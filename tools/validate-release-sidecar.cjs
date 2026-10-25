'use strict';
// Independent contract/DOM checks; never use browser renderer output as expected data.
const crypto=require('node:crypto');
const {records,validateSourceOwner}=require('./validate-release-sources.cjs');
const {descendants,textContent,hasClass,requireCondition:check}=require('./static-html-readonly-lib.cjs');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const labels={physicalMedia:'特典媒体',qualifyingProducts:'対象商品',acquisitionCondition:'入手条件'};
const approved={physicalMedia:'CD',qualifyingProducts:'2期Blu-ray',acquisitionCondition:'全巻特典'};
function expectedSidecar(sidecar,release){
 check(release.releaseId==='R0052'&&sidecar?.releaseId==='R0052'&&sidecar.schemaVersion===1&&sidecar.approvalScope==='public','Sidecar public approval/Release mismatch');
 check(sidecar.relations?.length===3,'Sidecar must have three separate store Relations');
 const ids=['RT0090','RT0091','RT0092'];check(JSON.stringify(sidecar.relations.map(r=>r.relationId))===JSON.stringify(ids),'Sidecar Relation set/order mismatch');
 return sidecar.relations.map(entry=>{
  const matches=release.includedSongs.filter(r=>r.relationId===entry.relationId);check(matches.length===1,'Sidecar missing/duplicate source Relation');const row=matches[0];
  check(entry.relationBinding===digest([release.releaseId,row.relationId,row.songId,row.benefitStore]),'Sidecar Relation/Song/store binding mismatch');
  check(JSON.stringify(Object.keys(entry.fields))===JSON.stringify(Object.keys(labels)),'Sidecar unknown/missing fields');
  const sources=new Map(),conditions=[];
  for(const[key,f]of Object.entries(entry.fields)){
   check(f.verificationStatus==='partial'&&f.displayApproval==='public'&&f.public===true,'Sidecar verification and public approval must stay separate');
   check(f.valueHash===digest([f.value,f.sources]),'Sidecar approved value/evidence hash mismatch');
   check(Array.isArray(f.sources)&&f.sources.length>0,'Sidecar evidence missing');
   for(const source of f.sources){const u=new URL(source.url);check(u.protocol==='https:'&&!u.username&&!u.password&&['akihata.jp','www.sofmap.com'].includes(u.hostname)&&/^2014(?: |店舗別)/.test(source.edition),'Sidecar source/edition invalid');if(!sources.has(source.url))sources.set(source.url,[]);if(!sources.get(source.url).includes(labels[key]))sources.get(source.url).push(labels[key]);}
   if(entry.relationId!=='RT0091')check(f.value===approved[key],'Other-store condition contamination');
   if(f.value!==approved[key])conditions.push([labels[key],f.value]);
  }
  return {relationId:entry.relationId,fields:Object.keys(labels).map(k=>[labels[k],approved[k]]),conditions,sources:[...sources].map(([url,fields])=>[url,(new URL(url).hostname==='www.sofmap.com'?'ソフマップ 商品案内':'畑亜貴 公式作品一覧')+'（'+fields.join('・')+'）'])};
 });
}
function validateSidecarBody(doc,release,sidecar){
 const blocks=doc.nodes.filter(n=>hasClass(n,'release-sidecar-info'));
 const sources=[doc.ids.get('releaseSources')].filter(Boolean);
 if(release.releaseId!=='R0052'){check(blocks.length===0&&!records(doc).some(r=>r.owner==='sidecar'),'Sidecar leaked into unrelated Release');return;}
 const expected=expectedSidecar(sidecar,release);check(blocks.length===3,'R0052 formal sidecar missing/duplicated');
 const same=(x,y,msg)=>check(JSON.stringify(x)===JSON.stringify(y),msg),clean=n=>textContent(n).trim(),children=n=>n.children.filter(x=>typeof x!=='string');
 blocks.forEach((block,i)=>{
  const siblings=children(block.parent),previous=siblings[siblings.indexOf(block)-1];check(previous?.attrs['data-relation-id']===expected[i].relationId,'Sidecar displayed under wrong Relation');
  const pairList=children(block).find(n=>n.tag==='dl'),pairs=children(pairList).map(n=>children(n).map(clean));same(pairs,expected[i].fields,'Sidecar normal fields differ from approved uniform display');
  check(children(block).length===1,'Sidecar per-store duplicate sources');
 });
 check(sources.length===1,'Shared sidecar sources missing');
 const groups=new Map();
 expected.forEach((row,i)=>{const relation=release.includedSongs.find(r=>r.relationId===row.relationId);for(const[url,label]of row.sources){if(!groups.has(url))groups.set(url,[]);const fields=label.slice(label.indexOf('（')+1,-1);groups.get(url).push(`${relation.benefitStore}「${relation.displayName||relation.songName}」：${fields}`);}});
 validateSourceOwner(doc,'sidecar',[...groups.keys()]);
 same(records(doc).filter(r=>r.owner==='sidecar').map(r=>[r.label,r.context]),[...groups].map(([url,rows])=>[new URL(url).hostname==='www.sofmap.com'?'ソフマップ 商品案内':'畑亜貴 公式作品一覧',rows.join('')]),'Sidecar store/Song/field associations');
 const conditions=descendants(sources[0],n=>Object.hasOwn(n.attrs,'data-sidecar-conditions'));
 same(conditions.map(n=>[n.attrs['data-sidecar-conditions'],children(n).map(n=>children(n).map(clean))]),expected.filter(r=>r.conditions.length).map(r=>[r.relationId,r.conditions]),'Sidecar original store conditions missing/changed');
}
module.exports={expectedSidecar,validateSidecarBody};
