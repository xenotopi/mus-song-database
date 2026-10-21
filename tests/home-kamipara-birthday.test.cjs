"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),test=require('node:test'),cp=require('node:child_process');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),current=JSON.parse(fs.readFileSync(path.join(ROOT,'data/current.json')));
const wrapper=JSON.parse(fs.readFileSync(path.join(ROOT,'data/snapshots',current.revision,'kamipara-dashboard.json')));
const source=fs.readFileSync(path.join(ROOT,'assets/js/birthday-data-v400.js'),'utf8');
const oldSource=cp.execFileSync('git',['show','HEAD:assets/js/birthday-data-v400.js'],{cwd:ROOT,encoding:'utf8'});
const modules=Promise.all([source,oldSource].map(s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'))));
const clone=()=>JSON.parse(JSON.stringify(wrapper));
let server,browser,base;
test.before(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(ROOT,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome'});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
test('Existing 18 birthdays and their lookup order remain byte/data identical',async()=>{
 const [m,old]=await modules;assert.equal(m.BIRTHDAY_DATA.length,18);assert.ok(Object.isFrozen(m.BIRTHDAY_DATA));assert.deepEqual(m.BIRTHDAY_DATA,old.BIRTHDAY_DATA);
 assert.equal(source.slice(0,source.indexOf('export function')).replace(/\r\n/g,'\n'),oldSource.slice(0,oldSource.indexOf('export function')).replace(/\r\n/g,'\n'));
 for(const x of old.BIRTHDAY_DATA)assert.deepEqual(m.getBirthdaysForMonthDay(x.month,x.day),old.getBirthdaysForMonthDay(x.month,x.day));
});
test('Current Kamipara performers derive exactly eight original names and dates; no Mizary or Muse/cast substitution',async()=>{
 const [m]=await modules,before=JSON.stringify(wrapper),rows=m.getKamiparaBirthdays(wrapper.data.performers);
 assert.deepEqual(rows.map(x=>[x.performerId,x.name,x.month,x.day]),[
 ['KPS001','早乙女リリエル',3,17],['KPS002','竜崎クロウエル',1,23],['KPS003','白鳥ラナエル',10,5],['KPS004','綾小路シェリエル',6,22],['KPS005','東條ネルエル',4,29],['KPS006','恋塚フルーネティ',12,21],['KPS007','神楽坂ミナモ',9,10],['KPS009','アサギ',8,8]]);
 assert.ok(rows.every(x=>x.type==='character'&&x.source==='kamipara'&&x.id===`BD-KP-${x.performerId}`));assert.ok(!rows.some(x=>x.name==='ミザリィ'));assert.equal(JSON.stringify(wrapper),before);
 for(const x of rows)assert.ok(m.getBirthdaysForMonthDay(x.month,x.day,rows).some(y=>y.id===x.id));
});
test('Missing, malformed and impossible birthdays are excluded; actual leap-day format is valid',async()=>{
 const [m]=await modules,person=wrapper.data.performers[0];
 for(const birthday of [null,undefined,'','不明','13/01','00/17','02/30','04/31','03/00','3/17','03/17/2026'])assert.deepEqual(m.getKamiparaBirthdays([{...person,birthday}]),[],String(birthday));
 assert.equal(m.getKamiparaBirthdays([{...person,birthday:'02/29'}]).length,1);assert.deepEqual(m.getKamiparaBirthdays(null),[]);
});
test('Invalid performer references and empty character names do not create birthdays; duplicate IDs do not duplicate cards',async()=>{
 const [m]=await modules,p=wrapper.data.performers[0];assert.deepEqual(m.getKamiparaBirthdays([{...p,characterName:''},{...p,performerId:'SN0001'}]),[]);assert.equal(m.getKamiparaBirthdays([p,{...p}]).length,1);
});
test('Same-day supplementary characters coexist with Muse and cast, retaining CHARACTER then CAST order',async()=>{
 const [m]=await modules,p=wrapper.data.performers[0];
 const a=m.getBirthdaysForMonthDay(10,21,m.getKamiparaBirthdays([{...p,birthday:'10/21'}]));assert.deepEqual(a.map(x=>x.name),['絢瀬絵里','早乙女リリエル']);
 const b=m.getBirthdaysForMonthDay(7,12,m.getKamiparaBirthdays([{...p,birthday:'07/12'}]));assert.deepEqual(b.map(x=>[x.name,x.type]),[['早乙女リリエル','character'],['南條愛乃','cast']]);
});
function dateContext(iso){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso)).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));return {dateKey:`${parts.year}-${parts.month}-${parts.day}`,month:+parts.month,day:+parts.day,label:`${+parts.month}月${+parts.day}日`};}
async function open(options={}){
 const state={iso:'2026-03-17T03:00:00Z',...options},page=await browser.newPage({viewport:{width:state.width||1280,height:900},timezoneId:'America/Los_Angeles'}),errors=[],calls=[];
 const dashboardResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/kamipara-dashboard.json'));
 let release;const gate=state.delayed?new Promise(r=>release=r):Promise.resolve();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
 await page.clock.install({time:new Date(state.iso)});
 await page.route('**/kamipara-dashboard.json',async route=>{calls.push('kamipara-static');await gate;const data=clone();if(state.mutate)state.mutate(data);if(state.invalid)data.data._cache.revision='invalid';await route.fulfill({status:200,json:data});});
 await page.route(/script\.google(?:usercontent)?\.com\//,async route=>{
  const url=new URL(route.request().url()),action=url.searchParams.get('action');calls.push(action);let data={};
  if(action==='revision')data={dataRevision:current.dataRevision,outputRevision:current.outputRevision};
  if(action==='home')data={summary:{songCount:117,eventCount:353,venueCount:154,performanceCount:1000},today:{...dateContext(state.iso),releases:[],events:[],firstPerformedSongs:[],lastPerformedSongs:[]},recentPerformances:[],topSongs:[],topVenues:[]};
  await route.fulfill({status:200,contentType:'text/javascript',body:`${url.searchParams.get('callback')}(${JSON.stringify({success:true,data})});`});
 });
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#todaySummary')?.textContent.includes('本日の記録'));
 const decline=page.getByRole('button',{name:'同意しない',exact:true});if(await decline.isVisible())await decline.click();
 return {page,errors,calls,state,release,dashboardResponse};
}
async function settled(ctx){const response=await ctx.dashboardResponse;assert.equal(response.status(),200);await response.finished();await ctx.page.waitForLoadState('networkidle');}
async function clean(ctx){assert.deepEqual(ctx.errors,[]);assert.equal(await ctx.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);assert.equal(ctx.calls.filter(x=>x==='kamipara-static').length,1);assert.ok(!ctx.calls.includes('kamiparaDashboard'));await ctx.page.close();}
for(const width of [1280,390])test(`Actual Kamipara birthday ${width}: same CHARACTER card/message/design and screenshots`,async()=>{
 const ctx=await open({width}),{page}=ctx;await page.locator('#birthdayContent strong').filter({hasText:'早乙女リリエルちゃん'}).waitFor();
 assert.deepEqual(await page.locator('#birthdayContent strong').allTextContents(),['早乙女リリエルちゃん']);assert.equal(await page.locator('.birthday-type').innerText(),'CHARACTER');assert.match(await page.locator('#birthdayContent').innerText(),/お誕生日おめでとうございます！/);assert.equal(await page.locator('#birthdaySection').getAttribute('hidden'),null);
 if(process.env.MUSDB_BIRTHDAY_QA_DIR)await page.locator('#topSection').screenshot({path:path.join(process.env.MUSDB_BIRTHDAY_QA_DIR,`kamipara-birthday-${width}.png`)});
 await clean(ctx);
});
test('Existing Muse and cast birthdays unchanged, and unregistered day hides the birthday card',async()=>{
 for(const [iso,name,type]of [['2026-10-21T03:00:00Z','絢瀬絵里ちゃん','CHARACTER'],['2026-07-12T03:00:00Z','南條愛乃さん','CAST'],['2026-03-16T03:00:00Z',null,null]]){
  const ctx=await open({iso,width:390});await settled(ctx);assert.deepEqual(await ctx.page.locator('#birthdayContent strong').allTextContents(),name?[name]:[]);if(name)assert.equal(await ctx.page.locator('.birthday-type').innerText(),type);else assert.equal(await ctx.page.locator('#birthdaySection').isVisible(),false);assert.doesNotMatch(await ctx.page.locator('#birthdayContent').textContent(),/ミザリィ/);await clean(ctx);
 }
});
test('Same-day fixtures display both existing and Kamipara birthdays without changing other Today content',async()=>{
 for(const [iso,birthday,names,types]of [['2026-10-21T03:00:00Z','10/21',['絢瀬絵里ちゃん','早乙女リリエルちゃん'],['CHARACTER','CHARACTER']],['2026-07-12T03:00:00Z','07/12',['早乙女リリエルちゃん','南條愛乃さん'],['CHARACTER','CAST']]]){
  const ctx=await open({iso,width:390,mutate:w=>w.data.performers[0].birthday=birthday});await settled(ctx);assert.deepEqual(await ctx.page.locator('#birthdayContent strong').allTextContents(),names);assert.deepEqual(await ctx.page.locator('.birthday-type').allTextContents(),types);assert.match(await ctx.page.locator('#todayContent').innerText(),/今日はまだ記録がありません/);await clean(ctx);
 }
});
test('Invalid optional snapshot does not remove the existing birthday or trigger extra API fallback',async()=>{
 const ctx=await open({iso:'2026-10-21T03:00:00Z',invalid:true});await settled(ctx);assert.deepEqual(await ctx.page.locator('#birthdayContent strong').allTextContents(),['絢瀬絵里ちゃん']);await clean(ctx);
});
test('Delayed optional snapshot never blocks existing birthdays and appends only to the birthday section',async()=>{
 const ctx=await open({iso:'2026-10-21T03:00:00Z',delayed:true,mutate:w=>w.data.performers[0].birthday='10/21'});
 assert.deepEqual(await ctx.page.locator('#birthdayContent strong').allTextContents(),['絢瀬絵里ちゃん']);const before=await ctx.page.locator('#todayContent').innerHTML();ctx.release();await settled(ctx);assert.deepEqual(await ctx.page.locator('#birthdayContent strong').allTextContents(),['絢瀬絵里ちゃん','早乙女リリエルちゃん']);assert.equal(await ctx.page.locator('#todayContent').innerHTML(),before);await clean(ctx);
});
test('JST rollover shows the new birthday and rejects a previous-day delayed supplement',async()=>{
 const ctx=await open({iso:'2026-03-16T14:59:00Z'});await settled(ctx);assert.equal(await ctx.page.locator('#birthdaySection').isVisible(),false);ctx.state.iso='2026-03-16T15:01:00Z';await ctx.page.clock.runFor(120000);await ctx.page.getByText('早乙女リリエルちゃん',{exact:true}).waitFor();assert.equal(await ctx.page.evaluate(()=>new Date().getDate()),16);assert.match(await ctx.page.locator('#todayDate').innerText(),/3月17日/);await clean(ctx);
 // Cross midnight within the existing Static fetch's 8-second budget;
 // holding the fixture for two virtual minutes tests an aborted request instead.
 const late=await open({iso:'2026-03-17T14:59:56Z',delayed:true});late.state.iso='2026-03-17T15:00:01Z';await late.page.clock.runFor(5000);await late.page.waitForFunction(()=>document.querySelector('#todayDate').textContent.includes('3月18日'));late.release();await settled(late);assert.equal(await late.page.locator('#birthdaySection').isVisible(),false);assert.deepEqual(await late.page.locator('#birthdayContent strong').allTextContents(),[]);await clean(late);
});
