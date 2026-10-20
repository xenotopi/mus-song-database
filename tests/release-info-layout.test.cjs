'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),p=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=p.resolve(__dirname,'..'),work=process.env.RELEASE_INFO_WORK,mode=process.env.RELEASE_INFO_MODE||'after';
if(!work||!['before','after'].includes(mode))throw Error('Use an external RELEASE_INFO_WORK and before/after mode');
const out=p.join(work,'screenshots',mode),pointer=require('../data/current.json'),base=p.join(root,'data/snapshots',pointer.outputRevision),read=f=>JSON.parse(fs.readFileSync(p.join(base,f))).data,list=read('release-list.json');
// Reuse a saved public API response only as a local layout fixture; no master edits.
const singers=require(p.resolve(work,'../release-detail-ux-05a-work/public-api-singerList.json')).payload.data;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),ids=['R0094','R0107','R0097','R0010','R0088','R0052'],observations=[];
let server,browser,origin;
test.before(async()=>{
 fs.mkdirSync(p.dirname(out),{recursive:true});fs.mkdirSync(out,{recursive:false});
 server=http.createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=p.resolve(root,'.'+decodeURIComponent(path));
  if(p.relative(root,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  const before=p.join(work,'before',path),source=mode==='before'&&fs.existsSync(before)&&fs.statSync(before).isFile()?before:file;
  let body=fs.readFileSync(source);
  // Independent query renderer, not a changed template or a formal capture.
  if(path==='/release.html')body=Buffer.from(body.toString().replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/,''));
  res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[p.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));fs.writeFileSync(p.join(out,'observations.json'),JSON.stringify({mode,localFixture:true,ids,observations},null,2)+'\n',{flag:'wx'});});
async function open(id,width,options={}){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 await context.addInitScript(()=>localStorage.setItem('musdb_analytics_consent','rejected'));
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.failure()?.errorText+' '+r.url()));
 if(options.release)await context.route('**/data/snapshots/**/releases/'+id+'.json',async route=>{const doc=JSON.parse(fs.readFileSync(p.join(base,'releases',id+'.json')));doc.data={...doc.data,...options.release};return route.fulfill({json:doc});});
 if(options.release)await context.route('**/data/snapshots/**/release-list.json',async route=>{const doc=JSON.parse(fs.readFileSync(p.join(base,'release-list.json')));doc.data=doc.data.map(r=>r.releaseId===id?{...r,...options.release}:r);return route.fulfill({json:doc});});
 await context.route(/script\.google(?:usercontent)?\.com\//,route=>{const u=new URL(route.request().url()),action=u.searchParams.get('action'),data=action==='revision'?{dataRevision:pointer.dataRevision}:action==='singerList'?(options.singers||singers):action==='releaseList'?list:action==='release'?read('releases/'+id+'.json'):{};return route.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success:true,data})});`});});
 try{await page.goto(origin+'/release.html?id='+id,{waitUntil:'load',timeout:30000});await ready(page);return{page,context,errors};}catch(e){await context.close();throw e;}
}
async function ready(page){await page.evaluate(async()=>{const m=await import(document.querySelector('script[src*="release-v500"]').src);await m.releaseReady;await m.releasePersonReady;await document.fonts.ready;});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function measure(page){return page.evaluate(()=>{
 const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};},dl=document.querySelector('#releaseInfo'),main=document.querySelector('#mainContent').cloneNode(true);main.querySelector('#releaseInformationSection').remove();
 return{tag:dl.tagName,hidden:dl.hidden,rect:rect(dl),overflow:document.documentElement.scrollWidth>innerWidth,rows:[...dl.children].map(n=>({field:n.dataset.releaseInfoField||'',label:n.querySelector('dt')?.textContent,value:n.querySelector('dd')?.textContent,rect:rect(n),dd:rect(n.querySelector('dd')),valid:n.tagName==='DIV'&&n.children.length===2&&n.children[0].tagName==='DT'&&n.children[1].tagName==='DD',links:[...n.querySelectorAll('a')].map(l=>({href:l.getAttribute('href'),text:l.textContent,rect:rect(l),font:getComputedStyle(l).fontSize}))})),outside:main.innerHTML,seo:{title:document.title,canonical:[...document.querySelectorAll('link[rel="canonical"]')].map(n=>n.href),description:document.querySelector('meta[name="description"]')?.content},hero:document.querySelector('.release-hero').textContent};
 });}
function checkLayout(state,width){
 a.equal(state.tag,'DL');a.equal(state.overflow,false);a.ok(state.rows.every(r=>r.valid&&r.label&&r.value));
 const names=state.rows.map(r=>r.field),ordered=['official','series','parent','featured','cv','edition','catalog'];a.equal(new Set(names).size,names.length);a.deepEqual(names,ordered.filter(k=>names.includes(k)));
 const field=name=>state.rows.find(r=>r.field===name),near=(x,y)=>a.ok(Math.abs(x-y)<1,`Expected ${x} ~ ${y}`);
 if(field('official'))near(field('official').rect.width,state.rect.width);
 if(width>700){for(const [left,right]of [['series','parent'],['featured','cv'],['edition','catalog']]){const l=field(left),r=field(right);if(l&&r){near(l.rect.y,r.rect.y);a.ok(l.rect.right<r.rect.x);}else if(l||r)near((l||r).rect.width,state.rect.width);}}
 else for(let i=0;i<state.rows.length;i++){near(state.rows[i].rect.width,state.rect.width);if(i)a.ok(state.rows[i].rect.y>=state.rows[i-1].rect.bottom-1);}
 for(const r of state.rows){a.ok(r.dd.right<=r.rect.right+1);for(const l of r.links){a.ok(l.rect.height>=(width<=700?44:36));a.ok(l.rect.right<=r.rect.right+1);}}
}
async function checkLinks(page,state,width){
 for(const row of state.rows.filter(r=>r.links.length)){
  a.ok(['parent','featured','cv'].includes(row.field));const link=page.locator(`[data-release-info-field="${row.field}"] a`);await link.scrollIntoViewIfNeeded();
  a.equal(await link.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+2,r.y+2));}),true);
  await link.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');a.equal(await link.evaluate(n=>n.matches(':focus-visible')),true);
  const destination=origin+'/'+row.links[0].href;
  // Click destination probe only. Singer/parent content QA belongs to 05D.
  await page.route(destination,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local link destination probe</title>'}));
  await link.click({position:{x:2,y:2}});await page.waitForURL(destination);a.equal(page.url(),destination);await page.goBack({waitUntil:'load'});await ready(page);await page.unroute(destination);
 }
}
for(const id of ids)for(const width of [1280,390])test(`${mode} information ${id} ${width}`,async()=>{
 const x=await open(id,width);try{
  await x.page.locator('#releaseInformationSection').scrollIntoViewIfNeeded();let state=await measure(x.page);a.equal(state.overflow,false);a.deepEqual(x.errors,[]);
  if(mode==='after'){
   checkLayout(state,width);const prior=JSON.parse(fs.readFileSync(p.join(work,'screenshots','before',id+'-'+width+'.json')));
   a.equal(hash(state.outside),hash(prior.outside),'UI outside the information card changed');a.deepEqual(state.seo,prior.seo);a.equal(state.hero,prior.hero);
   const current=list.find(r=>r.releaseId===id),oldRows=Object.fromEntries(prior.rows.map(r=>[r.label,r]));for(const row of state.rows){if(oldRows[row.label]){a.equal(row.value,oldRows[row.label].value);a.deepEqual(row.links.map(l=>({href:l.href,text:l.text})),oldRows[row.label].links.map(l=>({href:l.href,text:l.text})));}}
   if(current.officialName)a.equal(state.rows[0].value,current.officialName);else a.ok(!state.rows.some(r=>r.field==='official'));
   if(current.parentReleaseId)a.equal(state.rows.find(r=>r.field==='parent').links[0].href,'release/'+current.parentReleaseId+'.html');else a.ok(!state.rows.some(r=>r.field==='parent'));
   if(current.featuredSinger)a.equal(state.rows.find(r=>r.field==='featured').links[0].href,'singer.html?id='+current.featuredSinger.id);
   await checkLinks(x.page,state,width);a.deepEqual(x.errors,[]);await x.page.locator('#releaseInformationSection').scrollIntoViewIfNeeded();state=await measure(x.page);
  }
  fs.writeFileSync(p.join(out,id+'-'+width+'.json'),JSON.stringify(state,null,2)+'\n',{flag:'wx'});await x.page.screenshot({path:p.join(out,id+'-'+width+'-'+mode+'.png'),animations:'disabled'});
  observations.push({id,width,status:'PASS',outsideHash:hash(state.outside),rows:state.rows,errors:x.errors});
 }finally{await x.context.close();}
});
if(mode==='after')for(const [name,release,singerOverride]of [
 ['no-CV',{}, {official:[],solo:[]}],
 ['no-featured',{featuredSinger:null}],
 ['parent-without-series',{releaseSeries:null}],
 ['catalog-without-edition',{editionType:null}],
 ['edition-without-catalog',{catalogNumber:null}],
 ['no-official-name',{officialName:null}]
])test('optional fields '+name,async()=>{
 const x=await open('R0107',1280,{release,singers:singerOverride});try{for(const width of [1280,390]){await x.page.setViewportSize({width,height:900});await x.page.locator('#releaseInformationSection').scrollIntoViewIfNeeded();const state=await measure(x.page);checkLayout(state,width);const has=f=>state.rows.some(r=>r.field===f);if(name==='no-CV')a.equal(has('cv'),false);if(name==='no-featured'){a.equal(has('featured'),false);a.equal(has('cv'),false);}if(name==='parent-without-series'){a.equal(has('series'),false);a.equal(has('parent'),true);}if(name==='catalog-without-edition')a.equal(has('edition'),false);if(name==='edition-without-catalog')a.equal(has('catalog'),false);if(name==='no-official-name')a.equal(has('official'),false);a.deepEqual(x.errors,[]);}observations.push({fixture:name,status:'PASS'});}finally{await x.context.close();}
});
