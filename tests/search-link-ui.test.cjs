"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');let browser,server,base,shots;
const cases={末尾:'長い日本語の正式な名前末尾',MID:'開始MID終了',Special:'Special <img src=x onerror="window.__xss=1"> & 🎵末尾',Alias:'正式な表示名',Long:'LongUnbrokenEnglishTitle'.repeat(6)+'長い日本語の複数人名義＆二人目＆三人目','🎵':'音楽🎵'};
function payload(q){
 const title=cases[q]||q,alias=q==='Alias'?'<愛称>&"別名':'',results=q==='none'?{singers:[],songs:[],releases:[],events:[],venues:[]}:{
  singers:[{singerId:'SN0059',displayName:title,matchAlias:alias,songCount:10,eventCount:12},{singerId:'SN0072',displayName:title+'＆二人目',matchAlias:alias}],
  songs:[{songId:'S003',songName:title,matchAlias:alias,recordingCd:'正式なCD',version:'通常'}],
  releases:[{releaseId:'R0052',releaseName:title,matchAlias:alias,classification:'特典',releaseType:'全巻購入特典'}],
  events:[{eventId:'EV0001',eventName:title,matchAlias:alias,date:'2025-01-01',category:'公式'}],
  venues:[{venueId:'VE0001',venueName:title,matchAlias:alias,prefectureCity:'横浜',country:'日本'}]};
 const counts=Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.length]));return {query:q,results,counts,totalCount:Object.values(counts).reduce((a,b)=>a+b,0)};
}
test.before(async()=>{
 shots=fs.mkdtempSync(path.join(os.tmpdir(),'musdb-search-link09-'));console.log('Search09 images '+shots);
 server=http.createServer((req,res)=>{let name=new URL(req.url,'http://local').pathname.slice(1),old=name.startsWith('__baseline/');if(old)name=name.slice(11);const file=path.resolve(root,name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{const body=old&&name==='search.html'?cp.execFileSync('git',['show','HEAD:search.html']):fs.readFileSync(file);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome'});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(width,q='末尾',old=false){
 const ctx=await browser.newContext({viewport:{width,height:1000}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.addInitScript(()=>localStorage.setItem('musdb_analytics_consent','rejected'));
 await ctx.route(/script\.google(?:usercontent)?\.com\//,r=>{const u=new URL(r.request().url()),data=u.searchParams.get('action')==='revision'?{dataRevision:'link09'}:payload(u.searchParams.get('q')||'');return r.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success:true,data})});`});});
 await p.goto(base+'/'+(old?'__baseline/':'')+'search.html?q='+encodeURIComponent(q));await p.locator(q==='none'?'.empty-state':'.result-row').first().waitFor();return{ctx,p,errors};
}
async function healthy(c){assert.equal(await c.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(c.errors,[]);await c.ctx.close();}
async function chip(p,selector){
 const a=p.locator(selector).first();await a.scrollIntoViewIfNeeded();await a.locator('.mus-link-chevron svg').waitFor();const held=await a.elementHandle();
 const sample=()=>a.evaluate(async(e,h)=>{if(e!==h)throw Error('link replaced');const c=e.querySelector('.mus-link-chevron');getComputedStyle(c).transform;await new Promise(requestAnimationFrame);await Promise.all(c.getAnimations().map(a=>a.finished));await new Promise(requestAnimationFrame);const b=e.getBoundingClientRect(),r=c.getBoundingClientRect(),s=c.querySelector('svg').getBoundingClientRect();return{box:[b.x+scrollX,b.y+scrollY,b.width,b.height],x:r.x+scrollX,size:[r.width,r.height,s.width,s.height],center:[s.x+s.width/2-r.x-r.width/2,s.y+s.height/2-r.y-r.height/2],t:getComputedStyle(c).transform,d:getComputedStyle(c).transitionDuration};},held);
 await p.bringToFront();await p.mouse.move(0,0);await a.evaluate(e=>e.blur());const b=await sample();assert.deepEqual(b.size,[30,30,16,16]);assert.ok(b.center.every(n=>Math.abs(n)<.1));await a.hover();const h=await sample();assert.ok(Math.abs(h.x-b.x-3)<.1);assert.deepEqual(h.box,b.box);
 await a.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');assert.equal(await a.evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle==='solid'&&getComputedStyle(e).outlineOffset==='-3px'),true);
 await p.emulateMedia({reducedMotion:'reduce'});const reduced=await sample();assert.equal(reduced.t,'none');assert.equal(reduced.d,'0s');await a.evaluate(e=>e.blur());await p.emulateMedia({reducedMotion:'no-preference'});await held.dispose();
}
async function records(p){return p.locator('.result-row').evaluateAll(rows=>rows.map(e=>({href:e.getAttribute('href'),text:e.textContent.replace(/\s+/g,' ').trim(),highlight:[...e.querySelectorAll('.result-title .highlight')].map(e=>e.textContent).join('')})));}
for(const width of[1280,390]){
 test(`Search five TYPE A categories, safe highlight/alias and tabs ${width}`,async()=>{
  const c=await open(width),old=await open(width,'末尾',true);
  try{for(const q of Object.keys(cases)){
   for(const page of[c.p,old.p]){await page.locator('#searchInput').fill(q);await page.locator('#searchInput').press('Enter');await page.waitForFunction(q=>document.querySelector('#summaryText').textContent===`「${q}」の検索結果`&&!document.querySelector('#status').textContent,q);}
   assert.deepEqual(await records(c.p),await records(old.p));assert.equal(new URL(c.p.url()).searchParams.get('q'),q);assert.equal(await c.p.locator('#summaryCount').textContent(),'6件');assert.equal(await c.p.locator('.result-row .mus-link-chevron svg').count(),6);assert.equal(await c.p.locator('.result-arrow,a a,.result-title img,.result-title script').count(),0);assert.equal(await c.p.evaluate(()=>window.__xss),undefined);
   assert.equal(await c.p.locator('.result-row').evaluateAll(rows=>rows.every(a=>{const box=a.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(a);return [...range.getClientRects()].every(r=>r.left>=box.left-.1&&r.right<=box.right+.1)})),true,'individual title/alias/metadata bounds');
   if(q==='Alias'){assert.equal(await c.p.locator('.alias-match').count(),6);assert.equal(await c.p.locator('.alias-match').first().textContent(),'検索別名「<愛称>&"別名」に一致');}
  }
  for(const type of['singer','song','release','event','venue'])await chip(c.p,`.result-row:has(.result-type.${type})`);
  for(const tab of['singers','songs','releases','events','venues','all']){await c.p.locator(`[data-tab="${tab}"]`).click();assert.equal(await c.p.locator('.result-section').count(),tab==='all'?5:1);assert.equal(await c.p.locator('.result-row .mus-link-chevron svg').count(),tab==='all'?6:tab==='singers'?2:1);}
  await c.p.locator('#searchInput').fill('none');await c.p.locator('#searchButton').click();await c.p.locator('.empty-state').waitFor();assert.equal(await c.p.locator('.result-row').count(),0);await c.p.locator('[data-query="スノハレ"]').click();await c.p.locator('.result-row').first().waitFor();assert.equal(new URL(c.p.url()).searchParams.get('q'),'スノハレ');await c.p.screenshot({path:path.join(shots,`search-${width}.png`)});
  }finally{await healthy(c);await healthy(old);}
 });
 test(`Search all hrefs, card whitespace/badge/meta, middle/Control/Enter ${width}`,async()=>{
  const types=['singer','song','release','event','venue'],expected=['singer.html?id=SN0059','song/S003.html','release/R0052.html','event.html?id=EV0001','venue.html?id=VE0001'];
  for(let i=0;i<types.length;i++){const c=await open(width);try{const a=c.p.locator(`.result-row:has(.result-type.${types[i]})`).first();assert.equal(await a.getAttribute('href'),expected[i]);const original=c.p.url(),url=new URL(expected[i],original).href,matches=u=>u.href===url;await c.ctx.route(matches,r=>r.fulfill({contentType:'text/html',body:'<p>Destination</p>'}));
   if(i<2){const wait=c.ctx.waitForEvent('page',{timeout:10000});await a.click(i===0?{button:'middle'}:{modifiers:['Control']});const tab=await wait;await tab.waitForURL(url,{waitUntil:'commit'});assert.equal(await tab.evaluate(()=>document.URL),url);assert.equal(c.p.url(),original);assert.equal(c.ctx.pages().length,2);await tab.close();if(i===0){await Promise.all([c.p.waitForURL(url,{waitUntil:'commit'}),a.locator('.result-meta').click()]);assert.equal(await c.p.evaluate(()=>document.URL),url);}}
   else{const wait=c.p.waitForURL(url,{waitUntil:'commit'});if(i===2){await a.focus();await c.p.keyboard.press('Enter');}else if(i===3)await a.click({position:{x:4,y:8}});else await a.locator('.result-type').click();await wait;assert.equal(await c.p.evaluate(()=>document.URL),url);}
  }finally{await healthy(c);}}
 });
}
test('Common header audit: six suggestions, five category hrefs, alias and keyboard',async()=>{
 const c=await open(1280,'Alias');try{const input=c.p.locator('#globalSearchInput');await input.fill('Alias');await c.p.locator('.global-suggest-item').nth(5).waitFor();assert.equal(await c.p.locator('.global-suggest-item').count(),6);const links=await c.p.locator('.global-suggest-item').evaluateAll(es=>es.map(e=>e.getAttribute('href')));assert.deepEqual(links,(await records(c.p)).map(r=>r.href));assert.match(await c.p.locator('.global-suggest-item small').first().textContent(),/別名/);
 await input.press('ArrowDown');assert.equal(await c.p.locator('.global-suggest-item').first().getAttribute('aria-selected'),'true');await input.press('ArrowUp');assert.equal(await c.p.locator('.global-suggest-item').last().getAttribute('aria-selected'),'true');await input.press('Escape');assert.equal(await input.getAttribute('aria-expanded'),'false');
 await input.fill('Alias2');await c.p.locator('.global-suggest-item').first().waitFor();await input.press('ArrowDown');const url=new URL(links[0],c.p.url()).href;await c.ctx.route(u=>u.href===url,r=>r.fulfill({contentType:'text/html',body:'Destination'}));await Promise.all([c.p.waitForURL(url,{waitUntil:'commit'}),input.press('Enter')]);assert.equal(await c.p.evaluate(()=>document.URL),url);
 }finally{await healthy(c);}
});
test('Common mobile drawer audit: focus/ARIA/close and unchanged footer',async()=>{
 const c=await open(390);try{const button=c.p.locator('#musMobileMenuButton'),drawer=c.p.locator('#musMobileDrawer');await button.click();assert.equal(await button.getAttribute('aria-expanded'),'true');assert.equal(await drawer.getAttribute('aria-hidden'),'false');console.log('Drawer audit initial active element: '+await c.p.evaluate(()=>document.activeElement.id));await drawer.waitFor({state:'visible'});await drawer.locator('a').last().focus();await c.p.keyboard.press('Tab');console.log('Drawer audit focus outside after final link: '+await drawer.evaluate(e=>!e.contains(document.activeElement)));await c.p.keyboard.press('Escape');assert.equal(await button.getAttribute('aria-expanded'),'false');assert.equal(await button.evaluate(e=>document.activeElement===e),true);assert.equal(await c.p.locator('.site-footer a').count(),0);
 }finally{await healthy(c);}
});
test('Common header full-results button and Enter preserve q navigation',async()=>{
 for(const mode of['button','Enter']){const c=await open(1280);try{const input=c.p.locator('#globalSearchInput');await input.fill('Alias');await c.p.locator('.global-suggest-all').waitFor();const expected=base+'/search.html?q=Alias';await Promise.all([c.p.waitForURL(expected,{waitUntil:'commit'}),mode==='Enter'?input.press('Enter'):c.p.locator('.global-suggest-all').click()]);await c.p.locator('.alias-match').first().waitFor();assert.equal(await c.p.evaluate(()=>document.URL),expected);}finally{await healthy(c);}}
});
test('Search normalization, highlighting, generation guard and analytics source remain unchanged',()=>{
 const before=cp.execFileSync('git',['show','HEAD:search.html'],{encoding:'utf8'}),after=fs.readFileSync(path.join(root,'search.html'),'utf8');
 for(const prefix of['const normalize=','function highlight(','let searchGeneration','async function runSearch(','function resultCountFor(']){const line=text=>text.split(/\r?\n/).find(line=>line.startsWith(prefix));assert.equal(line(after),line(before),prefix);}
});
