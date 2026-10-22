"use strict";
// Independent product-inventory checks. Do not import the browser resolver.
const crypto=require('node:crypto');
const {descendants,textContent,hasClass,requireCondition:check}=require('./static-html-readonly-lib.cjs');
const keys=['relationId','songId','songName','displayName','disc','track','displayOrder','variant','benefitStore'],hash=r=>crypto.createHash('sha256').update(JSON.stringify(keys.map(k=>r[k]))).digest('hex');
function validateReleaseContentsData(data,releases){
 check(data?.schemaVersion===2&&data.scope==='release-product-track-list-only'&&Array.isArray(data.releases),'Contents schema');const map=new Map();
 const expected=Object.values(releases).filter(r=>r.releaseType==='サウンドトラック'||r.sourceMedia==='サウンドトラック').map(r=>r.releaseId).sort();
 check(JSON.stringify(data.releases.map(r=>r.releaseId).sort())===JSON.stringify(expected),'Contents complete soundtrack Release set');
 for(const item of data.releases){const release=releases[item.releaseId];check(release&&!map.has(item.releaseId)&&item.releaseName===release.releaseName&&item.releaseDate===release.releaseDate,'Contents Release FK');
  check(item.verification==='official-catalog-position-reviewed'&&/^https:\/\/catalog\.bandainamcomusiclive\.co\.jp\/release\/\d+\/$/.test(item.sourceUrl)&&/^[a-f0-9]{64}$/.test(item.sourceContentSha256),'Contents official source');check(Array.isArray(item.discs)&&item.discs.length>0,'Contents missing Discs');const bound=new Set(),tracks=[];
  const sourceId={R0071:'386',R0078:'313',R0082:'262'}[item.releaseId];check(sourceId&&item.managementCodeSource?.url==='https://www.sunrise-music.co.jp/list/detail.php?id='+sourceId&&/^[a-f0-9]{64}$/.test(item.managementCodeSource.contentSha256),'Contents management code source');
  item.discs.forEach((disc,i)=>{check(disc.disc===i+1&&Array.isArray(disc.tracks)&&disc.tracks.length>0,'Contents Disc sequence');disc.tracks.forEach((track,j)=>{
   check(track.track===j+1&&typeof track.officialTitle==='string'&&track.officialTitle.trim()&&track.sourceUrl===item.sourceUrl&&(track.officialVersion===null||typeof track.officialVersion==='string'),'Contents Track/title/source');
   check(!['songId','singerId'].some(k=>Object.hasOwn(track,k)),'Contents must not add Song/Singer IDs');check(!track.officialVersion||track.officialTitle.endsWith('('+track.officialVersion+')'),'Contents official version');
   check(track.managementCode===null||typeof track.managementCode==='string'&&/^(?:LM(?:\d+[A-Z]*|OP)|[TP]M\d+[A-Z]*|M\d+[A-Z]*)(?: [^\r\n<>]+)?$/.test(track.managementCode),'Contents management code field');
   const matches=release.includedSongs.filter(r=>r.disc===disc.disc&&r.track===track.track);
   if(track.relationId===null)check(matches.length===0&&track.relationBinding===null,'Contents omitted registered position');
   else{check(/^RT\d{4}$/.test(track.relationId)&&!bound.has(track.relationId)&&matches.length===1&&matches[0].relationId===track.relationId,'Contents Relation/Disc/Track binding');check(hash(matches[0])===track.relationBinding,'Contents immutable Relation tuple');bound.add(track.relationId);}
   tracks.push({...track,disc:disc.disc});
  });});check(bound.size===release.includedSongs.length,'Contents missing registered Relations');map.set(item.releaseId,{...item,tracks});
 }return map;
}
function validateReleaseContentsBody(doc,release,item){
 const host=doc.ids.get('includedSongsContent'),plain=descendants(host,n=>hasClass(n,'release-product-track-row'));
 if(!item){check(plain.length===0,'Contents unexpected extra product rows');return;}
 const cells=descendants(host,n=>hasClass(n,'release-product-track-row')||hasClass(n,'release-included-song-row'));check(cells.length===item.tracks.length,'Contents product count');
 const text=n=>textContent(n).trim();
 const lists=descendants(host,n=>hasClass(n,'release-product-track-list'));check(lists.length===item.discs.length,'Contents column lists');for(const list of lists){const heads=descendants(list,n=>hasClass(n,'release-track-columns'));check(heads.length===1&&heads[0].attrs['aria-hidden']==='true'&&JSON.stringify(heads[0].children.filter(n=>typeof n!=='string').map(text))===JSON.stringify(['No.','管理番号','曲名']),'Contents column headings');}
 cells.forEach((node,i)=>{const expected=item.tracks[i],number=descendants(node,n=>hasClass(n,'release-track-number'));check(number.length===1&&text(number[0])===String(expected.track),'Contents Track order');
  const codes=descendants(node,n=>hasClass(n,'release-management-code')),children=node.children.filter(n=>typeof n!=='string');check(codes.length===1&&children[1]===codes[0]&&text(codes[0])===(expected.managementCode||''),'Contents management code content/column');check(expected.managementCode?codes[0].attrs['aria-label']==='楽曲管理番号 '+expected.managementCode:codes[0].attrs['aria-hidden']==='true','Contents management code accessibility');const copy=descendants(node,n=>hasClass(n,'release-included-song-copy'));check(copy.length===1&&(!expected.managementCode||!text(copy[0]).includes(expected.managementCode)),'Contents management code repeated in title');
  let disc=node.parent;while(disc&&!hasClass(disc,'release-disc-details')&&!hasClass(disc,'release-disc-group'))disc=disc.parent;check(disc,'Contents missing Disc group');const heading=descendants(disc,n=>n.tag==='summary'||hasClass(n,'release-disc-heading'));check(heading.length===1&&text(heading[0]).startsWith('Disc '+expected.disc),'Contents Disc order');
  if(expected.relationId){check(node.tag==='a'&&node.attrs['data-relation-id']===expected.relationId,'Contents linked Relation identity');return;}
  check(node.tag==='div'&&hasClass(node,'release-product-track-row')&&node.attrs['data-product-disc']===String(expected.disc)&&node.attrs['data-product-track']===String(expected.track),'Contents plain identity');
  check(!['href','tabindex','role','data-relation-id','data-song-id','data-singer-id'].some(k=>Object.hasOwn(node.attrs,k)),'Contents plain row is interactive or has fabricated ID');
  check(!descendants(node,n=>['a','button','input','select','iframe'].includes(n.tag)||Object.hasOwn(n.attrs,'tabindex')||Object.hasOwn(n.attrs,'data-site-icon')||Object.hasOwn(n.attrs,'data-singer-id')||hasClass(n,'release-recording-vocal')).length,'Contents plain row contains links/arrows/vocals');
  const titles=descendants(node,n=>hasClass(n,'release-product-track-title'));check(titles.length===1&&text(titles[0])===expected.officialTitle,'Contents official plain title');
 });
 check(plain.length===item.tracks.filter(t=>t.relationId===null).length,'Contents plain count');
}
module.exports={validateReleaseContentsData,validateReleaseContentsBody};
