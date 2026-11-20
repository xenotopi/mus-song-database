'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 assert.equal(process.env.AUTO_SYNC_NETWORK_MODE,'offline');
 const root=path.resolve(__dirname,'../..'),current=JSON.parse(fs.readFileSync(path.join(root,'data/current.json'))),start=Date.now();
 const song=await require('../generate-song-pages.cjs').generateSongPages({revision:current.outputRevision});
 const release=await require('../generate-release-pages.cjs').generateReleasePages({revision:current.outputRevision});
 assert.equal(song.count,117);assert.equal(Object.keys(song.pages).length,117);assert.equal(release.length,114);
 fs.writeFileSync(path.join(process.env.AUTO_SYNC_OUTPUT,'offline-capture.json'),JSON.stringify({status:'PASS',source:'saved snapshot; no freshness claim',revision:current.outputRevision,pages:song.count+release.length,seconds:(Date.now()-start)/1000},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
