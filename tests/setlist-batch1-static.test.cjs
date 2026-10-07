const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const {validateEventSnapshot}=require('../tools/detail-snapshot-lib.cjs');
const revision='sha256-c49a830cb847904b76396897111936ab1b8b1c640bf63ab613243a1101f7feba';
const dataRevision='sha256-51b96a8ea846dd246d4aa66019b19cf9175158ea2eb589e5316317a41e8ee5f9';
const root=path.join(__dirname,'../data/snapshots',revision);
const events=()=>fs.readdirSync(path.join(root,'events')).map(f=>{const s=JSON.parse(fs.readFileSync(path.join(root,'events',f)));return validateEventSnapshot(s.data.event.eventId,s,revision,dataRevision).event;});
test('Batch1 generation validates all 353 Events / 1400 records / 478 positions / 52 confirmed Events',()=>{
 const all=events(),songs=all.flatMap(e=>e.songs);assert.equal(all.length,353);assert.equal(songs.length,1400);assert.equal(all.filter(e=>e.songOrderIsSetlist).length,52);assert.equal(songs.filter(s=>s.setlistPosition!=null).length,478);
 for(const e of all)for(const s of e.songs){if(e.songOrderIsSetlist)assert.ok(Number.isSafeInteger(s.setlistPosition)&&s.setlistPosition>0);if(s.setlistPosition!=null)assert.ok(Number.isSafeInteger(s.setlistPosition)&&s.setlistPosition>0);}
});
test('Batch1 repeat songs, medleys, Day differences and corrected singer remain intact',()=>{
 const m=new Map(events().map(e=>[e.eventId,e]));const p=(id,song)=>m.get(id).songs.filter(s=>s.songId===song).map(s=>s.setlistPosition).sort((a,b)=>a-b);
 assert.deepEqual(p('EV0007','S001'),[2,31]);assert.deepEqual(p('EV0013','S036'),[1,25]);assert.deepEqual(p('EV0013','S041'),[15]);assert.deepEqual(p('EV0013','S046'),[23]);
 assert.equal(m.get('EV0073').songs.filter(s=>s.setlistPosition===2).length,3);
 for(const id of ['EV0108','EV0109'])assert.deepEqual(m.get(id).songs.map(s=>s.setlistPosition).sort((a,b)=>a-b),Array.from({length:42},(_,i)=>i+1));
 assert.deepEqual(p('EV0108','S038'),[40]);assert.deepEqual(p('EV0109','S066'),[40]);
 const fixed=m.get('EV0086').songs.find(s=>s.songId==='S040');assert.equal(fixed.singer,'新田＆内田＆三森');assert.equal(fixed.setlistPosition,2);
 assert.deepEqual(p('EV0001','S001'),[1,18]);assert.deepEqual(p('EV0040','S064'),[25]);assert.deepEqual(p('EV0040','S003'),[26]);assert.deepEqual(p('EV0040','S045'),[27]);
 for(const id of ['EV0002','EV0038','EV0348']){assert.equal(m.get(id).songOrderIsSetlist,false);assert.ok(m.get(id).songs.every(s=>s.setlistPosition===null));}
});
