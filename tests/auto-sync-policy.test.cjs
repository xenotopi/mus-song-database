'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const p=require('../tools/auto-sync/policy.cjs'),{client}=require('../tools/auto-sync/http.cjs'),f=require('./helpers/auto-sync-fixture.cjs');
const observed=()=>({latest:f.target,published:{...f.old,fingerprint:f.fingerprint,verified:true},fingerprint:f.fingerprint,readiness:f.readiness()});
test('unchanged verified revision and source is NO_OP even without new completion receipt',()=>{const x=observed();x.published={...f.target,verified:true,fingerprint:f.fingerprint};x.readiness=null;assert.equal(p.decide(x).decision,'NO_OP');});
test('a new data revision requests a build while source-only changes also rebuild',()=>{assert.equal(p.decide(observed()).reason,'DATA_CHANGED');const x=observed();x.published={...f.target,verified:true,fingerprint:'f'.repeat(64)};assert.equal(p.decide(x).reason,'SOURCE_CHANGED');});
for(const state of ['running','failed','unknown'])test('GAS '+state+' never authorizes generation',()=>{const x=observed();x.readiness={schemaVersion:1,state};assert.equal(p.decide(x).decision,'BLOCKED');});
test('stable valid revision samples alone never prove GAS completion',()=>{const x=observed();x.readiness=null;assert.equal(p.decide(x).reason,'COMPLETION_UNKNOWN');assert.throws(()=>p.decide({...x,readiness:{...f.readiness(),authority:'two-stable-samples'}}));});
for(const [name,change]of [['unfinished log',{updateLogWritten:false}],['step failure',{allStepsSucceeded:false}],['active update',{activeUpdate:true}],['wrong revision',{dataRevision:f.old.dataRevision}],['stale proof',{observedAt:'2020-01-01T00:00:00Z'}],['recent completion',{completedAt:new Date(Date.now()).toISOString()}]])test('readiness rejects '+name,()=>assert.throws(()=>p.decide({...observed(),readiness:{...f.readiness(),...change}})));
test('failure is not retried every poll; exact failed run requires explicit acknowledgement',()=>{const x={...observed(),sourceSha:f.sourceSha,lastFailure:{id:9,head_sha:f.sourceSha,updated_at:new Date().toISOString()}};assert.equal(p.decide(x).reason,'PREVIOUS_FAILURE_REQUIRES_ACK');assert.equal(p.decide({...x,retryFailedRunId:'9'}).decision,'BUILD');assert.equal(p.decide({...x,retryFailedRunId:'8'}).decision,'BLOCKED');});
test('skipped or delayed monitor still detects an unpublished target on the next tick',()=>{const x=observed(),a=p.decide(x),later=Date.now()+900000;const b=p.decide({...x,now:later,readiness:f.readiness(f.target,later)});assert.equal(a.decision,'BUILD');assert.equal(b.decision,'BUILD');assert.deepEqual(a.target,b.target);});
test('superseded before deploy is deferred; the same condition after deploy must fail verification',()=>{for(const command of ['validate-monitor','validate-plan','build','predeploy'])assert.deepEqual(p.failureDisposition(command,{code:'SUPERSEDED'}),{state:'superseded',exitCode:0});assert.deepEqual(p.failureDisposition('verify',{code:'SUPERSEDED'}),{state:'failed',exitCode:1});for(const command of ['monitor','build','verify'])assert.equal(p.failureDisposition(command,{code:'API_FAILURE'}).exitCode,1);const cli=fs.readFileSync(path.resolve(__dirname,'../tools/auto-sync/cli.cjs'),'utf8');assert.match(cli,/policy\.failureDisposition\(command,e\)/);});
test('revision shape and missing partial payload are rejected',()=>{for(const x of [{},{dataRevision:'123',outputRevision:f.target.outputRevision},{dataRevision:f.target.dataRevision}])assert.throws(()=>p.revisions(x));});
test('source fingerprint includes renderer/Web sources but ignores generated snapshot and current pointer',t=>{const root=f.folder(t);for(const d of ['assets','tools','data/snapshots/x','.github'])fs.mkdirSync(path.join(root,d),{recursive:true});fs.writeFileSync(path.join(root,'index.html'),'source\r\n');fs.writeFileSync(path.join(root,'data/current.json'),'old');const before=p.sourceFingerprint(root);fs.writeFileSync(path.join(root,'data/current.json'),'new');fs.writeFileSync(path.join(root,'data/snapshots/x/S001.json'),'new');assert.equal(p.sourceFingerprint(root),before);fs.writeFileSync(path.join(root,'index.html'),'source\n');assert.equal(p.sourceFingerprint(root),before);fs.writeFileSync(path.join(root,'assets/renderer.js'),'changed');assert.notEqual(p.sourceFingerprint(root),before);});
test('public state separates GAS readiness, incomplete Pages publication and last verified publication',()=>{const state=p.publicState({latest:f.target,published:{...f.old,verified:true,publishedAt:'2026-11-01T00:00:00Z'},run:{status:'in_progress',phase:'validating',url:'https://github.com/example'}});assert.equal(state.state,'validating');assert.deepEqual(state.lastPublished,f.old);assert.equal(state.apiReadyDoesNotMeanPagesPublished,true);assert.equal(p.publicState({latest:f.target,run:{conclusion:'failure'}}).state,'failed');});
test('a failed current release keeps the independently verified previous revision visible',()=>{const state=p.publicState({latest:f.target,published:{...f.target,verified:false,runState:'failure',lastVerified:{...f.old,verified:true,publishedAt:'2026-11-01T00:00:00Z'}}});assert.equal(state.state,'failed');assert.deepEqual(state.lastPublished,f.old);assert.equal(state.publishedAt,'2026-11-01T00:00:00Z');});
function response(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});}
test('monitor revision GET has no retry, body save, Chrome dependency or all-data actions',async()=>{let calls=0;const c=client(f.config,{fetch:async(url,init)=>{calls++;assert.equal(new URL(url).searchParams.get('action'),'revision');assert.equal(init.method,'GET');assert.equal(init.headers.authorization,undefined);return response({success:true,data:f.target});},token:'secret-for-github-only'});assert.deepEqual(await c.latest(),{...f.target,readiness:null});assert.equal(calls,1);});
for(const status of [403,429,500])test('HTTP '+status+' blocks monitoring without automatic retry',async()=>{let calls=0;const c=client(f.config,{fetch:async()=>{calls++;return response({},status);}});await assert.rejects(c.latest(),/Read HTTP/);assert.equal(calls,1);});
test('incomplete API envelope and timeout reject without extra requests',async()=>{for(const kind of ['partial','timeout']){let calls=0;const c=client(f.config,{fetch:async()=>{calls++;if(kind==='timeout')throw new DOMException('timed out','TimeoutError');return response({success:true,data:{dataRevision:f.target.dataRevision}});}});await assert.rejects(c.latest());assert.equal(calls,1);}});
test('HTTP adapter refuses unknown hosts, actions and cross-project readiness',async()=>{let calls=0;const c=client(f.config,{fetch:async()=>{calls++;return response({});}});for(const u of ['https://evil.invalid/a','http://mus-song-db.com/','https://script.google.com/macros/s/other/exec?action=revision','https://script.google.com/macros/s/public-fixture/exec?action=updateAll'])await assert.rejects(c.get(u));assert.equal(calls,0);});
test('public marker requires actual publisher workflow success, not a deployment claim',async()=>{const current={...f.target,revision:f.target.outputRevision,manifest:'./'+f.target.outputRevision+'/manifest.json'},manifest={revision:f.target.outputRevision,dataRevision:f.target.dataRevision},bytes=x=>Buffer.from(JSON.stringify(x)),release={schemaVersion:1,...f.target,sourceSha:f.sourceSha,fingerprint:f.fingerprint,runId:2,currentSha256:p.sha(bytes(current)),snapshotManifestSha256:p.sha(bytes(manifest))};for(const state of ['in_progress','failure','success']){const c=client(f.config,{fetch:async(url,init)=>{const u=new URL(url);if(u.hostname==='api.github.com'){assert.equal(init.headers.authorization,'Bearer token');return response({head_sha:f.sourceSha,head_branch:'main',path:f.config.publishWorkflowPath,id:2,run_number:2,status:state==='in_progress'?state:'completed',conclusion:state==='in_progress'?null:state});}if(u.pathname.endsWith('current.json'))return response(current);if(u.pathname.endsWith('manifest.json'))return response(manifest);return response(release);},token:'token'});assert.equal((await c.published()).verified,state==='success');}});
test('manual first publication preserves the reviewed jobs and permission boundaries',()=>{
  const {yaml}=require(path.join(path.dirname(require.resolve('playwright/package.json')),'../playwright-core/lib/utilsBundle.js'));
  const github=path.resolve(__dirname,'../.github');
  function load(directory,name) {
    const document=yaml.parseDocument(fs.readFileSync(path.join(github,directory,name),'utf8'));
    assert.deepEqual(document.errors,[]);
    return document.toJS();
  }

  const monitorName='auto-sync-revision-monitor.yml';
  const expectedMonitor=load('workflow-templates',monitorName);
  assert.deepEqual(expectedMonitor.on.schedule,[{cron:'7,22,37,52 * * * *'}]);
  delete expectedMonitor.on.schedule;
  expectedMonitor.jobs.monitor.if=expectedMonitor.jobs.monitor.if.replace(
    "github.ref == 'refs/heads/main'",
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"
  );
  const monitor=load('workflows',monitorName);
  assert.deepEqual(Object.keys(monitor.on),['workflow_dispatch']);
  assert.deepEqual(monitor.permissions,{contents:'read',actions:'read'});
  assert.deepEqual(monitor,expectedMonitor);

  const publishName='auto-sync-publish.yml';
  const expectedPublisher=load('workflow-templates',publishName);
  assert.deepEqual(expectedPublisher.on.workflow_run,{
    workflows:['MUSDB revision monitor'],types:['completed'],branches:['main']
  });
  delete expectedPublisher.on.workflow_run;
  expectedPublisher.on.workflow_dispatch.inputs.publish={
    description:'Authorize deployment only if all publication gates pass',
    type:'boolean',required:true,default:false
  };
  expectedPublisher.jobs.plan.if=expectedPublisher.jobs.plan.if.replace(
    "(github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success')",
    "github.event_name == 'workflow_dispatch' && inputs.publish == true"
  );
  expectedPublisher.jobs.plan.steps.find(step=>step.id==='monitor').env.MONITOR_RUN_ID='${{ inputs.monitor_run_id }}';
  const publisher=load('workflows',publishName);
  assert.deepEqual(Object.keys(publisher.on),['workflow_dispatch']);
  assert.deepEqual(publisher,expectedPublisher);
  assert.deepEqual(publisher.concurrency,{group:'musdb-pages-production','cancel-in-progress':false});
  assert.deepEqual(publisher.permissions,{contents:'read',actions:'read'});
  assert.deepEqual(publisher.jobs.deploy.permissions,{
    contents:'read',actions:'read',pages:'write','id-token':'write'
  });
  assert.equal(publisher.jobs.deploy.environment.name,'musdb-sync-signing');
  for (const [name,job] of Object.entries(publisher.jobs)) {
    if (name!=='deploy') assert.equal(job.permissions,undefined);
    assert.match(job.steps[0].uses,/^actions\/checkout@[a-f0-9]{40}$/);
    assert.equal(job.steps[0].with['persist-credentials'],false);
  }
  const config=require('../tools/auto-sync/config.json');
  assert.equal(typeof config.enabled,'boolean');
  assert.equal(typeof config.signedReadiness.enabled,'boolean');
  assert.ok(config.readinessUrl===null||new URL(config.readinessUrl).hostname==='script.google.com');
  const text=fs.readFileSync(path.join(github,'workflows',publishName),'utf8');
  assert.doesNotMatch(text,/pull_request_target|git push|contents: write|enablement: true/);
  assert.match(text,/PAGES_DEPLOY_CONCLUSION/);
});
test('post-upload freshness check precedes deployment and trial remains read-only',()=>{const root=path.resolve(__dirname,'..'),text=fs.readFileSync(path.join(root,'.github/workflow-templates/auto-sync-publish.yml'),'utf8'),trial=fs.readFileSync(path.join(root,'.github/workflow-templates/auto-sync-safety-trial.yml'),'utf8'),{yaml}=require(path.join(path.dirname(require.resolve('playwright/package.json')),'../playwright-core/lib/utilsBundle.js')),t=yaml.parse(trial);assert.ok(text.indexOf('id: freshness')>text.indexOf('actions/upload-pages-artifact@'));assert.match(text,/if: steps\.freshness\.outputs\.allowed == 'true'/);assert.match(trial,/contents: read/);assert.doesNotMatch(trial,/pages: write|id-token: write|actions: write|pull_request_target/);assert.ok(Object.hasOwn(t.on,'workflow_dispatch'));assert.deepEqual(t.on.pull_request.branches,['main']);assert.match(t.jobs.contracts.if,/head.repo.full_name == github.repository/);assert.match(t.jobs.contracts.if,/auto-sync-19-production-integration-20261121/);const active=path.join(root,'.github/workflows/auto-sync-safety-trial.yml');if(fs.existsSync(active))assert.equal(fs.readFileSync(active,'utf8').replace(/\r\n/g,'\n'),trial.replace(/\r\n/g,'\n'),'Approved trial promotion must preserve exact permissions and behavior');});
