// Query-entry fixtures only. No formal HTML, manifest or real API writes.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),p=require('path'),http=require('http');
const {chromium}=require('playwright'),{validateSongCreditsData}=require('../tools/song-credits-lib.cjs');
const root=p.resolve(__dirname,'..'),current=require('../data/current.json'),data=require('../data/song-credits.json'),base=p.join(root,'data/snapshots',current.revision),read=f=>JSON.parse(fs.readFileSync(p.join(base,f))).data;
const credits=validateSongCreditsData(data,new Map(data.songs.map(s=>[s.songId,read('songs/'+s.songId+'.json')]))),out=process.env.RELEASE_SONG_CREDITS_WORK;
if(!out)throw Error('Set external RELEASE_SONG_CREDITS_WORK');
let server,browser,origin;const results=[];
test.before(async()=>{fs.mkdirSync(out,{recursive:true});server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname,file=p.resolve(root,'.'+name);if(!file.startsWith(root+p.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();let bytes=fs.readFileSync(file);if(name==='/release.html')bytes=Buffer.from(bytes.toString().replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/,''));res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[p.extname(file)]||'application/octet-stream'});res.end(bytes);});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'chrome',headless:true});});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));fs.writeFileSync(p.join(out,'results.json'),JSON.stringify(results,null,2));});
async function open(id,width,{unavailable=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[],requests=[];
 await context.addInitScript(()=>localStorage.setItem('musdb_analytics_consent','rejected'));
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin){if(unavailable&&url.pathname==='/data/song-credits.json')return route.fulfill({status:200,contentType:'application/json',body:'null'});return route.continue();}if(url.searchParams.has('callback')){const action=url.searchParams.get('action'),payload=action==='revision'?current:action==='releaseList'?read('release-list.json'):action==='release'?read('releases/'+url.searchParams.get('id')+'.json'):{};return route.fulfill({contentType:'text/javascript',body:`${url.searchParams.get('callback')}(${JSON.stringify({success:true,data:payload})});`});}return route.fulfill({status:200,contentType:'text/css',body:''});});
 await page.goto(origin+'/release.html?id='+id,{waitUntil:'load',timeout:30000});await page.evaluate(async()=>{const m=await import(document.querySelector('script[src*="release-v500"]').src);await m.releaseReady;await m.releasePersonReady;await document.fonts.ready;});return{page,context,errors,requests};
}
for(const id of ['R0003','R0070','R0071','R0082','R0031','R0063','R0052','R0106'])for(const width of [1280,390])test(`Release credits ${id}/${width}`,async()=>{
 const x=await open(id,width),source=read('releases/'+id+'.json');try{
  a.equal(await x.page.locator('.release-included-song-row').count(),source.includedSongs.length);
  a.equal(await x.page.locator('.release-hero-kicker').innerText(),source.classification==='CD'?'CD RELEASE':'RELEASE DETAIL');
  if(source.classification==='CD'){a.equal(await x.page.locator('.release-cd-icon').count(),1);a.equal(await x.page.locator('.release-hero-badge').innerText(),source.releaseType);}else{a.equal(await x.page.locator('.release-cd-icon,.release-hero-badge').count(),0);}
  a.equal(await x.page.locator('#releaseName').innerText(),source.releaseName);
  if(await x.page.locator('[data-discs-open="true"]').count())await x.page.locator('[data-discs-open="true"]').click();
  for(const t of source.includedSongs){const row=x.page.locator('.release-included-song-row[data-relation-id="'+t.relationId+'"]'),original=data.songs.find(s=>s.songId===t.songId).recording;
   const arranger=original.releaseId===id&&original.relationId===t.relationId&&(t.variant||null)===original.variant&&(t.disc==null||t.disc===original.disc)&&(t.track==null||t.track===original.track),wanted=credits.get(t.songId).rows.filter(r=>r.role!=='arranger'||arranger);
   a.equal(await row.getAttribute('href'),'song/'+t.songId+'.html');a.equal(await row.locator('.release-included-song-title').innerText(),t.displayName||t.songName);
   a.deepEqual(await row.locator('[data-release-credit]').allTextContents(),wanted.map(r=>r.label+'：'+r.value));a.equal(await row.locator('.release-song-credits').count(),1);
   a.equal(await row.locator('.release-recording-vocal').count(),1);if(t.variant)a.ok((await row.locator('.release-included-song-meta').innerText()).includes(t.variant)||await row.locator('xpath=ancestor::details[1]').locator('summary').innerText().then(text=>text.includes(t.variant)));
   a.equal(await row.locator('.release-song-credits').evaluate(n=>n.previousElementSibling.classList.contains('release-recording-vocal')),true);
  }
  a.equal(x.requests.filter(url=>new URL(url).pathname==='/data/song-credits.json').length,1);
  a.match(await x.page.locator('.release-song-credits').first().innerText(),/ ／ /);
  if(id==='R0003'&&width===1280)a.equal(await x.page.locator('.release-song-credits').first().evaluate(n=>new Set([...n.querySelectorAll('span')].map(s=>Math.round(s.getBoundingClientRect().top))).size),1);
  a.equal(await x.page.locator('.release-single-plain-track [data-release-credit],.release-product-track-row [data-release-credit],.release-bd-plain-track [data-release-credit]').count(),0);
  a.ok(await x.page.locator('.release-disc-details').evaluateAll(ns=>ns.every(n=>n.open)));
  a.ok((await x.page.locator('.release-song-credits').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().height).map(n=>{const b=n.getBoundingClientRect(),r=n.closest('a').getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1&&parseFloat(getComputedStyle(n).fontSize)<parseFloat(getComputedStyle(n.parentElement.querySelector('.release-included-song-title')).fontSize);}))).every(Boolean));
  a.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);a.deepEqual(x.errors,[]);
  await x.page.locator('.release-hero').screenshot({path:p.join(out,id+'-'+width+'-hero.png')});
  await x.page.locator('.release-included-song-row').first().scrollIntoViewIfNeeded();await x.page.screenshot({path:p.join(out,id+'-'+width+'.png')});results.push({id,width,status:'PASS',relations:source.includedSongs.length,oneCreditsRequest:true});
 }catch(e){results.push({id,width,status:'FAIL',error:e.message,errors:x.errors});await x.page.screenshot({path:p.join(out,id+'-'+width+'-failure.png'),fullPage:true});fs.writeFileSync(p.join(out,id+'-'+width+'-failure.html'),await x.page.content());throw e;}finally{await x.context.close();}
});
test('optional unavailable credit JSON preserves the registered tracks and vocals',async()=>{const x=await open('R0003',390,{unavailable:true});try{a.equal(await x.page.locator('.release-song-credits').count(),0);a.equal(await x.page.locator('.release-included-song-row').count(),2);a.equal(await x.page.locator('.release-recording-vocal').count(),2);a.deepEqual(x.errors,[]);}finally{await x.context.close();}});
test('reattach is idempotent; existing explicit legacy credits are not duplicated',async()=>{const x=await open('R0003',390);try{
 const r=await x.page.evaluate(async release=>{const m=await import(new URL('assets/js/release-song-credits.js?v=1.0.0',document.baseURI).href),host=document.getElementById('mainContent');await m.attachReleaseSongCredits(release,host);const row=host.querySelector('.release-included-song-row'),first=row.querySelector('.release-song-credits');const count=row.querySelectorAll('.release-song-credits').length;first.className='release-credits';await m.attachReleaseSongCredits(release,host);return{count,total:row.querySelectorAll('.release-credits,.release-song-credits').length};},read('releases/R0003.json'));a.deepEqual(r,{count:1,total:1});a.equal(x.requests.filter(url=>new URL(url).pathname==='/data/song-credits.json').length,1);
 }finally{await x.context.close();}});
