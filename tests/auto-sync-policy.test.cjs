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
test('manual and completion-event workflows preserve the reviewed permission boundaries',()=>{
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
  expectedMonitor.jobs.monitor.steps.push({
    name:'Save blocked or failed monitor evidence',
    if:"${{ !cancelled() && (steps.observe.outcome == 'failure' || steps.observe.outputs.decision == 'BLOCKED') }}",
    uses:'actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4',
    with:{
      name:'sync-monitor-evidence',
      path:'${{ runner.temp }}/musdb-sync/state.json\n${{ runner.temp }}/musdb-sync/http-summary-monitor.json\n',
      'retention-days':14,
      'if-no-files-found':'warn'
    }
  });
  const monitor=load('workflows',monitorName);
  assert.deepEqual(Object.keys(monitor.on),['workflow_dispatch']);
  assert.deepEqual(monitor.permissions,{contents:'read',actions:'read'});
  assert.equal(monitor.concurrency.queue,'max');
  delete monitor.concurrency.queue;
  assert.deepEqual(monitor.on.workflow_dispatch.inputs.completion_notice,{
    description:'Completion generation and both revisions from the authorized management script',
    type:'string',required:false,default:''
  });
  delete monitor.on.workflow_dispatch.inputs.completion_notice;
  const monitorEnv=monitor.jobs.monitor.steps.find(step=>step.id==='observe').env;
  for(const [key,value] of Object.entries({
    MUSDB_EVENT_MONITOR_ENABLED:'${{ vars.MUSDB_EVENT_MONITOR_ENABLED }}',
    MUSDB_EVENT_ACTOR_ID:'${{ vars.MUSDB_EVENT_ACTOR_ID }}',
    MUSDB_COMPLETION_NOTICE:'${{ inputs.completion_notice }}'
  })) {
    assert.equal(monitorEnv[key],value);
    delete monitorEnv[key];
  }
  assert.deepEqual(monitor,expectedMonitor);

  const publishName='auto-sync-publish.yml';
  const expectedPublisher=load('workflow-templates',publishName);
  assert.deepEqual(expectedPublisher.on.workflow_run,{
    workflows:['MUSDB revision monitor'],types:['completed'],branches:['main']
  });
  expectedPublisher.on.workflow_dispatch.inputs.publish={
    description:'Authorize deployment only if all publication gates pass',
    type:'boolean',required:true,default:false
  };
  const publisher=load('workflows',publishName);
  assert.deepEqual(Object.keys(publisher.on),['workflow_run','workflow_dispatch']);
  assert.deepEqual(publisher.concurrency,{group:'musdb-pages-production','cancel-in-progress':false,queue:'max'});
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

  // Validate each authorized addition before comparing the unchanged baseline, step by step.
  const newGuard=[
    "((github.event_name == 'workflow_dispatch' && inputs.publish == true) ||",
    " (github.event_name == 'workflow_run' && vars.MUSDB_EVENT_PUBLICATION_ENABLED == 'true' &&",
    "  vars.MUSDB_PUBLICATION_FENCE_ENABLED == 'true' && vars.MUSDB_EVENT_ACTOR_ID != '' &&",
    "  github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.run_attempt == 1 &&",
    "  format('{0}', github.event.workflow_run.actor.id) == vars.MUSDB_EVENT_ACTOR_ID))"
  ].join(' ');
  assert.ok(publisher.jobs.plan.if.replace(/\s+/g,' ').includes(newGuard.replace(/\s+/g,' ')));
  const expectedGuard=expectedPublisher.jobs.plan.if;
  assert.ok(publisher.jobs.plan.if.startsWith(expectedGuard.slice(0,expectedGuard.indexOf("(github.event_name"))));
  publisher.jobs.plan.if=expectedGuard;
  for(const [key,value] of Object.entries({
    MUSDB_EVENT_PUBLICATION_ENABLED:'${{ vars.MUSDB_EVENT_PUBLICATION_ENABLED }}',
    MUSDB_EVENT_ACTOR_ID:'${{ vars.MUSDB_EVENT_ACTOR_ID }}',
    MUSDB_RUN_REF_PROTECTED:'${{ github.ref_protected }}',
    MUSDB_PUBLICATION_FENCE_ENABLED:'${{ vars.MUSDB_PUBLICATION_FENCE_ENABLED }}'
  })) {
    assert.equal(publisher.env[key],value);
    delete publisher.env[key];
  }
  const build=publisher.jobs.build;
  const authorize=build.steps.findIndex(step=>step.id==='authorize');
  assert.ok(authorize>0);
  assert.deepEqual(build.steps.splice(authorize-1,1)[0],{
    name:'Require durable confirmation of the automatic monitor run',
    if:"github.event_name == 'workflow_run'",
    env:{MUSDB_DIRECT_FENCE_KEY:'${{ secrets.MUSDB_DIRECT_AUTO_KEY }}'},
    run:'node tools/auto-sync/publication-fence.cjs check'
  });
  const fenceEnv={MUSDB_DIRECT_FENCE_KEY:"${{ github.event_name == 'workflow_run' && secrets.MUSDB_DIRECT_AUTO_KEY || github.event_name == 'workflow_dispatch' && secrets.MUSDB_DIRECT_MANUAL_KEY || '' }}"};
  const buildEnv=build.steps.find(step=>step.id==='build').env;
  assert.equal(buildEnv.MUSDB_DIRECT_FENCE_KEY,fenceEnv.MUSDB_DIRECT_FENCE_KEY);
  delete buildEnv.MUSDB_DIRECT_FENCE_KEY;
  const deploy=publisher.jobs.deploy, baseline=expectedPublisher.jobs.deploy;
  assert.equal(deploy.if,baseline.if+" && vars.MUSDB_PUBLICATION_FENCE_ENABLED == 'true' && vars.MUSDB_PAGES_DEPLOY_ENABLED == 'true'");
  deploy.if=baseline.if;
  const freshness=deploy.steps.find(step=>step.id==='freshness');
  const oldFreshness=baseline.steps.find(step=>step.id==='freshness');
  assert.equal(freshness.if,"steps.fence.outputs.acquired == 'true'");
  assert.equal(freshness.name,'Recheck after upload while the publication fence is held');
  freshness.if=oldFreshness.if;
  freshness.name=oldFreshness.name;
  const pages=deploy.steps.find(step=>step.id==='pages');
  assert.equal(pages.if,"steps.begin.outputs.allowed == 'true'");
  pages.if=baseline.steps.find(step=>step.id==='pages').if;
  const at=deploy.steps.indexOf(freshness);
  assert.match(deploy.steps[at-2].uses,/^actions\/upload-pages-artifact@/);
  assert.deepEqual(deploy.steps.splice(at-1,1)[0],{
    id:'fence',name:'Acquire the publication fence shared with management updates',
    if:"steps.gate.outputs.allowed == 'true'",env:fenceEnv,run:'node tools/auto-sync/publication-fence.cjs acquire'
  });
  assert.deepEqual(deploy.steps.splice(at,1)[0],{
    id:'begin',name:'Persist that a Pages request may be issued',
    if:"steps.freshness.outputs.allowed == 'true'",env:fenceEnv,run:'node tools/auto-sync/publication-fence.cjs begin'
  });
  assert.deepEqual(deploy.steps.splice(at+1,1)[0],{
    name:'Release only if the Pages request could not have been issued',
    if:"${{ !cancelled() && steps.fence.outputs.acquired == 'true' && steps.begin.outcome == 'skipped' && steps.pages.outcome == 'skipped' }}",
    env:fenceEnv,run:'node tools/auto-sync/publication-fence.cjs abandon'
  });
  const verify=publisher.jobs.verify;
  const verification=verify.steps.findIndex(step=>/ cli\.cjs verify |\/cli\.cjs verify /.test(step.run||''));
  assert.ok(verification>=0);
  assert.deepEqual(verify.steps.splice(verification+1,1)[0],{
    name:'Release the publication fence after successful production verification',
    env:fenceEnv,run:'node tools/auto-sync/publication-fence.cjs verified'
  });
  delete publisher.concurrency.queue;
  assert.deepEqual(publisher,expectedPublisher);
});
test('post-upload freshness check precedes deployment and trial remains read-only',()=>{const root=path.resolve(__dirname,'..'),text=fs.readFileSync(path.join(root,'.github/workflow-templates/auto-sync-publish.yml'),'utf8'),trial=fs.readFileSync(path.join(root,'.github/workflow-templates/auto-sync-safety-trial.yml'),'utf8'),{yaml}=require(path.join(path.dirname(require.resolve('playwright/package.json')),'../playwright-core/lib/utilsBundle.js')),t=yaml.parse(trial);assert.ok(text.indexOf('id: freshness')>text.indexOf('actions/upload-pages-artifact@'));assert.match(text,/if: steps\.freshness\.outputs\.allowed == 'true'/);assert.match(trial,/contents: read/);assert.doesNotMatch(trial,/pages: write|id-token: write|actions: write|pull_request_target/);assert.ok(Object.hasOwn(t.on,'workflow_dispatch'));assert.deepEqual(t.on.pull_request.branches,['main']);assert.match(t.jobs.contracts.if,/head.repo.full_name == github.repository/);assert.match(t.jobs.contracts.if,/auto-sync-19-production-integration-20261121/);const active=path.join(root,'.github/workflows/auto-sync-safety-trial.yml');if(fs.existsSync(active))assert.equal(fs.readFileSync(active,'utf8').replace(/\r\n/g,'\n'),trial.replace(/\r\n/g,'\n'),'Approved trial promotion must preserve exact permissions and behavior');});

for (const outcome of ['NO_OP','CHECK','BLOCKED','FAIL']) test('monitor CLI records '+outcome+' using only unsigned reads',t=>{
  const cp=require('node:child_process');
  const root=path.resolve(__dirname,'..'),dir=f.folder(t);
  const configFile=path.join(root,'tools/auto-sync/config.json');
  const settings=require(configFile),localFingerprint=p.sourceFingerprint(root);
  const sourceSha=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const shaPrefix=f.target.outputRevision;
  const site=new URL(settings.siteUrl);
  const current={...f.target,revision:shaPrefix,manifest:'./'+shaPrefix+'/manifest.json'};
  const manifest={...f.target,revision:shaPrefix};
  const release={
    schemaVersion:1,...f.target,sourceSha,runId:99,
    fingerprint:outcome==='CHECK'?(localFingerprint==='1'.repeat(64)?'2':'1').repeat(64):localFingerprint,
    currentSha256:p.sha(JSON.stringify(current)),snapshotManifestSha256:p.sha(JSON.stringify(manifest))
  };
  const revisionUrl=new URL(settings.apiUrl);
  revisionUrl.searchParams.set('action','revision');
  const repo='https://api.github.com/repos/'+settings.repository;
  const replies=[
    [revisionUrl.href,outcome==='FAIL'?503:200,{success:true,data:f.target}],
    [new URL('data/current.json',site).href,200,current],
    [new URL('data/snapshots/'+shaPrefix+'/manifest.json',site).href,200,manifest],
    [new URL('data/sync-release.json',site).href,200,release],
    [repo+'/actions/runs/99',200,{id:99,head_sha:sourceSha,head_branch:'main',path:settings.publishWorkflowPath,run_number:1,status:'completed',conclusion:'success'}],
    [repo+'/commits/main',200,{sha:sourceSha}]
  ];
  const preload=path.join(dir,'mock-fetch.cjs'),outputs=path.join(dir,'github-output');
  fs.writeFileSync(preload,`
    const assert=require('node:assert/strict');
    require(${JSON.stringify(configFile)}).enabled=true;
    const replies=${JSON.stringify(replies)};
    global.fetch=async (url,init)=>{
      assert.equal(init.method,'GET');
      assert.equal(init.body,undefined);
      const next=replies.shift();
      assert.ok(next,'Unexpected extra network request');
      assert.equal(String(url),next[0]);
      return new Response(JSON.stringify(next[2]),{status:next[1]});
    };
  `);
  const env={...process.env,GITHUB_OUTPUT:outputs,GITHUB_RUN_ID:'100',GITHUB_RUN_NUMBER:'2',
    MUSDB_AUTO_SYNC_ENABLED:outcome==='BLOCKED'?'false':'true'};
  delete env.GITHUB_TOKEN;
  delete env.MUSDB_SYNC_SIGNING_KEY;
  const run=cp.spawnSync(process.execPath,['--require',preload,'tools/auto-sync/cli.cjs','monitor','--out='+dir],
    {cwd:root,env,encoding:'utf8',timeout:15000});
  assert.ifError(run.error);
  assert.equal(run.status,outcome==='FAIL'?1:0,run.stderr);
  const state=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));
  const network=JSON.parse(fs.readFileSync(path.join(dir,'http-summary-monitor.json')));
  assert.deepEqual(network.signedChecks,[]);
  assert.equal(network.retries,0);
  assert.equal(network.contentWrites,0);
  assert.equal(network.rawHttpBodiesSaved,false);
  assert.equal(network.reads.length,outcome==='BLOCKED'?0:outcome==='FAIL'?1:replies.length);
  const planFile=path.join(dir,'plan.json');
  if (outcome==='FAIL') {
    assert.equal(state.state,'failed');
    assert.match(state.error,/Read HTTP 503/);
    assert.equal(network.reads[0].status,'FAIL');
    assert.equal(fs.existsSync(planFile),false);
    assert.equal(fs.existsSync(outputs),false);
    return;
  }
  const actionsOutput=fs.readFileSync(outputs,'utf8');
  assert.match(actionsOutput,new RegExp('^decision='+outcome+'$','m'));
  if (outcome==='BLOCKED') {
    assert.equal(state.state,'blocked');
    assert.equal(state.reason,'ACTIVATION_DISABLED');
    assert.equal(fs.existsSync(planFile),false);
    return;
  }
  assert.equal(state.state,outcome==='NO_OP'?'published':'waiting');
  assert.equal(state.decision,outcome);
  const {planId,...plan}=JSON.parse(fs.readFileSync(planFile));
  assert.equal(planId,p.sha(JSON.stringify(plan)));
  assert.deepEqual(plan.target,f.target);
  assert.equal(plan.decision,outcome);
  assert.equal(plan.monitorRunId,100);
  assert.equal(Object.hasOwn(plan,'completionSha256'),false);
});
