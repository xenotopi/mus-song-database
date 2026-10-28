
const {validateProductFacts}=require('./validate-release-product-facts.cjs');
const {validateSourceOwner}=require('./validate-release-sources.cjs');
'use strict';
// Independent product data and saved HTML validation; never import the renderer.
const crypto=require('node:crypto'),{descendants,textContent,hasClass,requireCondition:check}=require('./static-html-readonly-lib.cjs');
const hash=r=>crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex'),eq=(a,b,label)=>check(JSON.stringify(a)===JSON.stringify(b),label),text=n=>textContent(n).trim();
const counts={R0001:13,R0002:15,R0003:5,R0004:5,R0005:5,R0006:8,R0010:8,R0011:7,R0012:7,R0013:7,R0014:9,R0015:8,R0026:5,R0027:5,R0029:5,R0033:7,R0047:5,R0049:5,R0050:5};
function validateSingleData(data,releases){
 check(data?.schemaVersion===1&&data.scope==='release-single-product-facts-only'&&Array.isArray(data.releases),'Single schema');
 const expected=Object.values(releases).filter(r=>r.releaseType==='シングル'&&/^https:\/\/www\.lovelive-anime\.jp\/otonokizaka\/release.php#cd\d+$/.test(r.officialReleaseUrl||'')).map(r=>r.releaseId).sort();eq(data.releases.map(r=>r.releaseId),expected,'Single exact Release set/order');check(expected.length===0||expected.length===41,'Single 41 products');const result=new Map(),catalogs=new Set();
 for(const item of data.releases){const r=releases[item.releaseId];check(item.releaseName===r.releaseName&&item.releaseDate===r.releaseDate,'Single Release identity');check(item.sources?.length>=2&&new Set(item.sources.map(s=>s.key)).size===item.sources.length,'Single source identities');
  const refs=new Set();for(const s of item.sources){const u=new URL(s.url);check(u.protocol==='https:'&&['www.lovelive-anime.jp','catalog.bandainamcomusiclive.co.jp','www.sunrise-inc.co.jp'].includes(u.hostname)&&/^[a-f0-9]{64}$/.test(s.sha256)&&Number.isFinite(Date.parse(s.checkedAt)),'Single primary source');refs.add(s.key);}check(item.sources[0].key==='official'&&item.sources[0].url===r.officialReleaseUrl&&/^https:\/\/www\.lovelive-anime\.jp\/otonokizaka\/release.php#cd\d+$/.test(item.sources[0].url),'Single official binding');
  check(item.cd?.medium==='CD'&&item.cd.tracks?.length===(counts[item.releaseId]||4),'Single complete CD track count');const bound=[];item.cd.tracks.forEach((t,i)=>{check(t.track===i+1&&typeof t.title==='string'&&t.title&&refs.has(t.sourceRef)&&!Object.hasOwn(t,'songId')&&!Object.hasOwn(t,'singerId'),'Single track sequence/source/IDs');if(t.relationId===null){check(t.relationBinding===null&&['off-vocal','drama'].includes(t.kind),'Single non-Song');}else{const rows=r.includedSongs.filter(x=>x.relationId===t.relationId);check(rows.length===1&&rows[0].disc===null&&rows[0].track===null&&hash(rows[0])===t.relationBinding&&t.kind==='song','Single unchanged Relation binding');bound.push(t.relationId);}});eq(bound,r.includedSongs.map(x=>x.relationId),'Single Relation order/complete multiplicity');
  check(item.editions?.length===(item.releaseId==='R0033'?3:item.releaseId==='R0067'?2:1),'Single exact edition count');for(const e of item.editions){check(e.key===e.catalogNumber&&/^LACM-\d+$/.test(e.catalogNumber)&&!catalogs.has(e.key)&&e.label&&refs.has(e.sourceRef),'Single catalog/edition');catalogs.add(e.key);check(Number.isInteger(e.price?.amount)&&e.price.amount>0&&['inclusive','exclusive'].includes(e.price.tax)&&refs.has(e.price.sourceRef)&&(e.price.exclusiveAmount===null||Number.isInteger(e.price.exclusiveAmount)&&e.price.exclusiveAmount>0),'Single price/tax');for(const k of ['included','videoExtras','specifications']){check(Array.isArray(e[k]),'Single fact array');for(const f of e[k])check(f.text&&typeof f.text==='string'&&refs.has(f.sourceRef)&&(k!=='included'||f.historical===true&&typeof f.initialProduction==='boolean'),'Single source-bound historical facts');}}
  result.set(item.releaseId,item);
 }check(catalogs.size===(expected.length?44:0)&&data.releases.reduce((n,r)=>n+r.cd.tracks.length,0)===(expected.length?222:0),'Single 44 editions/222 CD tracks');return result;
}
// Independent allowlist for the three user-confirmed, external-only recordings.
const externalAudioLinks = Object.freeze({
 RT0068:{releaseId:'R0037',songId:'S068',videoId:'nGP-3iqhKy0'},
 RT0099:{releaseId:'R0057',songId:'S099',videoId:'YErKL8h7eUQ'},
 RT0105:{releaseId:'R0061',songId:'S105',videoId:'dkl6n38q3r0'}
});
function validateTrackLinks(row,release,recording,links){
 const songLinks=links.filter(n=>Object.hasOwn(n.attrs,'data-relation-id')||/^song\//.test(n.attrs.href||''));
 check(songLinks.length===1&&songLinks[0].attrs.href==='song/'+recording.songId+'.html'&&songLinks[0].attrs['data-relation-id']===recording.relationId,'Single existing Song link');
 const extra=links.filter(n=>n!==songLinks[0]),containers=descendants(row,n=>Object.hasOwn(n.attrs,'data-youtube-external-relation'));
 check(extra.length<=1&&containers.length===(extra.length?1:0),'Single unexpected track link');
 if(!extra.length)return;
 const allowed=externalAudioLinks[recording.relationId],container=containers[0],link=extra[0];
 check(allowed&&allowed.releaseId===release.releaseId&&allowed.songId===recording.songId,'Single external recording scope');
 check(container.tag==='div'&&hasClass(container,'song-youtube-external-only')&&container.attrs['data-youtube-external-relation']===recording.relationId&&container.attrs['data-video-id']===allowed.videoId&&!Object.hasOwn(container.attrs,'hidden')&&container.attrs['aria-hidden']!=='true','Single external container');
 check(container.parent===songLinks[0].parent,'Single external parent');
 const siblings=container.parent.children.filter(n=>typeof n!=='string');
 check(siblings.indexOf(container)===siblings.indexOf(songLinks[0])+1,'Single external position');
 const children=descendants(container,n=>n.tag==='a');
 check(children.length===1&&children[0]===link&&!descendants(container,n=>['iframe','img','button','details'].includes(n.tag)).length,'Single external-only content');
 check(hasClass(link,'song-youtube-external-button')&&link.attrs.href==='https://www.youtube.com/watch?v='+allowed.videoId&&link.attrs.target==='_blank'&&text(link)==='YouTubeで聴く ↗'&&link.attrs['aria-label']===recording.songName+'をYouTubeで聴く（新しいタブで開く）','Single external URL/label');
 eq((link.attrs.rel||'').split(/\s+/).sort(),['noopener','noreferrer'],'Single external safety attributes');
}
function validateSingleBody(doc,release,item){
 const section=doc.ids.get('singleProductSection'),host=doc.ids.get('includedSongsContent');
 if(!item){check(!section&&!doc.nodes.some(n=>Object.hasOwn(n.attrs,'data-single-track')||Object.hasOwn(n.attrs,'data-release-single-inventory')),'Single supplement outside registered set');return;}
 check(section?.tag==='section'&&section.attrs['data-release-single-ready']===release.releaseId&&section.attrs['aria-labelledby']==='singleProductHeading'&&!Object.hasOwn(section.attrs,'hidden'),'Single completed section');check(text(doc.ids.get('singleProductHeading'))==='特典・商品仕様','Single heading');
 const siblings=section.parent.children.filter(n=>typeof n!=='string');check(siblings.indexOf(section)===siblings.findIndex(n=>n.attrs.id==='includedSongsSection')+1,'Single section position');check(host?.attrs['data-release-single-inventory']===release.releaseId,'Single inventory identity');check(text(doc.ids.get('includedSongsCount'))===`CD · ${item.cd.tracks.length}トラック`,'Single count');
 const rows=descendants(host,n=>Object.hasOwn(n.attrs,'data-single-track'));check(rows.length===item.cd.tracks.length,'Single track body count');rows.forEach((row,i)=>{const t=item.cd.tracks[i];check(row.attrs['data-single-track']===String(t.track)&&row.attrs.role==='listitem','Single CD order');eq(descendants(row,n=>hasClass(n,'release-single-track-number')).map(text),[String(t.track)],'Single product position');const links=descendants(row,n=>n.tag==='a');if(t.relationId){const r=release.includedSongs.find(r=>r.relationId===t.relationId);validateTrackLinks(row,release,r,links);eq(descendants(row,n=>hasClass(n,'release-included-song-title')).map(text),[r.displayName||r.songName],'Single established display title');}else{check(links.length===0&&!descendants(row,n=>n.tag==='button'||Object.hasOwn(n.attrs,'tabindex')||Object.hasOwn(n.attrs,'data-relation-id')||Object.hasOwn(n.attrs,'data-singer-id')||Object.hasOwn(n.attrs,'data-site-icon')||hasClass(n,'release-recording-vocal')).length,'Single plain track noninteractive');eq(descendants(row,n=>hasClass(n,'release-single-plain-track')).map(text),[t.title],'Single plain title');}});
 const editions=descendants(section,n=>Object.hasOwn(n.attrs,'data-single-edition'));eq(editions.map(n=>n.attrs['data-single-edition']),item.editions.map(e=>e.key),'Single edition order');editions.forEach((n,i)=>{const e=item.editions[i];check(n.tag==='details'&&Object.hasOwn(n.attrs,'open')===(i===0),'Single initial disclosure');check(text(n.children.find(c=>c.tag==='summary'))===e.label,'Single edition label');eq(descendants(n,x=>Object.hasOwn(x.attrs,'data-single-catalog')).map(text),[e.catalogNumber],'Single catalog body');const price=e.price.amount.toLocaleString('ja-JP')+'円（'+(e.price.tax==='inclusive'?'税込':'税抜')+'）'+(e.price.exclusiveAmount===null?'':'／'+e.price.exclusiveAmount.toLocaleString('ja-JP')+'円（税抜）');eq(descendants(n,x=>Object.hasOwn(x.attrs,'data-single-price')).map(text),[price],'Single price body');validateProductFacts(n,['videoExtras','included','specifications'].map(name=>({name,rows:e[name]})));});
 editions.forEach((n,i)=>{const e=item.editions[i];eq(descendants(n,x=>x.tag==='h3').map(text),[...(e.videoExtras.length?[(e.label.startsWith('BD')?'Blu-ray':'DVD')+'収録内容']:[]),...(e.included.length?[(e.included.every(f=>f.initialProduction)?'初回生産分の封入特典':'封入特典')+'（発売当時）']:[]),...(e.specifications.length?['商品仕様']:[])],'Single factual category/initial-production scope');});
 validateSourceOwner(doc,'single',item.sources.map(s=>s.url));check(!descendants(section,n=>['img','iframe'].includes(n.tag)||Object.hasOwn(n.attrs,'data-relation-id')||Object.hasOwn(n.attrs,'data-singer-id')).length,'Single no duplicated music inventory/media');
}
module.exports={validateSingleData,validateSingleBody};
