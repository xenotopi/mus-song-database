"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),cp=require('node:child_process');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');let server,browser,base,shots;
const hrefs=['songs.html','events.html','venues.html','singers.html'];
const titles=['曲から巡る','イベントから巡る','会場から巡る','歌唱名義から巡る'];
test.before(async()=>{
 shots=fs.mkdtempSync(path.join(os.tmpdir(),'musdb-about10-'));console.log('UI10 screenshots '+shots);
 server=http.createServer((req,res)=>{let name=new URL(req.url,'http://local').pathname.slice(1),old=name.startsWith('__baseline/');if(old)name=name.slice(11);const missing=name==='__ui10-missing.html';if(missing)name='404.html';const file=path.resolve(root,name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{const body=old&&name==='about.html'?cp.execFileSync('git',['show','HEAD:about.html']):fs.readFileSync(file);res.writeHead(missing?404:200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome'});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(width,name='about.html'){
 const ctx=await browser.newContext({viewport:{width,height:1000}}),p=await ctx.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!(name==='__ui10-missing.html'&&m.location().url===base+'/'+name&&m.text().includes('404')))errors.push(m.text());});
 await p.addInitScript(()=>localStorage.setItem('musdb_analytics_consent','rejected'));
 await ctx.route(/script\.google(?:usercontent)?\.com\//,r=>{const u=new URL(r.request().url()),data=u.searchParams.get('action')==='revision'?{dataRevision:'ui10-test'}:{summary:{songCount:117,eventCount:353,venueCount:154,performanceCount:1400,firstRecordedDate:'2010-08-28',lastRecordedDate:'2026-05-02'},updatedAt:'2026-10-15T00:00:00Z'};return r.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success:true,data})});`});});
 const response=await p.goto(base+'/'+name);await p.locator('#siteHeader nav').first().waitFor({state:'attached'});if(name.endsWith('about.html'))await p.locator('#aboutSummary').waitFor({state:'visible'});return{ctx,p,errors,status:response.status()};
}
async function clean(c){assert.equal(await c.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(c.errors,[]);await c.ctx.close();}
async function chip(p,selector){
 await p.bringToFront();const a=p.locator(selector).first();await a.scrollIntoViewIfNeeded();await a.locator('.mus-link-chevron svg').waitFor();const held=await a.elementHandle(),icon=await a.locator('.mus-link-chevron').elementHandle();
 const sample=()=>a.evaluate(async(e,{held,icon})=>{if(e!==held||e.querySelector('.mus-link-chevron')!==icon)throw Error('QA target replaced');const c=e.querySelector('.mus-link-chevron');getComputedStyle(c).transform;await new Promise(requestAnimationFrame);await Promise.all(c.getAnimations().map(a=>a.finished));await new Promise(requestAnimationFrame);const b=e.getBoundingClientRect(),r=c.getBoundingClientRect(),s=c.querySelector('svg').getBoundingClientRect();return{box:[b.x+scrollX,b.y+scrollY,b.width,b.height],x:r.x+scrollX,size:[r.width,r.height,s.width,s.height],center:[s.x+s.width/2-r.x-r.width/2,s.y+s.height/2-r.y-r.height/2],transform:getComputedStyle(c).transform,duration:getComputedStyle(c).transitionDuration};},{held,icon});
 await p.mouse.move(0,0);await a.evaluate(e=>e.blur());const b=await sample();assert.deepEqual(b.size,[30,30,16,16]);assert.ok(b.center.every(n=>Math.abs(n)<.1));await a.hover();const h=await sample();assert.ok(Math.abs(h.x-b.x-3)<.1);assert.deepEqual(h.box,b.box);
 await p.mouse.move(0,0);await a.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');assert.equal(await a.evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle==='solid'&&parseFloat(getComputedStyle(e).outlineWidth)>=3),true);
 await p.emulateMedia({reducedMotion:'reduce'});const r=await sample();assert.equal(r.transform,'none');assert.equal(r.duration,'0s');await a.evaluate(e=>e.blur());await p.emulateMedia({reducedMotion:'no-preference'});await held.dispose();await icon.dispose();
}
async function navigate(c,a,mode){
 const original=c.p.url(),url=await a.evaluate(e=>e.href);await c.ctx.route(u=>u.href===url,r=>r.fulfill({contentType:'text/html',body:'<title>Destination</title><p>Destination</p>'}));
 if(mode==='middle'||mode==='control'){const wait=c.ctx.waitForEvent('page',{timeout:10000});await a.click(mode==='middle'?{button:'middle'}:{modifiers:['Control']});const tab=await wait;await tab.waitForURL(url,{waitUntil:'commit'});assert.equal(await tab.evaluate(()=>document.URL),url);assert.equal(c.p.url(),original);assert.equal(c.ctx.pages().length,2);await tab.close();await c.p.bringToFront();}
  else{if(mode==='Enter'){await a.focus();await Promise.all([c.p.waitForURL(url,{waitUntil:'commit'}),c.p.keyboard.press('Enter')]);}else{await a.scrollIntoViewIfNeeded();const point=await a.evaluate(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.left+5,b.top+b.height/2);return{x:5,y:b.height/2,inside:e.contains(hit)}});assert.equal(point.inside,true,'padding point is inside rounded card');await Promise.all([c.p.waitForURL(url,{waitUntil:'commit'}),a.click({position:{x:point.x,y:point.y}})]);}assert.equal(await c.p.evaluate(()=>document.URL),url);}
}
for(const width of[1280,390]){
 test(`About four TYPE A cards, baseline copy/icons, hover/focus/reduced ${width}`,async()=>{
  const c=await open(width),old=await open(width,'__baseline/about.html');try{
   const read=p=>p.locator('.about-explore-card').evaluateAll(es=>es.map(e=>({href:e.getAttribute('href'),title:e.querySelector('strong').textContent,copy:e.querySelector('small').textContent,icon:e.querySelector('.about-explore-icon').dataset.siteIcon})));
   assert.deepEqual(await read(c.p),await read(old.p));assert.deepEqual((await read(c.p)).map(e=>e.title),titles);assert.deepEqual((await read(c.p)).map(e=>e.href),hrefs);
   const protectedSections=p=>p.locator('.about-section:not([aria-labelledby="aboutExploreTitle"])').evaluateAll(es=>es.map(e=>e.innerHTML));assert.deepEqual(await protectedSections(c.p),await protectedSections(old.p),'all non-target About sections unchanged');
   assert.equal(await c.p.locator('.about-explore-arrow,a a,.about-cta .mus-link-chevron,button .mus-link-chevron').count(),0);
   assert.equal(await c.p.locator('.about-explore-icon svg').count(),4);assert.equal(await c.p.locator('.about-explore-card .mus-link-chevron svg').count(),4);
   const boxes=await c.p.locator('.about-explore-card').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));assert.equal(boxes[0].y===boxes[1].y,width===1280);assert.equal(boxes[0].x===boxes[1].x,width===390);
   for(let i=0;i<4;i++)await chip(c.p,`.about-explore-card:nth-child(${i+1})`);
   await c.p.mouse.move(0,0);await c.p.locator('.about-explore-grid').screenshot({path:path.join(shots,`about-${width}.png`)});
   const strong=c.p.locator('.about-explore-card strong').first();await strong.evaluate(e=>e.firstChild.textContent='LongUnbrokenEnglishTitle'.repeat(5)+'長い日本語と複数人名義＆二人目から');
   assert.equal(await c.p.locator('.about-explore-card').first().evaluate(e=>{const b=e.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);return[...r.getClientRects()].every(r=>r.left>=b.left-.1&&r.right<=b.right+.1)}),true);await c.p.locator('.about-explore-grid').screenshot({path:path.join(shots,`about-long-${width}.png`)});
  }finally{await clean(c);await clean(old);}
 });
 test(`About all hrefs: middle/Control/Enter/padding; external form and settings ${width}`,async()=>{
  for(let i=0;i<4;i++)for(const mode of['middle','control','Enter','padding']){const c=await open(width);try{const a=c.p.locator('.about-explore-card').nth(i);assert.equal(await a.getAttribute('href'),hrefs[i]);await navigate(c,a,mode);}finally{await clean(c);}}
  const c=await open(width);try{const form=c.p.locator('a.about-cta'),settings=c.p.locator('button[data-musdb-analytics-settings]');assert.match(await form.getAttribute('href'),/^https:\/\/docs.google.com\/forms\//);assert.equal(await form.getAttribute('target'),'_blank');assert.match(await form.getAttribute('rel'),/noopener/);assert.equal(await form.locator('[data-site-icon="external-link"] svg').count(),1);assert.equal(await settings.getAttribute('type'),'button');await settings.click();await c.p.getByRole('dialog').waitFor({state:'visible'});assert.equal(await c.p.getByRole('button',{name:'許可する',exact:true}).count(),1);await c.p.getByRole('button',{name:'閉じる',exact:true}).click();await c.p.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await settings.evaluate(e=>e===document.activeElement),true);assert.equal(await c.p.evaluate(()=>localStorage.getItem('musdb_analytics_consent')),'rejected');}finally{await clean(c);}
 });
 for(const name of['404.html','__ui10-missing.html'])test(`404 ${name}: status, functional links, Tab/Enter, noindex ${width}`,async()=>{
  const c=await open(width,name);try{
   assert.equal(c.status,name==='404.html'?200:404);assert.equal(await c.p.locator('meta[name="robots"]').getAttribute('content'),'noindex,follow');assert.equal(await c.p.locator('.not-found-actions a').count(),2);assert.deepEqual(await c.p.locator('.not-found-actions a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))),['search.html','index.html']);assert.equal(await c.p.locator('.not-found-card .mus-link-chevron').count(),0);assert.match(await c.p.locator('.not-found-copy').textContent(),/ライブのダブルアンコール（ぷわぷわーお）/);
   for(let i=0;i<2;i++){const a=c.p.locator('.not-found-actions a').nth(i);await a.focus();await c.p.keyboard.press('Tab');await c.p.keyboard.press('Shift+Tab');assert.equal(await a.evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'&&parseFloat(getComputedStyle(e).outlineWidth)>0),true,'visible keyboard focus');const b=await a.boundingBox();assert.ok(b.height>=44);assert.ok(b.width>=44);}
   const boxes=await c.p.locator('.not-found-actions a').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}}));assert.ok(boxes[0].right<=boxes[1].x||boxes[0].bottom<=boxes[1].y);await c.p.locator('.not-found-card').screenshot({path:path.join(shots,`${name}-${width}.png`)});
   for(let i=0;i<2;i++){if(i)await c.p.goto(base+'/'+name);await navigate(c,c.p.locator('.not-found-actions a').nth(i),'Enter');}
  }finally{await clean(c);}
 });
}
test('UI10 leaves About JS, 404 source and official renderer dependencies unchanged',()=>{
 for(const file of['404.html','assets/js/about.js','assets/js/common.js','assets/js/api.js','assets/css/link-ui.css'])assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}).replace(/\r\n/g,'\n'),file);
 const {SONG_RENDERER_FILES}=require('../tools/generate-song-pages.cjs'),{RELEASE_RENDERER_FILES}=require('../tools/generate-release-pages.cjs');assert.equal([...SONG_RENDERER_FILES,...RELEASE_RENDERER_FILES].includes('about.html'),false);
});
