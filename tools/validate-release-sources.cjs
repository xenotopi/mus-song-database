'use strict';
// Independent source contract. Never imports the presentation module.
const {descendants,textContent,hasClass,requireCondition:check}=require('./static-html-readonly-lib.cjs');
const eq=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m),clean=n=>textContent(n).trim();
const unavailable=new Set(['https://www.lovelive-anime.jp/otonokizaka/bd/tv1st/sp_4thlive.html','https://www.lovelive-anime.jp/otonokizaka/bd/movie/sp_finallive.html']);
function records(doc){const host=doc.ids.get('releaseSources');return host?JSON.parse(host.attrs['data-release-source-records']):[];}
function validateSourceOwner(doc,owner,urls){
 const rows=records(doc).filter(r=>r.owner===owner);eq(rows.map(r=>[r.key,r.url]),urls.map((url,i)=>[String(i),url]),'Release source owner binding: '+owner);
 for(const row of rows){const links=doc.nodes.filter(n=>n.tag==='a'&&n.attrs['data-release-source-refs']&&JSON.parse(n.attrs['data-release-source-refs']).some(ref=>ref[0]===owner&&ref[1]===row.key));check(links.length===1&&links[0].attrs.href===row.url,'Release missing/duplicate source reference: '+owner);}
}
function expectedReleaseSources(release,{single,album,bluray,sidecar}={}){
 const rows=[],add=(owner,values,context)=>values.forEach((r,i)=>rows.push({owner,key:String(i),url:r.url,label:r.label,context:typeof context==='function'?context(r):context}));
 if(single)add('single',single.sources.map((s,i)=>({url:s.url,label:i===0?'公式商品情報':s.key==='supplement'?'公式発売時情報':'発売元：'+s.key})),'特典・商品仕様');
 const names={official:'公式商品情報',publisher:'発売元：商品仕様',box1sale:'公式通販案内（発売当時）',box1first:'公式会場販売案内',best1:'公式仕様・特典案内',best2:'公式予約・店舗特典案内',box2:'公式BOX・店舗特典案内',box3:'公式BOX・個別盤案内',complete:'公式店舗特典案内'};
 if(album)add('album',album.sources.map(s=>({url:s.url,label:names[s.key]||'発売元：'+s.key})),'特典・商品仕様');
 if(bluray){add('bluray',[{url:bluray.source.url,label:`出典：公式商品ページ（${bluray.series}${bluray.volume?' 第'+bluray.volume+'巻':''}）`}],'本編・特典・商品仕様');for(const e of bluray.editions)add('bluray-related-'+e.key,e.relatedLinks.filter(l=>!unavailable.has(l.url)),e.label);}
 if(release.releaseId==='R0052'&&sidecar){const groups=new Map(),labels={physicalMedia:'特典媒体',qualifyingProducts:'対象商品',acquisitionCondition:'入手条件'};
  for(const entry of sidecar.relations){const rel=release.includedSongs.find(r=>r.relationId===entry.relationId),sources=new Map();for(const[k,f]of Object.entries(entry.fields))for(const s of f.sources){if(!sources.has(s.url))sources.set(s.url,[]);if(!sources.get(s.url).includes(labels[k]))sources.get(s.url).push(labels[k]);}for(const[url,fields]of sources){if(!groups.has(url))groups.set(url,[]);groups.get(url).push(`${rel.benefitStore}「${rel.displayName||rel.songName}」：${fields.join('・')}`);}}
  add('sidecar',[...groups].map(([url,contexts])=>({url,label:new URL(url).hostname==='www.sofmap.com'?'ソフマップ 商品案内':'畑亜貴 公式作品一覧',context:contexts.join('')})),r=>r.context);
 }
 return rows;
}
function validateSourceCollection(doc,release,expected){
 const host=doc.ids.get('releaseSources'),official=doc.ids.get('officialRelease'),primary=descendants(official,n=>n.tag==='a'&&hasClass(n,'release-official-link')),officialUrl=String(release.officialReleaseUrl||'').trim();
 eq(primary.map(n=>n.attrs.href),officialUrl?[officialUrl]:[],'Release official URL mismatch');
 if(officialUrl){
  const links=doc.nodes.filter(n=>n.tag==='a'&&n.attrs.href===officialUrl);
  check(links.length===1&&links[0]===primary[0],'Release duplicate/misplaced official URL');
 }
 if(!expected.length){check(!host,'Unexpected Release source collection');return;}
 check(host&&host.tag==='div'&&host.parent===official.parent&&host.attrs['data-release-id']===release.releaseId,'Release source collection placement/identity');
 const siblings=host.parent.children.filter(n=>typeof n!=='string');check(siblings.indexOf(host)===siblings.indexOf(official)+1,'Release sources must follow official works link');
 eq(records(doc),expected,'Release exact source URL/label/edition/store/field records');
 const groups=new Map();for(const r of expected){if(!groups.has(r.url))groups.set(r.url,[]);groups.get(r.url).push(r);}
 for(const[url,refs]of groups){const links=doc.nodes.filter(n=>n.tag==='a'&&n.attrs.href===url);check(links.length===1,'Release duplicate/missing source URL');const n=links[0];check(n.attrs.target==='_blank'&&n.attrs.rel==='noopener noreferrer'&&hasClass(n,'release-official-link'),'Release source link style/safety');eq(JSON.parse(n.attrs['data-release-source-refs']),refs.map(r=>[r.owner,r.key]),'Release source exact provenance references');
  if(url===officialUrl)check(n===primary[0],'Official product link relocated outside works information');
  else{check(descendants(host,x=>x===n).length===1,'Release source outside collection');check(clean(n)===[...new Set(refs.map(r=>r.label))].join('／'),'Release source label');const contexts=descendants(n.parent,x=>hasClass(x,'release-source-context'));eq(contexts.map(clean),[[...new Set(refs.map(r=>r.context).filter(Boolean))].join('／')],'Release source context');}
 }
 const other=expected.filter(r=>r.url!==officialUrl),disclosures=descendants(host,n=>hasClass(n,'release-source-disclosure'));
 check(disclosures.length===(other.length?1:0),'Release source disclosure count');for(const n of disclosures)check(n.tag==='details'&&!Object.hasOwn(n.attrs,'open')&&clean(n.children.find(c=>c.tag==='summary'))==='出典','Release sources initially closed');
 eq(descendants(host,n=>n.tag==='a').map(n=>n.attrs.href),[...groups.keys()].filter(url=>url!==officialUrl),'Release unexpected/missing central links');
 check(!doc.nodes.some(n=>hasClass(n,'release-bd-source')||hasClass(n,'release-single-sources')||hasClass(n,'release-sidecar-sources')),'Release duplicate legacy source block');
}
module.exports={records,validateSourceOwner,expectedReleaseSources,validateSourceCollection};
