"use strict";
// Read-only real API input, replayed unchanged for deterministic before/after UI checks.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), os = require("node:os");
const { execFileSync } = require("node:child_process"), { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), current = JSON.parse(fs.readFileSync(path.join(root, "data/current.json")));
const cases = [
  { name: "songs", card: ".song-list-card", title: ".song-list-title", search: "#songSearch", sort: "#songSort", filter: '[data-performance="unperformed"]', reset: '[data-performance=""]', count: 117 },
  { name: "events", card: ".history-event-card", title: ".history-event-title", filter: '[data-category="公式"]', reset: '[data-category=""]', count: 353 },
  { name: "releases", card: ".release-list-card", title: ".release-list-title", search: "#releaseSearch", sort: "#releaseSort", filter: '[data-classification="CD"]', reset: '[data-classification=""]', count: 114 },
  { name: "venues", card: ".venue-list-card", title: ".venue-list-title", search: "#venueSearch", sort: "#venueSort", filter: '[data-scope="japan"]', reset: '[data-scope=""]', count: 154 },
  { name: "singers", card: ".singer-list-card", title: ".singer-card-title", search: "#nameSearch", sort: "#singerSort", filter: '[data-count="1"]', reset: '[data-count=""]', count: 72 }
];
const apiPattern = /script\.google(?:usercontent)?\.com\//;
let browser, server, base, payloads, shots;
test.before(async () => {
  shots = fs.mkdtempSync(path.join(os.tmpdir(), "musdb-five-list-links-"));
  const baselineFiles = new Set(cases.flatMap(c => [c.name + ".html", "assets/js/" + ({songs:"songs-v470",events:"events-v470",releases:"releases-v500",venues:"venues-v470",singers:"singers-v470"}[c.name]) + ".js"]));
  server = http.createServer((req, res) => {
    let name = decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1), baseline = name.startsWith("__baseline/");
    if (baseline) name = name.slice(11);
    // Serve destination-only fixtures at HTTP level, including a popup's first request.
    if (/^(?:song\/S\d+\.html|release\/R\d+\.html|(?:event|venue|singer)\.html)$/.test(name)) {
      res.setHeader("content-type", "text/html; charset=utf-8"); return res.end("<!doctype html><h1>Destination</h1>");
    }
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {
      const body = baseline && baselineFiles.has(name) ? execFileSync("git", ["show", "47f2613289ed9d7fa6066f4b7a9a048a0b532954:" + name], {cwd:root,maxBuffer:5e6}) : fs.readFileSync(file);
      res.setHeader("content-type", ({".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"})[path.extname(file)] || "application/octet-stream"); res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome"});
  const page = await browser.newPage(); await page.goto(base + "/404.html");
  payloads = await page.evaluate(async () => {
    const {apiGet} = await import("/assets/js/api.js?v=4.9.6&cache=revision-nonblocking");
    return Object.fromEntries(await Promise.all(["rankings","eventHistory","venueHistory","singerList"].map(async action => [action, await apiGet(action, action === "rankings" ? {limit:1000,year:"",category:"",schema:"4.2.1"} : {}, {cache:false,retryCount:0,timeoutMs:30000})])));
  });
  await page.close();
  assert.equal(payloads.rankings.data.songs.length,117); assert.equal(payloads.eventHistory.data.events.length,353); assert.equal(payloads.venueHistory.data.venues.length,154);
  assert.equal(payloads.singerList.data.official.length + payloads.singerList.data.solo.length,72);
  fs.writeFileSync(path.join(shots,"api-inputs.json"),JSON.stringify({current,payloads}));
});
test.after(async () => { await browser?.close(); if(server)await new Promise(r=>server.close(r)); console.log("Five list QA screenshots/input record: " + shots); });
async function open(c,width,baseline=false) {
  const ctx=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}), page=await ctx.newPage(),errors=[],calls=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await ctx.route(apiPattern,r=>{const u=new URL(r.request().url()),action=u.searchParams.get("action");calls.push(action);const value=action==="revision"?{success:true,data:current}:payloads[action];assert.ok(value,"Unexpected API: "+action);return r.fulfill({contentType:"text/javascript",body:`${u.searchParams.get("callback")}(${JSON.stringify(value)});`});});
  await page.goto(`${base}/${baseline?"__baseline/":""}${c.name}.html`);await page.locator(c.card).first().waitFor();await page.locator("#status").waitFor({state:"hidden"});
  const decline=page.getByRole("button",{name:"同意しない",exact:true});if(await decline.isVisible())await decline.click();
  return {ctx,page,errors,calls};
}
async function all(page,c) {
  if(c.name!=="events")while(await page.locator("#moreButton").isVisible())await page.locator("#moreButton").click();
}
async function identities(page,c) {
  return page.locator(c.card).evaluateAll(nodes=>nodes.map(e=>({href:e.getAttribute("href"),text:e.textContent.replace(/\s+/g," ").trim()})));
}
async function geometry(page,c) {
  // Sorting/filtering can move a new card under the stationary mouse. Measure the
  // normal state only after its real hover transition has returned to identity.
  await page.mouse.move(0,0); await page.evaluate(()=>document.activeElement?.blur());
  await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].every(e=>e.querySelector('.mus-link-chevron svg')),c.card);
  await page.waitForFunction(selector=>[...document.querySelectorAll(selector+' .mus-link-chevron')].every(e=>getComputedStyle(e).transform==='none'),c.card);
  const bad=await page.locator(c.card).evaluateAll(nodes=>nodes.flatMap(e=>{
    const chip=e.querySelector('.mus-link-chevron'),svg=chip.querySelector('svg'),b=chip.getBoundingClientRect(),s=svg.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(chip.parentElement.firstChild);const tail=r.getBoundingClientRect();
    return b.width===30&&b.height===30&&s.width===16&&s.height===16&&Math.abs(b.x+15-s.x-8)<.5&&Math.abs(b.y+15-s.y-8)<.5&&Math.abs(b.x-tail.right-8)<1&&Math.abs(b.y+15-tail.y-tail.height/2)<5&&e.scrollWidth<=e.clientWidth&&e.querySelectorAll('.mus-link-chevron').length===1&&!e.querySelector('a,button')?[]:[{text:e.textContent,chip:b.toJSON(),tail:tail.toJSON(),scroll:e.scrollWidth,width:e.clientWidth}];
  }));assert.deepEqual(bad,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}
for(const width of[1280,390])for(const c of cases)test(`${c.name} ${width}: full-card chip, interactions, all records and unchanged content`,async()=>{
  const {ctx,page,errors}=await open(c,width);try{
    const card=page.locator(c.card).first(),chip=card.locator('.mus-link-chevron');await card.scrollIntoViewIfNeeded();await chip.locator('svg').waitFor();await page.mouse.move(0,0);await page.waitForTimeout(220);
    const b=await card.boundingBox(),v=await chip.boundingBox();assert.equal(await card.evaluate(e=>getComputedStyle(e).display),['songs','releases'].includes(c.name)?'grid':'block');assert.equal(await chip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(242, 239, 255)');
    await card.hover();await page.waitForTimeout(250);assert.ok(Math.abs((await chip.boundingBox()).x-v.x-3)<.1);assert.deepEqual(await card.boundingBox(),b);console.log(`${c.name} ${width} hover=3px, card rect unchanged`);
    await page.mouse.move(0,0);await card.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await card.evaluate(e=>e.matches(':focus-visible')),true);assert.equal(await card.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await chip.evaluate(e=>getComputedStyle(e).transform),'none');assert.equal(await chip.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});await card.evaluate(e=>e.blur());
    const href=await card.evaluate(e=>e.href);
    for(const options of[{button:'middle'},{modifiers:['Control']}]){const waiting=ctx.waitForEvent('page');await card.click(options);const tab=await waiting;try{await tab.waitForURL(href,{waitUntil:'domcontentloaded'});assert.equal(await tab.locator('h1').innerText(),'Destination');}catch(e){console.error('popup diagnostic '+JSON.stringify({expected:href,actual:tab.url(),options}));throw e;}await tab.close();}
    await card.focus();await page.keyboard.press('Enter');await page.waitForURL(href);await page.goBack();await page.locator(c.card).first().waitFor();
    await card.scrollIntoViewIfNeeded();const pad=await card.boundingBox();await page.mouse.click(pad.x+5,pad.y+pad.height-5);await page.waitForURL(href);await page.goBack();await page.locator(c.card).first().waitFor();
    if(c.search){const title=(await page.locator(c.card).first().locator(c.title).textContent()).trim();await page.locator(c.search).fill(title);assert.ok(await page.locator(c.card).count()>0);await geometry(page,c);await page.locator(c.search).fill('');}
    if(c.sort){const values=await page.locator(c.sort+' option').evaluateAll(es=>es.map(e=>e.value));for(const value of values){await page.locator(c.sort).selectOption(value);await geometry(page,c);}await page.locator(c.sort).selectOption(values[0]);}
    await page.locator(c.filter).click();assert.ok(await page.locator(c.card).count()>0);await geometry(page,c);await page.locator(c.reset).click();await all(page,c);await geometry(page,c);
    const result=[];if(c.name==='singers'){for(const scope of['official','solo']){await page.locator(`[data-scope="${scope}"]`).click();await all(page,c);await geometry(page,c);result.push(...await identities(page,c));}assert.equal(new Set(result.map(e=>e.href)).size,72);}else {result.push(...await identities(page,c));assert.equal(result.length,c.count);}
    const before=await open(c,width,true);try{const expected=[];if(c.name==='singers'){for(const scope of['official','solo']){await before.page.locator(`[data-scope="${scope}"]`).click();await all(before.page,c);expected.push(...await identities(before.page,c));}}else{await all(before.page,c);expected.push(...await identities(before.page,c));}assert.deepEqual(result,expected,'data, dates, badges, ranks, counts and URLs match baseline');assert.deepEqual(before.errors,[]);}finally{await before.ctx.close();}
    // Screenshot real API data, including a long natural title; no synthetic content injected.
    if(c.name==='singers'){await page.locator('[data-scope="solo"]').click();await all(page,c);}
    const longIndex=await page.locator(c.card).evaluateAll((nodes,selector)=>nodes.reduce((best,e,i)=>e.querySelector(selector).textContent.length>nodes[best].querySelector(selector).textContent.length?i:best,0),c.title);await page.locator(c.card).nth(longIndex).scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:path.join(shots,`${c.name}-${width}.png`),animations:'disabled'});
    assert.deepEqual(errors,[]);
  }catch(error){console.error(`${c.name} ${width} diagnostic: ${error.stack}`);throw error;}finally{await ctx.close();}
});

for(const width of[1280,390])test(`member/count, region/location and event-type filters ${width}`,async()=>{
  const singers=await open(cases[4],width);try{
    const p=singers.page;
    for(const scope of['official','solo']){
      await p.locator(`[data-scope="${scope}"]`).click();
      for(const count of['1','2','3','4-8','9','']){
        await p.locator(`[data-count="${count}"]`).click();
        const expected=payloads.singerList.data[scope].filter(s=>!count||(count==='4-8'?s.memberCount>=4&&s.memberCount<=8:s.memberCount===+count));
        assert.equal(await p.locator(cases[4].card).count(),Math.min(24,expected.length));await geometry(p,cases[4]);
      }
      const members=await p.locator('#memberFilters [data-member]').evaluateAll(es=>es.map(e=>e.dataset.member));
      for(const member of members){await p.locator('#memberFilters').locator(`[data-member="${member}"]`).click();const expected=payloads.singerList.data[scope].filter(s=>!member||(s.memberShorts||[]).includes(member));assert.equal(await p.locator(cases[4].card).count(),Math.min(24,expected.length));await geometry(p,cases[4]);}
      await p.locator('#memberFilters [data-member=""]').click();
    }assert.deepEqual(singers.errors,[]);
  }finally{await singers.ctx.close();}
  const venues=await open(cases[3],width);try{
    const p=venues.page;
    for(const [selector,key]of[['#prefectureSelect','prefectureCity'],['#countrySelect','country']]){
      const value=await p.locator(selector+' option').evaluateAll(es=>es.find(e=>e.value)?.value);assert.ok(value);await p.locator(selector).selectOption(value);
      assert.equal(await p.locator(cases[3].card).count(),Math.min(24,payloads.venueHistory.data.venues.filter(v=>v[key]===value).length));await geometry(p,cases[3]);await p.locator(selector).selectOption('');
    }assert.deepEqual(venues.errors,[]);
  }finally{await venues.ctx.close();}
  const events=await open(cases[1],width);try{
    const p=events.page,value=await p.locator('#eventTypeSelect option').evaluateAll(es=>es.find(e=>e.value)?.value);assert.ok(value);await p.locator('#eventTypeSelect').selectOption(value);
    assert.equal(await p.locator(cases[1].card).count(),payloads.eventHistory.data.events.filter(e=>e.eventType===value).length);await geometry(p,cases[1]);await p.locator('#yearNav button').first().click();assert.deepEqual(events.errors,[]);
  }finally{await events.ctx.close();}
});

for(const width of[1280,390])test(`all 22 supplemental Release rows remain separate underlined Song links ${width}`,async()=>{
  const c=cases[2],{ctx,page,errors}=await open(c,width);try{
    const list=JSON.parse(fs.readFileSync(path.join(root,'data/snapshots',current.revision,'release-list.json'))).data;
    const extra=['R0041','R0060','R0063','R0054','R0055','R0056'];
    const eligible=list.filter(r=>(r.classification==='Blu-ray'&&r.releaseType==='アニメBlu-ray')||(r.classification==='特典'&&r.releaseType==='全巻購入特典')||extra.includes(r.releaseId));assert.equal(eligible.length,22);
    for(const release of eligible){
      await page.locator('#releaseSearch').fill(release.releaseName);const card=page.locator(`a.release-list-card[href="release/${release.releaseId}.html"]`);await card.scrollIntoViewIfNeeded();
      const panel=page.locator(`[data-release-songs="${release.releaseId}"]`);await panel.locator('a').first().waitFor();
      const data=JSON.parse(fs.readFileSync(path.join(root,'data/snapshots',current.revision,'releases',release.releaseId+'.json'))).data;
      assert.deepEqual(await panel.locator('a').allTextContents(),data.includedSongs.map(s=>s.songName));assert.deepEqual(await panel.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))),data.includedSongs.map(s=>'song/'+s.songId+'.html'));
      assert.equal(await panel.locator('a').evaluateAll(es=>es.every(e=>getComputedStyle(e).textDecorationLine==='underline'&&!e.closest('.release-list-card'))),true);assert.equal(await card.locator('a,button').count(),0);
      const x=(await card.locator(c.title).boundingBox()).x;assert.ok(Math.abs((await panel.boundingBox()).x-x)<.5);assert.ok((await card.boundingBox()).y+(await card.boundingBox()).height<=(await panel.boundingBox()).y);
      await geometry(page,c);
    }assert.deepEqual(errors,[]);
  }finally{await ctx.close();}
});
