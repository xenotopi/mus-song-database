'use strict';
// Independent serialized-HTML expectations, without importing the UI formatter.
const {requireCondition:check,descendants,textContent,hasClass}=require('./static-html-readonly-lib.cjs');
const roles={lyricist:'作詞',composer:'作曲',arranger:'編曲'};
function validUserSource(e){
 const c=e?.confirmation,a=c?.assertions;
 if(e?.kind!=='user_confirmation'||Object.hasOwn(e,'url')||!c?.reference||c.confirmedBy!=='user'||!c.statement?.trim()||!/^\d{4}-\d\d-\d\dT/.test(c.recordedAt||'')||!a||['songId','relationId','releaseId','catalogNumber','disc','track'].some(k=>a[k]!==e[k]))return false;
 if(e.purpose==='recording_identity')return c.type==='physical_item_report'&&a.discCount===1&&a.disc===1&&a.track===1&&Array.isArray(a.tracks)&&a.tracks.length>=2&&new Set(a.tracks.map(t=>t.track)).size===a.tracks.length&&a.tracks.every((t,i)=>t.track===i+1&&t.kind===(i===0?'song':i===1?'off_vocal':'drama'));
 return e.purpose==='credit'&&['creator_correction_report','explicit_credit_adoption'].includes(c.type)&&Object.hasOwn(roles,a.role)&&e.roles?.length===1&&e.roles[0]===a.role&&Array.isArray(a.creditedNames)&&a.creditedNames.length>0&&a.creditedNames.every(n=>typeof n==='string'&&n.trim());
}
function userPublicationApproved(data){const a=data.publicationApproval;return a?.scope==='verified_song_credits'&&typeof a.reference==='string'&&!!a.reference.trim()&&a.userConfirmedSources===true;}
function validateSongCreditsData(data,songs){
 check(data?.schemaVersion===1&&data.scope==='song_baseline_recording_credits'&&Array.isArray(data.songs)&&Array.isArray(data.evidence),'Song credit schema/scope');
 const result=new Map(),ids=new Set(),evidence=new Map();
 for(const e of data.evidence){let url;try{url=new URL(e.url);}catch{}const official=['publisher_official','creator_official','creator_agency_official'].includes(e.kind)&&url?.protocol==='https:'&&!url.username&&!url.password&&!Object.hasOwn(e,'confirmation');check(e.evidenceId&&!evidence.has(e.evidenceId)&&(official||validUserSource(e))&&e.title&&e.locator,'Invalid/duplicate Song credit evidence');evidence.set(e.evidenceId,e);}
 for(const item of data.songs){
  const song=songs.get(item.songId),r=item.recording;
  check(song&&!result.has(item.songId)&&r&&r.releaseId===song.debutRelease?.releaseId&&r.songVersion===song.version&&r.catalogNumber&&Number.isInteger(r.disc)&&r.disc>0&&Number.isInteger(r.track)&&r.track>0,'Song credit target missing/duplicate/wrong baseline');
  const bindings=song.includedReleases.filter(x=>x.releaseId===r.releaseId&&x.relationId===r.relationId&&(x.variant||null)===r.variant);
  check(bindings.length===1,'Song credit Relation/version mismatch');
  if(r.identityEvidenceRefs!==undefined){check(Array.isArray(r.identityEvidenceRefs)&&r.identityEvidenceRefs.length,'Recording identity evidence missing');for(const ref of r.identityEvidenceRefs){const e=evidence.get(ref);check(validUserSource(e)&&e.purpose==='recording_identity'&&e.songId===item.songId&&['releaseId','relationId','catalogNumber','disc','track'].every(k=>e[k]===r[k]),'Recording user confirmation target mismatch');}check(userPublicationApproved(data)||item.credits.every(c=>c.publishAllowed===false),'User-confirmed recording requires separate publication approval');}
  const rows=[],refs=new Set(),positions=new Set(),names=new Set();
  check(Array.isArray(item.credits),'Song credits missing');
  for(const c of item.credits){
   const key=c.role+':'+c.displayOrder,name=c.role+':'+c.creditedName;
   check(c.creditId&&!ids.has(c.creditId)&&Object.hasOwn(roles,c.role)&&typeof c.creditedName==='string'&&c.creditedName.trim()&&Number.isInteger(c.displayOrder)&&c.displayOrder>0&&!positions.has(key)&&!names.has(name),'Duplicate/invalid Song credit');ids.add(c.creditId);positions.add(key);names.add(name);
   check(['verified','partial','unverified'].includes(c.verificationStatus)&&typeof c.publishAllowed==='boolean'&&Array.isArray(c.evidenceRefs)&&c.evidenceRefs.length,'Song credit review/publication missing');
   for(const ref of c.evidenceRefs){const e=evidence.get(ref);check(e&&e.releaseId===r.releaseId&&e.catalogNumber===r.catalogNumber&&e.disc===r.disc&&e.track===r.track&&e.roles?.includes(c.role)&&(c.verificationStatus!=='verified'||e.verificationStatus==='verified'),'Song credit evidence target/role/status mismatch');if(e.recordingIdentityEvidenceRef)check(r.identityEvidenceRefs?.includes(e.recordingIdentityEvidenceRef),'Credit recording confirmation reference missing');if(e.kind==='user_confirmation')check((c.publishAllowed===false||userPublicationApproved(data))&&e.purpose==='credit'&&e.songId===item.songId&&e.relationId===r.relationId&&e.confirmation.assertions.role===c.role&&e.confirmation.assertions.creditedNames[c.displayOrder-1]===c.creditedName,'User-confirmed credit/name/publication mismatch');}
   if(c.verificationStatus==='verified'&&c.publishAllowed===true){rows.push(c);c.evidenceRefs.forEach(ref=>refs.add(ref));}
  }
  if(rows.length)for(const ref of r.identityEvidenceRefs||[])refs.add(ref);
  result.set(item.songId,{rows:Object.entries(roles).flatMap(([role,label])=>{const group=rows.filter(c=>c.role===role).sort((a,b)=>a.displayOrder-b.displayOrder);return group.length?[{role,label,value:group.map(c=>c.creditedName).join('・')}]:[];}),sources:data.evidence.filter(e=>refs.has(e.evidenceId)).map(e=>({...e,labels:e.purpose==='recording_identity'?['品番・収録位置']:Object.entries(roles).filter(([role])=>rows.some(c=>c.role===role&&c.evidenceRefs.includes(e.evidenceId))).map(([,label])=>label)}))});
 }
 return result;
}
function validateSongCreditsBody(doc,songId,credits){
 const wanted=credits.get(songId),host=doc.ids.get('songInfo');check(host,'Song information missing');
 check(descendants(host,n=>n.tag==='dt'&&Object.values(roles).includes(textContent(n).trim())).length===0,'Song basic information duplicates hero credits');
 const hero=doc.ids.get('songHeroCredits');check(Boolean(hero)===Boolean(wanted?.rows.length),'Song hero credits missing/unexpected');
 if(hero)check(hero.tag==='dl'&&hasClass(hero,'song-hero-credits'),'Song hero credit structure mismatch');
 const terms=hero?descendants(hero,n=>n.tag==='dt'):[];
 const actual=terms.map(dt=>{const siblings=dt.parent.children.filter(n=>typeof n!=='string'),dd=siblings[siblings.indexOf(dt)+1];check(dd?.tag==='dd','Song credit value missing');return[textContent(dt).trim(),textContent(dd).trim()];});
 check(JSON.stringify(actual)===JSON.stringify((wanted?.rows||[]).map(r=>[r.label,r.value])),'Song credit labels/order/names mismatch');
 if(hero){check(descendants(hero,n=>n.tag==='dd').length===terms.length,'Song hero credit value count mismatch');for(const[order,dt]of terms.entries()){const r=wanted.rows[order],dd=dt.parent.children.filter(n=>typeof n!=='string')[1];check(dt.attrs['data-song-credit']===r.role&&dd?.attrs['data-song-credit']===r.role,'Song hero credit role mismatch');}}
 const sources=descendants(doc.html,n=>hasClass(n,'song-credit-sources'));
 check(sources.length===(wanted?.rows.length?1:0),'Song credit source missing/unexpected');
 if(sources.length){const node=sources[0],container=doc.ids.get('songCreditSources');check(container&&descendants(container,n=>n===node).length===1&&(!hero||!descendants(hero,n=>n===node).length),'Song credit sources must remain in basic information');check(node.tag==='details'&&!Object.hasOwn(node.attrs,'open'),'Song credit sources must start collapsed');const summary=descendants(node,n=>n.tag==='summary');check(summary.length===1&&textContent(summary[0]).trim()==='クレジットの出典','Song credit source summary mismatch');
  const links=descendants(node,n=>n.tag==='a');check(JSON.stringify(links.map(n=>[n.attrs.href,textContent(n).trim(),n.attrs.target,(n.attrs.rel||'').split(/\s+/).sort()]))===JSON.stringify(wanted.sources.filter(e=>e.kind!=='user_confirmation').map(e=>[e.url,e.title,'_blank',['noopener','noreferrer']])),'Song credit source links differ');
  const items=descendants(node,n=>n.tag==='li');check(JSON.stringify(items.map(n=>textContent(n).trim()))===JSON.stringify(wanted.sources.map(e=>`${e.kind==='user_confirmation'?'ユーザー確認資料':e.title}（${e.labels.join('・')}／${e.catalogNumber}・Disc ${e.disc} Track ${e.track}）`)),'Song credit source attribution differs');
 }
}
// Capture already pins all Release sources. Validate the declared original
// Relation against those sources; the complete validator also checks the real
// Song baseline/version with validateSongCreditsData(data, snapshotSongs).
function validateReleaseCreditSources(data,releases){
 const originals=new Map();
 for(const item of data.songs){const r=item.recording,release=releases[r?.releaseId],rows=release?.includedSongs?.filter(t=>t.relationId===r.relationId&&t.songId===item.songId&&(t.variant||null)===r.variant)||[];
  check(rows.length===1,'Release credit original Relation mismatch');
  originals.set(item.songId,{songId:item.songId,version:r.songVersion,debutRelease:{releaseId:r.releaseId},includedReleases:rows.map(t=>({...t,releaseId:r.releaseId}))});
 }
 return validateSongCreditsData(data,originals);
}
function validateReleaseSongCreditsBody(doc,release,credits,data){
 const expected=[];
 for(const t of release.includedSongs){const item=data.songs.find(s=>s.songId===t.songId),r=item?.recording,original=r&&r.releaseId===release.releaseId&&r.relationId===t.relationId&&(t.variant||null)===r.variant&&(t.disc==null||t.disc===r.disc)&&(t.track==null||t.track===r.track);
  const rows=(credits.get(t.songId)?.rows||[]).filter(row=>row.role!=='arranger'||original);if(rows.length)expected.push({t,rows});
 }
 const blocks=doc.nodes.filter(n=>hasClass(n,'release-song-credits'));check(blocks.length===expected.length,'Release Song credit count mismatch');
 for(const{t,rows}of expected){const anchors=doc.nodes.filter(n=>hasClass(n,'release-included-song-row')&&n.attrs['data-relation-id']===t.relationId);check(anchors.length===1,'Release Song credit Relation missing/duplicate');const anchor=anchors[0],found=descendants(anchor,n=>hasClass(n,'release-song-credits'));check(found.length===1&&!descendants(anchor,n=>hasClass(n,'release-credits')).length,'Release Song credit duplicate/missing');const block=found[0],lines=block.children.filter(n=>typeof n!=='string');
  check(JSON.stringify(lines.map(n=>[n.tag,n.attrs['data-release-credit'],textContent(n)]))===JSON.stringify(rows.map(r=>['span',r.role,`${r.label}：${r.value}`])),'Release Song credit role/name/order mismatch');check(textContent(block)===rows.map(r=>`${r.label}：${r.value}`).join(' ／ '),'Release Song credit separators mismatch');
  const copy=block.parent,siblings=copy.children.filter(n=>typeof n!=='string'),title=siblings.find(n=>hasClass(n,'release-included-song-title')),vocal=siblings.find(n=>hasClass(n,'release-recording-vocal')),meta=siblings.find(n=>hasClass(n,'release-included-song-meta'));check(title&&siblings.indexOf(block)>siblings.indexOf(vocal||title)&&(!meta||siblings.indexOf(block)<siblings.indexOf(meta)),'Release Song credit title/vocal/Mix position mismatch');
 }
}
module.exports={validateSongCreditsData,validateSongCreditsBody,validateReleaseCreditSources,validateReleaseSongCreditsBody};
