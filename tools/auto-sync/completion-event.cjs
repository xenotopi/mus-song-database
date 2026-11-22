'use strict';

const assert=require('node:assert/strict');
const {authorizeBuild}=require('./readiness-client.cjs');
const {validateMonitorRun}=require('./pipeline.cjs');
const policy=require('./policy.cjs');

const noticeFields=['completionIdSha256','dataRevision','outputRevision','schemaVersion'];

function completionNotice(value) {
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_NOTICE');
  assert.deepEqual(Object.keys(value).sort(),noticeFields,'INVALID_NOTICE_FIELDS');
  assert.equal(value.schemaVersion,1,'INVALID_NOTICE_VERSION');
  assert.match(value.completionIdSha256,/^[a-f0-9]{64}$/,'INVALID_COMPLETION_DIGEST');
  const revisions=policy.revisions(value);
  return {schemaVersion:1,completionIdSha256:value.completionIdSha256,...revisions};
}

function validateAutomaticMonitorRun({run,config,invocation,mainSha,enabled}) {
  assert.equal(enabled,true,'AUTOMATIC_PUBLICATION_DISABLED');
  assert.equal(invocation.event,'workflow_run','UNTRUSTED_PUBLISHER_EVENT');
  assert.equal(invocation.protected,true,'UNPROTECTED_PUBLISHER_REF');
  assert.equal(invocation.repositoryId,config.repositoryId,'WRONG_PUBLISHER_REPOSITORY');
  assert.equal(invocation.ref,'refs/heads/'+config.branch,'WRONG_PUBLISHER_REF');
  assert.equal(invocation.runAttempt,1,'PUBLISHER_RERUN_NOT_AUTOMATIC');
  assert.equal(invocation.sha,mainSha,'PUBLISHER_MAIN_CHANGED');
  validateMonitorRun(run,config);
  assert.equal(run.repository.id,config.repositoryId,'WRONG_MONITOR_REPOSITORY');
  assert.equal(run.head_repository.id,config.repositoryId,'WRONG_MONITOR_HEAD_REPOSITORY');
  assert.equal(run.workflow_id,config.monitorWorkflowId,'WRONG_MONITOR_WORKFLOW');
  assert.equal(run.event,'workflow_dispatch','WRONG_MONITOR_EVENT');
  assert.equal(run.run_attempt,1,'MONITOR_RERUN_NOT_AUTOMATIC');
  assert.ok(Number.isSafeInteger(config.trustedDispatchActorId)&&config.trustedDispatchActorId>0,'MISSING_TRUSTED_DISPATCH_ACTOR');
  assert.equal(run.actor?.id,config.trustedDispatchActorId,'UNTRUSTED_DISPATCH_ACTOR');
  assert.equal(run.triggering_actor?.id,config.trustedDispatchActorId,'UNTRUSTED_TRIGGERING_ACTOR');
  assert.equal(run.head_sha,mainSha,'STALE_MONITOR_MAIN');
  return run;
}

function validateAutomaticCandidate({candidate,run,config,invocation,mainSha,enabled}) {
  validateAutomaticMonitorRun({run,config,invocation,mainSha,enabled});
  assert.equal(candidate.repository,config.repository,'WRONG_MONITOR_PLAN_REPOSITORY');
  assert.equal(candidate.monitorRunId,run.id,'WRONG_MONITOR_PLAN_RUN');
  assert.equal(candidate.sourceSha,mainSha,'WRONG_MONITOR_PLAN_SOURCE');
  assert.equal(candidate.decision,'CHECK','NO_WORK_TO_AUTHORIZE');
  assert.equal(candidate.retryFailedRunId,null,'AUTOMATIC_RETRY_NOT_ALLOWED');
  const notice=completionNotice(candidate.completionNotice);
  assert.ok(policy.same(notice,candidate.target),'NOTICE_REVISION_MISMATCH');
  return notice;
}

async function authorizeAutomaticBuild({http,candidate,run,config,invocation,mainSha,enabled,completionOptions}) {
  const notice=validateAutomaticCandidate({candidate,run,config,invocation,mainSha,enabled});
  const result=await authorizeBuild({http,candidate,completionOptions});
  if (result.decision==='BUILD'&&result.completionSha256!==notice.completionIdSha256) {
    return {decision:'BLOCKED',reason:'NOTICE_GENERATION_SUPERSEDED',target:result.target};
  }
  return result;
}

module.exports={completionNotice,validateAutomaticMonitorRun,validateAutomaticCandidate,authorizeAutomaticBuild};
