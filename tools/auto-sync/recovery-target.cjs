'use strict';

const assert = require('node:assert/strict');
const {same, sha} = require('./policy.cjs');
const {verifySite} = require('./site.cjs');
const targets = require('./recovery-targets.json');

function selectRecoveryTarget(id) {
  assert.ok(Object.hasOwn(targets, id), 'Recovery target is not approved');
  const target = targets[id];
  const binding = [id, target.runId, target.sourceSha, target.releaseTag, target.assetName, target.archiveBytes, target.archiveSha256,
    target.paths, target.receiptSha256, target.inventorySha256, target.dataRevision, target.outputRevision];
  return {id, ...target, targetSha256:sha(JSON.stringify(binding))};
}

function recoveryAssetBinding(target) {
  assert.ok(Number.isSafeInteger(target.releaseId) && target.releaseId>0 && Number.isSafeInteger(target.assetId) && target.assetId>0,
    'Recovery Release and Asset IDs are not pinned');
  return {releaseId:target.releaseId, assetId:target.assetId, archiveSha256:target.archiveSha256,
    dataRevision:target.dataRevision, outputRevision:target.outputRevision};
}

async function verifyRecoveryOrigin({http,target}) {
  const binding=recoveryAssetBinding(target);
  const [release,asset,reference] = await Promise.all([
    http.gh('/releases/'+binding.releaseId),
    http.gh('/releases/assets/'+binding.assetId),
    http.gh('/git/ref/tags/'+encodeURIComponent(target.releaseTag))
  ]).then(responses=>responses.map(response=>response.json()));
  assert.ok(release.id===binding.releaseId && release.tag_name===target.releaseTag && release.draft===false &&
    release.prerelease===true && Array.isArray(release.assets) && release.assets.length===1,
    'Unexpected recovery Release');
  assert.ok(reference.ref==='refs/tags/'+target.releaseTag && reference.object?.type==='commit' &&
    reference.object.sha===target.sourceSha,'Recovery Release tag changed');
  for(const value of [asset,release.assets[0]]) {
    assert.ok(value?.id===binding.assetId && value.name===target.assetName && value.state==='uploaded' &&
      value.size===target.archiveBytes && value.digest==='sha256:'+binding.archiveSha256,
      'Recovery Release Asset unavailable or differs from approval');
  }
}

function verifyRecoveryArchive(target, bytes) {
  assert.ok(bytes.length===target.archiveBytes && sha(bytes)===target.archiveSha256, 'Recovery archive SHA256 or size mismatch');
}

function verifyRecoverySite(target, directory, verify=verifySite) {
  const site=verify(directory), release=site.release;
  assert.ok(release.runId===target.runId && release.sourceSha===target.sourceSha && same(release,target), 'Recovery release identity or Revision mismatch');
  assert.equal(site.rows.length,target.paths,'Unexpected recovery path count');
  const byPath=new Map(site.rows.map(row=>[row.path,row]));
  assert.equal(byPath.get('data/sync-release.json')?.sha256,target.receiptSha256,'Recovery receipt SHA256 mismatch');
  assert.equal(byPath.get('data/sync-files.json')?.sha256,target.inventorySha256,'Recovery inventory SHA256 mismatch');
  assert.equal(release.filesManifestSha256,target.inventorySha256,'Recovery release binds a different inventory');
  return site;
}

module.exports={selectRecoveryTarget,recoveryAssetBinding,verifyRecoveryArchive,verifyRecoveryOrigin,verifyRecoverySite};
