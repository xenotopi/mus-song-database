'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),pointer=JSON.parse(fs.readFileSync(path.join(root,'data/current.json')));
const snap=path.join(root,'data/snapshots',pointer.outputRevision);
const event=JSON.parse(fs.readFileSync(path.join(snap,'events/EV0353.json'))).data.event;
let browser,server,base;const shots=fs.mkdtempSync(path.join(os.tmpdir(),'musdb-ui-links-'));
test.before(async()=>{
  server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome'});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));console.log('UI link screenshots: '+shots);});
async function open(kind,width){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',isMobile:width===390,hasTouch:width===390});
  await context.route(/https:\/\/script\.google(?:usercontent)?\.com\//,route=>{
    const u=new URL(route.request().url()),action=u.searchParams.get('action'),callback=u.searchParams.get('callback');let data={dataRevision:pointer.dataRevision,outputRevision:pointer.outputRevision};
    if(action==='home'){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
      data={summary:{songCount:117,eventCount:353,venueCount:154,performanceCount:1400},today:{dateKey:`${parts.year}-${parts.month}-${parts.day}`,month:Number(parts.month),day:Number(parts.day),events:[],releases:[],firstPerformedSongs:[],lastPerformedSongs:[]},recentPerformances:[{...event,venueId:event.venue.venueId,venueName:event.venue.venueName}],topSongs:[],topVenues:[],_cache:{revision:pointer.outputRevision}};
    }
    if(action==='venue')data={venueId:'VE0038',venueName:'監査用会場',statistics:{eventCount:2},events:[],topSongs:[],navigation:{}};
    if(action==='discover')data={firstEvent:{eventId:'EV0062',eventName:'μ’s Go→Go! LoveLive! 2015 ～Dream Sensation!～ 1日目',date:'2015-01-31'},lastEvent:{eventId:'EV0353',eventName:event.eventName,date:event.date},topSingers:[],topSongs:[],firstPerformedSongs:[],navigation:{}};
    return route.fulfill({contentType:'text/javascript',body:`${callback}(${JSON.stringify({success:true,data})});`});
  });
  // Only destination documents are replaced; pilot renderers and CSS are real.
  for(const pattern of ['**/song/S*.html','**/event.html?*','**/singer.html?*','**/gap-checker.html?*'])await context.route(pattern,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Destination</title><h1>Destination</h1>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const url=kind==='home'?'index.html':kind==='venue'?'venue.html?id=VE0038':'gap-rankings.html';await page.goto(base+'/'+url);
  const selector=kind==='home'?'.recent-song.mus-card-multi':kind==='venue'?'#venueHistoryEvents .mus-card-link':'.gap-rankings-row.mus-card-multi';await page.locator(selector).first().waitFor();
  const consent=page.getByRole('button',{name:'同意しない',exact:true});if(await consent.isVisible())await consent.click();return{context,page,errors,selector};
}
async function style(link){return link.evaluate(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return{color:c.color,underline:c.textDecorationLine,outline:c.outlineStyle,height:r.height};});}
async function newTab(context,link,modified=false){const href=await link.getAttribute('href');const wait=context.waitForEvent('page',{timeout:10000});await link.click(modified?{modifiers:['Control']}:{button:'middle'});const popup=await wait;await popup.waitForURL(new URL(href,base+'/').href);assert.equal(popup.url(),new URL(href,base+'/').href);await popup.close();}
for(const width of[1280,390])for(const kind of['gap','home','venue'])test(`${kind} normal / hover / focus / click separation / new tabs ${width}`,async()=>{
  const{context,page,errors,selector}=await open(kind,width);try{
    const card=page.locator(selector).first(),primary=kind==='venue'?card:card.locator('.mus-link-primary').first();
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
