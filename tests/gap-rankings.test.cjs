'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const model=import('../assets/js/gap-rankings-model.js');
const presentation=import('../assets/js/gap-rankings-presentation.js');
const current=JSON.parse(fs.readFileSync(path.join(root,'data/current.json')));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/gap-rankings.json')));
const event=(id,date,category='公式')=>({eventId:id,eventName:id,date,category});
const song=(id,ids)=>({songId:id,songName:id,performances:ids.map(eventId=>({eventId,type:'ソロ',singerCategory:'ソロ'}))});
const payload=async(events,songs)=> (await model).buildPayload(songs,events);

// Frozen historical input for the six existing hashes; never select it via current.
async function historicalSnapshot() {
  const revision='sha256-6fdbbc6ce4f103d9f222f9ac6d2f2d9954f91c327421e553422e442029c1a9dd';
  const dataRevision='sha256-7192e9317a6fb98418a20aba5fd97839b9e81d15a1c9629429c97cb7b68b562f';
  const base=path.join(root,'data/snapshots',revision),hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  const {sha256}=require('../tools/detail-snapshot-lib.cjs');
  const manifestBytes=fs.readFileSync(path.join(base,'manifest.json')),revisionBytes=fs.readFileSync(path.join(base,'revision.json'));
  assert.equal(manifestBytes.length,133564);assert.equal(hash(manifestBytes),'41701e6b471d6d3b75cbbaf37d382134f36384661f6e096560797bc9c1e7a172');
  assert.equal(revisionBytes.length,325);assert.equal(hash(revisionBytes),'a06b61a2a4cdbfdbee2f96668927a25a743dc3ee5a66253fa2aaa6aafcb4a21d');
  const manifest=JSON.parse(manifestBytes),metadata=JSON.parse(revisionBytes);
  for(const entry of [manifest,metadata]){assert.equal(entry.outputRevision,revision);assert.equal(entry.dataRevision,dataRevision);}
  let checked=0;
  function load(relative,entry){
    const bytes=fs.readFileSync(path.join(base,relative)),wrapper=JSON.parse(bytes);
    assert.equal(bytes.length,entry.bytes,relative);assert.equal(hash(bytes),entry.fileSha256,relative);assert.equal(sha256(wrapper.data),entry.sha256,relative);
    assert.equal(wrapper.snapshot.outputRevision,revision);assert.equal(wrapper.snapshot.dataRevision,dataRevision);checked++;return wrapper.data;
  }
  const details={};
  for(const [group,count,pattern]of [['songs',117,/^S\d{3}$/],['releases',114,/^R\d{4}$/],['events',355,/^EV\d{4}$/]]){
    const ids=Object.keys(manifest.hashes[group]).sort();assert.equal(manifest.counts[group],count);assert.equal(ids.length,count);assert.ok(ids.every(id=>pattern.test(id)));
    assert.deepEqual(fs.readdirSync(path.join(base,group)).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)).sort(),ids);
    details[group]=ids.map(id=>load(group+'/'+id+'.json',manifest.hashes[group][id]));
  }
  for(const [key,file]of [['releaseList','release-list.json'],['kamiparaDashboard','kamipara-dashboard.json'],['memberAnalytics','member-analytics.json']])load(file,manifest[key]);
  assert.equal(checked,589);
  const events=details.events.map(pair=>pair.event),songs=details.songs;
  assert.equal(songs.reduce((n,s)=>n+s.performances.length,0),1402);assert.equal(events.reduce((n,e)=>n+e.songs.length,0),1402);
  return {songs,events,payload:(await model).buildPayload(songs,events)};
}
test('current Song records: derived data is reproducible without writes',async()=>{
  const bytes=fs.readFileSync(path.join(root,'data/current.json'));
  assert.deepEqual(await require('../tools/generate-gap-rankings.cjs').generate({write:false}),data);
  const base=path.join(root,'data/snapshots',current.outputRevision);
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
  const sourceCount=Object.keys(manifest.hashes.songs).reduce((n,id)=>n+JSON.parse(fs.readFileSync(path.join(base,'songs',id+'.json'))).data.performances.length,0);
  assert.equal(data.payload.songs.length,117);assert.equal(data.payload.songs.reduce((n,s)=>n+s.recordCount,0),sourceCount);
  assert.deepEqual(fs.readFileSync(path.join(root,'data/current.json')),bytes);
});
test('formal Event category and date take precedence; unknown category uses raw type',async()=>{
  const m=await model,p=await payload([event('EV1','2020-01-01'),event('EV2','2020-02-01','不明')],[song('S001',['EV1','EV2'])]);
  assert.deepEqual(p.songs[0].dates[0].official,['EV1']);assert.deepEqual(p.songs[0].dates[0].solo,[]);
  assert.deepEqual(p.songs[0].dates[1].solo,['EV2']);assert.equal(m.categoryOf({type:'不明',singerCategory:'ソロ'},{}),'不明');
});
test('same-day repeated records retain counts and all Event associations',async()=>{
  const p=await payload([event('EV1','2020-01-01'),event('EV2','2020-01-01')],[song('S001',['EV1','EV1','EV2'])]);
  assert.equal(p.songs[0].recordCount,3);assert.equal(p.songs[0].dates.length,1);assert.equal(p.songs[0].dates[0].recordCount,3);
  assert.deepEqual(p.songs[0].dates[0].all,['EV1','EV2']);
});
test('A strictly excludes baseline day, retains today annotation and excludes today-only/empty',async()=>{
  const m=await model,p=await payload([event('EV1','2020-02-28'),event('EV2','2020-03-01')],[song('S001',['EV1','EV2']),song('S002',['EV2']),song('S003',[])]);
  const a=m.rankSongs(p,'official','current','2020-03-01');assert.equal(a.population,1);assert.equal(a.rows[0].days,2);
  assert.deepEqual(a.rows[0].todayEvents,['EV2']);assert.deepEqual(a.noHistory.map(s=>s.id),['S002','S003']);
});
test('B ignores pre-first period, one-day Songs; equal maxima choose latest revival',async()=>{
  const m=await model,p=await payload([event('EV1','2020-01-01'),event('EV2','2020-01-11'),event('EV3','2020-01-21')],[song('S001',['EV1','EV2','EV3']),song('S002',['EV1']),song('S003',[])]);
  const b=m.rankSongs(p,'all','history','2020-02-01');assert.equal(b.population,1);assert.equal(b.rows[0].days,10);
  assert.equal(b.rows[0].fromDate,'2020-01-11');assert.equal(b.rows[0].toDate,'2020-01-21');assert.equal(b.noInterval.length,2);
});
test('official / solo / all calculated independently, future excluded',async()=>{
  const m=await model,p=await payload([event('EV1','2020-01-01'),event('EV2','2020-02-01','ソロ'),event('EV3','2030-01-01')],[song('S001',['EV1','EV2','EV3'])]);
  assert.equal(m.rankSongs(p,'official','current','2020-03-01').rows[0].days,60);
  assert.equal(m.rankSongs(p,'solo','current','2020-03-01').rows[0].days,29);
  assert.equal(m.rankSongs(p,'all','current','2020-03-01').rows[0].days,29);
});
test('leap year, invalid month/day and reversed invalid conditions',async()=>{
  const m=await model;assert.equal(m.dayDifference('2020-02-28','2020-03-01'),2);assert.equal(m.dayDifference('2019-02-28','2019-03-01'),1);
  for(const date of ['2020-13-01','2020-02-30','2019-02-29','bad'])assert.equal(m.validDate(date),false);
  assert.throws(()=>m.rankSongs(data.payload,'bad','current','2020-01-01'));assert.throws(()=>m.dayDifference('bad','2020-01-01'));
});
test('TOP20, one entry per Song, competition ranks and deterministic ID order',async()=>{
  const m=await model,p=await payload([event('EV1','2020-01-01'),event('EV2','2020-01-02')],Array.from({length:25},(_,i)=>song('S'+String(i+1).padStart(3,'0'),[i<2?'EV1':'EV2'])).reverse());
  const a=m.rankSongs(p,'official','current','2020-02-01');assert.equal(a.rows.length,20);assert.equal(a.population,25);
  assert.deepEqual(a.rows.slice(0,3).map(r=>[r.id,r.rank]),[['S001',1],['S002',1],['S003',3]]);assert.equal(new Set(a.rows.map(r=>r.id)).size,20);
});
for(const [name,mutate]of Object.entries({revision:d=>d.source.dataRevision='old',partial:d=>d.payload.songs.pop(),duplicate:d=>d.payload.songs[1].id='S001',date:d=>d.payload.songs[0].dates[0].date='bad',event:d=>delete d.payload.events[d.payload.songs[0].dates[0].all[0]],count:d=>d.payload.songs[0].recordCount++}))test('fail-closed dataset '+name,async()=>{
  const d=structuredClone(data),m=await model;mutate(d);assert.throws(()=>m.validateDataset(d,current));
});
for(let i=0;i<15;i++)test('approximate period band and both boundaries '+i,async()=>{
  const {PERIOD_ANALOGIES:bands,periodAnalogy}=await presentation,b= bands[i];
  for(const days of [Math.ceil(b.from*365.25),Number.isFinite(b.to)?Math.ceil(b.to*365.25)-1:36525]){
    for(const id of ['S001','S002'])assert.ok(b.lines.includes(periodAnalogy(days,id)));
  }
  if(i)assert.ok(bands[i-1].lines.includes(periodAnalogy(Math.ceil(b.from*365.25)-1,'S001')));
  assert.equal(b.lines.length,2);assert.equal(i===0?b.from:bands[i-1].to,b.from);
});
test('under one year and invalid durations have no analogy',async()=>{
  const {periodAnalogy}=await presentation;for(const days of [0,1,364,365,-1,NaN,Infinity])assert.equal(periodAnalogy(days,'S014'),'');
});
test('deterministic per Song and period, no random selection; prescribed leading examples',async()=>{
  const {periodAnalogy}=await presentation;
  assert.equal(periodAnalogy(5352,'S014'),'ランドセルだった子が、もう二十歳。');
  assert.equal(periodAnalogy(4699,'S028'),'干支が一周して、さらにおまけ付き。');
  for(const days of [400,800,1100,1600,2000,2400,2800,3200,3600,4000,4700,5300,6100,7000,9000]){
    assert.equal(periodAnalogy(days,'S001'),periodAnalogy(days,'S001'));
    assert.notEqual(periodAnalogy(days,'S001'),periodAnalogy(days,'S002'));
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root,'assets/js/gap-rankings-presentation.js'),'utf8'),/Math\.random/);
});
test('all six rankings unchanged from FEATURE-GAP-RANKINGS-01 baseline',async()=>{
  const m=await model,hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
  const historical=await historicalSnapshot();
  const expected={'all/current':'10ecda107a2a66837f58d7a6541f13ec58bb45ac85c4c5ceb1e29628c359013c','all/history':'c0bb735e63369d7d3252586182e4d970a6fba1ac254643c1ab6336f978f5a239','official/current':'c51f3c24e1f444727a03d43b923420e7a7a70c7ed2a97c4c4866a4dc2e006dab','official/history':'3a94c1e2dbc3e165d6c9e8ca1be6d3d75a2225f298b5f328ed6efc61e09bc735','solo/current':'5e05112f94e182d541f1d734c336ec90d525e39a7c1c35900a4c275add36ddb0','solo/history':'40e8e5bb988efbee55436e7eadc4c001be50f4b305cfd18cafaec44ae31093f5'};
  for(const [condition,digest]of Object.entries(expected)){const [scope,mode]=condition.split('/');assert.equal(hash(JSON.stringify(m.rankSongs(historical.payload,scope,mode,'2026-10-15'))),digest);}
});

test('future official records preserve solo rankings and retain updated source histories',async()=>{
  const m=await model,historical=await historicalSnapshot(),baseDate='2026-10-15',beforeBytes=JSON.stringify(historical.payload);
  const base=path.join(root,'data/snapshots',current.outputRevision),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'))),{sha256}=require('../tools/detail-snapshot-lib.cjs');
  const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  function load(group,id){const bytes=fs.readFileSync(path.join(base,group,id+'.json')),entry=manifest.hashes[group][id],wrapper=JSON.parse(bytes);assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.fileSha256);assert.equal(sha256(wrapper.data),entry.sha256);assert.equal(wrapper.snapshot.outputRevision,current.outputRevision);assert.equal(wrapper.snapshot.dataRevision,current.dataRevision);return wrapper.data;}
  const futureEvents=['EV0356','EV0357'].map(id=>load('events',id).event),futureIds=new Set(futureEvents.map(e=>e.eventId));
  assert.ok(futureEvents.every(e=>e.category==='公式'&&e.date>baseDate&&!historical.events.some(old=>old.eventId===e.eventId)));
  const affected=new Set(futureEvents.flatMap(e=>e.songs.map(s=>s.songId))),updated=structuredClone(historical.songs);let added=0;
  for(const song of updated){if(!affected.has(song.songId))continue;const records=load('songs',song.songId).performances.filter(p=>futureIds.has(p.eventId));assert.ok(records.every(p=>p.type==='公式'&&p.singerCategory==='公式'&&p.date>baseDate));song.performances.push(...structuredClone(records));added+=records.length;}
  assert.equal(added,13);assert.equal(added,futureEvents.reduce((n,e)=>n+e.songs.length,0));
  const afterPayload=m.buildPayload(updated,[...historical.events,...futureEvents]);
  assert.equal(afterPayload.songs.reduce((n,s)=>n+s.recordCount,0),1415);assert.equal(JSON.stringify(historical.payload),beforeBytes);
  for(const mode of ['current','history']){
    const before=m.rankSongs(historical.payload,'solo',mode,baseDate),after=m.rankSongs(afterPayload,'solo',mode,baseDate);
    assert.deepEqual(after.rows,before.rows);assert.equal(after.population,before.population);
    for(const key of ['noHistory','noInterval'])assert.deepEqual(after[key].map(s=>s.id),before[key].map(s=>s.id));
    const oldSong=before.noHistory.find(s=>s.id==='S073'),newSong=after.noHistory.find(s=>s.id==='S073');
    assert.equal(newSong.recordCount,oldSong.recordCount+1);assert.notDeepEqual(newSong,oldSong);
  }
  for(const [id,eventId]of [['S068','EV0356'],['S073','EV0357']]){
    const before=historical.payload.songs.find(s=>s.id===id),after=afterPayload.songs.find(s=>s.id===id),event=futureEvents.find(e=>e.eventId===eventId),date=after.dates.find(d=>d.date===event.date);
    assert.equal(after.recordCount,before.recordCount+1);assert.ok(date.all.includes(eventId));assert.ok(date.official.includes(eventId));assert.deepEqual(date.solo,[]);
  }
});
