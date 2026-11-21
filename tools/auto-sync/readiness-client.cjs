'use strict';

const assert = require('node:assert/strict');
const { createHmac, randomBytes } = require('node:crypto');
const policy = require('./policy.cjs');

const phases = Object.freeze({
  monitor: 'monitor',
  'build-start': 'publish',
  'build-end': 'publish',
  'pre-deploy': 'publish',
  'post-deploy': 'publish'
});

function signBody({ audience,kid,key,issuedAt,target,nonce,invocation }) {
  assert.match(audience,/^[A-Za-z0-9:._/-]{1,160}$/);
  assert.match(kid,/^[A-Za-z0-9_-]{1,48}$/);
  if (typeof key!=='string'||! /^[a-f0-9]{64}$/.test(key)) throw new Error('INVALID_SIGNING_KEY');
  assert.ok(Number.isSafeInteger(issuedAt) && issuedAt>0);
  assert.match(nonce,/^[a-f0-9]{32}$/);
  const {fingerprint,sourceSha,repositoryId,workflowRef,phase,runId,runAttempt}=invocation;
  assert.match(fingerprint,/^[a-f0-9]{64}$/);
  assert.match(sourceSha,/^[a-f0-9]{40}$/);
  assert.match(repositoryId,/^[1-9][0-9]{0,19}$/);
  assert.match(workflowRef,/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml@refs\/heads\/main$/);
  assert.ok(workflowRef.length<=200);
  assert.ok(Object.hasOwn(phases,phase));
  assert.match(runId,/^[1-9][0-9]{0,19}$/);
  assert.ok(Number.isSafeInteger(runAttempt)&&runAttempt>=1&&runAttempt<=1000000);
  const {dataRevision,outputRevision} = policy.revisions(target);
  const fields = [2,audience,kid,issuedAt,nonce,dataRevision,outputRevision,fingerprint,sourceSha,repositoryId,workflowRef,phase,runId,runAttempt];
  const mac = createHmac('sha256',key).update(JSON.stringify(['POST','syncReadiness',...fields]),'utf8').digest('hex');
  const body=JSON.stringify([...fields,mac]);
  assert.ok(body.length<=1024);
  return body;
}

async function readStrict({ apiUrl,target,credentials,invocation,completionOptions,fetch:request=globalThis.fetch,now=Date.now }) {
  try {
    const url = new URL(apiUrl);
    assert.equal(url.origin,'https://script.google.com');
    assert.match(url.pathname,/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/);
    assert.ok(!url.username && !url.password && !url.search && !url.hash);
    const body = signBody({...credentials,target,invocation,issuedAt:now(),nonce:randomBytes(16).toString('hex')});
    const signal = AbortSignal.timeout(30000);
    const headers = { accept:'application/json', 'cache-control':'no-cache' };
    const options = { redirect:'manual',referrerPolicy:'no-referrer',signal };
    let response = await request(url,{...options,method:'POST',headers:{...headers,'content-type':'application/json'},body});
    if ([302,303].includes(response.status)) {
      const redirect = new URL(response.headers.get('location') || '',url);
      assert.equal(redirect.origin,'https://script.googleusercontent.com');
      assert.equal(redirect.pathname,'/macros/echo');
      assert.ok(!redirect.username && !redirect.password && !redirect.hash);
      // Google ContentService supplies a response URL. Only fetch it via GET, without any signed request fields.
      response = await request(redirect,{...options,method:'GET',headers});
    }
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type') || '',/^application\/json\b/i);
    const maxBytes = 16384;
    assert.ok(Number(response.headers.get('content-length')||0)<=maxBytes);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert.ok(bytes<=maxBytes);
      chunks.push(chunk);
    }
    const reply = JSON.parse(Buffer.concat(chunks));
    assert.equal(reply.success,true);
    assert.equal(reply.data?.schemaVersion,1);
    assert.equal(reply.data.authority,'shared-update-completion-v1');
    assert.ok(['ready','running','failed','unknown'].includes(reply.data.state));
    if (reply.data.state==='ready') assert.ok(policy.completion(reply.data,target,{now:now(),...completionOptions}).ready);
    return reply.data;
  } catch (error) {
    // Underlying exceptions can contain the request URL or details from a credentialed response.
    // A fixed error code is the only diagnostic passed outside this transport.
    throw new Error('STRICT_READINESS_UNAVAILABLE');
  }
}

function makeReadinessReader({config,env,signingKey,fetch,record}) {
  return async (target,{phase,sourceSha,fingerprint}) => {
    if (config.signedReadiness?.enabled !== true || env.MUSDB_SYNC_SIGNING_ENABLED !== 'true') return null;
    try {
      assert.equal(phases[phase],'publish','Only the protected publisher can sign automatic readiness requests');
      const workflow = config.publishWorkflowPath;
      assert.equal(workflow,'.github/workflows/auto-sync-publish.yml');
      const ref = 'refs/heads/'+config.branch;
      const workflowRef = config.repository+'/'+workflow+'@'+ref;
      assert.equal(env.GITHUB_REPOSITORY,config.repository);
      assert.equal(env.GITHUB_REPOSITORY_ID,config.signedReadiness.repositoryId);
      assert.equal(env.GITHUB_REF,ref);
      assert.equal(env.GITHUB_WORKFLOW_REF,workflowRef);
      assert.equal(env.GITHUB_SHA,sourceSha);
      assert.ok(['workflow_run','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME));
      const invocation = {phase,sourceSha,fingerprint,workflowRef,repositoryId:env.GITHUB_REPOSITORY_ID,
        runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT)};
      const credentials = {audience:config.signedReadiness.audience,kid:env.MUSDB_SYNC_SIGNING_KID,key:signingKey};
      const completionOptions = {maxAgeSeconds:config.maximumReadinessAgeSeconds,stableSeconds:config.minimumStableSeconds};
      const data = await readStrict({apiUrl:config.apiUrl,target,invocation,credentials,completionOptions,fetch});
      record({phase,status:data.state});
      return data;
    } catch {
      record({phase,status:'BLOCKED'});
      throw new Error('STRICT_READINESS_UNAVAILABLE');
    }
  };
}

async function monitor({http,sourceSha,fingerprint}) {
  const latest = policy.revisions(await http.latest());
  const published = await http.published();
  assert.equal(sourceSha,await http.mainSha(),'Monitor not at latest main');
  const observation = {latest,published,fingerprint,sourceSha};
  const withoutProof = policy.decide(observation);
  if (withoutProof.decision==='NO_OP') return withoutProof;
  return {...withoutProof,decision:'CHECK',reason:'PUBLISHER_READINESS_REQUIRED'};
}

async function authorizeBuild({http,candidate,completionOptions}) {
  assert.equal(candidate.decision,'CHECK','An unsigned change observation is required');
  assert.ok(!Object.hasOwn(candidate,'completionSha256'),'Unsigned candidate must not carry completion evidence');
  const {sourceSha,fingerprint,retryFailedRunId}=candidate;
  const latest=policy.revisions(await http.latest());
  const published=await http.published();
  if (sourceSha!==await http.mainSha() || !policy.same(latest,candidate.target)) throw superseded('Monitor target superseded before authorization');
  const observation={latest,published,sourceSha,fingerprint,retryFailedRunId,completionOptions};
  const withoutProof=policy.decide(observation);
  if (withoutProof.decision==='NO_OP') return withoutProof;
  let readiness;
  try {
    readiness = await http.readReadiness(latest,{phase:'build-start',sourceSha,fingerprint});
  } catch {
    return {...withoutProof,reason:'STRICT_READINESS_UNAVAILABLE'};
  }
  const lastFailure = readiness?.state==='ready'?await http.lastFailure():null;
  if (sourceSha!==await http.mainSha()) throw superseded('Main advanced during build authorization');
  return policy.decide({...observation,readiness,lastFailure});
}

function superseded(message) {
  return Object.assign(new Error(message),{code:'SUPERSEDED'});
}

async function confirmPlan({http,plan,phase,getFingerprint,context,completionOptions}) {
  const published = await http.published();
  const latest = policy.revisions(await http.latest());
  const fingerprint = getFingerprint();
  const mainSha = await http.mainSha();
  if (!policy.same(latest,plan.target) || fingerprint!==plan.fingerprint ||
      context.sha!==mainSha || plan.sourceSha!==mainSha) throw superseded('Target revision or source superseded');
  // Run the signed check last, after GitHub, Pages, and revision reads.
  const readiness = await http.readReadiness(latest,{phase,sourceSha:mainSha,fingerprint});
  if (readiness?.state==='running') throw superseded('GAS update running');
  assert.ok(policy.completion(readiness,latest,completionOptions).ready,'Strict update completion unavailable');
  if (policy.sha(readiness.completionId)!==plan.completionSha256) throw superseded('Completion generation superseded');
  assert.equal(getFingerprint(),fingerprint,'Build source changed during readiness check');
  if (await http.mainSha()!==mainSha) throw superseded('Main advanced during readiness check');
  return {latest,published,readiness,fingerprint,context:{...context,mainSha}};
}

module.exports = {signBody,readStrict,makeReadinessReader,monitor,authorizeBuild,confirmPlan};
