'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const config=require('./config.json');
const {client}=require('./http.cjs');
const policy=require('./policy.cjs');
const {callDirect}=require('./publication-fence.cjs');

const commands=new Set(['status','enter','enroll','reconcile','approve-baseline','cancel-baseline','close']);
const pagesStates={succeed:'succeeded',deployment_failed:'failed',cancelled:'cancelled'};

async function refreshRecoveryEvidence({entered,state,http,now=Date.now}){
  const evidence={...entered};
  // The operator records idle writers, Sheets checks, the historical expected bundle and deploy-log ID.
  const expected=evidence.expectedPublic;
  const latest=await http.latest();
  assert.ok(policy.same(latest,evidence.latest),'API revision changed since review');
  const current=await http.get(new URL('data/current.json',config.siteUrl));
  const publicRevision=policy.revisions(current.json());
  const marker=expected.path==='data/current.json'?current:
    await http.get(new URL('data/sync-release.json',config.siteUrl));
  assert.ok(['data/current.json','data/sync-release.json'].includes(expected.path));
  if(expected.path==='data/sync-release.json') assert.ok(policy.same(marker.json(),publicRevision));
  const sha256=policy.sha(marker.bytes);
  assert.ok(policy.same(expected,publicRevision)&&expected.sha256===sha256);
  evidence.publicSite={...publicRevision,sha256};
  const lease=state.lease;
  if(lease&&lease.kind!=='update'){
    const actual=(await http.gh('/actions/runs/'+lease.run.runId)).json();
    assert.equal(String(actual.id),lease.run.runId);
    assert.equal(actual.head_sha,lease.run.sourceSha);
    assert.equal(actual.head_branch,config.branch);
    assert.equal(actual.run_attempt,lease.run.attempt);
    const workflow=lease.kind==='baseline'?'.github/workflows/auto-sync-pages-migration.yml':config.publishWorkflowPath;
    assert.equal(actual.path,workflow);
    assert.equal(actual.status,'completed');
    evidence.run={...lease.run,status:actual.status};
    if(lease.phase==='DEPLOYING'){
      const pages=evidence.pages;
      assert.match(pages.deploymentId,/^[A-Za-z0-9_-]{1,128}$/);
      const actualPages=(await http.gh('/pages/deployments/'+pages.deploymentId)).json();
      assert.equal(pagesStates[actualPages.status],pages.status,'Pages state is still unconfirmed');
      assert.ok(Object.hasOwn(pagesStates,actualPages.status));
    }
  }
  return {...evidence,observedAt:now()};
}

async function main(){
  const command=process.argv[2];
  assert.ok(commands.has(command));
  const key=process.env.MUSDB_DIRECT_OPERATOR_KEY;
  delete process.env.MUSDB_DIRECT_OPERATOR_KEY;
  const send=(name,payload)=>callDirect({role:'operator',route:'maintenance/'+name,payload,key});
  if(command==='status'){
    console.log(JSON.stringify((await send('status',{})).view,null,2));
    return;
  }
  const payload=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  if(command==='reconcile'||command==='close'){
    const state=(await send('status',{})).view;
    assert.equal(payload.serial,state.serial);
    const http=client(config,{token:process.env.MUSDB_RECOVERY_GITHUB_READER});
    payload.proof=await refreshRecoveryEvidence({entered:payload.proof,state,http});
  }
  const result=await send(command,payload);
  console.log(result.status);
}

module.exports={refreshRecoveryEvidence};
if(require.main===module)main().catch(()=>{
  console.error('PUBLICATION_MAINTENANCE_UNCONFIRMED');
  process.exitCode=1;
});
