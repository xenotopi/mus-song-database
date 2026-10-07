const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const {validateEventSnapshot,sha256}=require('../tools/detail-snapshot-lib.cjs');
const revision='sha256-c7349aa942952a64088e1df95e62cc81f7f42655785b9826c36badc06e89caa4';
const dataRevision='sha256-54324050df2b0bc56d2a433d3862eec2a7def50b758b5e58a8ec4686f2d62a2f';
const root=path.join(__dirname,'../data/snapshots',revision);
function events(){const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));return Object.entries(manifest.hashes.events).map(([id,h])=>{const body=fs.readFileSync(path.join(root,'events',id+'.json'),'utf8');const wrapper=JSON.parse(body);assert.equal(sha256(body),h.fileSha256);assert.equal(sha256(wrapper.data),h.sha256);return validateEventSnapshot(id,wrapper,revision,dataRevision).event;});}
test('Batch2 all 353 Events: 1400 records / 774 positions / 86 complete confirmed Events',()=>{
 const all=events(),songs=all.flatMap(e=>e.songs);assert.equal(all.length,353);assert.equal(songs.length,1400);assert.equal(all.filter(e=>e.songOrderIsSetlist).length,86);assert.equal(songs.filter(s=>s.setlistPosition!=null).length,774);
 for(const e of all)for(const s of e.songs){if(e.songOrderIsSetlist||s.setlistPosition!=null)assert.ok(Number.isSafeInteger(s.setlistPosition)&&s.setlistPosition>0);}
});
test('Batch2 medleys, corrected singers, mixed positions and old batches remain intact',()=>{
 const m=new Map(events().map(e=>[e.eventId,e]));const p=(id,song)=>m.get(id).songs.filter(s=>s.songId===song).map(s=>s.setlistPosition).sort((a,b)=>a-b);
 assert.equal(m.get('EV0217').songs.filter(s=>s.setlistPosition===22).length,6);assert.equal(m.get('EV0218').songs.filter(s=>s.setlistPosition===18).length,6);
 for(const [id,position] of [['S011',3],['S039',4],['S045',5]])assert.deepEqual(p('EV0316',id),[position]);
 for(const [event,song,singer] of [['EV0285','S042','新田＆Pile'],['EV0321','S003','新田＆飯田＆Pile']]){const row=m.get(event).songs.find(s=>s.songId===song);assert.equal(row.singer,singer);assert.equal(row.setlistPosition,4);}
 for(let i=320;i<=327;i++){const e=m.get('EV0'+i);assert.equal(e.songOrderIsSetlist,true);assert.equal(e.day,i%4<2?'Day1':'Day2');assert.equal(e.performance,i%2===0?'1部':'2部');}
 assert.deepEqual(p('EV0007','S001'),[2,31]);assert.deepEqual(p('EV0013','S036'),[1,25]);assert.deepEqual(p('EV0013','S041'),[15]);assert.deepEqual(p('EV0013','S046'),[23]);assert.equal(m.get('EV0073').songs.filter(s=>s.setlistPosition===2).length,3);
 for(const id of ['EV0108','EV0109'])assert.deepEqual(m.get(id).songs.map(s=>s.setlistPosition).sort((a,b)=>a-b),Array.from({length:42},(_,i)=>i+1));
 assert.deepEqual(p('EV0001','S001'),[1,18]);assert.deepEqual(p('EV0040','S064'),[25]);
 for(const id of ['EV0002','EV0038','EV0348']){assert.equal(m.get(id).songOrderIsSetlist,false);assert.ok(m.get(id).songs.every(s=>s.setlistPosition===null));}
});
