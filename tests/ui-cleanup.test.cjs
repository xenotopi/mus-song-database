'use strict';
// Offline only: no browser, server, fetch, hooks, generation or filesystem writes.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),p=require('node:path'),vm=require('node:vm');
const root=p.resolve(__dirname,'..'),read=f=>fs.readFileSync(p.join(root,f),'utf8'),json=f=>JSON.parse(read(f));
const revision=json('data/current.json').revision,release=id=>json(`data/snapshots/${revision}/releases/${id}.json`).data;
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const wrap=body=>'<!doctype html><html><head></head><body>'+body+'</body></html>';
const {parseSerializedHtml:parse,descendants,textContent:txt,hasClass}=require('../tools/static-html-readonly-lib.cjs');
const load=f=>import('data:text/javascript;base64,'+Buffer.from(read(f)).toString('base64'));
const sidecar=load('assets/js/release-sidecar.js'),bluray=load('assets/js/release-bluray.js');
const sourceModule=load('assets/js/release-sources.js'),{offlineDocument}=require('./helpers/offline-release-dom.cjs');
const {expectedReleaseSources,validateSourceCollection}=require('../tools/validate-release-sources.cjs');
const official=r=>'<div id="officialRelease">'+(r.officialReleaseUrl?'<a class="release-official-link" href="'+esc(r.officialReleaseUrl)+'" target="_blank" rel="noopener noreferrer">公式作品ページを見る</a>':'')+'</div>';
async function consolidated(body,r){const doc=offlineDocument(wrap(body));(await sourceModule).consolidateReleaseSources(r.releaseId,doc);return doc.serialize();}
function checkSidecar(body){const doc=parse(body);validateSidecarBody(doc,r52,side);validateSourceCollection(doc,r52,expectedReleaseSources(r52,{sidecar:side}));}
const home=read('assets/js/home-v453.js'),start=home.indexOf('function renderTodayReleaseSongs(item)'),end=home.indexOf('function renderTodaySummary',start);
const today=vm.runInNewContext('('+home.slice(start,end).trim()+')',{escapeHtml:esc,buildSongUrl:id=>'song/'+id+'.html'});
const data=json('data/release-bluray-products.json'),side=json('data/release-sidecars/R0052.json'),r52=release('R0052');
const {validateSidecarBody}=require('../tools/validate-release-sidecar.cjs'),{validateBluRayData,validateBluRayBody}=require('../tools/validate-release-bluray.cjs');
test('Today: R0089 retains first-occurrence order, 70 Relations -> 19 Song links, 3 + 16',()=>{
 const r=release('R0089'),before=JSON.stringify(r);a.equal(r.includedSongs.length,70);
 const doc=parse(wrap(today(r))),links=doc.nodes.filter(n=>n.tag==='a');a.equal(links.length,19);
 a.deepEqual(links.map(n=>n.attrs.href),[...new Set(r.includedSongs.map(r=>'song/'+r.songId+'.html'))]);
 const details=doc.nodes.find(n=>n.tag==='details');a.equal(descendants(details,n=>n.tag==='a').length,16);a.equal(txt(details.children.find(n=>n.tag==='summary')),'残り16曲を見る');a.equal(JSON.stringify(r),before);
});
test('Today: preserve separate store conditions for a repeated Song, no title inference for unknown IDs',()=>{
 const rows=[{songId:'S090',songName:'A',benefitStore:'ゲーマーズ'},{songId:'S090',songName:'A',benefitStore:'ソフマップ'},{songName:'A'},{songName:'A'}],before=JSON.stringify(rows),doc=parse(wrap(today({includedSongs:rows})));
 a.equal(doc.nodes.filter(n=>n.tag==='a').length,1);a.equal(doc.nodes.filter(n=>hasClass(n,'today-release-song')).length,3);a.match(txt(doc.html),/ゲーマーズソフマップ/);a.equal(JSON.stringify(rows),before);
});
test('Today: R0052 three stores/Songs intact; empty/missing input stays absent',()=>{
 const html=today(r52);for(const r of r52.includedSongs){a.ok(html.includes(esc(r.benefitStore)));a.ok(html.includes('song/'+r.songId+'.html'));}a.equal(parse(wrap(html)).nodes.filter(n=>n.tag==='a').length,3);a.equal(today({}),'');
});
async function sidecarFixture(){const m=await sidecar,rows=await m.verifiedSidecarFields(r52,side);const blocks=rows.map(row=>'<div><a class="release-included-song-row" data-relation-id="'+row.relationId+'"></a><div class="release-sidecar-info"><dl>'+m.sidecarPresentation(row).fields.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(f.value)+'</dd></div>').join('')+'</dl></div></div>').join('');return {m,rows,body:await consolidated(blocks+m.sidecarSourcesHtml(rows,r52)+official(r52),r52)};}
test('Sidecar: shared closed sources, exact store/Song/field and original Sofmap condition associations',async()=>{
 const {body}=await sidecarFixture(),doc=parse(body);checkSidecar(body);a.equal(doc.nodes.filter(n=>n.tag==='a'&&n.attrs.href?.startsWith('https://akihata.jp/')).length,1);
 a.equal(doc.nodes.filter(n=>n.tag==='a'&&n.attrs.href?.startsWith('https://www.sofmap.com/')).length,1);a.match(txt(doc.html),/公式作品一覧/);
});
for(const [name,change]of [
 ['wrong source',s=>s.replace('https://www.sofmap.com/','https://invalid.example/')],
 ['lost Sofmap condition',s=>s.replace('第7巻予約分で終了','誤条件')],
 ['cross-store association',s=>s.replace('ゲーマーズ「','ソフマップ「')],
 ['open source disclosure',s=>s.replace('<details class=','<details open class=')],
 ['normal field contamination',s=>s.replace('<dd>CD</dd>','<dd>DVD</dd>')]
])test('Sidecar independent negative: '+name,async()=>{const {body}=await sidecarFixture();a.throws(()=>checkSidecar(change(body)));});
test('Blu-ray: original source data contract, all 15 products/30 editions',()=>{a.equal(validateBluRayData(data,Object.fromEntries(data.releases.map(r=>[r.releaseId,release(r.releaseId)]))).size,15);a.equal(data.releases.reduce((n,r)=>n+r.editions.length,0),30);});
async function bdBody(item){const m=await bluray,r=release(item.releaseId),previous=global.document;try{const baseline=offlineDocument(read('release/'+r.releaseId+'.html'));global.document=baseline;const out=m.renderBluRayProduct(item,r);m.applyTvBluRayLayout(item,r,out);global.document.getElementById('bluRayProductSection').replaceWith(out);(await sourceModule).consolidateReleaseSources(r.releaseId,global.document);return global.document.serialize();}finally{global.document=previous;}}
for(const item of data.releases)test('Blu-ray exact content and scoped application-detail omission: '+item.releaseId,async()=>{
 const before=JSON.stringify(item),body=await bdBody(item),r=release(item.releaseId);validateBluRayBody(parse(body),r,item);validateSourceCollection(parse(body),r,expectedReleaseSources(r,{bluray:item}));a.equal(JSON.stringify(item),before);
 for(const fact of item.editions.flatMap(e=>e.included).filter(f=>f.historical&&/申込|応募|抽選/.test(f.label))){a.ok(body.includes(esc(fact.officialName||fact.label)));if(fact.eventInfo)a.ok(!body.includes(esc(fact.eventInfo.description)));}
});
test('Blu-ray negative: changed price or missing bonus CD link is rejected',async()=>{const item=data.releases.find(r=>r.releaseId==='R0051'),body=await bdBody(item);for(const changed of [body.replace('円（税抜）','円（税込）'),body.replace('href="song/','href="wrong/')])a.throws(()=>validateBluRayBody(parse(changed),release(item.releaseId),item));});
test('Scoped CSS contracts: four borders, compact bonus Song link, 44px target, focus retained',()=>{
 const css=read('assets/css/release-detail.css');a.doesNotMatch(css,/\.release-bd-edition\s*\{[^}]*border-width:\s*1px 0 0/);
 a.match(css,/\.release-bd-cd, \.release-bd-edition, \.release-bd-history\s*\{[^}]*border: 1px solid[^}]*border-radius: 10px/);
 a.match(css,/\.release-bd-song-link\s*\{[^}]*display: inline-flex[^}]*width: fit-content[^}]*justify-content: flex-start[^}]*min-height: 44px/);a.match(css,/\.release-bluray a:focus-visible/);
});
const singles=json('data/release-single-products.json').releases,albums=json('data/release-album-products.json').releases;
for(const id of ['R0001','R0033','R0053','R0067','R0070','R0089','R0091'])test('Source relocation on baseline HTML preserves product fields/edition links: '+id,async()=>{
 const r=release(id),doc=offlineDocument(read('release/'+id+'.html')),m=await sourceModule,single=singles.find(r=>r.releaseId===id),album=albums.find(r=>r.releaseId===id);
 const links=()=>doc.querySelectorAll('.release-included-song-row').map(n=>[n.dataset.relationId,n.getAttribute('href'),n.textContent]);const before=links();m.consolidateReleaseSources(id,doc);
 const result=parse(doc.serialize());validateSourceCollection(result,r,expectedReleaseSources(r,{single,album}));require('../tools/validate-release-single-products.cjs').validateSingleBody(result,r,single);require('../tools/validate-release-album-products.cjs').validateAlbumBody(result,r,album);a.deepEqual(links(),before);
 const first=doc.serialize();m.consolidateReleaseSources(id,doc);a.equal(doc.serialize(),first,'Idempotent; captured sources survive without a fetch');
});
test('Exact-URL grouping keeps query/fragment/edition distinctions; duplicate bindings and unsafe protocols rejected',async()=>{
 const m=await sourceModule,rows=['https://example.invalid/#a','https://example.invalid/#b','https://example.invalid/?v=1','https://example.invalid/?v=2','https://example.invalid/#a'].map((url,i)=>({url,owner:'test',key:String(i),label:'L',context:'C'})),before=JSON.stringify(rows);
 a.equal(m.releaseSourceGroups(rows).length,4);a.equal(JSON.stringify(rows),before);a.throws(()=>m.releaseSourceGroups([rows[0],rows[0]]));a.throws(()=>m.releaseSourceGroups([{...rows[0],url:'javascript:alert(1)'}]));
});
test('No product/official URL: no fabricated link or empty disclosure',async()=>{const r={releaseId:'R0000'},doc=offlineDocument(wrap(official(r)));(await sourceModule).consolidateReleaseSources(r.releaseId,doc);a.equal(doc.querySelectorAll('a').length,0);a.equal(doc.getElementById('releaseSources'),null);});
for(const [name,change]of [
 ['missing central link',s=>s.replace('href="https://akihata.jp/','href="https://wrong.invalid/')],
 ['source context/ownership change',s=>s.replace('data-release-source-records="','data-release-source-records="BROKEN')],
 ['duplicate official product link',s=>s.replace('</body>','<a href="'+esc(r52.officialReleaseUrl)+'">duplicate</a></body>')],
 ['missing conditions',s=>s.replace('data-sidecar-conditions="RT0091"','data-sidecar-conditions="RT0090"')],
 ['lost source binding',s=>s.replace('data-release-source-refs="','data-release-source-refs="BROKEN')]
])test('Central-source independent negative: '+name,async()=>{const {body}=await sidecarFixture();a.throws(()=>checkSidecar(change(body)));});
