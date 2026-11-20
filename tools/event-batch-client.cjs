'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const MAX_IDS=8,MAX_BYTES=524288,revisionPattern=/^sha256-[a-f0-9]{64}$/;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function eventTransportOptions(argv){
 const values=argv.filter(a=>a.startsWith('--event-transport='));assert.ok(values.length<=1,'Duplicate Event transport');
 const mode=values.length?values[0].slice('--event-transport='.length):'legacy';assert.ok(['legacy','batch-v1'].includes(mode),'Unknown Event transport');
 const sizes=argv.filter(a=>a.startsWith('--event-batch-size='));assert.ok(sizes.length<=1,'Duplicate Event batch size');
 const batchSize=sizes.length?Number(sizes[0].slice('--event-batch-size='.length)):MAX_IDS;
 assert.ok(Number.isInteger(batchSize)&&batchSize>=1&&batchSize<=MAX_IDS,'Invalid Event batch size');
 assert.ok(mode==='batch-v1'||sizes.length===0,'Batch size requires explicit batch transport');return{mode,batchSize};
}
async function fetchEventBatches({api,ids,dataRevision,outputRevision,batchSize=MAX_IDS,onBatch=()=>{}}){
 assert.ok(revisionPattern.test(dataRevision)&&revisionPattern.test(outputRevision),'Invalid batch revisions');
 assert.ok(Array.isArray(ids)&&ids.length&&ids.every(id=>/^EV\d+$/.test(id))&&new Set(ids).size===ids.length,'Invalid Event IDs');
 assert.ok(Number.isInteger(batchSize)&&batchSize>0&&batchSize<=MAX_IDS,'Invalid Event batch size');
 let navigation=null,navigationHash=null;const output=[];
 for(let offset=0;offset<ids.length;offset+=batchSize){
  const expected=ids.slice(offset,offset+batchSize),first=offset===0;
  // No fallback or generic payload retry: transport-level timeout policy alone may retry.
  const payload=await api('eventBatch',{ids:expected.join(','),dataRevision,outputRevision,includeNavigation:first?'1':'0'},1),data=payload?.data;
  assert.equal(payload?.success,true,'Batch API failure');assert.ok(data,'Missing batch data');assert.equal(data.schemaVersion,1);
  assert.equal(data.dataRevision,dataRevision,'Batch data Revision mismatch');assert.equal(data.outputRevision,outputRevision,'Batch output Revision mismatch');
  assert.equal(data._cache?.revision,dataRevision,'Batch cache Revision mismatch');
  assert.ok(Number.isSafeInteger(data.responseBytes)&&data.responseBytes>0&&data.responseBytes<=MAX_BYTES,'Invalid batch response size');
  assert.equal(Buffer.byteLength(JSON.stringify(data)),data.responseBytes,'Batch response bytes mismatch');
  assert.deepEqual(data.ids,expected,'Batch ID/order mismatch');assert.equal(data.count,expected.length);assert.equal(data.totalCount,ids.length,'Event total mismatch');assert.equal(data.navigationCount,ids.length);
  assert.ok(Array.isArray(data.entries)&&data.entries.length===expected.length,'Partial batch response');
  if(first){assert.ok(Array.isArray(data.navigation),'Missing shared navigation');navigation=data.navigation;navigationHash=digest(navigation);
   assert.equal(navigation.length,ids.length);assert.deepEqual([...navigation.map(e=>e.eventId)].sort(),[...ids].sort(),'Navigation Event set mismatch');
  }else assert.equal(Object.hasOwn(data,'navigation'),false,'Repeated navigation transfer');
  assert.equal(data.navigationSha256,navigationHash,'Shared navigation mismatch');
  for(let i=0;i<expected.length;i++){
   const entry=data.entries[i],id=expected[i];assert.equal(entry.id,id);assert.equal(entry.event?.eventId,id);assert.equal(entry.discover?.eventId,id);
   assert.equal(entry.event._cache?.revision,dataRevision);assert.equal(entry.discover._cache?.revision,dataRevision);
   const nav=entry.event.navigation;assert.ok(nav&&!Object.hasOwn(nav,'events'),'Unexpected per-event navigation list');
   assert.deepEqual(Object.keys(nav).sort(),['next','previous','totalCount']);assert.equal(nav.totalCount,ids.length);
   const n=navigation.findIndex(e=>e.eventId===id);assert.deepEqual(nav.previous,n>0?navigation[n-1]:null);assert.deepEqual(nav.next,navigation[n+1]||null);
   assert.ok(Array.isArray(entry.event.songs)&&entry.event.statistics?.songCount===entry.event.songs.length,'Incomplete Event songs');
   assert.equal(entry.event.statistics.uniqueSongCount,new Set(entry.event.songs.map(s=>s.songId)).size);
   for(const key of ['uniqueSongs','firstPerformedSongs','lastPerformedSongs'])assert.ok(Array.isArray(entry.discover[key]),'Incomplete discover');
   output.push({event:{...entry.event,navigation:{previous:nav.previous,next:nav.next,events:navigation,totalCount:nav.totalCount}},discover:entry.discover});
  }
  onBatch({ids:expected,bytes:data.responseBytes,metrics:data.metrics});
 }
 assert.equal(output.length,ids.length);return output;
}
module.exports={fetchEventBatches,eventTransportOptions,MAX_IDS,MAX_BYTES};
