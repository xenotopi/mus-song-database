"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),current=JSON.parse(fs.readFileSync(path.join(root,'data/current.json'))),snap=path.join(root,'data/snapshots',current.revision);
const source=fs.readFileSync(path.join(root,'assets/js/venue-event-songs.js'),'utf8');
const order=new Function(source.split('export function createVenueEventSongs')[0].replace(/^import.*\n/gm,'').replace(/export /g,'')+';return orderedEventSongs;')();
const row=(id,p=null,r=null)=>({songId:id,songName:id,setlistPosition:p,relativePosition:r});
for(const [name,input,mode,ids]of[
 ['absolute gaps/ties',{songOrderIsSetlist:true,songs:[row('S002',18),row('S001',1),row('S003',18)]},'absolute',['S001','S002','S003']],
 ['relative',{songOrderIsSetlist:false,songs:[row('S002',null,2),row('S001',null,1)]},'relative',['S001','S002']],
 ['partial relative',{songOrderIsSetlist:false,songs:[row('S002',null,2),row('S001')]},'registered',['S002','S001']],
 ['incomplete absolute',{songOrderIsSetlist:true,songs:[row('S002',2),row('S001')]},'registered',['S002','S001']],
 ['flag false absolute',{songOrderIsSetlist:false,songs:[row('S002',2),row('S001',1)]},'registered',['S002','S001']],
 ['dual positions invalid',{songOrderIsSetlist:true,songs:[row('S002',1,1)]},'registered',['S002']],
 ['repeated Song',{songOrderIsSetlist:true,songs:[row('S001',18),row('S001',1)]},'absolute',['S001','S001']],
 ['zero rows',{songOrderIsSetlist:true,songs:[]},'registered',[]]
])test('Venue order '+name,()=>{const before=JSON.stringify(input),out=order(input);assert.equal(out.mode,mode);assert.deepEqual(out.rows.map(s=>s.songId),ids);assert.equal(JSON.stringify(input),before);});
let browser,server,base;const shots=fs.mkdtempSync(path.join(os.tmpdir(),'musdb-detail06-'));
test.before(async()=>{server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome'});});
test.after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));console.log('Detail06 QA images '+shots);});
const events=Array.from({length:22},(_,i)=>({eventId:'EV'+String(i+1).padStart(4,'0'),eventName:i===0?'長い開催イベント LongUnbrokenEnglishEventTitle'.repeat(2):'Event '+i,date:(i%2?'2025':'2024')+'-01-01',category:i%3?'公式':'ソロ',eventType:'ライブ',day:'Day1'}));
async function open(kind,width,opts={}){
 const ctx=await browser.newContext({viewport:{width,height:900}}),page=await ctx.newPage(),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const ev=opts.events||events,template=JSON.parse(fs.readFileSync(path.join(snap,'events/EV0001.json')));
 const songs=opts.songs||[{...row('S002',18),songName:'長いSong title '+('EnglishTitle'.repeat(5)),singerId:'SN0001',singerDisplayName:'正式な歌唱名義'},{...row('S001',1),songName:'<img src=x onerror=alert(1)>',singer:'Unknown'},{...row('S002',18),songName:'Repeated Song'}];
 const detail=id=>({...template.data.event,...opts.sourceEvent,eventId:id,songOrderIsSetlist:opts.sourceEvent?.songOrderIsSetlist??opts.flag??true,songs:opts.sourceEvent?.songs||songs});
 await ctx.route('**/data/snapshots/**/events/*.json',async r=>{const id=new URL(r.request().url()).pathname.match(/(EV\d+)\.json/)[1];calls.push('static:'+id);if(opts.gate)await opts.gate;if(opts.failStatic)return r.fulfill({json:{}});const wrapper=structuredClone(template);wrapper.data.event=detail(id);wrapper.data.discover.eventId=id;return r.fulfill({json:wrapper});});
 await ctx.route(/script\.google(?:usercontent)?\.com\//,r=>{const u=new URL(r.request().url()),a=u.searchParams.get('action'),id=u.searchParams.get('id');calls.push('api:'+a+':'+(id||''));let data={};
 if(a==='revision')data=current;
 if(a==='venue')data={venueId:'VE0038',venueName:'正式会場名',statistics:{eventCount:ev.length,uniqueSongCount:2,performanceCount:3},events:ev,topSongs:[{songId:'S001',songName:'曲名',performanceCount:3,eventCount:2}],navigation:{}};
 if(a==='discover')data={yearlyStats:[{year:'2024',eventCount:1}],firstPerformedSongs:[],topSingers:[{singerId:'SN0001',name:'μ’s',count:1}],navigation:{}};
 if(a==='event')data=opts.badSchema?{eventId:id,songs:null}:detail(id);
 if(a==='singer')data={singerId:'SN0001',displayName:'μ’s',summary:{eventCount:ev.length,uniqueSongCount:2,performanceCount:ev.length*2},songs:[{songId:'S001',songName:'長い曲名 '+('LongSongTitle'.repeat(5)),performanceCount:3}],history:ev.flatMap(e=>[...songs.slice(0,2)].map(s=>({...s,...e,date:e.date,type:e.category})))};
 return r.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success:!opts.failApi||a!=='event',data})});`});});
 await page.goto(base+'/'+kind+'.html?id='+({venue:'VE0038',singer:'SN0001',event:'EV0001'}[kind]));await page.locator('#status').waitFor({state:'hidden'});const d=page.getByRole('button',{name:'同意しない',exact:true});if(await d.isVisible())await d.click();return{ctx,page,errors,calls,opts};
}
async function chip(page,selector){const a=page.locator(selector).first();await a.scrollIntoViewIfNeeded();await a.locator('.mus-link-chevron svg').waitFor();await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());const finish=async()=>a.evaluate(async e=>{const c=e.querySelector('.mus-link-chevron');window.__linkHold??={e,c};if(window.__linkHold.e!==e||window.__linkHold.c!==c)throw Error('identity changed');getComputedStyle(c).transform;await new Promise(requestAnimationFrame);await Promise.all(c.getAnimations().map(a=>a.finished));await new Promise(requestAnimationFrame);const b=e.getBoundingClientRect(),x=c.getBoundingClientRect();return{r:[b.x+scrollX,b.y+scrollY,b.width,b.height],x:x.x+scrollX,w:x.width,h:x.height,svg:c.querySelector('svg').getBoundingClientRect().width,transform:getComputedStyle(c).transform,duration:getComputedStyle(c).transitionDuration};});await page.evaluate(()=>delete window.__linkHold);const b=await finish();assert.equal(b.w,30);assert.equal(b.h,30);assert.equal(b.svg,16);await a.hover();const h=await finish();assert.ok(Math.abs(h.x-b.x-3)<.1);assert.deepEqual(h.r,b.r);await page.mouse.move(0,0);await a.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await a.evaluate(e=>e.matches(':focus-visible')),true);assert.equal(await a.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');await page.emulateMedia({reducedMotion:'reduce'});const rm=await finish();assert.equal(rm.transform,'none');assert.equal(rm.duration,'0s');await page.mouse.move(0,0);await a.evaluate(e=>e.blur());await page.emulateMedia({reducedMotion:'no-preference'});}
async function clean(c){assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await c.page.locator('a a,a button,button a').count(),0);assert.deepEqual(c.errors,[]);await c.ctx.close();}
for(const width of[1280,390]){
 test(`Venue ${width} years, categories, more, independent expansion and cached restoration`,async()=>{let release;const gate=new Promise(r=>release=r),c=await open('venue',width,{gate}),p=c.page;try{
  assert.equal(await p.locator('#discoverySection,#venueInsightsSection,#venueYearSelect').count(),0);assert.equal(await p.locator('main>section').evaluateAll(es=>es.map(e=>e.id).indexOf('eventsSection')<es.map(e=>e.id).indexOf('venueRecordsSection')),true);
  assert.equal(c.calls.filter(x=>x.startsWith('static:')).length,0);assert.equal(await p.locator('.venue-event-row').count(),10);assert.match(await p.locator('[data-year="all"]').innerText(),/22件/);assert.match(await p.locator('[data-year="2024"]').innerText(),/11件/);
  await p.locator('.venue-singer-row').first().waitFor();await chip(p,'.venue-singer-row');assert.equal(await p.locator('.venue-singer-row').first().getAttribute('aria-label'),'μ’sの歌唱名義詳細を見る');await chip(p,'.venue-song-row');await chip(p,'.venue-event-row .mus-link-primary');const first=p.locator('.venue-event-row').first(),btn=first.locator('button');await btn.click();await p.getByText('歌唱曲を読み込んでいます…').waitFor();assert.equal(await btn.getAttribute('aria-expanded'),'true');await btn.click();await btn.click();assert.equal(c.calls.filter(x=>x==='static:EV0001').length,1);const stalePanel=await first.locator('[data-venue-event-panel]').elementHandle();await p.locator('[data-year="2024"]').click();await p.locator('[data-year="all"]').click();assert.equal(await stalePanel.evaluate(e=>e.isConnected),false);assert.equal(c.calls.filter(x=>x==='static:EV0001').length,1);release();await first.locator('.venue-event-song').first().waitFor();
  assert.deepEqual(await first.locator('.venue-event-song .mus-link-primary').allTextContents(),['<img src=x onerror=alert(1)>','長いSong title '+('EnglishTitle'.repeat(5)),'Repeated Song']);assert.equal(await first.locator('img').count(),0);assert.match(await first.innerText(),/確認済みのイベント全体/);await chip(p,'.venue-event-song .mus-link-primary');
  const held=await first.locator('.venue-event-song').first().elementHandle();await p.locator('.venue-event-row').nth(1).locator('button').click();await p.locator('.venue-event-row').nth(1).locator('.venue-event-song').first().waitFor();assert.equal(await held.evaluate(e=>e.isConnected),true);
  await p.locator('[data-year="2024"]').click();assert.match(await p.locator('#eventCount').innerText(),/11\/22/);await p.locator('[data-category="公式"]').click();assert.equal(await p.locator('[data-year="2024"]').getAttribute('aria-pressed'),'true');assert.match(await p.locator('#eventCount').innerText(),/7\/22/);
  await p.locator('[data-category="all"]').click();await p.locator('[data-year="all"]').click();await p.locator('#eventMoreButton').click();assert.equal(await p.locator('.venue-event-row').count(),20);assert.equal(await p.locator('[data-venue-event-songs="EV0001"]').getAttribute('aria-expanded'),'true');assert.equal(c.calls.filter(x=>x==='static:EV0001').length,1);
  await p.locator('#eventsSection').screenshot({path:path.join(shots,'venue-'+width+'.png')});
 }finally{release();await clean(c);}});
 test(`Venue ${width} API fallback, local failure, explicit retry, malformed data`,async()=>{const opts={failStatic:true,failApi:true},c=await open('venue',width,opts),p=c.page;try{const row=p.locator('.venue-event-row').first();await row.locator('button').click();await row.locator('[data-venue-songs-retry]').waitFor();assert.equal(await p.locator('.venue-event-row').count(),10);assert.equal(await row.locator('.venue-event-song').count(),0);opts.failApi=false;opts.badSchema=true;await row.locator('[data-venue-songs-retry]').click();await row.locator('[data-venue-songs-retry]').waitFor();opts.badSchema=false;await row.locator('[data-venue-songs-retry]').click();await row.locator('.venue-event-song').first().waitFor();assert.equal(await row.locator('.venue-event-song').count(),3);}finally{await clean(c);}});
 for(const count of[0,1])test(`Venue ${width} ${count} events, empty songs and year buttons`,async()=>{const c=await open('venue',width,{events:events.slice(0,count),songs:[]});try{assert.equal(await c.page.locator('.venue-year-button').count(),count+1);if(count){await c.page.locator('[data-venue-event-songs]').click();await c.page.getByText('登録された歌唱曲はありません。').waitFor();}assert.equal(await c.page.locator('#eventMoreButton').isHidden(),true);}finally{await clean(c);}});
 test(`Event ${width} title/singer links and absolute order unchanged`,async()=>{const c=await open('event',width);try{const p=c.page;await chip(p,'.event-song-title');assert.equal(await p.locator('.event-song-title').first().getAttribute('href'),'song/S001.html');assert.equal(await p.locator('.event-song-singer-link').first().evaluate(e=>getComputedStyle(e).textDecorationLine),'underline');await p.locator('#songList').screenshot({path:path.join(shots,'event-'+width+'.png')});}finally{await clean(c);}});
 test(`Singer ${width} TYPE A songs, TYPE B history, toggles and filters`,async()=>{const c=await open('singer',width);try{const p=c.page;await chip(p,'.singer-song-row');assert.equal(await p.locator('.singer-song-row').first().evaluate(e=>e.tagName),'A');await chip(p,'.singer-event-title a');const row=p.locator('.singer-event-card').first();await row.locator('button').click();assert.equal(await row.locator('button').getAttribute('aria-expanded'),'true');await chip(p,'.singer-event-songs .mus-link-primary');await p.locator('#historySection').screenshot({path:path.join(shots,'singer-'+width+'.png')});await row.locator('button').click();assert.equal(await row.locator('button').getAttribute('aria-expanded'),'false');}finally{await clean(c);}});
}
for(const width of[1280,390])for(const mode of['relative','registered'])test(`Venue ${width} ${mode} order note and repeated rows`,async()=>{
 const songs=[row('S002',null,2),row('S001',null,1),row('S002',null,3)];if(mode==='registered')songs[1].relativePosition=null;
 const c=await open('venue',width,{flag:false,songs});try{const p=c.page;await p.locator('[data-venue-event-songs]').first().click();await p.locator('.venue-event-song').first().waitFor();assert.equal(await p.locator('.venue-event-song').count(),3);
 assert.deepEqual(await p.locator('.venue-event-song .mus-link-primary').allTextContents(),mode==='relative'?['S001','S002','S002']:['S002','S001','S002']);
 assert.match(await p.locator('.venue-event-order-note').innerText(),mode==='relative'?/相対順.*イベント全体の歌唱順ではありません/:/登録順.*実際の歌唱順ではありません/);
 }finally{await clean(c);}
});

// Formal Event fixtures retain every performance row, statistics and order field.
const formalEvents=fs.readdirSync(path.join(snap,'events')).map(name=>JSON.parse(fs.readFileSync(path.join(snap,'events',name))).data.event);
const solo=formalEvents.find(e=>e.eventId==='EV0017');
const official=formalEvents.find(e=>e.songs.some(s=>s.singerId==='SN0001'));
const multiple=formalEvents.find(e=>new Set(e.songs.map(s=>s.singerId).filter(Boolean)).size>1 && e.songs.some(s=>s.singerDisplayName?.includes('＆')));
assert.ok(solo&&official&&multiple,'formal solo, official and multiple-name fixtures exist');
const displayCases=[
 ['formal solo EV0017',solo],['formal official',official],['formal multiple names',multiple],
 ['missing displayName',{...solo,songs:[{...solo.songs[0],singerDisplayName:null}]}],
 ['missing Singer ID',{...solo,songs:[{...solo.songs[0],singerId:null,singerDisplayName:'正式名義 <script> & LongEnglishName'.repeat(3)}]}],
 ['same ID missing displayName and unset',{...solo,songs:[{...solo.songs[0],singerDisplayName:null},{...solo.songs[0]}, {...solo.songs[0],singerId:null,singerDisplayName:null,singer:null}]}]
];
for(const width of[1280,390])for(const [name,event]of displayCases)test(`Event performers ${width} ${name}`,async()=>{
 const original=JSON.stringify(event),c=await open('event',width,{sourceEvent:event});try{
  const p=c.page,names=new Map(event.songs.filter(s=>s.singerId&&s.singerDisplayName).map(s=>[s.singerId,s.singerDisplayName]));
  const display=s=>String(s.singerDisplayName||names.get(s.singerId)||s.singer||'—').trim()||'—';
  const sorted=event.songs.slice();if(event.songOrderIsSetlist===true&&sorted.every(s=>Number.isSafeInteger(s.setlistPosition)&&s.setlistPosition>0))sorted.sort((a,b)=>a.setlistPosition-b.setlistPosition);
  else if(event.songOrderIsSetlist!==true&&sorted.length&&sorted.every(s=>Number.isSafeInteger(s.relativePosition)&&s.relativePosition>0&&s.setlistPosition==null))sorted.sort((a,b)=>a.relativePosition-b.relativePosition);
  assert.deepEqual(await p.locator('.event-song-meta>span:nth-child(2)').allTextContents(),sorted.map(s=>'歌唱名義：'+display(s)));
  assert.deepEqual(await p.locator('.event-song-title .mus-title-chip').allTextContents(),sorted.map(s=>s.songName||'曲名未設定'));
  const expected=new Map();for(const s of event.songs){const key=String(s.singerId||`${s.singerCategory||''}｜${s.singer||display(s)}`).trim();const v=expected.get(key)||{id:s.singerId||'',name:display(s),count:0};v.count++;expected.set(key,v);}
  const rows=[...expected.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ja'));
  assert.equal(await p.locator('.performer-row').count(),rows.length);
  for(let i=0;i<rows.length;i++){const a=p.locator('.performer-row').nth(i),r=rows[i];assert.equal(await a.locator('.performer-name').innerText(),r.name);assert.equal(await a.locator('.performer-count').innerText(),r.count+'曲');assert.equal(await a.getAttribute('href'),r.id?'singer.html?id='+encodeURIComponent(r.id):'singer.html?name='+encodeURIComponent(r.name));assert.equal(await a.getAttribute('aria-label'),r.name+'の歌唱名義詳細を見る');assert.equal(await a.evaluate(e=>getComputedStyle(e).display),'grid');}
  assert.deepEqual(await p.locator('.event-info-singers a').allTextContents(),rows.filter(r=>r.name!=='—').map(r=>r.name));
  for(let i=0;i<sorted.length;i++){const a=p.locator('.event-song-row').nth(i).locator('.event-song-singer-link');assert.equal(await a.count(),sorted[i].singerId?1:0);if(sorted[i].singerId)assert.equal(await a.getAttribute('href'),'singer.html?id='+encodeURIComponent(sorted[i].singerId));}
  assert.equal(c.calls.some(x=>x.includes('singerList')),false);assert.equal(await p.locator('#songList script,.performer-name script').count(),0);
  await chip(p,'.performer-row');const a=p.locator('.performer-row').first();const box=await a.boundingBox();assert.equal(await a.evaluate((e,pt)=>document.elementFromPoint(pt.x,pt.y)?.closest('a')===e,{x:box.x+box.width-3,y:box.y+box.height/2}),true);
  const href=await a.getAttribute('href');await c.ctx.route('**/singer.html?*',r=>r.fulfill({body:'Singer navigation target'}));const popup=c.ctx.waitForEvent('page',{timeout:10000});await a.click({button:'middle'});const tab=await popup;await tab.waitForURL(new URL(href,base+'/').href);await tab.close();await a.focus();await Promise.all([p.waitForURL(new URL(href,base+'/').href),p.keyboard.press('Enter')]);
  assert.equal(JSON.stringify(event),original);
 }finally{await clean(c);}
});
