"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const {parseSerializedHtml,descendants,textContent,hasClass}=require('../tools/static-html-readonly-lib.cjs');
const root=path.resolve(__dirname,'..'),current=require('../data/current.json'),snap=path.join(root,'data/snapshots',current.revision);
const song=id=>JSON.parse(fs.readFileSync(path.join(snap,'songs',id+'.json'))).data;
const cls=(node,name)=>descendants(node,n=>hasClass(n,name)),text=n=>textContent(n).trim();
const shots=process.env.MUSDB_SONG_UI_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'song-information-ui-'));
const baselineRoot=process.env.MUSDB_SONG_UI_BASELINE;
const ranking=[{singerId:'SN0001',name:'μ\'s',count:42},{singerId:'SN0007',name:'旧3人名義',count:12},{singerId:'SN0013',name:'旧3人名義',count:5}];
const labels=['μ\'s','Printemps','BiBi'];
let browser,server,base;
test.before(async()=>{
 fs.mkdirSync(shots,{recursive:true});
 server=http.createServer((req,res)=>{let pathname=new URL(req.url,'http://local').pathname;const base=pathname.startsWith('/__baseline__/')&&baselineRoot?baselineRoot:root;if(base===baselineRoot)pathname=pathname.slice('/__baseline__'.length);const p=path.resolve(base,'.'+pathname);if(!p.startsWith(base+path.sep))return res.writeHead(403).end();try{let b=fs.readFileSync(p);if(pathname==='/song.html')b=Buffer.from(b.toString().replace(/<script data-song-legacy-redirect>[\s\S]*?<\/script>/,''));res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'chrome',headless:true});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function open(id,width,{override,off=false,query=false,baseline=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},javaScriptEnabled:!off,hasTouch:width===390}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+':'+r.failure()?.errorText));
 await context.route(/script\.google(?:usercontent)?\.com/,r=>{const u=new URL(r.request().url()),a=u.searchParams.get('action');const data=a==='revision'?current:a==='song'?(override||song(id)):a==='discover'?{topSingers:ranking,relatedSongs:[]}:{};return r.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success:true,data})});`});});
 if(override)await context.route('**/data/snapshots/**/songs/*.json',r=>{const wrapper=JSON.parse(fs.readFileSync(path.join(snap,'songs',id+'.json')));wrapper.data=override;return r.fulfill({json:wrapper});});
 await page.goto(base+(baseline?'/__baseline__':'')+(query?'/song.html?id='+id:'/song/'+id+'.html'),{waitUntil:'load'});
 if(!off){await page.locator('#status').waitFor({state:'hidden'});await page.locator('.singer-rank-row').first().waitFor();const decline=page.getByRole('button',{name:'同意しない',exact:true});if(await decline.isVisible())await decline.click();}
 return{context,page,errors};
}
test('117 formal Songs: exact work text, real Release link, official link and no duplicate button',()=>{
 const manifest=require('../song/manifest.json'),releases=new Set(Object.keys(require('../release/manifest.json').pages));assert.equal(Object.keys(manifest.pages).length,117);
 for(const id of Object.keys(manifest.pages)){
  const s=song(id),doc=parseSerializedHtml(fs.readFileSync(path.join(root,'song',id+'.html'),'utf8')),info=doc.ids.get('songInfo');
  assert.ok(!descendants(info,n=>n.tag==='dt').some(n=>text(n)==='収録作品'),id);
  const dt=descendants(info,n=>n.tag==='dt').find(n=>text(n)==='収録CD');assert.ok(dt,id);
  // Serialized indentation can occur between sibling definition elements.
  const values=descendants(info,n=>n.tag==='dd'),terms=descendants(info,n=>n.tag==='dt');assert.equal(text(values[terms.indexOf(dt)]),s.recordingCd||'—',id);
  const links=cls(info,'song-debut-release-link'),rid=String(s.debutRelease?.releaseId||'').trim();
  if(/^R\d{4}$/.test(rid)&&s.includedReleases.some(r=>r.releaseId===rid)){assert.ok(releases.has(rid),id);assert.equal(links.length,1,id);assert.equal(links[0].attrs.href,'release/'+rid+'.html',id);assert.equal(descendants(links[0],n=>n.attrs['data-site-icon']==='chevron-right'&&n.attrs['aria-hidden']==='true').length,1);}
  else assert.equal(links.length,0,id);
  assert.equal(cls(doc.ids.get('releaseAction'),'release-detail-link').length,0,id);
  const official=cls(doc.ids.get('releaseAction'),'official-release-link');assert.deepEqual(official.map(n=>n.attrs.href),s.officialReleaseUrl?.trim()?[s.officialReleaseUrl.trim()]:[],id);
  assert.equal(text(doc.ids.get('releaseTitle')),s.recordingCd||s.displayName||s.songName||'作品名未設定',id);
 }
});
for(const [name,debut,relations]of[
 ['missing',null],['empty',{releaseId:''}],['invalid',{releaseId:'javascript:alert(1)'}],['unregistered',{releaseId:'R9999'}],['unverifiable',{releaseId:'R0001'},[]]
])test('work name remains escaped plain text when '+name,async()=>{
 const s=structuredClone(song('S001'));s.debutRelease=debut;if(relations)s.includedReleases=relations;s.recordingCd='元の作品名 <img src=x onerror=alert(1)>';
 const{context,page,errors}=await open('S001',390,{override:s,query:true});try{assert.equal(await page.locator('#songInfo .song-debut-release-link').count(),0);assert.equal(await page.locator('#songInfo img').count(),0);assert.ok((await page.locator('#songInfo').innerText()).includes(s.recordingCd));assert.equal(await page.locator('#releaseAction .release-detail-link').count(),0);assert.deepEqual(errors,[]);}finally{await context.close();}
});
for(const width of[1280,390])for(const query of[false,true])test(`work/ranking interaction, order, focus and non-interference ${width} ${query?'query':'static'}`,async()=>{
 const s=song('S100'),{context,page,errors}=await open('S100',width,{query});try{
  const work=page.locator('#songInfo .song-debut-release-link');assert.equal(await work.innerText(),s.recordingCd);assert.equal(await work.getAttribute('href'),'release/R0058.html');await work.locator('svg').waitFor();
  const statistics=await page.locator('#songStats .value').allTextContents();assert.deepEqual(statistics.map(s=>s.trim()),['eventCount','officialEventCount','soloEventCount','performanceCount'].map(k=>Number(s.statistics[k]??0).toLocaleString('ja-JP')));
  await work.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');assert.equal(await work.evaluate(e=>e.matches(':focus-visible')),true);assert.equal(await work.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');await work.hover();assert.equal(await work.evaluate(e=>getComputedStyle(e).textDecorationLine),'underline');
  assert.deepEqual(await page.locator('#singerRanking .singer-rank-row').evaluateAll(es=>es.map(e=>[e.getAttribute('href'),[...e.children].map(n=>n.className)])),ranking.map(r=>['singer.html?id='+r.singerId,['singer-rank-number','singer-rank-name','singer-rank-count','site-icon-inline singer-rank-chevron']]));
  assert.deepEqual((await page.locator('.singer-rank-name').allTextContents()).map(s=>s.trim()),labels);assert.deepEqual((await page.locator('.singer-rank-count').allTextContents()).map(s=>s.trim()),ranking.map(r=>r.count+'件'));assert.deepEqual((await page.locator('.singer-rank-number').allTextContents()).map(s=>s.trim()),['1','2','3']);
  assert.equal(await page.locator('.singer-rank-chevron[aria-hidden="true"] svg').count(),3);
  const row=page.locator('.singer-rank-row').first();await row.focus();assert.equal(await row.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');await row.scrollIntoViewIfNeeded();assert.equal(await row.evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+3,b.y+b.height/2)?.closest('a')===e;}),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const prefix=`S100-${width}-${query?'query':'static'}`;await page.locator('#songInfo').locator('..').screenshot({path:path.join(shots,prefix+'-information.png')});await page.locator('#singerRanking').screenshot({path:path.join(shots,prefix+'-ranking.png')});
  await context.route('**/release/R0058.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Release destination</title><h1>R0058</h1>'}));
  await work.click();await page.waitForURL(/\/release\/R0058\.html$/);await page.goBack();await page.locator('#songInfo .song-debut-release-link').waitFor();await page.locator('#songInfo .song-debut-release-link').focus();await page.keyboard.press('Enter');await page.waitForURL(/\/release\/R0058\.html$/);await page.goBack();await page.locator('.singer-rank-row').first().waitFor();
  await context.route('**/singer.html?*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Singer destination</title><h1>SN0001</h1>'}));await page.locator('.singer-rank-row').first().focus();await page.keyboard.press('Enter');await page.waitForURL(/\/singer\.html\?id=SN0001$/);await page.goBack();await page.locator('.singer-rank-row').first().waitFor();await page.locator('.singer-rank-row').first().click({position:{x:3,y:20}});await page.waitForURL(/\/singer\.html\?id=SN0001$/);await page.goBack();await page.locator('.singer-rank-row').first().waitFor();
  assert.equal(await page.locator('#releaseSection').isVisible(),true);assert.equal(await page.locator('#releaseAction .release-detail-link').count(),0);assert.equal(await page.locator('#releaseAction .official-release-link').getAttribute('href'),s.officialReleaseUrl);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const width of[1280,390])test(`JS OFF formal information Release link ${width}`,async()=>{const{context,page,errors}=await open('S100',width,{off:true});try{assert.equal(await page.locator('#songInfo .song-debut-release-link').getAttribute('href'),'release/R0058.html');assert.equal(await page.locator('#releaseAction .release-detail-link').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);}finally{await context.close();}});

for(const width of[1280,390])test(`CD label, centered work arrow and unchanged neighboring UI ${width}`,async()=>{
 const rows=[];
 const measure=()=>{
  const dl=document.getElementById('songInfo'),link=dl.querySelector('.song-debut-release-link'),title=link.querySelector('.mus-title-chip'),arrow=link.querySelector('.mus-link-chevron');
  const rect=e=>{const b=e.getBoundingClientRect();return{y:b.y,height:b.height,center:b.y+b.height/2,width:b.width};};
  const style=e=>{const s=getComputedStyle(e);return{fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,padding:s.padding};};
  const firstText=e=>{const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let t;while((t=w.nextNode()))if(t.textContent.trim())break;const r=document.createRange();r.setStart(t,t.textContent.search(/\S/));r.setEnd(t,t.textContent.search(/\S/)+1);return r.getBoundingClientRect().y;};
  const dt=link.parentElement.previousElementSibling,other=[...dl.querySelectorAll('dt')].filter(e=>e!==dt).map(e=>({label:e.textContent.trim(),term:style(e),value:style(e.nextElementSibling),offset:firstText(e.nextElementSibling)-firstText(e)}));
  return{label:dt.textContent.trim(),href:link.getAttribute('href'),title:rect(title),arrow:rect(arrow),link:style(link),titleStyle:style(title),ddStyle:style(link.parentElement),textOffset:firstText(title)-firstText(dt),other,official:document.getElementById('releaseSection').outerHTML,ranking:document.getElementById('singerRanking').outerHTML,overflow:document.documentElement.scrollWidth>innerWidth};
 };
 for(const id of['S001','S100']){
  let before;
  if(baselineRoot){const old=await open(id,width,{baseline:true});try{before=await old.page.evaluate(measure);assert.equal(before.label,'収録作品');await old.page.locator('#songInfo').locator('..').screenshot({path:path.join(shots,`${id}-${width}-before.png`)});assert.deepEqual(old.errors,[]);}finally{await old.context.close();}}
  const current=await open(id,width);try{const after=await current.page.evaluate(measure);assert.equal(after.label,'収録CD');assert.ok(Math.abs(after.title.center-after.arrow.center)<.5,'title and arrow centers match');assert.equal(after.link.lineHeight,after.ddStyle.lineHeight);assert.equal(after.titleStyle.lineHeight,after.ddStyle.lineHeight);assert.equal(after.titleStyle.fontSize,after.ddStyle.fontSize);assert.equal(after.titleStyle.fontWeight,after.ddStyle.fontWeight);assert.ok(Math.abs(after.textOffset-after.other[0].offset)<2.5,'first text line aligns with ordinary information rows');assert.equal(after.arrow.width,30);assert.equal(after.arrow.height,30);assert.equal(after.overflow,false);
   if(before){assert.deepEqual(after.other,before.other);assert.equal(after.href,before.href);assert.equal(after.official,before.official);assert.equal(after.ranking,before.ranking);assert.equal(after.titleStyle.fontSize,before.titleStyle.fontSize);assert.equal(after.titleStyle.fontWeight,before.titleStyle.fontWeight);}
   await current.page.locator('#songInfo').locator('..').screenshot({path:path.join(shots,`${id}-${width}-after.png`)});rows.push({id,width,before,after});assert.deepEqual(current.errors,[]);
  }finally{await current.context.close();}
 }
 fs.writeFileSync(path.join(shots,`alignment-${width}.json`),JSON.stringify(rows,null,2));
});
