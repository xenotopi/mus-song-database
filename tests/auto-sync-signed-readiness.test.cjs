'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../tools/auto-sync/policy.cjs');
const {client} = require('../tools/auto-sync/http.cjs');
const {monitor,authorizeBuild,confirmPlan} = require('../tools/auto-sync/readiness-client.cjs');
const actualConfig = require('../tools/auto-sync/config.json');
const fixture = require('./helpers/auto-sync-fixture.cjs');

const key = '9'.repeat(64); // Synthetic fixture value.
const config = {...actualConfig,apiUrl:fixture.config.apiUrl,enabled:true,
  signedReadiness:{...actualConfig.signedReadiness,enabled:true}};
const {target,old,sourceSha,fingerprint,context,checks} = fixture;
const workflowRef = kind => config.repository+'/.github/workflows/auto-sync-'+kind+'.yml@refs/heads/main';
const signingEnvironment = (kind='publish') => ({
  MUSDB_SYNC_SIGNING_ENABLED:'true',MUSDB_SYNC_SIGNING_KID:'fixture',
  GITHUB_REPOSITORY:config.repository,GITHUB_REPOSITORY_ID:config.signedReadiness.repositoryId,
  GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:workflowRef(kind),GITHUB_SHA:sourceSha,
  GITHUB_EVENT_NAME:kind==='publish'?'workflow_run':'workflow_dispatch',GITHUB_RUN_ID:'100',GITHUB_RUN_ATTEMPT:'1'
});
const response = data => new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
const allowedContext = {phase:'build-start',sourceSha,fingerprint};

test('checked-in OFF and runtime OFF each independently prevent all signature traffic',async()=>{
  assert.equal(actualConfig.enabled,false);
  assert.equal(actualConfig.signedReadiness.enabled,false);
  for (const [settings,enabled] of [[actualConfig,'true'],[config,'false']]) {
    let calls=0;
    const env={...signingEnvironment(),MUSDB_SYNC_SIGNING_ENABLED:enabled};
    const http=client(settings,{env,signingKey:key,fetch:async()=>{calls++;}});
    assert.equal(await http.readReadiness(target,allowedContext),null);
    assert.equal(calls,0);
  }
});

test('untrusted caller contexts or missing signing key never send POST',async()=>{
  const variants = [
    {GITHUB_REPOSITORY_ID:'1'}, {GITHUB_REF:'refs/heads/pr'},
    {GITHUB_WORKFLOW_REF:workflowRef('monitor')}, {GITHUB_WORKFLOW_REF:workflowRef('revision-monitor')}, {GITHUB_SHA:'b'.repeat(40)},
    {GITHUB_EVENT_NAME:'pull_request'}, {GITHUB_EVENT_NAME:'pull_request_target'},
    {GITHUB_RUN_ATTEMPT:'0'}
  ];
  for (const overrides of [...variants,null]) {
    let calls=0;
    const env={...signingEnvironment(),...overrides};
    const http=client(config,{env,signingKey:overrides?key:null,fetch:async()=>{calls++;}});
    await assert.rejects(http.readReadiness(target,allowedContext),/^Error: STRICT_READINESS_UNAVAILABLE$/);
    assert.equal(calls,0);
  }
});

test('light revision GET discards embedded proof and authenticated GET is never used',async()=>{
  const calls=[];
  const http=client({...config,readinessUrl:config.apiUrl+'?action=syncReadiness'},
    {fetch:async(u,init)=>{calls.push([new URL(u).searchParams.get('action'),init.method]);
      return response({...target,readiness:fixture.readiness()});}});
  assert.deepEqual(await http.latest(),{...target,readiness:null});
  await assert.rejects(http.get(config.apiUrl+'?action=syncReadiness'));
  assert.deepEqual(calls,[['revision','GET']]);
});

test('NO_OP needs no signer, published read, Revision GET and current main suffice',async()=>{
  const calls=[];
  const http={
    latest:async()=>{calls.push('revision');return target;},
    published:async()=>{calls.push('published');return {...target,verified:true,fingerprint};},
    mainSha:async()=>{calls.push('main');return sourceSha;},
    readReadiness:async()=>{throw new Error('Unexpected signing');}
  };
  assert.equal((await monitor({http,sourceSha,fingerprint})).decision,'NO_OP');
  assert.deepEqual(calls,['revision','published','main']);
});

for (const [reason,published] of [
  ['DATA_CHANGED',{...old,verified:true,fingerprint}],
  ['SOURCE_CHANGED',{...target,verified:true,fingerprint:'f'.repeat(64)}]
]) test(reason+' uses an unsigned observation and one publisher READY before authorizing a build',async()=>{
  const calls=[];
  const http={latest:async()=>target,published:async()=>published,mainSha:async()=>sourceSha,
    readReadiness:async(...args)=>{calls.push(args);return fixture.readiness();},lastFailure:async()=>null};
  const observation=await monitor({http,sourceSha,fingerprint});
  assert.equal(observation.decision,'CHECK');
  assert.ok(!Object.hasOwn(observation,'completionSha256'));
  assert.deepEqual(calls,[]);
  const candidate={...observation,sourceSha};
  const result=await authorizeBuild({http,candidate});
  assert.equal(result.decision,'BUILD');
  assert.equal(result.reason,reason);
  assert.equal(result.completionSha256,policy.sha(fixture.readiness().completionId));
  assert.ok(!Object.hasOwn(result,'completionId'));
  assert.deepEqual(calls,[[target,allowedContext]]);
  http.readReadiness=async()=>null;
  assert.equal((await authorizeBuild({http,candidate})).decision,'BLOCKED');
  http.readReadiness=async()=>{throw Error('transport down');};
  assert.deepEqual((await authorizeBuild({http,candidate})).reason,'STRICT_READINESS_UNAVAILABLE');
});

test('publisher rejects a superseded monitor target before signing and skips an already published candidate',async()=>{
  let latest=old, published={...old,verified:true,fingerprint}, signs=0;
  const http={latest:async()=>latest,published:async()=>published,mainSha:async()=>sourceSha,
    readReadiness:async()=>{signs++;throw Error('Unexpected signing');}};
  const candidate={decision:'CHECK',sourceSha,fingerprint,target};
  await assert.rejects(authorizeBuild({http,candidate}),{code:'SUPERSEDED'});
  latest=target;published={...target,verified:true,fingerprint};
  assert.equal((await authorizeBuild({http,candidate})).decision,'NO_OP');
  assert.equal(signs,0);
});

test('production signing never reuses the one-time monitor phase',async()=>{
  let sent=0;
  const http=client(config,{env:signingEnvironment('monitor'),signingKey:key,fetch:async()=>{sent++;}});
  await assert.rejects(http.readReadiness(target,{...allowedContext,phase:'monitor'}),/^Error: STRICT_READINESS_UNAVAILABLE$/);
  assert.equal(sent,0);
});

test('signed POST sends only an unsigned GET to the ContentService response URL',async()=>{
  const calls=[],records=[];
  const http=client(config,{env:signingEnvironment(),signingKey:key,recordSigned:r=>records.push(r),
    fetch:async(u,init)=>{
      calls.push([String(u),init]);
      return init.method==='POST' ? new Response(null,{status:302,
        headers:{location:'https://script.googleusercontent.com/macros/echo?user_content_key=fixture'}}) :
        response(fixture.readiness());
    }});
  assert.equal((await http.readReadiness(target,allowedContext)).state,'ready');
  assert.equal(calls.length,2);
  assert.equal(calls[0][0],config.apiUrl);
  assert.deepEqual(calls.map(([,init])=>[init.method,init.redirect]),[['POST','manual'],['GET','manual']]);
  assert.equal(calls[1][1].body,undefined);
  assert.equal(calls[1][1].headers.authorization,undefined);
  assert.deepEqual(records,[{phase:'build-start',status:'ready'}]);
});

for(const [label,reply] of [
  ['unexpected redirect',()=>new Response(null,{status:302,headers:{location:'https://untrusted.invalid/echo'}})],
  ['HTML',()=>new Response('<html>permission</html>',{headers:{'content-type':'text/html'}})],
  ['incomplete JSON',()=>response({state:'ready'})],
  ['Revision mismatch',()=>response(fixture.readiness(old))],
  ['503',()=>new Response('unavailable',{status:503})]
]) test('strict transport rejects '+label+' without retry or raw payload in the error',async()=>{
  let calls=0;
  const http=client(config,{env:signingEnvironment(),signingKey:key,fetch:async()=>{calls++;return reply();}});
  await assert.rejects(http.readReadiness(target,allowedContext),/^Error: STRICT_READINESS_UNAVAILABLE$/);
  assert.equal(calls,1);
});

function deploymentFixture() {
  let proof=fixture.readiness(),latest=target,main=sourceSha,afterCheckMain=sourceSha;
  const plan={decision:'BUILD',target,sourceSha,fingerprint,completionSha256:policy.sha(proof.completionId)};
  const phases=[];
  const http={published:async()=>({...old,verified:true,fingerprint,runNumber:4}),latest:async()=>latest,
    mainSha:async()=>main,readReadiness:async(pair,{phase})=>{
      phases.push(phase);
      assert.deepEqual(pair,target);
      main=afterCheckMain;
      return proof;
    }};
  const confirm=phase=>confirmPlan({http,plan,phase,getFingerprint:()=>fingerprint,context});
  const predeploy=async()=>policy.deploymentGate({config,enabledVariable:'true',plan,checks,...await confirm('pre-deploy')});
  return {phases,predeploy,confirm,
    updateProof:value=>{proof=value;},updateRevision:()=>{latest=old;},
    mainChangesDuringRequest:()=>{afterCheckMain='b'.repeat(40);}};
}

test('build-start, build-end and pre-deploy each obtain a new strict observation',async()=>{
  const x=deploymentFixture();
  assert.equal((await x.confirm('build-start')).readiness.state,'ready');
  assert.equal((await x.confirm('build-end')).readiness.state,'ready');
  assert.equal((await x.predeploy()).status,'DEPLOY_ALLOWED');
  assert.deepEqual(x.phases,['build-start','build-end','pre-deploy']);
});

for(const [label,change] of [
  ['a new update begins with unchanged Revisions',x=>x.updateProof({schemaVersion:1,state:'running'})],
  ['another same-Revision generation completes',x=>x.updateProof({...fixture.readiness(),completionId:'changed-generation'})],
  ['Revision changes after upload',x=>x.updateRevision()],
  ['proof disappears',x=>x.updateProof(null)],
  ['a new main appears during the signed check',x=>x.mainChangesDuringRequest()]
]) test('final gate refuses after successful pre-upload check if '+label,async()=>{
  const x=deploymentFixture();
  assert.equal((await x.predeploy()).status,'DEPLOY_ALLOWED');
  change(x);
  await assert.rejects(x.predeploy());
});

test('publication verification rejects an update beginning after the last deploy gate',async()=>{
  const x=deploymentFixture();
  assert.equal((await x.predeploy()).status,'DEPLOY_ALLOWED');
  x.updateProof({schemaVersion:1,state:'running'});
  await assert.rejects(x.confirm('post-deploy'),{code:'SUPERSEDED'});
  assert.equal(policy.failureDisposition('verify',{code:'SUPERSEDED'}).exitCode,1);
});

test('protected templates scope signing keys and the approved PR trial stays offline and read-only',()=>{
  const {yaml}=require(path.join(path.dirname(require.resolve('playwright/package.json')),'../playwright-core/lib/utilsBundle.js'));
  const root=path.resolve(__dirname,'..');
  const templates=['revision-monitor','publish','safety-trial'].map(name=>{
    const filename='auto-sync-'+name+'.yml';
    const active=path.join(root,'.github/workflows',filename);
    const template=fs.readFileSync(path.join(root,'.github/workflow-templates',filename));
    if (name==='safety-trial') {
      if (fs.existsSync(active)) assert.deepEqual(fs.readFileSync(active),template);
    } else {
      assert.equal(fs.existsSync(active),false);
    }
    const parsed=yaml.parseDocument(template.toString('utf8'));
    assert.deepEqual(parsed.errors,[]);
    return parsed.toJS();
  });
  const [monitor,publisher,trial]=templates;
  assert.doesNotMatch(JSON.stringify(monitor),/\bsecrets\b|MUSDB_SYNC_SIGNING|pages: write/);
  assert.equal(monitor.jobs.monitor.environment,undefined);
  assert.equal(publisher.jobs.deploy.environment.name,'musdb-sync-signing');
  assert.deepEqual(trial.permissions,{contents:'read'});
  assert.doesNotMatch(JSON.stringify(trial),/\bsecrets\b/);
  assert.deepEqual(Object.keys(trial.jobs),['contracts']);
  const contracts=trial.jobs.contracts;
  assert.equal(contracts.permissions,undefined);
  assert.equal(contracts.environment,undefined);
  assert.equal(contracts.steps.length,4);
  const [checkout,setup,install,synthetic]=contracts.steps;
  assert.match(checkout.uses,/^actions\/checkout@[a-f0-9]{40}$/);
  assert.equal(checkout.with['persist-credentials'],false);
  assert.match(setup.uses,/^actions\/setup-node@[a-f0-9]{40}$/);
  assert.equal(install.run,'npm ci --prefix tests --ignore-scripts');
  assert.deepEqual(synthetic.env,{
    AUTO_SYNC_NETWORK_MODE:'offline',
    AUTO_SYNC_NETWORK_ENFORCE:'1',
    NODE_OPTIONS:'--require ./tools/ci/read-only-network.cjs'
  });
  assert.equal(synthetic.run,[
    'node --test --test-concurrency=1','tests/auto-sync-policy.test.cjs','tests/auto-sync-pipeline.test.cjs',
    'tests/auto-sync-signed-readiness.test.cjs','tests/auto-sync-site.test.cjs','tests/auto-sync-retention.test.cjs'
  ].join(' '));
  const keyEnv='MUSDB_SYNC_SIGNING_KEY';
  let keySteps=0;
  for (const workflow of templates) for (const job of Object.values(workflow.jobs)) {
    assert.equal(job.env?.[keyEnv],undefined);
    for (const step of job.steps) if (step.env?.[keyEnv]) {
      keySteps++;
      assert.match(step.run,/cli\.cjs (authorize-plan|build|predeploy|verify) /);
      assert.equal(step.uses,undefined);
      assert.equal(job.environment.name,'musdb-sync-signing');
      assert.doesNotMatch(JSON.stringify(workflow.on),/pull_request/);
    }
  }
  assert.equal(keySteps,5);
  const cli=fs.readFileSync(path.join(root,'tools/auto-sync/cli.cjs'),'utf8');
  assert.ok(cli.indexOf('delete process.env.'+keyEnv)<cli.indexOf('childEnvironment('));
});
