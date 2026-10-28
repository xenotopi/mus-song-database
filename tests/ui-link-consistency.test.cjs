'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),pointer=JSON.parse(fs.readFileSync(path.join(root,'data/current.json')));
const snap=path.join(root,'data/snapshots',pointer.outputRevision);
const event=JSON.parse(fs.readFileSync(path.join(snap,'events/EV0353.json'))).data.event;
const rankingPayload=JSON.parse(fs.readFileSync(path.join(root,'data/gap-rankings.json'))).payload;
const topSongs=[...rankingPayload.songs].sort((a,b)=>b.recordCount-a.recordCount||a.id.localeCompare(b.id)).slice(0,5).map((s,i)=>({rank:i+1,songId:s.id,songName:s.name,performanceCount:s.recordCount,eventCount:new Set(s.dates.flatMap(d=>d.all)).size}));
let browser,server,base;const shots=process.env.MUSDB_UI_LINK_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'musdb-ui-links-'));fs.mkdirSync(shots,{recursive:true});
test.before(async()=>{
  server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome'});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));console.log('UI link screenshots: '+shots);});
async function open(kind,width,eventName=event.eventName){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',isMobile:width===390,hasTouch:width===390});
  await context.route(/https:\/\/script\.google(?:usercontent)?\.com\//,route=>{
    const u=new URL(route.request().url()),action=u.searchParams.get('action'),callback=u.searchParams.get('callback');let data={dataRevision:pointer.dataRevision,outputRevision:pointer.outputRevision};
    if(action==='home'){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
      data={summary:{songCount:117,eventCount:353,venueCount:154,performanceCount:1400},today:{dateKey:`${parts.year}-${parts.month}-${parts.day}`,month:Number(parts.month),day:Number(parts.day),events:[],releases:[],firstPerformedSongs:[],lastPerformedSongs:[]},recentPerformances:[{...event,eventName,venueId:event.venue.venueId,venueName:event.venue.venueName}],topSongs,topVenues:[],_cache:{revision:pointer.outputRevision}};
    }
    if(action==='venue')data={venueId:'VE0038',venueName:'監査用会場',statistics:{eventCount:2},events:[{eventId:'EV0062',eventName:'監査用開催イベント',date:'2015-01-31',category:'公式'}],topSongs:[],navigation:{}};
    if(action==='discover')data={firstEvent:{eventId:'EV0062',eventName:'μ’s Go→Go! LoveLive! 2015 ～Dream Sensation!～ 1日目',date:'2015-01-31'},lastEvent:{eventId:'EV0353',eventName:event.eventName,date:event.date},topSingers:[],topSongs:[],firstPerformedSongs:[],navigation:{}};
    return route.fulfill({contentType:'text/javascript',body:`${callback}(${JSON.stringify({success:true,data})});`});
  });
  // Only destination documents are replaced; pilot renderers and CSS are real.
  for(const pattern of ['**/song/S*.html','**/event.html?*','**/singer.html?*','**/gap-checker.html?*'])await context.route(pattern,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Destination</title><h1>Destination</h1>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const url=kind==='home'?'index.html':kind==='venue'?'venue.html?id=VE0038':'gap-rankings.html';await page.goto(base+'/'+url);
  const selector=kind==='home'?'.recent-song.mus-card-multi':kind==='venue'?'#eventList .venue-event-row':'.gap-rankings-row.mus-card-multi';await page.locator(selector).first().waitFor();
  const consent=page.getByRole('button',{name:'同意しない',exact:true});if(await consent.isVisible())await consent.click();return{context,page,errors,selector};
}
async function style(link){return link.evaluate(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return{color:c.color,underline:c.textDecorationLine,outline:c.outlineStyle,height:r.height};});}
async function newTab(context,link,modified=false){const href=await link.getAttribute('href');const wait=context.waitForEvent('page',{timeout:10000});await link.click(modified?{modifiers:['Control']}:{button:'middle'});const popup=await wait;await popup.waitForURL(new URL(href,base+'/').href);assert.equal(popup.url(),new URL(href,base+'/').href);await popup.close();}
for(const width of[1280,390])for(const kind of['gap','home','venue'])test(`${kind} normal / hover / focus / click separation / new tabs ${width}`,async()=>{
  const{context,page,errors,selector}=await open(kind,width);try{
    const card=page.locator(selector).first(),primary=card.locator('.mus-link-primary').first();
    if(kind==='venue'){
      assert.equal(await page.locator('#discoverySection,#venueInsightsSection,#venueYearSelect').count(),0);
      assert.equal(await card.evaluate(e=>e.tagName),'ARTICLE');
      assert.equal(await card.locator('a a, a button, button a').count(),0);
      assert.equal(await card.locator('[data-venue-event-songs]').getAttribute('aria-expanded'),'false');
      assert.equal(await primary.getAttribute('href'),'event.html?id=EV0062');
      await primary.scrollIntoViewIfNeeded();await primary.locator('svg').waitFor();
      await page.mouse.move(0,0);
      const finish=async()=>primary.evaluate(async e=>{const c=e.querySelector('.mus-link-chevron');getComputedStyle(c).transform;await new Promise(requestAnimationFrame);await Promise.all(c.getAnimations().map(a=>a.finished));await new Promise(requestAnimationFrame);return getComputedStyle(c).transform==='none'?0:new DOMMatrixReadOnly(getComputedStyle(c).transform).m41;});
      assert.equal(await finish(),0);await primary.hover();assert.equal(await finish(),3);
      await page.mouse.move(0,0);await primary.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await primary.evaluate(e=>e.matches(':focus-visible')),true);assert.equal((await style(primary)).outline,'solid');
      await newTab(context,primary);await newTab(context,primary,true);
      assert.equal(await card.locator('[data-venue-event-songs]').getAttribute('aria-expanded'),'false');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
      return;
    }
    await primary.evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-150));await page.mouse.move(0,0);
    const normal=await style(primary);assert.equal(normal.color,'rgb(23, 32, 51)');assert.equal(normal.underline,'none');assert.ok(normal.height>=44);
    assert.ok(await card.locator('[data-site-icon="chevron-right"]').count());assert.equal(await page.locator('a a').count(),0);
    await page.screenshot({path:path.join(shots,`${kind}-${width}.png`)});
    await primary.hover();const hover=await style(kind==='venue'?primary.locator('.mus-card-title'):primary);assert.equal(hover.color,'rgb(79, 70, 229)');assert.equal(hover.underline,'underline');
    await page.mouse.move(0,0);await page.keyboard.press('Tab');await primary.focus();assert.equal((await style(primary)).outline,'solid');
    const focused=await style(kind==='venue'?primary.locator('.mus-card-title'):primary);assert.equal(focused.color,'rgb(79, 70, 229)');assert.equal(focused.underline,'underline');
    await page.screenshot({path:path.join(shots,`${kind}-${width}-focus.png`)});
    if(kind!=='venue'){
      const secondary=card.locator('.mus-link-secondary').first();assert.equal((await style(secondary)).color,'rgb(79, 70, 229)');assert.equal((await style(secondary)).underline,'underline');
      const links=await card.locator('a').evaluateAll(as=>as.map(a=>({href:a.getAttribute('href'),r:a.getBoundingClientRect().toJSON()})));
      assert.equal(new Set(links.map(a=>a.href)).size,links.length);
      for(let i=0;i<links.length;i++)for(let j=i+1;j<links.length;j++){const a=links[i].r,b=links[j].r;assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'click rectangles must not overlap');}
      const before=page.url(),r=await card.boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height-6);assert.equal(page.url(),before);
      await newTab(context,primary);await newTab(context,secondary,true);
      if(kind==='gap'){const action=card.locator('.mus-link-action');assert.equal((await style(action)).color,'rgb(79, 70, 229)');assert.match(await action.innerText(),/→/);await newTab(context,action);}
      if(kind==='home'){const eventLink=page.locator('.recent-event.mus-link-primary');assert.ok((await style(eventLink)).height>=44);await newTab(context,eventLink);}
    }else{
      assert.equal(await card.evaluate(e=>e.tagName),'A');assert.equal(await card.locator('a,button').count(),0);
      assert.equal(await card.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+12,r.y+r.height/2)?.closest('a')===e;}),true);
      await newTab(context,primary);await newTab(context,primary,true);
      const href=await primary.getAttribute('href'),r=await primary.boundingBox();await page.mouse.click(r.x+12,r.y+r.height/2);await page.waitForURL(new URL(href,base+'/').href);await page.goBack();await card.waitFor();
    }
    const label=kind==='venue'?card.locator('.mus-card-title'):primary.locator('.mus-link-label');await label.evaluate(e=>e.textContent='長いタイトルの折返し確認 '+('LongUnbrokenTitle'.repeat(8)));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await card.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
    const href=await primary.getAttribute('href');
    if(width===390){await primary.tap();await page.waitForURL(new URL(href,base+'/').href);await page.goBack();await card.waitFor();}
    await primary.focus();await page.keyboard.press('Enter');await page.waitForURL(new URL(href,base+'/').href);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const width of[1280,390])test(`Home shared title chips, TOP5 and inline wrapped Event ${width}`,async()=>{
  const{context,page,errors}=await open('home',width,'長いイベント名の折返し検証 '+event.eventName+' LongUnbrokenEnglishEventTitle'.repeat(3));try{
    await page.emulateMedia({reducedMotion:'no-preference'});
    const input=await page.evaluate(()=>({hover:matchMedia('(hover:hover)').matches,fine:matchMedia('(pointer:fine)').matches,coarse:matchMedia('(pointer:coarse)').matches,reduce:matchMedia('(prefers-reduced-motion:reduce)').matches}));
    assert.deepEqual(input,{hover:width===1280,fine:width===1280,coarse:width===390,reduce:false});
    await page.locator('#topSongs .home-ranking-row').nth(4).waitFor();
    assert.deepEqual(await page.locator('#topSongs .home-ranking-name').allTextContents(),topSongs.map(s=>s.songName));
    assert.deepEqual(await page.locator('#topSongs .home-ranking-count').allTextContents(),topSongs.map(s=>s.performanceCount.toLocaleString('ja-JP')+'回'));
    assert.deepEqual(await page.locator('#topSongs .home-ranking-meta').allTextContents(),topSongs.map(s=>'イベント '+s.eventCount.toLocaleString('ja-JP')+'件'));
    assert.equal(await page.locator('#topSongs .home-ranking-count [data-site-icon]').count(),0);
    assert.equal(await page.locator('a a').count(),0);
    const links=[...await page.locator('#topSongs .home-ranking-row').all(),page.locator('.recent-event'),page.locator('.recent-song-name').first()];
    for(const link of links){
      const isTop5=await link.evaluate(n=>n.classList.contains('home-top-song-row')),feedback=isTop5?link.locator('.mus-link-label'):link;const chip=link.locator('.mus-link-chevron');await chip.locator('svg').waitFor();await link.scrollIntoViewIfNeeded();await page.mouse.move(0,0);await link.evaluate(e=>e.blur());await page.waitForTimeout(220);
      const before=await link.boundingBox(),b=await chip.boundingBox(),svg=await chip.locator('svg').boundingBox();
      assert.equal(b.width,30);assert.equal(b.height,30);assert.equal(svg.width,16);assert.equal(svg.height,16);assert.ok(before.height>=44);
      assert.ok(Math.abs(b.x+b.width/2-svg.x-svg.width/2)<1);assert.ok(Math.abs(b.y+b.height/2-svg.y-svg.height/2)<1);
      assert.equal(await chip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(242, 239, 255)');
      assert.equal(await link.locator('.mus-title-chip').evaluate(e=>getComputedStyle(e).color),'rgb(23, 32, 51)');
      assert.equal(await chip.evaluate(e=>{const tail=e.parentElement,n=tail.firstChild,r=document.createRange();r.selectNodeContents(n);const t=r.getBoundingClientRect(),b=e.getBoundingClientRect();return b.x-t.right>=7&&b.x-t.right<=9&&Math.abs((b.y+b.height/2)-(t.y+t.height/2))<5;}),true,'chip follows final characters, not the card edge');
      const expectedHoverDelta=isTop5&&!(input.hover&&input.fine)?0:3;
      await feedback.hover();await page.waitForTimeout(250);assert.ok(Math.abs((await chip.boundingBox()).x-b.x-expectedHoverDelta)<.1,'hover displacement follows measured pointer capability');assert.deepEqual(await link.boundingBox(),before);
      await page.mouse.move(0,0);await page.keyboard.press('Tab');await link.focus();await page.waitForTimeout(250);assert.equal(await feedback.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');assert.match(await chip.evaluate(e=>getComputedStyle(e).transform),/matrix\(1, 0, 0, 1, 3, 0\)/);
      console.log(JSON.stringify({width,href:await link.getAttribute('href'),chip:30,svg:16,hoverDelta:expectedHoverDelta,input,layoutUnchanged:true}));
    }
    const row=page.locator('#topSongs .home-ranking-row').first();await row.scrollIntoViewIfNeeded();const b=await row.boundingBox();assert.equal(await row.evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+3,b.y+b.height/2)?.closest('a')===e;}),true);
    const href=await row.getAttribute('href');await page.mouse.click(b.x+3,b.y+b.height/2);await page.waitForURL(new URL(href,base+'/').href);await page.goBack();await row.waitFor();if(width===390){await row.tap();await page.waitForURL(new URL(href,base+'/').href);await page.goBack();await row.waitFor();}await newTab(context,row);await row.focus();await page.keyboard.press('Enter');await page.waitForURL(new URL(href,base+'/').href);await page.goBack();await row.waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('#topSongs .home-ranking-row,.recent-card').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth)),true);
    await row.scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:path.join(shots,`home-top5-${width}.png`)});
    await page.locator('.recent-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,`home-recent-chip-${width}.png`)});
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
for(const width of[1280,390])test(`Home shared chips reduced motion ${width}`,async()=>{
  const{context,page,errors}=await open('home',width);try{
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const selector of['#topSongs .home-ranking-row','.recent-event','.recent-song-name']){
      const link=page.locator(selector).first(),chip=link.locator('.mus-link-chevron'),feedback=await link.evaluate(n=>n.classList.contains('home-top-song-row'))?link.locator('.mus-link-label'):link;await feedback.hover();await page.waitForTimeout(220);assert.equal(await chip.evaluate(e=>getComputedStyle(e).transform),'none');assert.equal(await chip.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.mouse.move(0,0);await page.keyboard.press('Tab');await link.focus();assert.equal(await feedback.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');assert.equal(await chip.evaluate(e=>getComputedStyle(e).transform),'none');
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
