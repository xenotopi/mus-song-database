"use strict";
// Independent in-memory documents; no production renderer import or formal HTML writes.
const e=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const span=(c,t)=>'<span class="'+c+'">'+e(t)+'</span>';
const {expectedGroups}=require('../../tools/validate-release-navigation.cjs');
function navigationFixture(r,list,data){
 const ordered=list.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.releaseDate||'')&&Number.isFinite(Date.parse(x.releaseDate+'T00:00:00Z'))&&new Date(x.releaseDate+'T00:00:00Z').toISOString().slice(0,10)===x.releaseDate).sort((a,b)=>a.releaseDate.localeCompare(b.releaseDate)||a.releaseId.localeCompare(b.releaseId)),at=ordered.findIndex(x=>x.releaseId===r.releaseId),neighbors=[at>0?ordered[at-1]:null,at>=0?ordered[at+1]||null:null];
 return '<nav id="releaseChronologyNav" aria-label="発売日順の前後の作品">'+neighbors.map((x,i)=>{const dir=i?'next':'prev',tag=x?'a':'div';return '<'+tag+' class="release-neighbor-'+dir+'" '+(x?'href="release/'+x.releaseId+'.html" rel="'+dir+'"':'aria-disabled="true"')+'><span data-site-icon="'+(i?'arrow-right':'arrow-left')+'" aria-hidden="true"></span>'+span('release-neighbor-label',i?'次の作品':'前の作品')+span('release-neighbor-title',x?x.releaseName:at<0?'発売日未登録・不正のため表示できません':i?'次の作品はありません':'前の作品はありません')+(x?'<time datetime="'+x.releaseDate+'">'+x.releaseDate.replaceAll('-','/')+'</time>':'')+'</'+tag+'>';}).join('')+'</nav>';
}
function releaseBody(r,list,options={}){
 const x={...list.find(a=>a.releaseId===r.releaseId),...r},rows=r.includedSongs||[],meta=r.includedSongsMeta,origins=new Set((r.debutSongs||[]).map(s=>s.songId)),marked=new Set(),hasStores=rows.some(s=>s.benefitStore),stores=[...new Set(rows.map(s=>hasStores?s.benefitStore||"":""))];
 const children=x.editionType==="memorial_box"?list.filter(a=>a.parentReleaseId===r.releaseId):[],parent=list.find(a=>a.releaseId===x.parentReleaseId),exclude=new Set([r.releaseId,x.parentReleaseId,...children.map(c=>c.releaseId)]),siblings=x.releaseSeries?list.filter(a=>a.releaseSeries?.id===x.releaseSeries.id&&!exclude.has(a.releaseId)):[];
 const a=(c,url,title,tc)=>'<a class="'+c+'" href="'+e(url)+'">'+(c==='release-child-row'?span(tc||'mus-title-chip',title)+'<span data-site-icon="chevron-right" aria-hidden="true"></span>'+span('release-related-kind',(list.find(x=>'release/'+x.releaseId+'.html'===url)||{}).releaseType||(list.find(x=>'release/'+x.releaseId+'.html'===url)||{}).classification||''):(tc?span(tc,title):e(title)))+'</a>';
 const links=(id,items,tc)=>'<div id="'+id+'">'+items.map(s=>a("release-child-row","release/"+s.releaseId+".html",s.releaseName,tc)).join("")+'</div>';
 const info={};if(x.officialName)info["正式商品名"]=x.officialName;
 if(x.releaseSeries)info["シリーズ"]=x.releaseSeries.shortName||x.releaseSeries.name;
 if(parent)info["親BOX"]=parent.releaseName||"BOX詳細を見る";
 if(x.featuredSinger)info["対象キャラクター／歌唱名義"]=({SN0007:"Printemps",SN0011:"lily white",SN0013:"BiBi"})[x.featuredSinger.id]||x.featuredSinger.name;
 if(x.editionType)info["エディション"]=x.editionType==="individual"?"個別盤":"Memorial BOX";
 if(x.catalogNumber)info["品番"]=x.catalogNumber;
 const fields={"正式商品名":"official","シリーズ":"series","親BOX":"parent","対象キャラクター／歌唱名義":"featured","エディション":"edition","品番":"catalog"};
 const outside=(r.debutSongs||[]).filter(s=>!rows.some(t=>t.songId===s.songId));
 let body='<h1>'+e(r.releaseName)+'</h1><div id="heroMeta">'+[(['R0032','R0052'].includes(r.releaseId)?'Blu-ray最終巻発売日：':'')+(r.releaseDate?r.releaseDate.replaceAll("-","/"):"発売日未登録"),r.classification||"分類未設定",...(r.releaseType?[r.releaseType]:[])].map(s=>'<span>'+e(s)+'</span>').join("")+'</div>';
 body+='<article id="releaseInformationSection"><dl id="releaseInfo"'+(Object.keys(info).length?"":" hidden")+'>'+Object.entries(info).map(([k,v])=>'<div class="release-info-row" data-release-info-field="'+fields[k]+'"'+(k==="対象キャラクター／歌唱名義"?' data-release-featured':'')+'><dt>'+e(k)+'</dt><dd>'+(k==="親BOX"?a("","release/"+parent.releaseId+".html",v):e(v))+'</dd></div>').join("")+'</dl><div id="officialRelease">'+(r.officialReleaseUrl?a("",r.officialReleaseUrl,"公式作品ページを見る"):"")+'</div></article>';
 const navigationData=options.navigationData||require('../../data/release-navigation.json'),groups=expectedGroups(x,list,navigationData),related=parent||children.length||siblings.length||groups.length;
 body+=navigationFixture(r,list,navigationData);
 body+='<section id="relatedReleasesSection"'+(related?"":" hidden")+'><div id="relatedCurrentHost">'+(related?'<div class="release-related-current" aria-current="true">'+span('release-related-title',r.releaseName)+span('release-current-label','閲覧中')+span('release-related-kind',r.releaseType||r.classification||'')+'</div>':'')+'</div>'+links("parentReleaseHost",parent?[parent]:[])+links("childReleasesHost",children,"release-child-title")+links("seriesReleasesHost",siblings)+'<div id="curatedReleasesHost">'+groups.map(g=>'<section data-release-nav-group="'+g.key+'"><h3>'+e(g.label)+'</h3>'+g.rows.map(row=>'<a class="release-curated-row" href="release/'+row.releaseId+'.html">'+span('release-related-title',row.releaseName)+'<span data-site-icon="chevron-right" aria-hidden="true"></span>'+span('release-related-kind',[row.context,row.releaseType||row.classification||''].filter(Boolean).join(' · '))+'</a>').join('')+'</section>').join('')+'</div></section>';
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
  if(discKeys.length>=2&&!large)section+='<nav class="release-disc-index">'+discKeys.map((d,i)=>{const id="release-disc-"+(groupIndex+i+1);return '<a href="/release/'+r.releaseId+'.html#'+id+'" data-disc-target="'+id+'">Disc '+e(d)+'</a>';}).join("")+'</nav>';
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
 const navSections=[...(!hidden?[["includedSongsSection","収録内容"]]:[]),...(r.releaseId==="R0072"?[["kamiparaHistorySection","神パラ歌唱履歴"]]:[]),...(outside.length?[["debutSongsSection","初出・由来"]]:[]),...(related?[["relatedReleasesSection","関連作品"]]:[]),...(r.relatedEvents?.length?[["relatedEventsSection","関連イベント"]]:[]),["releaseInformationSection","作品情報"]];
 return body+'<section id="includedSongsSection"'+(hidden?" hidden":"")+'><span id="includedSongsCount">'+count+'</span><div id="includedSongsContent">'+(options.kamipara||content)+'</div></section><nav id="releaseSectionNav">'+navSections.map(([id,label])=>a("","/release/"+r.releaseId+".html#"+id,label)).join("")+'</nav>';
}
module.exports={releaseBody};
