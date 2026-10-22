"use strict";
// Independent reader: no renderer imports and no synthesis of recording credits.
const { descendants, textContent, hasClass, requireCondition: check } = require('./static-html-readonly-lib.cjs');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fields=['songId','disc','track','variant','displayName','benefitStore'];
function validateVocalData(data, releases) {
  check(data?.schemaVersion===1&&Array.isArray(data.releases)&&Array.isArray(data.singers),'Vocal schema');
  const singerIds=new Set(),releaseIds=new Set();
  for(const singer of data.singers){
    check(/^(?:SN|RVN)\d{4}$/.test(singer.singerId)&&!singerIds.has(singer.singerId)&&typeof singer.name==='string'&&singer.name.trim(),'Vocal singer ID/name');singerIds.add(singer.singerId);
    check(singer.cv===null||(typeof singer.cv==='string'&&singer.cv.trim()),'Vocal CV');
    if(singer.singerId.startsWith('RVN')){
      const members=singer.memberSingerIds;
      check(singer.scope==='release-only'&&singer.cv===null&&Array.isArray(members)&&members.length>=2&&members.length<=9&&new Set(members).size===members.length,'Vocal release-only scope');
      const definitions=members.map(id=>{const matches=data.singers.filter(s=>s.singerId===id);check(/^SN\d{4}$/.test(id)&&matches.length===1&&typeof matches[0].cv==='string'&&matches[0].cv.trim(),'Vocal release-only member FK');return matches[0];});
      check(definitions.map(s=>s.name).join('＆')===singer.name,'Vocal release-only member order');
    }else check(singer.scope===undefined&&singer.memberSingerIds===undefined,'Vocal global ID scope');
  }
  const units={SN0007:'Printemps',SN0011:'lily white',SN0013:'BiBi'},usedReviews=new Map();
  for(const entry of data.releases){
    check(!releaseIds.has(entry.releaseId)&&Array.isArray(entry.records),'Vocal duplicate Release');releaseIds.add(entry.releaseId);
    const source=releases[entry.releaseId];check(source&&source.releaseId===entry.releaseId,'Vocal Release FK');
    check((source.featuredSinger?.id||null)===entry.featuredSingerId&&(source.parentReleaseId||null)===entry.parentReleaseId,'Vocal Release singer/parent');
    const seen=new Set();
    for(const record of entry.records){
      const matches=source.includedSongs.filter(r=>r.relationId===record.relationId);
      check(/^RT\d{4}$/.test(record.relationId)&&!seen.has(record.relationId)&&matches.length===1,'Vocal duplicate/missing Relation');seen.add(record.relationId);
      check(fields.every(key=>matches[0][key]===record[key]),'Vocal Song/Disc/Track/Mix binding');check(singerIds.has(record.singerId),'Vocal Singer FK');
      check(Array.isArray(record.evidence)&&record.evidence.length>0,'Vocal evidence');
      check(['explicit_relation','featured_singer','child_release_exact','solo_disc_reference','user_confirmed_recording'].includes(record.basis),'Vocal basis');
      check(!record.singerId.startsWith('RVN')||record.basis==='user_confirmed_recording','Vocal release-only recording basis');
      for(const key of record.evidence){
        const evidence=data.evidence?.[key];
        if(record.basis==='user_confirmed_recording'){
          check(evidence?.kind==='user-confirmed-recording'&&evidence.reference==='RELEASE-VOCAL-04B'&&evidence.recordingIdentity==='vocal-credit-only'&&/^[a-f0-9]{64}$/.test(evidence.sourceContentSha256||''),'Vocal user review provenance');
          const approvals=evidence.approvals;
          check(Array.isArray(approvals)&&new Set(approvals.map(r=>r.relationId)).size===approvals.length,'Vocal user review duplicates');
          const approved=approvals.filter(r=>r.relationId===record.relationId);check(approved.length===1,'Vocal user review missing approval');
          const row=approved[0],singer=data.singers.find(s=>s.singerId===record.singerId);
          check(row.releaseId===entry.releaseId&&[...fields,'singerId'].every(k=>row[k]===record[k])&&row.name===(units[singer.singerId]||singer.name)&&Number.isInteger(row.sourceRow)&&row.sourceRow>=2&&row.sourceRow<=78,'Vocal user review tuple/name');
          if(!usedReviews.has(key))usedReviews.set(key,new Set());usedReviews.get(key).add(record.relationId);
        }else check(/^https:\/\//.test(evidence?.url||'')&&(evidence.kind==='official-product'||(evidence.kind==='official-creator-product'&&/^https:\/\/akihata\.jp\/works\/(?:music|video)\/\d+\/$/.test(evidence.url))),'Vocal evidence');
      }
      if(record.basis==='featured_singer')check(source.featuredSinger?.id===record.singerId,'Vocal Solo singer');
      if(record.basis==='child_release_exact'){
        const child=releases[record.childReleaseId],childRows=child?.includedSongs.filter(r=>r.relationId===record.childRelationId)||[];
        check(child?.parentReleaseId===entry.releaseId&&child.editionType==='individual'&&child.featuredSinger?.id===record.singerId&&childRows.length===1,'Vocal BOX child singer/parent');
        check(fields.filter(key=>key!=='disc').every(key=>childRows[0][key]===record[key]),'Vocal BOX child tuple');
        const parentDisc=source.includedSongs.filter(r=>r.disc===record.disc),childDisc=child.includedSongs.filter(r=>r.disc===childRows[0].disc);
        const signature=rows=>rows.map(r=>fields.filter(key=>key!=='disc').map(key=>r[key]));
        check(same(signature(parentDisc),signature(childDisc)),'Vocal BOX complete Disc sequence');
      }
      if(record.basis==='solo_disc_reference'){
        const child=releases[record.childReleaseId],refs=record.referenceRelationIds;
        check(child&&child.releaseId!==entry.releaseId&&child.featuredSinger?.id===record.singerId&&Array.isArray(refs)&&refs.length>0&&new Set(refs).size===refs.length,'Vocal Solo reference');
        // Historical BOX I inventory includes previously issued Solo CDs. Bind all stored
        // Mix recordings in order, not a performer inferred from the word "Mix".
        const childDisc=child.includedSongs.filter(r=>r.variant),parentDisc=source.includedSongs.filter(r=>r.disc===record.disc);
        check(same(refs,childDisc.map(r=>r.relationId)),'Vocal Solo complete reference IDs');
        const signature=rows=>rows.map(r=>['songId','variant','displayName','benefitStore'].map(key=>r[key]));
        check(same(signature(parentDisc),signature(childDisc)),'Vocal Solo complete recording sequence');
        const at=parentDisc.findIndex(r=>r.relationId===record.relationId);
        check(at>=0&&refs[at]===record.childRelationId,'Vocal Solo reference position');
        const childEntry=data.releases.filter(e=>e.releaseId===child.releaseId);
        check(childEntry.length===1&&childEntry[0].records.filter(r=>r.relationId===record.childRelationId&&r.singerId===record.singerId).length===1,'Vocal Solo referenced credit');
      }
    }
  }
  for(const[key,ids]of usedReviews)check(ids.size===data.evidence[key].approvals.length,'Vocal orphaned user approval');
  return data;
}
function expectedVocals(release,data){
 const entries=data.releases.filter(r=>r.releaseId===release.releaseId);check(entries.length<=1,'Vocal duplicate Release');
 const units={SN0007:'Printemps',SN0011:'lily white',SN0013:'BiBi'};
 return(entries[0]?.records||[]).map(r=>{const singers=data.singers.filter(s=>s.singerId===r.singerId);check(singers.length===1,'Vocal singer unique');const s=singers[0];return{relationId:r.relationId,singerId:r.singerId,text:`歌唱：${units[s.singerId]||s.name}`};});
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
