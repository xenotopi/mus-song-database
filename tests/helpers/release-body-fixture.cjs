"use strict";
// Independent in-memory documents; no production renderer import or formal HTML writes.
const e=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const span=(c,t)=>'<span class="'+c+'">'+e(t)+'</span>';
function releaseBody(r,list,options={}){
 const x={...list.find(a=>a.releaseId===r.releaseId),...r},rows=r.includedSongs||[],meta=r.includedSongsMeta,origins=new Set((r.debutSongs||[]).map(s=>s.songId)),marked=new Set(),hasStores=rows.some(s=>s.benefitStore),stores=[...new Set(rows.map(s=>hasStores?s.benefitStore||"":""))];
 const children=x.editionType==="memorial_box"?list.filter(a=>a.parentReleaseId===r.releaseId):[],parent=list.find(a=>a.releaseId===x.parentReleaseId),exclude=new Set([r.releaseId,x.parentReleaseId,...children.map(c=>c.releaseId)]),siblings=x.releaseSeries?list.filter(a=>a.releaseSeries?.id===x.releaseSeries.id&&!exclude.has(a.releaseId)):[];
 const a=(c,url,title,tc)=>'<a class="'+c+'" href="'+e(url)+'">'+(tc?span(tc,title):e(title))+'</a>';
 const links=(id,items,tc)=>'<div id="'+id+'">'+items.map(s=>a("release-child-row","release/"+s.releaseId+".html",s.releaseName,tc)).join("")+'</div>';
 const info={};if(x.officialName&&x.officialName!==r.releaseName)info["正式商品名"]=x.officialName;
 if(x.releaseSeries)info["シリーズ"]=x.releaseSeries.shortName||x.releaseSeries.name;
 if(x.editionType)info["エディション"]=x.editionType==="individual"?"個別盤":"Memorial BOX";
 if(x.featuredSinger)info["対象キャラクター／歌唱名義"]=x.featuredSinger.name;if(x.catalogNumber)info["品番"]=x.catalogNumber;
 const outside=(r.debutSongs||[]).filter(s=>!rows.some(t=>t.songId===s.songId));
 let body='<h1>'+e(r.releaseName)+'</h1><div id="heroMeta">'+[(['R0032','R0052'].includes(r.releaseId)?'Blu-ray最終巻発売日：':'')+(r.releaseDate?r.releaseDate.replaceAll("-","/"):"発売日未登録"),r.classification||"分類未設定",...(r.releaseType?[r.releaseType]:[])].map(s=>'<span>'+e(s)+'</span>').join("")+'</div>';
 body+='<dl id="releaseInfo"'+(Object.keys(info).length?"":" hidden")+'>'+Object.entries(info).map(([k,v])=>'<dt>'+e(k)+'</dt><dd>'+e(v)+'</dd>').join("")+'</dl><div id="officialRelease">'+(r.officialReleaseUrl?a("",r.officialReleaseUrl,"公式作品ページを見る"):"")+'</div>';
 body+='<section id="relatedReleasesSection"'+(parent||children.length||siblings.length?"":" hidden")+'>'+links("parentReleaseHost",parent?[parent]:[])+links("childReleasesHost",children,"release-child-title")+links("seriesReleasesHost",siblings)+'</section>';
 body+='<section id="relatedEventsSection"'+(r.relatedEvents?.length?"":" hidden")+'><div id="relatedEventsHost">'+[...(r.relatedEvents||[])].sort((a,b)=>a.order-b.order).map(s=>a("release-event-row","event.html?id="+s.eventId,s.eventName,"release-event-title")).join("")+'</div></section>';
 body+='<section id="debutSongsSection"'+(outside.length?"":" hidden")+'><div id="debutSongs">'+outside.map(s=>a("release-song-row","song/"+s.songId+".html",s.songName||s.displayName,"release-song-title")).join("")+'</div></section>';
 const note=meta.publicNote||"",hidden=meta.status==="not_applicable"&&!rows.length&&!note;
 let content=note?'<p class="release-coverage-note">'+e(note)+'</p>':"";
 if(meta.status==="partial")content+=span("release-coverage-progress","確認済み"+meta.confirmedCount+"件 / 確認中"+meta.pendingCount+"件");
 if(!rows.length&&meta.status==="complete")content+="収録楽曲の登録はありません。";
 if(!rows.length&&meta.status==="unreviewed"&&!note)content+="収録情報を確認中です。";
 let groupIndex=0;
 for(const store of stores){
  const records=rows.filter(s=>(hasStores?s.benefitStore||"":"")===store),discKeys=[...new Set(records.map(s=>s.disc==null?null:String(s.disc)))];discKeys.sort((a,b)=>a===null?1:b===null?-1:0);
  const large=x.editionType==="memorial_box"&&!hasStores&&discKeys.length>=10;
  let section="";
  if(large)section+='<div class="release-large-box"><select data-box-member><option value="">すべてのメンバー</option>'+children.map(c=>'<option value="'+e(c.featuredSinger?.id)+'">'+e(c.featuredSinger?.name)+'</option>').join("")+'</select><select data-box-disc>'+discKeys.map((d,i)=>'<option value="release-disc-'+(groupIndex+i+1)+'">Disc '+e(d)+'</option>').join("")+'</select><p data-box-status></p>';
  discKeys.forEach((disc,idx)=>{
   groupIndex++;const data=records.filter(s=>(s.disc==null?null:String(s.disc))===disc),uniform=large&&data[0].variant&&data.every(s=>s.variant===data[0].variant)?data[0].variant:"";
   const title=(disc===null?"Disc未登録":"Disc "+disc)+(uniform?" · "+uniform:"")+data.length+(data.every(s=>s.track!=null)?"トラック":"件");
   const collapsible=discKeys.length>=2,grouped=disc!==null||collapsible;
   if(collapsible)section+='<details id="release-disc-'+groupIndex+'" class="release-disc-details'+(large&&idx===0?" is-selected":"")+'"'+(discKeys.length<3||idx===0?" open":"")+'><summary>'+e(title)+'</summary>';
   else if(grouped)section+='<section class="release-disc-group"><h3 class="release-disc-heading">'+e(title)+'</h3>';
   for(const s of data){
    const origin=origins.has(s.songId)&&!marked.has(s.songId);if(origin)marked.add(s.songId);
    section+='<a class="release-included-song-row" data-relation-id="'+e(s.relationId)+'" href="song/'+e(s.songId)+'.html">'+(s.track!=null?span("release-track-number",s.track):rows.some(r=>r.track!=null)?"Track未登録":"")+span("release-included-song-title",s.displayName||s.songName)+(!uniform&&s.variant?span("release-variant",s.variant):"")+(origin?span("release-origin","初出・由来"):"")+'</a>';
   }
   if(collapsible)section+='</details>';else if(grouped)section+='</section>';
  });
  if(large)section+='</div>';
  const title=r.classification==="特典"&&r.releaseType==="全巻購入特典"&&store?store+"｜"+r.releaseName:store||"店舗未登録";
  content+=hasStores?'<section class="release-store-group"><h3 class="release-store-heading">'+e(title)+'</h3>'+section+'</section>':section;
 }
 if(rows.length&&(marked.size||r.releaseId==="R0052"))content+='<details class="release-registration-details"'+(r.releaseId==="R0052"?" hidden":"")+'><summary>収録情報の注記</summary>曲マスター上の初出・由来です。特定の収録バージョンの初出ではありません。</details>';
 const unique=new Set(rows.map(r=>r.songId)).size,discSet=new Set(rows.map(r=>r.disc));
 let count=rows.length?(unique===rows.length?rows.length+"曲":rows.length+"件（"+unique+"曲）"):"";
 if(rows.length&&r.classification==="特典"&&r.releaseType==="全巻購入特典")count="店舗別特典CD";
 else if(rows.length&&discSet.size>1&&![...discSet].some(x=>x==null)){
  const registered=rows.every(x=>Number.isInteger(x.disc)&&x.disc>0&&Number.isInteger(x.track)&&x.track>0)&&new Set(rows.map(x=>x.disc+":"+x.track)).size===rows.length;
  count=discSet.size+" Disc · "+(unique===rows.length?rows.length+"曲":rows.length+(registered?"トラック":"件")+"（"+unique+"曲）");
 }
 if(r.releaseId==="R0072")count="10曲";
 return body+'<section id="includedSongsSection"'+(hidden?" hidden":"")+'><span id="includedSongsCount">'+count+'</span><div id="includedSongsContent">'+(options.kamipara||content)+'</div></section>';
}
module.exports={releaseBody};
