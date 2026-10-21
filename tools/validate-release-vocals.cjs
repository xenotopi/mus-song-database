"use strict";
// Independent reader: no renderer imports and no synthesis of recording credits.
const { descendants, textContent, hasClass, requireCondition: check } = require('./static-html-readonly-lib.cjs');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fields=['songId','disc','track','variant','displayName','benefitStore'];
function validateVocalData(data, releases) {
  check(data?.schemaVersion===1&&Array.isArray(data.releases)&&Array.isArray(data.singers),'Vocal schema');
  const singerIds=new Set(),releaseIds=new Set();
  for(const singer of data.singers){check(/^SN\d{4}$/.test(singer.singerId)&&!singerIds.has(singer.singerId)&&typeof singer.name==='string'&&singer.name.trim(),'Vocal singer ID/name');singerIds.add(singer.singerId);check(singer.cv===null||(typeof singer.cv==='string'&&singer.cv.trim()),'Vocal CV');}
  for(const entry of data.releases){
    check(!releaseIds.has(entry.releaseId)&&Array.isArray(entry.records),'Vocal duplicate Release');releaseIds.add(entry.releaseId);
    const source=releases[entry.releaseId];check(source&&source.releaseId===entry.releaseId,'Vocal Release FK');
    check((source.featuredSinger?.id||null)===entry.featuredSingerId&&(source.parentReleaseId||null)===entry.parentReleaseId,'Vocal Release singer/parent');
    const seen=new Set();
    for(const record of entry.records){
      const matches=source.includedSongs.filter(r=>r.relationId===record.relationId);
      check(/^RT\d{4}$/.test(record.relationId)&&!seen.has(record.relationId)&&matches.length===1,'Vocal duplicate/missing Relation');seen.add(record.relationId);
      check(fields.every(key=>matches[0][key]===record[key]),'Vocal Song/Disc/Track/Mix binding');check(singerIds.has(record.singerId),'Vocal Singer FK');
      check(Array.isArray(record.evidence)&&record.evidence.length>0&&record.evidence.every(key=>data.evidence?.[key]?.kind==='official-product'&&/^https:\/\//.test(data.evidence[key].url)),'Vocal evidence');
      check(['explicit_relation','featured_singer','child_release_exact'].includes(record.basis),'Vocal basis');
      if(record.basis==='featured_singer')check(source.featuredSinger?.id===record.singerId,'Vocal Solo singer');
      if(record.basis==='child_release_exact'){
        const child=releases[record.childReleaseId],childRows=child?.includedSongs.filter(r=>r.relationId===record.childRelationId)||[];
        check(child?.parentReleaseId===entry.releaseId&&child.editionType==='individual'&&child.featuredSinger?.id===record.singerId&&childRows.length===1,'Vocal BOX child singer/parent');
        check(fields.filter(key=>key!=='disc').every(key=>childRows[0][key]===record[key]),'Vocal BOX child tuple');
        const parentDisc=source.includedSongs.filter(r=>r.disc===record.disc),childDisc=child.includedSongs.filter(r=>r.disc===childRows[0].disc);
        const signature=rows=>rows.map(r=>fields.filter(key=>key!=='disc').map(key=>r[key]));
        check(same(signature(parentDisc),signature(childDisc)),'Vocal BOX complete Disc sequence');
      }
    }
  }
  return data;
}
function expectedVocals(release,data){
 const entries=data.releases.filter(r=>r.releaseId===release.releaseId);check(entries.length<=1,'Vocal duplicate Release');
 const units={SN0007:'Printemps',SN0011:'lily white',SN0013:'BiBi'};
 return(entries[0]?.records||[]).map(r=>{const singers=data.singers.filter(s=>s.singerId===r.singerId);check(singers.length===1,'Vocal singer unique');const s=singers[0];return{relationId:r.relationId,singerId:r.singerId,text:`歌唱：${units[s.singerId]||s.name}${s.cv?`（CV：${s.cv}）`:''}`};});
}
function validateVocalBody(doc,release,data){
 const expected=expectedVocals(release,data),all=doc.nodes.filter(n=>hasClass(n,'release-recording-vocal'));
 check(all.length===expected.length,'Vocal saved count');
 const rows=doc.nodes.filter(n=>hasClass(n,'release-included-song-row'));
 for(const vocal of expected){
  const matches=rows.filter(n=>n.attrs['data-relation-id']===vocal.relationId);check(matches.length===1,'Vocal saved Relation');
  const row=matches[0],nodes=descendants(row,n=>hasClass(n,'release-recording-vocal'));check(nodes.length===1,'Vocal saved duplicate/missing');
  const node=nodes[0];check(node.tag==='span'&&node.attrs['data-singer-id']===vocal.singerId&&textContent(node)===vocal.text,'Vocal saved singer/name');
  const title=descendants(row,n=>hasClass(n,'release-included-song-title'))[0],meta=descendants(row,n=>hasClass(n,'release-included-song-meta'))[0];
  check(title&&node.parent===title.parent,'Vocal saved structure');const siblings=node.parent.children;check(siblings.indexOf(title)<siblings.indexOf(node)&&(!meta||siblings.indexOf(node)<siblings.indexOf(meta)),'Vocal title / singer / Mix order');
 }
 return {count:expected.length};
}
module.exports={validateVocalData,expectedVocals,validateVocalBody};
