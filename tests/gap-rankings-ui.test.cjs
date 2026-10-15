'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'data/gap-rankings.json')));
let browser,server,base;
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'musdb-gap-rankings-'));
test.before(async()=>{
  server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const bytes=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'application/json');res.end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome',headless:true});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));console.log('Screenshots: '+screenshots);});
async function open(width=1280,derived=data,date='2026-10-15T03:00:00Z'){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
  await page.clock.install({time:new Date(date)});
  await page.route('**/data/gap-rankings.json',r=>r.fulfill({json:derived}));
  await page.route('https://script.google.com/**',r=>{const u=new URL(r.request().url()),callback=u.searchParams.get('callback');r.fulfill({contentType:'text/javascript',body:`${callback}(${JSON.stringify({success:true,data:{dataRevision:data.source.dataRevision,outputRevision:data.source.outputRevision}})});`});});
  await page.goto(base+'/gap-rankings.html');return{page,context,errors,requests};
}
async function ready(page){await page.locator('#rankingResults').waitFor({state:'visible'});}
async function fit(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.gap-rankings-row').evaluateAll(rows=>rows.every(r=>{const b=r.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&r.scrollWidth<=r.clientWidth;})),true);}
for(const width of [1280,390])test('real snapshot TOP20, all six views, links, keyboard, no overflow '+width,async()=>{
  const{page,context,errors,requests}=await open(width);try{
    await ready(page);
    const consent=page.getByRole('button',{name:'同意しない',exact:true});if(await consent.isVisible())await consent.click();
    await page.screenshot({path:path.join(screenshots,`overview-${width}.png`),fullPage:false});
    assert.equal(await page.locator('[data-scope=official]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.gap-rankings-row').count(),20);assert.match(await page.locator('#rankingTitle').innerText(),/もし今日/);
    for(const tab of ['current','history'])for(const scope of ['official','solo','all']){
      await page.locator(`[data-tab=${tab}]`).click();await page.locator(`[data-scope=${scope}]`).click();
      const expected=(await import('../assets/js/gap-rankings-model.js')).rankSongs(data.payload,scope,tab,'2026-10-15');
      const shown=await page.locator('.gap-rankings-song h3').allTextContents();assert.deepEqual(shown,expected.rows.map(r=>r.name));
      assert.deepEqual(await page.locator('.gap-rankings-number').allTextContents(),expected.rows.map(r=>r.days.toLocaleString('ja-JP')+'日'));
      assert.deepEqual(await page.locator('.gap-rankings-rank').allTextContents(),expected.rows.map(r=>String(r.rank)));
      assert.match(await page.locator('#rankingMeta').innerText(),new RegExp('対象'+expected.population+'曲'));
      assert.equal(new URL(page.url()).searchParams.get('scope'),scope);await fit(page);
      const first=page.locator('.gap-rankings-row').first();assert.match(await first.locator('h3 a').getAttribute('href'),/song\/S\d{3}\.html/);
      assert.match(await first.locator('.gap-rankings-dates a').first().getAttribute('href'),/event\.html\?id=EV/);
      assert.match(await first.locator('.gap-rankings-checker').innerText(),/→/);
      assert.doesNotMatch((await page.locator('#rankingTitle,.gap-rankings-hero,.gap-rankings-controls,.gap-rankings-row').allTextContents()).join('\n'),/復活|再生|蘇る|ブランク開始日|過去最大の歌唱間隔/);
      if(tab==='history')assert.equal(await page.locator('#rankingTitle').innerText(),'歴代『何日ぶり？』ランキング');
      assert.equal(await first.locator('.gap-rankings-analogy').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
      if(width===1280){assert.ok((await first.boundingBox()).height<(tab==='current'?192:248));const dates=await first.locator('.gap-rankings-dates').boundingBox(),days=await first.locator('.gap-rankings-days').boundingBox();assert.ok(days.x>=dates.x+dates.width);}
    }
    await page.locator('[data-scope=official]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-scope=official]').getAttribute('aria-pressed'),'true');
    await page.goBack();assert.equal(await page.locator('[data-scope=all]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-scope=official]').click();
    assert.match(await page.locator('.gap-rankings-number').first().innerText(),/4,699日/);
    assert.equal(await page.locator('.gap-rankings-analogy').first().innerText(),'干支が一周して、さらにおまけ付き。');
    await page.locator('#rankingTitle').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-20));
    await page.screenshot({path:path.join(screenshots,`history-${width}.png`),fullPage:false});
    await page.locator('[data-tab=current]').click();await page.locator('#rankingTitle').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-20));await page.screenshot({path:path.join(screenshots,`current-${width}.png`),fullPage:false});
    assert.equal(await page.locator('.gap-rankings-number').first().innerText(),'5,352日');
    assert.equal(await page.locator('.gap-rankings-analogy').first().innerText(),'ランドセルだった子が、もう二十歳。');
    assert.equal(await page.getByText('期間の例えは、日数をイメージしやすくするための目安です。',{exact:true}).count(),1);
    assert.equal(await page.locator('#backToTopButton').evaluate(e=>getComputedStyle(e).position),'relative');
    const top=await page.locator('#backToTopButton').boundingBox(),last=await page.locator('.gap-rankings-row').last().boundingBox();assert.ok(top.y>=last.y+last.height);
    console.log(JSON.stringify({width,firstCardHeight:(await page.locator('.gap-rankings-row').first().boundingBox()).height,days:await page.locator('.gap-rankings-number').first().innerText()}));
    await page.locator('.gap-rankings-checker').first().focus();assert.equal(await page.locator('.gap-rankings-checker').first().evaluate(e=>e===document.activeElement),true);
    await page.locator('#backToTopButton').scrollIntoViewIfNeeded();await page.locator('#backToTopButton').focus();await page.keyboard.press('Enter');await page.clock.runFor(1500);assert.equal(await page.evaluate(()=>scrollY),0);
    assert.equal(requests.filter(u=>u.includes('/data/gap-rankings.json')).length,1);
    assert.equal(requests.filter(u=>u.includes('/songs/')||u.includes('action=gapV2')).length,0);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
for(const kind of ['revision','hash'])test('untrusted '+kind+' fails closed and retry recovers',async()=>{
  const altered=structuredClone(data);if(kind==='revision')altered.source.dataRevision='old';else altered.payload.songs[0].name='changed';
  const{page,context}=await open(390,altered);try{await page.getByRole('button',{name:'再試行'}).waitFor();assert.equal(await page.locator('#rankingResults').isHidden(),true);assert.match(await page.locator('#rankingStatus').innerText(),/表示できません/);await page.unroute('**/data/gap-rankings.json');await page.getByRole('button',{name:'再試行'}).click();await ready(page);assert.equal(await page.locator('.gap-rankings-row').count(),20);}finally{await context.close();}
});
test('JST midnight updates baseline and same-day record notice, today-only excluded',async()=>{
  const fixture=structuredClone(data);fixture.payload.events={EV1:{eventId:'EV1',eventName:'前回',date:'2026-10-13'},EV2:{eventId:'EV2',eventName:'当日のイベント',date:'2026-10-14'}};
  fixture.payload.songs=fixture.payload.songs.map(s=>({...s,recordCount:0,dates:[]}));
  fixture.payload.songs[0].recordCount=2;fixture.payload.songs[0].dates=[{date:'2026-10-13',all:['EV1'],official:['EV1'],solo:[],recordCount:1},{date:'2026-10-14',all:['EV2'],official:['EV2'],solo:[],recordCount:1}];
  fixture.payload.songs[1].recordCount=1;fixture.payload.songs[1].dates=[{date:'2026-10-14',all:['EV2'],official:['EV2'],solo:[],recordCount:1}];
  fixture.payloadSha256=crypto.createHash('sha256').update(JSON.stringify(fixture.payload)).digest('hex');
  const{page,context,errors}=await open(390,fixture,'2026-10-14T14:59:59Z');try{await ready(page);assert.equal(await page.locator('.gap-rankings-row').count(),1);assert.match(await page.locator('.gap-rankings-today').innerText(),/当日の歌唱記録があります/);assert.match(await page.locator('#unrankedList').textContent(),/当日の記録あり/);await page.clock.runFor(2000);assert.match(await page.locator('#rankingMeta').innerText(),/2026-10-15/);assert.equal(await page.locator('.gap-rankings-row').count(),2);assert.equal(await page.locator('.gap-rankings-today').count(),0);assert.deepEqual(errors,[]);}finally{await context.close();}
});
test('empty Songs are unranked, never fabricated as zero-day rankings; escaped labels',async()=>{
  const fixture=structuredClone(data);fixture.payload.events={};fixture.payload.songs=fixture.payload.songs.map(s=>({...s,recordCount:0,dates:[]}));fixture.payload.songs[0].name='<img src=x onerror=alert(1)>';
  fixture.payloadSha256=crypto.createHash('sha256').update(JSON.stringify(fixture.payload)).digest('hex');
  const{page,context,errors}=await open(390,fixture);try{await ready(page);assert.equal(await page.locator('.gap-rankings-row').count(),0);assert.match(await page.locator('#unrankedSummary').innerText(),/117曲/);assert.equal(await page.locator('#unrankedList img').count(),0);assert.match(await page.locator('#unrankedList').textContent(),/<img src=x/);await page.locator('[data-tab=history]').click();assert.match(await page.locator('#unrankedSummary').innerText(),/2日未満/);assert.deepEqual(errors,[]);}finally{await context.close();}
});
test('saved URL restores scope/tab after reload without ranking API requests',async()=>{
  const{page,context}=await open();try{await ready(page);await page.locator('[data-tab=history]').click();await page.locator('[data-scope=solo]').click();await page.reload();await ready(page);assert.equal(await page.locator('[data-tab=history]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-scope=solo]').getAttribute('aria-pressed'),'true');await page.goto(base+'/gap-rankings.html?scope=toString&tab=unknown');await ready(page);assert.equal(await page.locator('[data-scope=official]').getAttribute('aria-pressed'),'true');}finally{await context.close();}
});
test('HTTP failure shows retry, not a zero-song ranking',async()=>{
  const{page,context}=await open();try{await ready(page);await page.route('**/data/gap-rankings.json',r=>r.fulfill({status:503,body:'Unavailable'}));await page.reload();await page.getByRole('button',{name:'再試行'}).waitFor();assert.match(await page.locator('#rankingStatus').innerText(),/HTTP 503/);assert.equal(await page.locator('#rankingResults').isHidden(),true);await page.unroute('**/data/gap-rankings.json');await page.getByRole('button',{name:'再試行'}).click();await ready(page);}finally{await context.close();}
});
for(const width of[1280,390])for(const tab of['current','history'])test(`ranking chip actual animation, alignment and DOM reading order ${tab} ${width}`,async()=>{
  const{page,context,errors}=await open(width);try{
    await page.emulateMedia({reducedMotion:'no-preference'});await ready(page);
    const consent=page.getByRole('button',{name:'同意しない',exact:true});if(await consent.isVisible())await consent.click();
    await page.locator(`[data-tab=${tab}]`).click();
    for(let i=0;i<3;i++){
      const row=page.locator('.gap-rankings-row').nth(i),link=row.locator('.mus-link-primary'),chip=link.locator('.mus-link-chevron');await chip.locator('svg').waitFor();
      await link.evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-120));await page.mouse.move(0,0);await page.waitForTimeout(220);
      const label=await link.locator('.mus-link-label').boundingBox(),normal=await chip.boundingBox(),svg=await chip.locator('svg').boundingBox(),box=await link.boundingBox();
      assert.equal(normal.width,30);assert.equal(normal.height,30);assert.ok(box.height>=44);
      assert.ok(Math.abs(label.y+label.height/2-normal.y-normal.height/2)<1);
      assert.ok(Math.abs(svg.y+svg.height/2-normal.y-normal.height/2)<1);
      assert.ok(Math.abs(svg.x+svg.width/2-normal.x-normal.width/2)<1);
      assert.equal(await chip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(242, 239, 255)');
      assert.equal(await chip.evaluate(e=>e.closest('a')===e.parentElement),true);assert.equal(await row.locator('button').count(),0);
      assert.equal(await chip.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===e.parentElement;}),true);
      const before=await row.boundingBox();await link.hover();await page.waitForTimeout(250);
      const moved=await chip.boundingBox(),matrix=await chip.evaluate(e=>getComputedStyle(e).transform);
      assert.ok(Math.abs(moved.x-normal.x-3)<.1);assert.match(matrix,/matrix\(1, 0, 0, 1, 3, 0\)/);
      const after=await row.boundingBox();assert.deepEqual(after,before);assert.deepEqual(await link.boundingBox(),box);
      console.log(JSON.stringify({width,tab,row:i+1,transform:matrix,deltaX:moved.x-normal.x,cardLayoutUnchanged:true}));
      await page.mouse.move(0,0);await page.keyboard.press('Tab');await link.focus();await page.waitForTimeout(250);
      assert.equal(await link.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');assert.match(await chip.evaluate(e=>getComputedStyle(e).transform),/matrix\(1, 0, 0, 1, 3, 0\)/);
      assert.equal(await row.locator('.gap-rankings-analogy').evaluate(e=>e.nextElementSibling.matches('.gap-rankings-checker')),true);
      assert.deepEqual(await row.locator('a').evaluateAll(as=>as.slice(0,2).map(a=>a.className)),['mus-link-primary','gap-rankings-checker mus-link-action']);
      assert.equal(await row.locator('.gap-rankings-date-label').first().evaluate(e=>getComputedStyle(e).color),'rgb(23, 32, 51)');
      assert.equal(await row.locator('.mus-link-secondary').first().evaluate(e=>getComputedStyle(e).fontWeight),'700');
      const action=await row.locator('.gap-rankings-checker').boundingBox(),days=await row.locator('.gap-rankings-days').boundingBox(),dates=await row.locator('.gap-rankings-dates').boundingBox();
      assert.ok(action.x>=days.x&&action.x+action.width<=days.x+days.width+.1);
      if(width===390)assert.ok(dates.y>=action.y+action.height);
    }
    // Controlled long-title input only: production data and humor remain untouched.
    const first=page.locator('.gap-rankings-row').first();await first.locator('.mus-link-label').evaluate(e=>e.textContent='長い曲名の折返し '+('VeryLongUnbrokenSongTitle'.repeat(6)));
    await first.locator('.mus-link-secondary').first().evaluate(e=>e.textContent='長いイベント名 '+('LongEventTitle'.repeat(9)));
    await page.mouse.move(0,0);await page.waitForTimeout(220);const l=await first.locator('.mus-link-label').boundingBox(),c=await first.locator('.mus-link-chevron').boundingBox();assert.ok(l.height>30);assert.ok(Math.abs(l.y+l.height/2-c.y-c.height/2)<1);await fit(page);
    await page.locator(`[data-tab=${tab==='current'?'history':'current'}]`).click();await page.locator(`[data-tab=${tab}]`).click();
    await page.locator('#rankingTitle').evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-20));await page.mouse.move(0,0);await page.waitForTimeout(220);await page.screenshot({path:path.join(screenshots,`chip-${tab}-${width}.png`)});
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
for(const width of[1280,390])test('ranking chip reduced motion '+width,async()=>{
  const{page,context}=await open(width);try{await page.emulateMedia({reducedMotion:'reduce'});await ready(page);const link=page.locator('.mus-link-primary').first(),chip=link.locator('.mus-link-chevron');await link.hover();await page.waitForTimeout(220);assert.equal(await chip.evaluate(e=>getComputedStyle(e).transform),'none');assert.equal(await chip.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.mouse.move(0,0);await page.keyboard.press('Tab');await link.focus();assert.equal(await chip.evaluate(e=>getComputedStyle(e).transform),'none');assert.equal(await link.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');}finally{await context.close();}
});
