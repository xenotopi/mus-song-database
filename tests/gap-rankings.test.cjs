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
  const expected={'all/current':'10ecda107a2a66837f58d7a6541f13ec58bb45ac85c4c5ceb1e29628c359013c','all/history':'c0bb735e63369d7d3252586182e4d970a6fba1ac254643c1ab6336f978f5a239','official/current':'c51f3c24e1f444727a03d43b923420e7a7a70c7ed2a97c4c4866a4dc2e006dab','official/history':'3a94c1e2dbc3e165d6c9e8ca1be6d3d75a2225f298b5f328ed6efc61e09bc735','solo/current':'5e05112f94e182d541f1d734c336ec90d525e39a7c1c35900a4c275add36ddb0','solo/history':'40e8e5bb988efbee55436e7eadc4c001be50f4b305cfd18cafaec44ae31093f5'};
  for(const [condition,digest]of Object.entries(expected)){const [scope,mode]=condition.split('/');assert.equal(hash(JSON.stringify(m.rankSongs(data.payload,scope,mode,'2026-10-15'))),digest);}
});
