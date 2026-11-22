'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,createHmac,randomBytes}=require('node:crypto');
const config=require('./config.json');

const domain='musdb-publication-v1';
const operations={
  check:['publish/check','CONFIRMED'],
  'open-source':['source/open','FROZEN'],
  acquire:['publish/acquire','ACQUIRED','BUSY'],
  begin:['publish/begin','DEPLOY_ALLOWED'],
  abandon:['publish/abandon','RELEASED'],
  verified:['publish/verified','RELEASED'],
  'baseline-begin':['baseline/begin','DEPLOY_ALLOWED']
};

function signedCommand({role,route,payload,key,issuedAt,nonce}){
  if(typeof key!=='string'||! /^[a-f0-9]{64}$/.test(key))throw Error('PUBLICATION_KEY_UNAVAILABLE');
  const fields=[1,role,route,issuedAt,nonce,payload];
  const mac=createHmac('sha256',key).update(JSON.stringify(['POST',domain,...fields])).digest('hex');
  return JSON.stringify([...fields,mac]);
}

async function callDirect({role,route,payload,key,fetch=global.fetch,now=Date.now}){
  try{
    const endpoint=new URL(config.apiUrl+'/'+domain);
    assert.equal(endpoint.origin,'https://script.google.com');
    assert.match(endpoint.pathname,/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/musdb-publication-v1$/);
    assert.ok(!endpoint.search&&!endpoint.hash&&!endpoint.username&&!endpoint.password);
    const nonce=randomBytes(16).toString('hex');
    const body=signedCommand({role,route,payload,key,issuedAt:now(),nonce});
    const options={redirect:'manual',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)};
    let response=await fetch(endpoint,{...options,method:'POST',headers:{'content-type':'application/json'},body});
    if([302,303].includes(response.status)){
      const redirect=new URL(response.headers.get('location'));
      assert.equal(redirect.origin,'https://script.googleusercontent.com');
      assert.equal(redirect.pathname,'/macros/echo');
      assert.ok(!redirect.username&&!redirect.password&&!redirect.hash);
      response=await fetch(redirect,{...options,method:'GET'});
    }
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')||'',/^application\/json\b/i);
    const chunks=[];
    let size=0;
    for await(const chunk of response.body){
      size+=chunk.length;
      assert.ok(size<=16384);
      chunks.push(chunk);
    }
    const result=JSON.parse(Buffer.concat(chunks));
    assert.equal(result.success,true);
    assert.equal(result.data?.success,true);
    assert.equal(result.data?.nonce,nonce);
    return result.data;
  }catch{
    throw new Error('PUBLICATION_FENCE_UNCONFIRMED');
  }
}

function invocation(action,env){
  const baseline=action==='baseline-begin';
  const workflow=baseline?'.github/workflows/auto-sync-pages-migration.yml':config.publishWorkflowPath;
  assert.equal(env.MUSDB_PUBLICATION_FENCE_ENABLED,'true');
  if (['acquire','begin','baseline-begin'].includes(action)) {
    assert.equal(env.MUSDB_PAGES_DEPLOY_ENABLED,'true','Pages deployment disabled');
  }
  assert.equal(env.GITHUB_REPOSITORY,config.repository);
  assert.equal(env.GITHUB_REPOSITORY_ID,config.signedReadiness.repositoryId);
  assert.equal(env.GITHUB_REF,'refs/heads/'+config.branch);
  assert.equal(env.MUSDB_RUN_REF_PROTECTED,'true');
  assert.equal(env.GITHUB_WORKFLOW_REF,config.repository+'/'+workflow+'@'+env.GITHUB_REF);
  const auto=env.GITHUB_EVENT_NAME==='workflow_run';
  if(auto)assert.ok(!baseline&&env.MUSDB_EVENT_PUBLICATION_ENABLED==='true'&&env.GITHUB_RUN_ATTEMPT==='1');
  else assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');
  if(baseline)assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
  if(action==='check')assert.ok(auto);
  assert.match(env.GITHUB_RUN_ID,/^[1-9][0-9]{0,19}$/);
  assert.match(env.GITHUB_RUN_ATTEMPT,/^[1-9][0-9]{0,5}$/);
  assert.match(env.GITHUB_SHA,/^[a-f0-9]{40}$/);
  return {role:baseline?'baseline':auto?'publisher':'manual',mode:auto?'auto':'manual',
    run:{runId:env.GITHUB_RUN_ID,attempt:Number(env.GITHUB_RUN_ATTEMPT),sourceSha:env.GITHUB_SHA}};
}

async function publicationFence(action,{env=process.env,fetch=global.fetch,payload={}}={}){
  assert.ok(Object.hasOwn(operations,action),'Unknown publication operation');
  const [route,...allowed]=operations[action];
  const {role,mode,run}=invocation(action,env);
  const result=await callDirect({role,route,payload:{...payload,mode,run},key:env.MUSDB_DIRECT_FENCE_KEY,fetch});
  assert.ok(allowed.includes(result.status),'Publication state not confirmed');
  return result.status;
}

function deploymentPayload(action,env){
  if(action==='baseline-begin'){
    assert.match(env.MUSDB_BASELINE_RECOVERY_TICKET,/^[a-f0-9]{32}$/);
    return {ticket:env.MUSDB_BASELINE_RECOVERY_TICKET};
  }
  if(!['begin','verified','check'].includes(action))return {};
  const filename=action==='check'?'candidate-plan.json':'accepted-plan.json';
  const plan=JSON.parse(fs.readFileSync(path.join(env.RUNNER_TEMP,'plan',filename)));
  assert.equal(plan.sourceSha,env.GITHUB_SHA);
  const binding={target:plan.target,sourceSha:plan.sourceSha,monitorRunId:String(plan.monitorRunId),
    notice:plan.completionNotice,sourceImageSha256:plan.sourceImageSha256,completionSha256:plan.completionSha256};
  if(action==='check')return binding;
  const release=fs.readFileSync(path.join(env.RUNNER_TEMP,'site','data','sync-release.json'));
  return {...binding,releaseSha256:createHash('sha256').update(release).digest('hex')};
}

module.exports={publicationFence,callDirect,signedCommand,deploymentPayload};

if(require.main===module)Promise.resolve().then(()=>{
  const action=process.argv[2];
  return publicationFence(action,{payload:deploymentPayload(action,process.env)});
}).then(status=>{
  const output={ACQUIRED:'acquired',BUSY:'acquired',DEPLOY_ALLOWED:'allowed',RELEASED:'released'}[status];
  if(output&&process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,output+'='+(status!=='BUSY')+'\n');
  console.log(status);
}).catch(()=>{
  console.error('PUBLICATION_FENCE_UNCONFIRMED');
  process.exitCode=1;
});
