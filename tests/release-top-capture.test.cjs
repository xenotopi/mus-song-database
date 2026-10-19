"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{chromium}=require('playwright');
const {removeRuntimeTopForCapture}=require('../tools/generate-release-pages.cjs');
const {assertReleaseDom}=require('./helpers/release-e2e-assertions.cjs');
const root=path.resolve(__dirname,'..'),out=process.env.RELEASE_TOP_QA_DIR;
if(!out)throw Error('RELEASE_TOP_QA_DIR must be an isolated output directory');
const pointer=require('../data/current.json'),base=path.join(root,'data/snapshots',pointer.outputRevision),read=f=>JSON.parse(fs.readFileSync(path.join(base,f))).data,list=read('release-list.json'),template=fs.readFileSync(path.join(root,'release.html'),'utf8');
const top='<button id="backToTopButton" type="button" class="back-to-top" aria-label="ページ上部へ戻る"><span>↑</span><small>TOP</small></button>';
const fixture=body=>'<!doctype html><html><head><title>Keep SEO</title><style>body{color:navy}</style></head><body><section id="keep"><a href="song/S001.html">Song &amp; name</a><input value="keep"></section>'+body+'</body></html>';
let browser,context,page,server,origin;const copies=new Map();
test.before(async()=>{fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome'});context=await browser.newContext({javaScriptEnabled:false});page=await context.newPage();const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+decodeURIComponent(name));if(path.relative(root,file).startsWith('..'))return res.writeHead(403).end();if(copies.has(name)){res.writeHead(200,{'content-type':'text/html'});return res.end(copies.get(name));}if(!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
test('TOP removal preserves every other DOM node and excludes TOP from serialization',async()=>{await page.setContent(fixture(top));const expected=await page.evaluate(()=>{const n=document.documentElement.cloneNode(true);n.querySelector('#backToTopButton').remove();return n.outerHTML;});await page.evaluate(removeRuntimeTopForCapture,{templateHtml:template});assert.equal(await page.locator('#backToTopButton').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.outerHTML),expected);assert.equal(await page.locator('#keep a').getAttribute('href'),'song/S001.html');assert.equal(await page.locator('#keep input').inputValue(),'keep');});
const cases=[['missing runtime TOP','',template,/TOP_COUNT/],['duplicate TOP',top+top,template,/TOP_COUNT/],['unexpected tag',top.replaceAll('button','article'),template,/TOP_SHAPE/],['nested TOP','<section>'+top+'</section>',template,/TOP_SHAPE/],['wrong class',top.replace('back-to-top','other'),template,/TOP_SHAPE/],['wrong type',top.replace('type="button"','type="submit"'),template,/TOP_SHAPE/],['wrong label',top.replace('ページ上部へ戻る','different'),template,/TOP_SHAPE/],['static input TOP',top,fixture(top),/TEMPLATE_TOP/],['missing pinned input',top,'',/TEMPLATE_MISSING/]];
for(const[name,live,source,pattern]of cases)test('reject '+name+' before mock publish',async()=>{await page.setContent(fixture(live));let published=0;await assert.rejects(async()=>{await page.evaluate(removeRuntimeTopForCapture,{templateHtml:source});published++;},pattern);assert.equal(published,0);assert.equal(await page.locator('#keep').count(),1);});
for(const mode of['noop','unrelated removal'])test('reject '+mode+' before mock publish',async()=>{await page.setContent(fixture(top));await page.evaluate(mode=>{const n=document.querySelector('#backToTopButton');n.remove=()=>{if(mode==='unrelated removal'){document.getElementById('keep').remove();Element.prototype.remove.call(n);}};},mode);let published=0;await assert.rejects(async()=>{await page.evaluate(removeRuntimeTopForCapture,{templateHtml:template});published++;},mode==='noop'?/TOP_REMAINS/:/NON_TOP_CHANGED/);assert.equal(published,0);});
test('production capture guard is awaited before serialization, page accumulation and publish',()=>{const source=fs.readFileSync(path.join(root,'tools/generate-release-pages.cjs'),'utf8'),guard=source.indexOf('await page.evaluate(removeRuntimeTopForCapture,');assert.ok(guard>source.indexOf('if (id === "R0072") await validateKamiparaCapture(page);'));assert.ok(guard<source.indexOf('const html = (await page.content())'));assert.ok(guard<source.indexOf('pages.push({ id, html'));assert.ok(guard<source.indexOf('css.publish(() => capture.publish'));assert.match(source,/capture\.source\("release\.html"\)/);});
for(const width of[1280,390])for(const id of['R0052','R0088'])test('guarded copy reload creates one working TOP '+id+' '+width,async()=>{
 const raw=fs.readFileSync(path.join(root,'release',id+'.html'),'utf8');await page.setContent(raw); // JS disabled: inspect only, never re-capture formal output.
 // After official capture the saved body intentionally has no TOP. The test
 // supplies the same runtime-only node a fresh common.js creates, in memory.
 if(!await page.locator('#backToTopButton').count())await page.evaluate(html=>{const t=document.createElement('template');t.innerHTML=html;document.body.append(t.content);},top);
 await page.evaluate(removeRuntimeTopForCapture,{templateHtml:template});const isolated=await page.content();assertReleaseDom(isolated,read('releases/'+id+'.json'),list);copies.set('/release/'+id+'.html',isolated);
 const c=await browser.newContext({viewport:{width,height:900}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{await p.goto(origin+'/release/'+id+'.html');await p.evaluate(()=>import(document.querySelector('script[src*="release-v500"]').src).then(m=>m.releaseReady));const decline=p.locator('[data-musdb-consent="rejected"]').first();if(await decline.isVisible())await decline.click();assert.equal(await p.locator('#backToTopButton').count(),1);await p.evaluate(()=>scrollTo({top:650,behavior:'instant'}));await p.waitForFunction(()=>document.querySelector('#backToTopButton').classList.contains('visible'));await p.locator('#backToTopButton').click();await p.waitForFunction(()=>scrollY===0);await p.evaluate(()=>scrollTo({top:650,behavior:'instant'}));await p.waitForFunction(()=>document.querySelector('#backToTopButton').classList.contains('visible'));await p.locator('#backToTopButton').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>scrollY===0);await p.reload();await p.evaluate(()=>import(document.querySelector('script[src*="release-v500"]').src).then(m=>m.releaseReady));assert.equal(await p.locator('#backToTopButton').count(),1);assertReleaseDom(await p.content(),read('releases/'+id+'.json'),list);assert.deepEqual(errors,[]);}finally{await c.close();}
});

// 04N-H: the exact CSS served at the old cache URL is intentionally the new
// local file. These are not claims about deployment or post-capture final QA.
const {verifyCase,settle,scrollTopState}=require('./helpers/release-top-layout.cjs');
for(const width of[390,761,1024,1279])test(`flow TOP: all 114 formal Releases at ${width}, initial closed and expanded`,async()=>{
 assert.equal(list.length,114);
 for(const release of list)await verifyCase({browser,origin,id:release.releaseId,width,out,label:'all-'});
});
for(const width of[320,360,390,620,621,700,701,760,761,1024,1279,1280,1366])for(const id of['R0052','R0060','R0072','R0077','R0081','R0088','R0089','R0090'])test(`flow TOP and preserved operations ${id} ${width}`,async()=>{
 await verifyCase({browser,origin,id,width,out,exercise:true,label:'actions-'});
});
for(const width of[320,390])for(const id of['R0052','R0072','R0088'])test(`flow TOP JS OFF retains static contents ${id} ${width}`,async()=>{
 await verifyCase({browser,origin,id,width,out,js:false,label:'nojs-'});
});
test('TOP settlement waits for its animation, not an unrelated paused animation',async()=>{
 const c=await browser.newContext(),p=await c.newPage();try{
  await p.setContent('<button id="backToTopButton">TOP</button><div id="unrelated">Disclosure</div>');
  await p.evaluate(()=>{window.testTop=document.getElementById('backToTopButton');window.topAnimation=testTop.animate([{transform:'translateY(10px)'},{transform:'none'}],{duration:180,fill:'forwards'});window.otherAnimation=document.getElementById('unrelated').animate([{opacity:0},{opacity:1}],10000);otherAnimation.pause();});
  await settle(p);assert.deepEqual(await p.evaluate(()=>({same:testTop===document.getElementById('backToTopButton'),top:topAnimation.playState,other:otherAnimation.playState})),{same:true,top:'finished',other:'paused'});
 }finally{await c.close();}
});
test('TOP boundary follows CSS viewport even with an occupied scrollbar gutter',async()=>{
 const classic=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome',ignoreDefaultArgs:['--hide-scrollbars']});
 try{for(const width of[1279,1280])for(const id of['R0060','R0072','R0077','R0081','R0088','R0089','R0090']){
  const result=await verifyCase({browser:classic,origin,id,width,out,gutter:true,label:'gutter-'});assert.equal(result.viewport.innerWidth,width);assert.equal(result.viewport.max1279,width===1279);assert.equal(result.viewport.min1280,width===1280);assert.equal(result.position,width===1279?'static':'fixed');
 }}finally{await classic.close();}
});
test('synthetic future R0052 metadata retains full card width without a fixed TOP lane',async()=>{
 // Same synthetic values as the 04J local fixture, kept self-contained so the
 // permanent test does not depend on an untracked directory outside the repo.
 const metadata={releaseId:'R0052',approved:true,syntheticFixtureOnly:true,relations:[['RT0090','ゲーマーズ','gamers','A'],['RT0091','ソフマップ','sofmap','B'],['RT0092','アニメイト','animate','C']].map(([relationId,store,key,suffix])=>({relationId,verificationStatus:'verified',applicabilityMode:'explicit_relation',sourceUrl:'https://example.test/products/'+key,productName:`【${store}向け合成商品名・正式未登録】描き下ろしジャケット付き録り下ろし新曲CD`,credits:[['lyricist','作詞'],['composer','作曲']].map(([role,label])=>({role,name:`合成${label}者${suffix}`,verificationStatus:'verified',applicabilityMode:'explicit_relation',sourceUrl:'https://example.test/credits/'+key}))}))};assert.equal(metadata.syntheticFixtureOnly,true);
 for(const width of[320,390])await verifyCase({browser,origin,id:'R0052',width,out,metadata,label:'metadata-'});
});
// Exercise both branches against the unchanged production visibility handler.
// Only the fixture's document height and minimal presentation CSS are synthetic.
async function topVisibilityFixture(p,maxScroll){
 await p.setContent(`<style>body{margin:0}#height{height:${900+maxScroll}px}.back-to-top{position:fixed;right:22px;bottom:22px;width:54px;height:54px;opacity:0;pointer-events:none;transform:translateY(10px);transition:transform .18s,opacity .18s}.back-to-top.visible{opacity:1;pointer-events:auto;transform:none}</style><div id="height"></div>`);
 const source=fs.readFileSync(path.join(root,'assets/js/common.js'),'utf8'),start=source.indexOf('function setupBackToTop_() {'),end=source.indexOf('\n}',start)+2;assert.ok(start>=0&&end>start);
 await p.evaluate(source=>{Function(source+';setupBackToTop_();')();},source.slice(start,end));
}
test('short fixed TOP is non-intercepting and recovers click and Enter after expansion',async()=>{
 const c=await browser.newContext({viewport:{width:1366,height:900}}),p=await c.newPage();try{await topVisibilityFixture(p,510);const short=await scrollTopState(p);assert.equal(short.requested,525);assert.equal(short.expectedScrollY,510);assert.equal(short.actualScrollY,510);assert.equal(short.expectedVisible,false);await p.locator('#height').evaluate(n=>n.style.height='4436px');const long=await scrollTopState(p);assert.equal(long.actualScrollY,525);assert.equal(long.expectedVisible,true);await p.locator('#backToTopButton').click();await p.waitForFunction(()=>scrollY===0);await scrollTopState(p);await p.locator('#backToTopButton').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>scrollY===0);}finally{await c.close();}
});
for(const maxScroll of[520,521])test(`fixed TOP strict threshold at maxScroll ${maxScroll}`,async()=>{
 const c=await browser.newContext({viewport:{width:1366,height:900}}),p=await c.newPage();try{await topVisibilityFixture(p,maxScroll);const state=await scrollTopState(p);assert.equal(state.actualScrollY,maxScroll);assert.equal(state.expectedVisible,maxScroll>520);}finally{await c.close();}
});
for(const [name,maxScroll,css,message]of[['short visible opacity',510,'opacity:1!important',/hidden TOP opacity/],['short intercepting pointer',510,'pointer-events:auto!important',/hidden TOP pointer events/],['long invisible opacity',1000,'opacity:0!important',/visible TOP opacity/]])test('TOP state check rejects '+name,async()=>{
 const c=await browser.newContext({viewport:{width:1366,height:900}}),p=await c.newPage();try{await topVisibilityFixture(p,maxScroll);await p.addStyleTag({content:'#backToTopButton{'+css+'}'});await assert.rejects(()=>scrollTopState(p),message);}finally{await c.close();}
});
test('R0081 1366 closed page hides TOP but expansion restores operations',async()=>{
 const result=await verifyCase({browser,origin,id:'R0081',width:1366,out,exercise:true,label:'short-recovery-'}),closed=result.states.find(s=>s.state==='closed'),expanded=result.states.find(s=>s.state==='expanded');assert.ok(closed.topState.maxScroll<=520);assert.equal(closed.topState.expectedVisible,false);assert.equal(closed.topState.pointerEvents,'none');assert.ok(expanded.topState.actualScrollY>520);assert.equal(expanded.topState.expectedVisible,true);assert.equal(result.topActions,'PASS');assert.ok(result.songClick);
});
