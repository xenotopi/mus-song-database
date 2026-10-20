'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),p=require('path');
const root=p.resolve(__dirname,'..'),load=f=>JSON.parse(fs.readFileSync(p.join(root,f))),rev=load('data/current.json').revision;
const release=load('data/snapshots/'+rev+'/releases/R0052.json').data,sidecar=load('data/release-sidecars/R0052.json');
const {expectedSidecar,validateSidecarBody}=require('../tools/validate-release-sidecar.cjs'),{parseSerializedHtml}=require('../tools/static-html-readonly-lib.cjs');
const q1='https://akihata.jp/works/music/?ah=%E3%82%89&an=lovelive&at=k',q3='https://www.sofmap.com/product_detail.aspx?sku=12334636';
const fields='<dl><div><dt>特典媒体</dt><dd>CD</dd></div><div><dt>対象商品</dt><dd>2期Blu-ray</dd></div><div><dt>入手条件</dt><dd>全巻特典</dd></div></dl>';
const fixture='<!doctype html><html><head></head><body>'+['RT0090','RT0091','RT0092'].map((id,i)=>'<div><a class="release-included-song-row" data-relation-id="'+id+'"></a><div class="release-sidecar-info">'+fields+'<details><summary>出典</summary><a href="'+q1+'">畑亜貴 公式作品一覧（'+(i===1?'特典媒体':'特典媒体・対象商品・入手条件')+'）</a>'+(i===1?'<a href="'+q3+'">ソフマップ 商品案内（特典媒体・対象商品・入手条件）</a><p>一次資料に記載されたソフマップ固有条件</p><dl><div><dt>対象商品</dt><dd>2期Blu-ray特装限定版（全巻連続予約）</dd></div><div><dt>入手条件</dt><dd>全巻連続予約特典（特装限定版第7巻予約分で終了）</dd></div></dl>':'')+'</details></div></div>').join('')+'</body></html>';
test('independent formal fixture and input contract pass',()=>{a.equal(expectedSidecar(sidecar,release).length,3);validateSidecarBody(parseSerializedHtml(fixture),release,sidecar);});
for(const[name,change]of [
 ['missing field',s=>s.replace('<dd>CD</dd>','<dd></dd>')],
 ['duplicate product block',s=>s.replace('</body>',s.match(/<div class="release-sidecar-info">[\s\S]*?<\/details><\/div>/)[0]+'</body>')],
 ['wrong Relation',s=>s.replace('data-relation-id="RT0091"','data-relation-id="RT0090"')],
 ['wrong source',s=>s.replace(q3,'https://example.com/')],
 ['lost Sofmap source condition',s=>s.replace('第7巻予約分で終了','終了日不明')],
 ['initial disclosure open',s=>s.replace('<details>','<details open>')],
 ['normal-display contamination',s=>s.replace('<dd>全巻特典</dd>','<dd>全巻連続予約特典</dd>')]
])test('formal negative rejects '+name,()=>a.throws(()=>validateSidecarBody(parseSerializedHtml(change(fixture)),release,sidecar)));
test('unrelated Release refuses supplemental product DOM',()=>a.throws(()=>validateSidecarBody(parseSerializedHtml(fixture),{releaseId:'R0010'},sidecar)));
test('renderer pinning includes both modules and sidecar data',()=>{const r=require('../tools/generate-release-pages.cjs').RELEASE_RENDERER_FILES,s=require('../tools/generate-song-pages.cjs').SONG_RENDERER_FILES;for(const f of ['assets/js/release-sidecar.js','assets/js/singer-display.js','data/release-sidecars/R0052.json','tools/validate-release-sidecar.cjs'])a.ok(r.includes(f));a.ok(s.includes('assets/js/singer-display.js'));});
test('existing independent full-protocol synthetic fixture conforms to new contract',()=>{const f=require('./helpers/static-html-validator-fixture.cjs').createFixture(),r=require('../tools/validate-static-html.cjs').validateStaticHtml(f.options);a.equal(r.status,'PASS',JSON.stringify(r.issues));a.equal(r.provenance,'VERIFIED');});
