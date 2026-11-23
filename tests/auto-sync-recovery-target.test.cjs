'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const config=require('../tools/auto-sync/config.json');
const {sha}=require('../tools/auto-sync/policy.cjs');
const {publicationFence,deploymentPayload}=require('../tools/auto-sync/publication-fence.cjs');
const {selectRecoveryTarget,recoveryAssetBinding,verifyRecoveryArchive,verifyRecoveryOrigin,verifyRecoverySite}=require('../tools/auto-sync/recovery-target.cjs');

const target=selectRecoveryTarget('pages-44928928159');
const workflow=path.resolve(__dirname,'../.github/workflows/auto-sync-pages-migration.yml');

function origin() {
  const asset={id:target.assetId,name:target.assetName,state:'uploaded',
    digest:'sha256:'+target.archiveSha256,size:target.archiveBytes};
  const release={id:target.releaseId,tag_name:target.releaseTag,draft:false,prerelease:true,assets:[{...asset}]};
  const tag={ref:'refs/tags/'+target.releaseTag,object:{type:'commit',sha:target.sourceSha}};
  const routes={['/releases/'+target.releaseId]:release,['/releases/assets/'+target.assetId]:asset,
    ['/git/ref/tags/'+target.releaseTag]:tag};
  const requests=[];
  const http={gh:async route=>{requests.push(route);assert.ok(Object.hasOwn(routes,route));return {json:()=>structuredClone(routes[route])};}};
  return {asset,release,tag,requests,verify:()=>verifyRecoveryOrigin({http,target})};
}

test('recovery must select the verified package explicitly; the legacy tree is never selectable',()=>{
  assert.equal(target.paths,7463);
  assert.equal(target.runId,44928928159);
  assert.equal(target.releaseId,455606933);
  assert.equal(target.assetId,783446732);
  for(const value of ['',undefined,'none','9159d5624fe90b9f83816874d7d52660fc01ab18','__proto__']){
    assert.throws(()=>selectRecoveryTarget(value),/not approved/);
  }
  const text=fs.readFileSync(workflow,'utf8');
  assert.match(text,/default: none\s+options:\s+- none\s+- pages-44928928159/);
  assert.doesNotMatch(text,/9159d562|7637|actions\/artifacts/);
  assert.match(text,/application\/octet-stream.*\/releases\/assets\//);
  assert.match(text,/recovery-archive[\s\S]+unzip -q[\s\S]+recovery-diff/);
});

test('only the pinned Release, tag and asset are used; Actions retention is irrelevant',async()=>{
  const known=origin();await known.verify();
  assert.deepEqual(known.requests,['/releases/455606933','/releases/assets/783446732','/git/ref/tags/'+target.releaseTag]);
  const tag=origin();tag.tag.object.sha='0'.repeat(40);
  await assert.rejects(tag.verify(),/Recovery Release tag changed/);
  const draft=origin();draft.release.draft=true;
  await assert.rejects(draft.verify(),/Unexpected recovery Release/);
  const replacement=origin();replacement.release.assets[0].id++;
  await assert.rejects(replacement.verify(),/Release Asset unavailable/);
  const otherRelease=origin();otherRelease.release.id++;
  await assert.rejects(otherRelease.verify(),/Unexpected recovery Release/);
});

test('unassigned IDs, missing asset proof and ZIP digest or size drift stop before recovery',async()=>{
  await assert.rejects(verifyRecoveryOrigin({http:{gh:()=>assert.fail('Unassigned IDs must not query GitHub')},
    target:{...target,releaseId:null,assetId:null}}),/IDs are not pinned/);
  for(const delta of [{id:403},{state:'open'}, {digest:'sha256:'+'0'.repeat(64)}, {size:1}, {digest:undefined}]){
    const fixture=origin();Object.assign(fixture.asset,delta);
    await assert.rejects(fixture.verify(),/Release Asset unavailable/);
  }
  const bytes=Buffer.from('fixture archive'), small={...target,archiveBytes:bytes.length,archiveSha256:sha(bytes)};
  verifyRecoveryArchive(small,bytes);
  assert.throws(()=>verifyRecoveryArchive(small,Buffer.from('mutated archive')),/SHA256 or size mismatch/);
});

test('exact receipt, inventory, both revisions and path count are pinned independently',()=>{
  const site={release:{...target,filesManifestSha256:target.inventorySha256},rows:[
    {path:'data/sync-release.json',sha256:target.receiptSha256}, {path:'data/sync-files.json',sha256:target.inventorySha256}
  ]};
  const fixtureTarget={...target,paths:2};
  assert.equal(verifyRecoverySite(fixtureTarget,'unused',()=>site),site);
  for(const field of ['dataRevision','outputRevision']){
    const changed=structuredClone(site);changed.release[field]='sha256-'+'0'.repeat(64);
    assert.throws(()=>verifyRecoverySite(fixtureTarget,'unused',()=>changed),/identity or Revision mismatch/);
  }
  for(const [i,kind] of [[0,'receipt'],[1,'inventory']]){
    const changed=structuredClone(site);changed.rows[i].sha256='0'.repeat(64);
    assert.throws(()=>verifyRecoverySite(fixtureTarget,'unused',()=>changed),new RegExp(kind+' SHA256 mismatch'));
  }
  assert.throws(()=>verifyRecoverySite(target,'unused',()=>site),/Unexpected recovery path count/);
});

test('a recovery ticket binds the Asset ID, ZIP and both revisions before reaching the coordinator',async()=>{
  const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:config.repository,
    GITHUB_REPOSITORY_ID:config.signedReadiness.repositoryId,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
    GITHUB_SHA:'1'.repeat(40),GITHUB_WORKFLOW_REF:config.repository+'/.github/workflows/auto-sync-pages-migration.yml@refs/heads/main',
    MUSDB_RUN_REF_PROTECTED:'true',MUSDB_PUBLICATION_FENCE_ENABLED:'true',MUSDB_PAGES_DEPLOY_ENABLED:'true',
    MUSDB_BASELINE_RECOVERY_TICKET:'2'.repeat(32),MUSDB_RECOVERY_TARGET:target.id,MUSDB_RECOVERY_TARGET_SHA256:target.targetSha256,
    MUSDB_RECOVERY_RELEASE_ID:String(target.releaseId),MUSDB_RECOVERY_ASSET_ID:String(target.assetId),
    MUSDB_DIRECT_FENCE_KEY:'3'.repeat(64)};
  const payload=deploymentPayload('baseline-begin',env);
  let calls=0;
  const fetch=async (url,{body})=>{
    calls++;
    assert.match(String(url),/\/musdb-publication-v1$/);
    const [,role,operation,,nonce,actual]=JSON.parse(body);
    assert.equal(role,'baseline');assert.equal(operation,'baseline/begin-v3');
    assert.equal(actual.targetId,target.id);assert.equal(actual.targetSha256,target.targetSha256);
    assert.deepEqual(actual.asset,recoveryAssetBinding(target));
    return Response.json({success:true,data:{success:true,nonce,status:'DEPLOY_ALLOWED'}});
  };
  for(const invalid of [{ticket:''},{targetId:'none'},{targetSha256:'0'.repeat(64)},
    ...[{releaseId:403},{assetId:404},{archiveSha256:'0'.repeat(64)},{outputRevision:'sha256-'+'0'.repeat(64)}]
      .map(delta=>({asset:{...payload.asset,...delta}}))]){
    await assert.rejects(publicationFence('baseline-begin',{env,fetch,payload:{...payload,...invalid}}));
  }
  assert.equal(calls,0);
  assert.throws(()=>deploymentPayload('baseline-begin',{...env,MUSDB_RECOVERY_ASSET_ID:'999'}),/Asset differs/);
  assert.equal(await publicationFence('baseline-begin',{env,fetch,payload}),'DEPLOY_ALLOWED');
  assert.equal(calls,1);
});
