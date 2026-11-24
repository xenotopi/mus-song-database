'use strict';
// Same-revision Web rebuild: keep published JSON bytes immutable, and call the
// existing formal capture producers under their existing shared operation lease.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function captureExisting({root,revision,expectedDataRevision}){assert.match(revision,/^sha256-[a-f0-9]{64}$/);const base=path.join(root,'data/snapshots',revision),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));assert.equal(manifest.dataRevision,expectedDataRevision);assert.equal(manifest.revision,revision);return require('../snapshot-publication.cjs').withSnapshotOperation(root,async()=>{const songs=await require('../generate-song-pages.cjs').generateSongPages({revision}),releases=await require('../generate-release-pages.cjs').generateReleasePages({revision});assert.equal(songs.count,117);assert.equal(releases.length,114);return{capturePages:231,reusedPublishedSnapshotBytes:true};});}
const policy=require('./policy.cjs');
const {confirmPublishedSnapshot}=require('./publication-mode.cjs');
async function generateVerifiedSnapshot({root,plan,published,retained,generatorArgs,freezeSource,run,save}){
  const target=path.join(root,'data/snapshots',plan.target.outputRevision);
  const legacy=Object.hasOwn(plan,'publishedSnapshot');
  confirmPublishedSnapshot(plan,published);
  if(!fs.existsSync(target)&&!legacy){
    const frozen=await freezeSource(plan);
    run('snapshot',generatorArgs,frozen);
    return;
  }
  assert.ok(published.verified&&policy.same(published,plan.target)&&retained.revisions.includes(plan.target.outputRevision),
    'Existing target snapshot is not proven published; refuse overwrite');
  assert.equal(policy.sha(fs.readFileSync(path.join(target,'manifest.json'))),published.release.snapshotManifestSha256,
    'Existing snapshot manifest differs from published bytes');
  if(legacy){
    run('snapshot',['tools/auto-sync/capture-existing.cjs',plan.target.outputRevision]);
    return;
  }
  const prior=published.release.sourceImageSha256;
  if(prior===undefined){
    const frozen=await freezeSource(plan);
    const log=run('snapshot-proof',[...generatorArgs,'--verify-existing-snapshot',plan.target.outputRevision],frozen);
    const proof=JSON.parse(log.trimEnd().split(/\r?\n/).at(-1));
    assert.ok(proof.status==='VERIFIED_EXISTING_SNAPSHOT'&&policy.same(proof,plan.target));
    assert.equal(proof.sourceImageSha256,plan.sourceImageSha256,'Snapshot proof used a different frozen input');
    assert.match(proof.dataSha256,/^[a-f0-9]{64}$/);
    save('existing-snapshot-proof.json',proof);
  }else{
    assert.equal(prior,plan.sourceImageSha256,'The same output revision has a different frozen input');
  }
  run('snapshot',['tools/auto-sync/capture-existing.cjs',plan.target.outputRevision]);
}
module.exports={captureExisting,generateVerifiedSnapshot};
if(require.main===module)captureExisting({root:path.resolve(__dirname,'../..'),revision:process.argv[2],expectedDataRevision:process.env.AUTO_SYNC_EXPECTED_DATA_REVISION}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.stack);process.exitCode=1;});
