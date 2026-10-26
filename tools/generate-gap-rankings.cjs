"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sha256,validateSnapshot,validateEventSnapshot}=require('./detail-snapshot-lib.cjs');
const ROOT=path.resolve(__dirname,'..');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function generate({root=ROOT,write=true}={}) {
  const {buildPayload,validateDataset}=await import('../assets/js/gap-rankings-model.js');
  const pointer=JSON.parse(fs.readFileSync(path.join(root,'data/current.json')));
  const base=path.join(root,'data/snapshots',pointer.outputRevision);
  const manifestBytes=fs.readFileSync(path.join(base,'manifest.json')),manifest=JSON.parse(manifestBytes);
  if(manifest.outputRevision!==pointer.outputRevision||manifest.dataRevision!==pointer.dataRevision||manifest.counts.songs!==117||!Number.isSafeInteger(manifest.counts.events)||manifest.counts.events<=0)throw Error('Snapshot manifest不一致');
  const inputs={};
  function load(type,id){const relative=`${type}/${id}.json`,bytes=fs.readFileSync(path.join(base,relative)),wrapper=JSON.parse(bytes),entry=manifest.hashes[type][id];
    if(!entry||digest(bytes)!==entry.fileSha256||bytes.length!==entry.bytes||sha256(wrapper.data)!==entry.sha256)throw Error('Snapshot hash不一致: '+relative);
    inputs[relative]=digest(bytes);
    if(type==='songs')validateSnapshot('song',id,wrapper,pointer.outputRevision,pointer.dataRevision);
    else validateEventSnapshot(id,wrapper,pointer.outputRevision,pointer.dataRevision);
    return type==='songs'?wrapper.data:wrapper.data.event;
  }
  const songIds=fs.readdirSync(path.join(base,'songs')).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)).sort();
  if(songIds.join()!==Array.from({length:117},(_,i)=>'S'+String(i+1).padStart(3,'0')).join())throw Error('Song ID集合不一致');
  const eventIds=fs.readdirSync(path.join(base,'events')).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)).sort();
  if(eventIds.length!==manifest.counts.events||eventIds.some(id=>!/^EV\d+$/.test(id))||eventIds.join()!==Object.keys(manifest.hashes.events).sort().join())throw Error('Event ID集合不一致');
  const payload=buildPayload(songIds.map(id=>load('songs',id)),eventIds.map(id=>load('events',id)));
  const data={schemaVersion:1,source:{outputRevision:pointer.outputRevision,dataRevision:pointer.dataRevision,manifestSha256:digest(manifestBytes),inputsSha256:sha256(inputs)},payloadSha256:digest(JSON.stringify(payload)),payload};
  validateDataset(data,pointer);
  // Never rewrite snapshots/current or invoke the official capture generators.
  if(!fs.readFileSync(path.join(base,'manifest.json')).equals(manifestBytes)||JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'data/current.json'))))!==JSON.stringify(pointer))throw Error('生成中にRevision変更');
  for(const [relative,hash]of Object.entries(inputs))if(digest(fs.readFileSync(path.join(base,relative)))!==hash)throw Error('生成中に入力変更');
  if(write)fs.writeFileSync(path.join(root,'data/gap-rankings.json'),JSON.stringify(data));
  return data;
}
module.exports={generate};
if(require.main===module)generate({write:!process.argv.includes('--check')}).then(d=>console.log(JSON.stringify({songs:d.payload.songs.length,records:d.payload.songs.reduce((n,s)=>n+s.recordCount,0),source:d.source}))).catch(e=>{console.error(e);process.exitCode=1;});
