'use strict';
// Independent structural checks; no browser renderer or live API imports.
const crypto=require('node:crypto');
const {descendants,textContent,hasClass,requireCondition:check}=require('./static-html-readonly-lib.cjs');
const {validateSourceOwner}=require('./validate-release-sources.cjs');
const TARGETS=['R0016','R0041','R0054','R0055','R0056','R0060','R0069','R0073','R0074','R0076','R0079','R0080','R0083','R0084','R0085','R0086','R0087'];
const eq=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m),text=n=>textContent(n).trim(),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function validateMediaData(data,releases,songIds){
 check(data?.schemaVersion===1&&data.scope==='release-media-product-facts-only'&&Array.isArray(data.releases),'Media schema');
 eq(data.releases.map(r=>r.releaseId),TARGETS.filter(id=>releases[id]?.officialReleaseUrl),'Media exact Release set');const result=new Map();
 for(const item of data.releases){
  const release=releases[item.releaseId];check(release&&release.releaseName===item.releaseName&&item.relationBinding===hash(release.includedSongs),'Media unchanged Release/Relation binding');
  const kind=item.releaseId==='R0086'?'collection':['R0054','R0055','R0056'].includes(item.releaseId)?'ticket':['R0041','R0060','R0069','R0074','R0087'].includes(item.releaseId)?'live':'radio';check(item.kind===kind&&item.summary&&item.sections?.length&&item.sources?.length&&Array.isArray(item.editions),'Media category/inventory');
  const keys=new Set();for(const s of item.sources){const u=new URL(s.url);check(u.protocol==='https:'&&!u.username&&!u.password&&s.key&&!keys.has(s.key)&&s.label&&['official','retailer','press'].includes(s.kind),'Media source identity');keys.add(s.key);}
  const bound=new Set();for(const s of item.sections){check(s.label&&keys.has(s.sourceKey)&&typeof s.description==='string'&&Array.isArray(s.entries),'Media source-bound section');const numbers=new Set();for(const e of s.entries){check(e.title&&Number.isInteger(e.number)&&e.number>0&&!numbers.has(e.number)&&!Object.hasOwn(e,'singerId'),'Media position/no new Singer');numbers.add(e.number);if(e.relationId){const rows=release.includedSongs.filter(r=>r.relationId===e.relationId);check(rows.length===1&&!bound.has(e.relationId)&&e.title===(rows[0].displayName||rows[0].songName)&&!e.songId,'Media audio reference/title');bound.add(e.relationId);}else if(e.songId)check(kind==='collection'&&/^S\d{3}$/.test(e.songId)&&songIds?.has(e.songId),'Media existing Song work link');}}
  if(['ticket','radio'].includes(kind))check(bound.size===release.includedSongs.length,'Media audio Relation coverage');
  for(const e of item.editions)check(e.label&&keys.has(e.sourceKey)&&e.facts?.length&&e.facts.every(f=>typeof f==='string'&&f),'Media edition/source facts');
  result.set(item.releaseId,item);
 }return result;
}
function validateMediaBody(doc,release,item){
 const inventory=doc.nodes.filter(n=>n.attrs['data-release-media-ready']===release.releaseId&&hasClass(n,'release-media-inventory')),products=doc.nodes.filter(n=>n.attrs.id==='mediaProductSection');
 if(!item){check(!inventory.length&&!products.length,'Unexpected media supplement');return;}
 check(inventory.length===1&&products.length===(item.editions.length?1:0),'Media missing/duplicate inventory/products');const content=doc.ids.get('includedSongsContent'),section=doc.ids.get('includedSongsSection');check(content&&section&&section.attrs.hidden===undefined&&descendants(content,n=>n===inventory[0]).length===1,'Media visible main inventory placement');
 if(products.length){check(products[0].attrs['data-release-media-product']===release.releaseId,'Media product identity');const siblings=products[0].parent.children.filter(n=>typeof n!=='string');check(siblings.indexOf(products[0])===siblings.indexOf(section)+1,'Media product position');}
 eq(descendants(inventory[0],n=>hasClass(n,'release-media-intro')).map(text),[item.summary],'Media summary');
 const groups=descendants(inventory[0],n=>Object.hasOwn(n.attrs,'data-media-section'));eq(groups.map(n=>n.attrs['data-media-section']),item.sections.map((_,i)=>String(i)),'Media group order');
 groups.forEach((g,i)=>{const s=item.sections[i];check(g.tag==='details'&&Object.hasOwn(g.attrs,'open')===(i===0||!s.entries.length),'Media disclosure initial state');check(text(g.children.find(n=>n.tag==='summary'))===s.label+(s.entries.length?' · '+s.entries.length+'項目':''),'Media group heading/count');eq(descendants(g,n=>hasClass(n,'release-media-description')).map(text),s.description?[s.description]:[],'Media Disc/episode description');
  const entries=descendants(g,n=>Object.hasOwn(n.attrs,'data-media-position'));eq(entries.map(n=>+n.attrs['data-media-position']),s.entries.map(e=>e.number),'Media exact source positions');
  entries.forEach((n,j)=>{const e=s.entries[j],links=descendants(n,x=>x.tag==='a');if(e.relationId){const r=release.includedSongs.find(r=>r.relationId===e.relationId);check(n.attrs['data-media-slot']===e.relationId&&links.length===1&&links[0].attrs['data-relation-id']===e.relationId&&links[0].attrs.href==='song/'+r.songId+'.html','Media original audio card binding');eq(descendants(links[0],x=>hasClass(x,'release-included-song-title')).map(text),[r.displayName||r.songName],'Media original audio title');}else{eq(descendants(n,x=>hasClass(x,'release-track-number')).map(text),[String(e.number)],'Media video/plain position');if(e.songId)check(links.length===1&&links[0].attrs.href==='song/'+e.songId+'.html'&&text(links[0])===e.title&&!Object.hasOwn(links[0].attrs,'data-relation-id'),'Media existing work link/no new Relation');else check(!links.length&&!descendants(n,x=>x.tag==='button'||Object.hasOwn(x.attrs,'tabindex')||Object.hasOwn(x.attrs,'data-site-icon')).length&&descendants(n,x=>hasClass(x,'release-media-title')).map(text)[0]===e.title,'Media plain noninteractive track');}});
 });
 const note=String(release.includedSongsMeta.publicNote||'');if(note){const notes=descendants(content,n=>hasClass(n,'release-coverage-note'));check(notes.some(n=>text(n).includes(note)),'Media public coverage note retained');const c=content.children.filter(n=>typeof n!=='string');check(c.indexOf(inventory[0])<c.findIndex(n=>hasClass(n,'release-coverage-note')),'Media content before coverage note');}
 const editions=products.length?descendants(products[0],n=>Object.hasOwn(n.attrs,'data-media-edition')):[];eq(editions.map(n=>n.attrs['data-media-edition']),item.editions.map((_,i)=>String(i)),'Media exact editions');editions.forEach((n,i)=>{check(n.tag==='details'&&!Object.hasOwn(n.attrs,'open')&&text(n.children.find(c=>c.tag==='summary'))===item.editions[i].label,'Media edition disclosure');eq(descendants(n,x=>x.tag==='li').map(text),item.editions[i].facts,'Media complete product facts');});
 validateSourceOwner(doc,'media',item.sources.map(s=>s.url));
 const expected=item.kind==='radio'?item.sections.length+' Disc':item.kind==='collection'?'映像 · 30項目':item.kind==='live'?'ライブ映像':release.includedSongs.length+'曲';check(text(doc.ids.get('includedSongsCount'))===expected,'Media display count');
}
module.exports={TARGETS,validateMediaData,validateMediaBody};
