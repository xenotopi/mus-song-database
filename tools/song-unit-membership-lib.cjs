'use strict';
// Independent JSON/serialized-DOM contract. No browser renderer imports.
const {requireCondition:check,descendants,textContent}=require('./static-html-readonly-lib.cjs');
const units={printemps:['SN0007','Printemps',11,'Disc 7'],lily_white:['SN0011','lily white',10,'Disc 9'],bibi:['SN0013','BiBi',10,'Disc 8']};
function validateSongUnitMemberships(data,songIds){
 check(data?.schemaVersion===1&&data.scope==='song_unit_affiliation_only'&&data.approvalScope==='public'&&data.publicReleaseApproved===true&&data.unregisteredMeaning==='unknown_not_nonmember','Song unit approval/scope mismatch');
 check(data.sourcePolicyVersion==='UNIT-PERFORMANCE-RULE-02','Song unit policy mismatch');
 check(data.evidence?.length===1&&data.evidence[0].id==='aki-hata-complete-best-2019'&&data.evidence[0].url==='https://akihata.jp/works/music/27389/'&&data.evidence[0].kind==='creator_official'&&data.evidence[0].edition==='2019 Complete BEST BOX'&&data.evidence[0].scope===data.scope,'Song unit evidence mismatch');
 check(data.memberships?.length===31,'Song unit membership count must be 31');
 check(JSON.stringify(Object.keys(data.units).sort())===JSON.stringify(Object.keys(units).sort()),'Song unit keys mismatch');
 const result=new Map(),counts={printemps:0,lily_white:0,bibi:0};
 for(const row of data.memberships){const unit=units[row.unitKey];check(unit&&data.units[row.unitKey].displayNameRef===unit[0],'Song unit display reference mismatch');check(/^S\d{3}$/.test(row.songId)&&!result.has(row.songId)&&(!songIds||songIds.has(row.songId)),'Song unit duplicate/unknown Song ID');check(row.verificationStatus==='source_matched'&&row.displayApproval==='public'&&row.evidenceId===data.evidence[0].id&&row.sourceLocator===unit[3],'Song unit review/evidence scope mismatch');result.set(row.songId,{unitKey:row.unitKey,label:unit[1]});counts[row.unitKey]++;}
 for(const[k,u]of Object.entries(units))check(counts[k]===u[2],'Song unit per-unit count mismatch');
 return result;
}
function validateSongUnitBody(doc,songId,memberships){
 const host=doc.ids.get('songInfo');check(host,'Song info missing for unit affiliation');
 const terms=descendants(host,n=>n.tag==='dt'&&textContent(n).trim()==='所属ユニット'),wanted=memberships.get(songId);
 check(terms.length===(wanted?1:0),'Song unit field missing/unexpected/duplicate');
 if(wanted){const siblings=terms[0].parent.children.filter(n=>typeof n!=='string'),value=siblings[siblings.indexOf(terms[0])+1];check(value?.tag==='dd'&&textContent(value).trim()===wanted.label,'Song unit label mismatch');check(descendants(value,n=>n.tag==='a').length===0,'Affiliation must not link to performance-history Singer as a unit catalog');}
}
module.exports={validateSongUnitMemberships,validateSongUnitBody};
