'use strict';
// Same-revision Web rebuild: keep published JSON bytes immutable, and call the
// existing formal capture producers under their existing shared operation lease.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function captureExisting({root,revision,expectedDataRevision}){assert.match(revision,/^sha256-[a-f0-9]{64}$/);const base=path.join(root,'data/snapshots',revision),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));assert.equal(manifest.dataRevision,expectedDataRevision);assert.equal(manifest.revision,revision);return require('../snapshot-publication.cjs').withSnapshotOperation(root,async()=>{const songs=await require('../generate-song-pages.cjs').generateSongPages({revision}),releases=await require('../generate-release-pages.cjs').generateReleasePages({revision});assert.equal(songs.count,117);assert.equal(releases.length,114);return{capturePages:231,reusedPublishedSnapshotBytes:true};});}
module.exports={captureExisting};
if(require.main===module)captureExisting({root:path.resolve(__dirname,'../..'),revision:process.argv[2],expectedDataRevision:process.env.AUTO_SYNC_EXPECTED_DATA_REVISION}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.stack);process.exitCode=1;});
