"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { assertReleaseDom } = require("./helpers/release-e2e-assertions.cjs");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const REV = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current.json"))).outputRevision;
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots", REV, file))).data;
const ids = ["R0010", "R0070", "R0081", "R0021", "R0032", "R0052", "R0097", "R0088", "R0072"];
const output = process.env.RELEASE_RED_QA_DIR || path.resolve(ROOT, "../release-redesign-03-work/screenshots");
const observations = [];
const venues = new Map(fs.readdirSync(path.join(ROOT,"data/snapshots",REV,"events")).filter(f=>f.endsWith(".json")).map(file=>read(`events/${file}`).event?.venue).filter(v=>v?.venueId && v.venueName).map(v=>[v.venueId,v]));
let browser, server, origin;
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
test.before(async () => {
  fs.mkdirSync(output, { recursive: true });
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(ROOT, `.${decodeURIComponent(pathname)}`);
    if (path.relative(ROOT, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    const body = fs.readFileSync(file);
    // Local query preview only. Production redirect remains unchanged.
    res.end(pathname === "/release.html" ? body.toString().replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/, "") : body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome" });
});
test.after(async () => {
  fs.writeFileSync(path.join(output, "observations.json"), JSON.stringify(observations, null, 2));
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});
async function pageFor(width, options = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, javaScriptEnabled: options.js !== false });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  const actions = [];
  if (options.fallback) await page.route("**/data/current.json", route => route.fulfill({ contentType: "application/json", body: '{"revision":"local-preview"}' }));
  await page.route(/script\.google(?:usercontent)?\.com\//, async route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");
    actions.push(action);
    if (options.gate && action === "release") { options.started(); await options.gate; }
    if (options.fail && action === "release") return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({success:false,error:{code:"RELEASE_NOT_FOUND",message:"テスト取得失敗"}})});` });
    let data = {};
    if (action === "revision") data = { dataRevision: "local-preview" };
    if (action === "release") data = options.fixture || read(`releases/${url.searchParams.get("id")}.json`);
    if (action === "releaseList") data = read("release-list.json");
    if (action === "kamiparaDashboard") data = read("kamipara-dashboard.json");
    if (action === "venue") data = venues.get(url.searchParams.get("id")) || {};
    return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({success:true,data})});` });
  });
  return { page, errors, actions };
}
async function ready(page, id) {
  await page.goto(`${origin}/release.html?id=${id}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => import(document.querySelector('script[src*="release-v500"]').src).then(module => module.releaseReady));
  await page.locator("#mainContent").waitFor({ state: "visible" });
  const decline = page.locator('[data-musdb-consent="rejected"]').first();
  if (await decline.isVisible()) await decline.click();
}
async function stable(page) {
  await page.evaluate(async () => {
    // Only the measured link's transitions; unrelated loading dots can loop.
    const target = window.__testedReleaseLink;
    if (target?.isConnected) await Promise.all(target.getAnimations({subtree:true}).map(a => a.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
for (const width of [1280, 390]) for (const id of ids) test(`snapshot preview ${id} ${width}`, async () => {
  const { page, errors, actions } = await pageFor(width);
  try {
    await ready(page, id);
    const d = read(`releases/${id}.json`);
    assert.equal(await page.locator("#releaseName").innerText(), d.releaseName);
    assert.equal(await page.locator("img").count(), 0, "no jacket or placeholder images");
    assert.equal(await page.locator("a a, a button").count(), 0);
    if (id !== "R0072") {
      const labels = { R0010:"2曲", R0021:"1曲", R0032:"店舗別特典CD", R0052:"店舗別特典CD", R0070:"2 Disc · 31曲", R0081:"3 Disc · 46トラック（39曲）", R0088:"27 Disc · 285トラック（46曲）", R0097:"14曲" };
      assert.equal(await page.locator("#includedSongsCount").innerText(), labels[id]);
      assert.deepEqual(await page.locator(".release-included-song-row").evaluateAll(nodes => nodes.map(n => n.dataset.relationId)), d.includedSongs.map(s => s.relationId));
      assert.deepEqual(await page.locator(".release-included-song-row").evaluateAll(nodes => nodes.map(n => n.querySelector(".release-track-number")?.textContent ?? null)), d.includedSongs.map(s => s.track == null ? null : String(s.track)));
      if(id !== "R0088") assert.deepEqual(await page.locator(".release-variant").allTextContents(),d.includedSongs.filter(s=>s.variant).map(s=>s.variant));
      assert.equal(await page.locator(".release-origin").count(), d.debutSongs.length);
      assert.equal(await page.locator("#debutSongsSection").isVisible(), false);
      assert.equal(actions.includes("release"), false, "formal snapshot used without detail API");
      const expectedLinks = d.includedSongs.map(s => `song/${s.songId}.html`).sort();
      assert.deepEqual((await page.locator(".release-included-song-row").evaluateAll(nodes => nodes.map(n => n.getAttribute("href")))).sort(), expectedLinks);
    } else {
      assert.equal(await page.locator(".release-kp-song").count(), 10);
      assert.equal(await page.locator(".release-kp-song a").count(), 0);
      assert.equal(await page.locator(".release-kp-event").count(), 5);
      assert.equal(await page.locator(".release-kp-performance").count(), 10);
      assert.equal(await page.locator("#kamiparaDashboardSection a").getAttribute("href"), "kamipara.html");
      await page.locator(".release-kp-event summary").first().click();
      assert.equal(await page.locator(".release-kp-event[open]").count(), 1);
      await page.locator('#kamiparaYearFilter button[data-year="2019"]').click();
      assert.equal(await page.locator('#kamiparaYearFilter [aria-pressed="true"]').getAttribute("data-year"), "2019");
      await page.locator('#kamiparaYearFilter button[data-year="all"]').click();
      await page.locator(".release-kp-event summary").first().click();
    }
    if (["R0032", "R0052"].includes(id)) {
      assert.match(await page.locator("#heroMeta").innerText(), /Blu-ray最終巻発売日/);
      assert.doesNotMatch(await page.locator("#releaseInfo").innerText(), /Blu-ray/);
      assert.deepEqual(await page.locator(".release-store-heading").allTextContents(), [...new Set(d.includedSongs.map(s => `${s.benefitStore}｜${d.releaseName}`))]);
      const notes=page.locator(".release-registration-details");
      assert.equal(await notes.evaluate(n=>n.open),false);
      assert.match(await notes.textContent(),/曲マスター上/);
      assert.match(await notes.textContent(),/Track番号は未登録/);
      if(id==="R0052") assert.equal(await notes.isVisible(),false);
      else {
        await notes.locator("summary").focus();await page.keyboard.press("Enter");
        assert.equal(await notes.evaluate(n=>n.open),true);
        await page.keyboard.press("Enter");
      }
    }
    if (id === "R0088") {
      assert.equal(await page.locator("[data-box-disc] option").count(), 27);
      await page.locator("[data-box-disc]").selectOption("release-disc-27");
      assert.equal(await page.locator("#release-disc-27").evaluate(n => n.open), true);
      assert.equal(await page.locator("#release-disc-27 summary").evaluate(n => n === document.activeElement), true);
      assert.equal(await page.locator("#childReleasesHost .release-child-row").count(), 9);
      // Return to the initial view for the approval screenshot.
      await page.locator("[data-box-disc]").selectOption("release-disc-1");
    }
    if (id === "R0097") assert.equal(await page.locator("#parentReleaseHost a").getAttribute("href"), "release/R0077.html");
    const row = page.locator(".release-included-song-row").first();
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0); await stable(page);
      const documentRect = n => { const r = n.getBoundingClientRect(); return { x:r.x+scrollX, y:r.y+scrollY, width:r.width, height:r.height }; };
      const before = await row.evaluate(documentRect);
      await row.evaluate(n => window.__testedReleaseLink = n);
      await row.hover(); await stable(page);
      const metrics = await row.evaluate(n => {
        const chip = n.querySelector(".mus-link-chevron"), svg = chip.querySelector("svg");
        const c = chip.getBoundingClientRect(), s = svg.getBoundingClientRect();
        return { same: n === window.__testedReleaseLink, x: new DOMMatrixReadOnly(getComputedStyle(chip).transform).m41, chip:[c.width,c.height], svg:[s.width,s.height] };
      });
      assert.deepEqual(metrics.chip, [30,30]); assert.deepEqual(metrics.svg, [16,16]);
      assert.equal(metrics.same, true); assert.ok(Math.abs(metrics.x - 3) < 0.05);
      assert.deepEqual(await row.evaluate(documentRect), before, "hover can scroll into view but must not move/resize the link in the document");
      await page.mouse.move(0,0); await row.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      assert.equal(await row.evaluate(n => n.matches(":focus-visible")), true);
      await page.emulateMedia({ reducedMotion: "reduce" }); await row.hover(); await stable(page);
      assert.equal(await row.locator(".mus-link-chevron").evaluate(n => getComputedStyle(n).transform), "none");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      observations.push({ id, width, metrics, layout:"full-width contents; row-major information/related grid" });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.mouse.move(0,0); await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0,0); }); await stable(page);
    await page.screenshot({ path: path.join(output, `${id}-${width}.png`), fullPage: true });
  } finally { await page.close(); }
});
function fixture(songs, debutSongs = [], meta = {}) {
  return {releaseId:"R9001",releaseName:"長い名前 日本語 English & <タイトル>",releaseDate:"2026-10-17",classification:"特典",releaseType:"全巻購入特典",relatedEvents:[],includedSongs:songs,debutSongs,includedSongsMeta:{status:"complete",confirmedCount:songs.length,pendingCount:0,publicNote:null,...meta}};
}
for(const width of [1280,390]) test(`store context must not imply full-volume benefits ${width}`,async()=>{
  for(const [classification,releaseType] of [["特典","前売券特典"],["CD","全巻購入特典"]]) {
    const d={...fixture([song(1,{benefitStore:"正式店舗"})]),classification,releaseType};
    const {page,errors}=await pageFor(width,{fallback:true,fixture:d});
    try {
      await ready(page,"R9001");
      assert.equal(await page.locator(".release-store-heading").innerText(),"正式店舗");
      assert.doesNotMatch(await page.locator("#includedSongsContent").innerText(),/全巻購入特典/);
      assert.deepEqual(errors,[]);
    } finally {await page.close();}
  }
});
for (const width of [1280,390]) test(`related-card visual/DOM/Tab order ${width}`,async()=>{
  const {page,errors}=await pageFor(width);
  try {
    await ready(page,"R0088");
    const cards=page.locator("#childReleasesHost .release-child-row");
    const rects=await cards.evaluateAll(nodes=>nodes.slice(0,3).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y};}));
    if(width===1280) {assert.equal(rects[0].y,rects[1].y);assert.ok(rects[0].x<rects[1].x);assert.ok(rects[2].y>rects[0].y);}
    else assert.ok(rects[1].y>rects[0].y);
    await cards.first().focus(); await page.keyboard.press("Tab");
    assert.equal(await cards.nth(1).evaluate(n=>n===document.activeElement),true);
    await page.keyboard.press("Tab");
    assert.equal(await cards.nth(2).evaluate(n=>n===document.activeElement),true);
    assert.equal(await page.locator('#releaseSectionNav a[href="#debutSongsSection"]').count(),0);
    assert.equal(await page.locator('#releaseSectionNav a[href="#relatedReleasesSection"]').count(),1);
    assert.equal(await page.evaluate(()=>Boolean(document.getElementById("includedSongsSection").compareDocumentPosition(document.getElementById("releaseInformationSection")) & Node.DOCUMENT_POSITION_FOLLOWING)),true);
    assert.deepEqual(errors,[]);
  } finally {await page.close();}
});
const song = (i, data = {}) => ({relationId:`RT900${i}`,songId:"S017",songName:"正式曲名 & <safe>",displayName:"正式曲名 & <safe>",disc:1,track:i,displayOrder:i,variant:null,benefitStore:null,...data});
for (const width of [1280,390]) test(`mixed stores, missing positions, variants and origin sets ${width}`, async () => {
  const songs = [song(1,{benefitStore:"店舗<&>",variant:"Solo <Mix>"}),song(2,{track:null,variant:"Other Mix"}),song(3,{disc:null,track:null,songId:"S018"})];
  const d = fixture(songs,[{songId:"S017",songName:"正式曲名"},{songId:"S019",songName:"収録外の初出"}]);
  const {page,errors}=await pageFor(width,{fallback:true,fixture:d});
  try {
    await ready(page,"R9001");
    assert.equal(await page.locator(".release-included-song-row").count(),3);
    assert.equal(await page.locator("#includedSongsCount").innerText(),"店舗別特典CD");
    assert.deepEqual(await page.locator(".release-store-heading").allTextContents(),[`店舗<&>｜${d.releaseName}`,"店舗未登録"]);
    assert.equal(await page.locator(".release-origin").count(),1);
    assert.equal(await page.locator("#debutSongs .release-song-row").getAttribute("href"),"song/S019.html");
    assert.match(await page.locator("#includedSongsContent").innerText(),/Track未登録/);
    assert.match(await page.locator("#includedSongsContent").innerText(),/Disc未登録/);
    assert.equal(await page.locator("#mainContent img, #mainContent script").count(),0);
    assert.doesNotMatch(await page.locator("#heroMeta").innerText(),/Blu-ray最終巻発売日/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
  } finally {await page.close();}
});
for(const status of ["complete","partial","unreviewed","not_applicable","special_hold"]) test(`coverage ${status} empty/nonempty`,async()=>{
  for(const rows of [[],[song(1)]]) {
    const d=fixture(rows,[],{status,pendingCount:status==="partial"?2:0,publicNote:status==="special_hold"?"専用注記":null});
    const {page,errors}=await pageFor(390,{fallback:true,fixture:d});
    try {
      await ready(page,"R9001");
      assert.equal(await page.locator(".release-included-song-row").count(),rows.length);
      assert.equal(await page.locator("#includedSongsSection").isVisible(),!(status==="not_applicable"&&!rows.length));
      if(status==="partial") assert.match(await page.locator(".release-coverage-progress").innerText(),/確認中2件/);
      if(status==="unreviewed"&&!rows.length) assert.match(await page.locator("#includedSongsContent").innerText(),/確認中/);
      assert.deepEqual(errors,[]);
    } finally {await page.close();}
  }
});
test("detail delay has a real loading-to-content transition; failure is not empty success",async()=>{
  let release, started;
  const gate=new Promise(resolve=>release=resolve), began=new Promise(resolve=>started=resolve);
  const {page,errors}=await pageFor(1280,{fallback:true,fixture:fixture([song(1)]),gate,started});
  try {
    await page.goto(`${origin}/release.html?id=R9001`, {waitUntil:"domcontentloaded"}); await began;
    assert.equal(await page.locator("#mainContent").isVisible(),false);
    release(); await page.locator("#mainContent").waitFor({state:"visible"}); assert.deepEqual(errors,[]);
  } finally {release();await page.close();}
  const failed=await pageFor(390,{fallback:true,fail:true});
  try {
    await failed.page.goto(`${origin}/release.html?id=R9001`, {waitUntil:"domcontentloaded"});
    try { await failed.page.locator("#status.error").waitFor(); }
    catch (error) {
      fs.writeFileSync(path.join(output,"failure-diagnostic.json"),JSON.stringify({actions:failed.actions,errors:failed.errors,state:await failed.page.locator("#status").evaluate(n=>({html:n.outerHTML,text:n.textContent})),url:failed.page.url()},null,2));
      throw error;
    }
    assert.equal(await failed.page.locator("#mainContent").isVisible(),false);
    assert.match(await failed.page.locator("#status").innerText(),/テスト取得失敗/);
    assert.deepEqual(failed.errors,[]);
  } finally {await failed.page.close();}
});
test("formal new UI preserves complete snapshot semantics and native Disc disclosure with JS OFF",async()=>{
  const {page}=await pageFor(390);
  let ctx;
  try {
    await ready(page,"R0088");
    const html=await page.content();
    ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
    const off=await ctx.newPage();
    // Transient in-memory DOM fixture, NOT a formal capture or file.
    await off.setContent(html);
    await off.locator("#release-disc-27 summary").click();
    assert.equal(await off.locator("#release-disc-27").getAttribute("open"),"");
    assert.equal(await off.locator("#release-disc-27 a").count(),10);
    for(const width of [1280,390]) for(const id of ids) {
      await off.setViewportSize({width,height:900});
      const raw=fs.readFileSync(path.join(ROOT,"release",`${id}.html`),"utf8");
      assert.match(raw,/href="assets\/css\/release-detail\.css(?:\?[^\"]*)?"/);
      assertReleaseDom(raw,read(`releases/${id}.json`),read("release-list.json"),id==="R0072"?{dashboard:read("kamipara-dashboard.json"),venues:new Map([...venues].map(([key,value])=>[key,value.venueName]))}:undefined);
      await off.goto(`${origin}/release/${id}.html`);
      assertReleaseDom(await off.content(),read(`releases/${id}.json`),read("release-list.json"),id==="R0072"?{dashboard:read("kamipara-dashboard.json"),venues:new Map([...venues].map(([key,value])=>[key,value.venueName]))}:undefined);
      assert.equal(await off.locator("#mainContent").isVisible(),true);
      assert.equal(await off.locator("#releaseName").innerText(),read(`releases/${id}.json`).releaseName);
      assert.equal(await off.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
  } finally {await page.close();await ctx?.close();}
});

test("formal new UI semantic checks reject missing, duplicate and mislinked relations",()=>{
  const id="R0010",source=read(`releases/${id}.json`),list=read("release-list.json"),raw=fs.readFileSync(path.join(ROOT,"release",`${id}.html`),"utf8");
  const row=/<a\b[^>]*class="[^"]*release-included-song-row[^\"]*"[^>]*>[\s\S]*?<\/a>/;
  const first=row.exec(raw);assert.ok(first);
  for(const changed of [raw.replace(row,""),raw.replace(row,m=>m+m),raw.replace(first[0],first[0].replace('href="song/'+source.includedSongs[0].songId+'.html"','href="song/S999.html"'))]){
    assert.notEqual(changed,raw);assert.throws(()=>assertReleaseDom(changed,source,list));
  }
});

for (const width of [1280,390]) test(`integrated BOX selectors, all 285 relations, exact 9 members and no song search ${width}`, async()=>{
  const {page,errors}=await pageFor(width);
  try {
    await ready(page,"R0088");
    assert.equal(await page.locator("[data-box-member]").isEnabled(),true);
    assert.equal(await page.locator(".release-disc-details:visible").count(),1);
    assert.equal(await page.locator(".release-included-song-row:visible").count(),13);
    const source=read("releases/R0088.json");
    const all=[];
    for(let disc=1;disc<=27;disc++){
      await page.locator("[data-box-disc]").selectOption("release-disc-"+disc);
      const host=page.locator("#release-disc-"+disc),rows=source.includedSongs.filter(row=>row.disc===disc);
      assert.equal(await host.isVisible(),true);
      assert.match(await host.locator("summary").innerText(),new RegExp(rows[0].variant));
      assert.equal(await host.locator(".release-variant").count(),0);
      assert.deepEqual(await host.locator("[data-relation-id]").evaluateAll(nodes=>nodes.map(node=>[node.dataset.relationId,node.getAttribute("href"),node.querySelector(".release-track-number").textContent])),rows.map(row=>[row.relationId,"song/"+row.songId+".html",String(row.track)]));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      all.push(...rows.map(row=>row.relationId));
    }
    assert.equal(all.length,285);assert.equal(new Set(all).size,285);
    const expected=[["SN0004","R0106",1],["SN0034","R0107",4],["SN0028","R0108",7],["SN0026","R0109",10],["SN0012","R0110",13],["SN0006","R0111",16],["SN0027","R0112",19],["SN0021","R0113",22],["SN0022","R0114",25]];
    for(const [member,child,disc]of expected){
      await page.locator("[data-box-member]").selectOption(member);
      assert.equal(await page.locator("[data-box-disc] option").count(),3);
      assert.equal(await page.locator("[data-box-child]").getAttribute("href"),"release/"+child+".html");
      assert.equal(await page.locator("[data-box-disc] option").first().getAttribute("value"),"release-disc-"+disc);
    }
    await page.locator("[data-box-member]").selectOption("");
    assert.equal(await page.locator("[data-box-search], [data-box-search-count], [data-box-matches], [data-box-jump], .release-box-search").count(),0);
    assert.doesNotMatch(await page.locator("#includedSongsContent").innerText(),/曲名から探す/);
    assert.equal(await page.locator('[data-relation-id][href="song/S060.html"]').count(),9);
    assert.equal(await page.locator("#globalSearchInput").count(),1);
    await page.locator("[data-box-disc]").selectOption("release-disc-25");
    await page.locator(".release-disc-details.is-selected summary").click();
    await page.locator("#release-disc-25 summary").focus();await page.keyboard.press("Enter");
    assert.equal(await page.locator("#release-disc-25").evaluate(n=>n.open),true);
    assert.equal(await page.locator("#release-disc-25 summary").evaluate(n=>n===document.activeElement),true);
    await page.screenshot({path:path.join(output,`R0088-disc-${width}.png`),fullPage:true});
    await page.locator("[data-box-member]").selectOption("SN0022");
    await page.locator("[data-box-disc]").selectOption("release-disc-27");
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(output,`R0088-member-${width}.png`),fullPage:true});
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test("BOX child loading is static-only, shared, maximum three and nonblocking; delayed controls keep focus",async()=>{
  let releaseGate,started;const gate=new Promise(r=>releaseGate=r),three=new Promise(r=>started=r);
  const {page,errors,actions}=await pageFor(390);
  let total=0,active=0,peak=0;const urls=[];
  try{
    await page.route(/\/releases\/R01(?:0[6-9]|1[0-4])\.json$/,async route=>{
      total++;active++;peak=Math.max(peak,active);urls.push(route.request().url());if(total===3)started();await gate;await route.continue();active--;
    });
    await page.goto(origin+"/release.html?id=R0088",{waitUntil:"domcontentloaded"});
    await three;
    assert.equal(await page.locator("#mainContent").isVisible(),true);
    assert.equal(await page.locator("[data-box-member]").isDisabled(),true);
    assert.equal(total,3);
    await page.locator("[data-box-disc]").selectOption("release-disc-27");
    await page.locator("[data-box-disc]").focus();
    const discSelect=await page.locator("[data-box-disc]").elementHandle();
    releaseGate();
    await page.waitForFunction(()=>!document.querySelector("[data-box-member]").disabled);
    await page.evaluate(()=>import(document.querySelector('script[src*="release-v500"]').src).then(m=>m.releaseReady));
    assert.equal(await page.locator("[data-box-disc]").evaluate((n,old)=>n===old,discSelect),true);
    assert.equal(await page.locator("[data-box-disc]").evaluate(n=>n===document.activeElement),true);
    assert.equal(await page.locator("[data-box-disc]").inputValue(),"release-disc-27");
    assert.equal(total,9);assert.equal(new Set(urls).size,9);assert.ok(peak<=3);
    await page.locator("[data-box-member]").selectOption("SN0004");await page.locator("[data-box-member]").selectOption("");
    assert.equal(total,9);assert.equal(actions.includes("release"),false);assert.deepEqual(errors,[]);
  }finally{releaseGate();await page.close();}
});

test("BOX invalid child revision is local failure, preserves songs and can retry",async()=>{
  const {page,errors}=await pageFor(390);
  const pattern=/\/releases\/R0106\.json$/;
  try{
    await page.route(pattern,route=>route.fulfill({contentType:"application/json",body:JSON.stringify({snapshot:{revision:"wrong"},data:read("releases/R0106.json")})}));
    await ready(page,"R0088");
    assert.equal(await page.locator("[data-box-member]").isDisabled(),true);
    assert.match(await page.locator("[data-box-status]").innerText(),/Disc選択をご利用/);
    assert.equal(await page.locator("[data-relation-id]").count(),285);
    await page.locator("[data-box-disc]").selectOption("release-disc-27");
    assert.equal(await page.locator("#release-disc-27").isVisible(),true);
    await page.unroute(pattern);await page.locator("[data-box-retry]").click();
    await page.waitForFunction(()=>!document.querySelector("[data-box-member]").disabled);
    assert.equal(await page.locator("[data-box-member] option").count(),10);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

for(const width of [1280,390])test(`BOX mixed/unknown variants keep row-level data ${width}`,async()=>{
  const rows=Array.from({length:20},(_,i)=>({...song(1),relationId:"RT"+(9001+i),disc:Math.floor(i/2)+1,track:i%2+1,displayOrder:i+1,variant:i<2?"HONOKA Mix":i===2?"Mix A":i===3?"Mix B":i===4?null:"Mix C"}));
  const d={...fixture(rows),classification:"CD",releaseType:"BOX",editionType:"memorial_box"};
  const {page,errors}=await pageFor(width,{fallback:true,fixture:d});
  try{
    await ready(page,"R9001");
    assert.match(await page.locator("#release-disc-1 summary").innerText(),/HONOKA Mix/);
    assert.equal(await page.locator("#release-disc-1 .release-variant").count(),0);
    await page.locator("[data-box-disc]").selectOption("release-disc-2");
    assert.deepEqual(await page.locator("#release-disc-2 .release-variant").allTextContents(),["Mix A","Mix B"]);
    assert.doesNotMatch(await page.locator("#release-disc-2 summary").innerText(),/Mix/);
    await page.locator("[data-box-disc]").selectOption("release-disc-3");
    assert.deepEqual(await page.locator("#release-disc-3 .release-variant").allTextContents(),["Mix C"]);
    assert.doesNotMatch(await page.locator("#release-disc-3 summary").innerText(),/Mix/);
    assert.equal(await page.locator("[data-relation-id]").count(),20);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});



test("BOX late list enrichment keeps existing Disc control, selection and focus",async()=>{
  let releaseGate,started;const gate=new Promise(r=>releaseGate=r),began=new Promise(r=>started=r);
  const {page,errors}=await pageFor(390);
  try{
    await page.route("**/release-list.json",async route=>{started();await gate;await route.continue();});
    await page.goto(origin+"/release.html?id=R0088",{waitUntil:"domcontentloaded"});await began;
    await page.locator("[data-box-disc]").selectOption("release-disc-27");
    await page.locator("[data-box-disc]").focus();
    const input=await page.locator("[data-box-disc]").elementHandle();
    releaseGate();
    await page.waitForFunction(()=>!document.querySelector("[data-box-member]").disabled);
    assert.equal(await page.locator("[data-box-disc]").evaluate((n,old)=>n===old,input),true);
    assert.equal(await page.locator("[data-box-disc]").evaluate(n=>n===document.activeElement),true);
    assert.equal(await page.locator("[data-box-disc]").inputValue(),"release-disc-27");
    assert.equal(await page.locator("[data-box-search]").count(),0);
    assert.deepEqual(errors,[]);
  }finally{releaseGate();await page.close();}
});

test("BOX list failure preserves full content and usable Disc without guessed members",async()=>{
  const {page,errors}=await pageFor(390);
  try{
    await page.route("**/release-list.json",route=>route.fulfill({contentType:"application/json",body:'{"data":[]}'}));
    await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=releaseList(?:&|$)/,route=>{
      const callback=new URL(route.request().url()).searchParams.get("callback");
      return route.fulfill({contentType:"text/javascript",body:callback+'({"success":false,"error":{"code":"LIST_FAILURE","message":"fixture failure"}});'});
    });
    await ready(page,"R0088");
    assert.equal(await page.locator("[data-relation-id]").count(),285);
    assert.equal(await page.locator("[data-box-member]").isDisabled(),true);
    assert.match(await page.locator("[data-box-status]").textContent(),/Disc選択をご利用/);
    await page.locator("[data-box-disc]").selectOption("release-disc-27");
    assert.equal(await page.locator("#release-disc-27").isVisible(),true);
    assert.equal(await page.locator("[data-box-search], [data-box-matches]").count(),0);
    await page.locator("#release-disc-27 summary").click();
    assert.equal(await page.locator("#release-disc-27").evaluate(n=>n.open),false);
    await page.locator("#release-disc-27 summary").focus();await page.keyboard.press("Enter");
    assert.equal(await page.locator("#release-disc-27").evaluate(n=>n.open),true);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});


for(const id of ["R0052","R0088"])test(`04J mobile TOP never blocks controls and Enter keeps original scroll ${id}`,async()=>{
  const {page,errors}=await pageFor(390);
  try{
    await ready(page,id);
    const max=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
    for(let y=525;y<=max;y+=90){
      await page.evaluate(y=>scrollTo({top:y,behavior:"instant"}),y);
      await page.waitForFunction(()=>document.getElementById("backToTopButton").classList.contains("visible"));
      await page.evaluate(async()=>{const b=document.getElementById("backToTopButton");await Promise.all(b.getAnimations().map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      const blocked=await page.evaluate(()=>{
        const b=document.getElementById("backToTopButton"),r=b.getBoundingClientRect(),previous=b.style.visibility;b.style.visibility="hidden";
        const hits=[...document.querySelectorAll("a,button,input,select,summary")].filter(n=>n!==b&&n.getClientRects().length).filter(n=>{const t=n.getBoundingClientRect(),l=Math.max(t.left,r.left),x=Math.min(t.right,r.right),top=Math.max(t.top,r.top),bottom=Math.min(t.bottom,r.bottom);if(l>=x||top>=bottom)return false;const hit=document.elementFromPoint((l+x)/2,(top+bottom)/2);return hit===n||n.contains(hit);}).map(n=>n.tagName+":"+n.textContent.trim().slice(0,30));
        b.style.visibility=previous;return hits;
      });
      assert.deepEqual(blocked,[],"TOP obstruction at "+y);
    }
    await page.evaluate(()=>scrollTo({top:550,behavior:"instant"}));
    const button=page.locator("#backToTopButton");
    await button.focus();await page.keyboard.press("Tab");await page.keyboard.press("Shift+Tab");
    assert.equal(await button.evaluate(n=>n.matches(":focus-visible")),true);
    await page.screenshot({path:path.join(output,`${id}-TOP-390.png`)});
    await page.keyboard.press("Enter");
    await page.waitForFunction(()=>scrollY===0&&!document.getElementById("backToTopButton").classList.contains("visible"));
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test("04J TOP desktop placement is unchanged",async()=>{
  const {page,errors}=await pageFor(1280);
  try{await ready(page,"R0088");await page.evaluate(()=>scrollTo({top:650,behavior:"instant"}));await page.waitForFunction(()=>document.getElementById("backToTopButton").classList.contains("visible"));assert.deepEqual(await page.locator("#backToTopButton").evaluate(n=>{const c=getComputedStyle(n);return [c.right,c.bottom,c.width,c.height];}),["22px","22px","54px","54px"]);assert.deepEqual(errors,[]);}finally{await page.close();}
});

for(const width of [1280,390])test(`04J R0052 synthetic metadata uses real renderer, separate source links ${width}`,async()=>{
  const metadata=JSON.parse(fs.readFileSync(process.env.RELEASE_METADATA_FIXTURE || path.resolve(ROOT,"../release-metadata-04j-work/synthetic-r0052-metadata.json")));
  const before=JSON.stringify(metadata),{page,errors}=await pageFor(width),requests=[];
  try{
    page.on("request",r=>requests.push(r.url()));
    // A test-only module export; the production source and API have no fixture hook.
    await page.route(/\/assets\/js\/release-v500\.js(?:\?|$)/,async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+"\nexport { renderRelease as renderSyntheticFixture };\n"});});
    await ready(page,"R0052");
    assert.equal(await page.locator(".release-product-name,.release-credits,.release-metadata-sources").count(),0);
    await page.evaluate(async({release,metadata})=>{const m=await import(document.querySelector('script[src*="release-v500"]').src);m.renderSyntheticFixture(release,[],metadata);const banner=document.createElement("p");banner.textContent="表示検証用の合成データ（正式未登録・架空の商品名と作者名）";banner.style.cssText="padding:12px;background:#fff1cc;color:#172033";document.querySelector(".release-page").prepend(banner);},{release:read("releases/R0052.json"),metadata});
    assert.deepEqual(await page.locator(".release-product-name").allTextContents(),metadata.relations.map(r=>r.productName));
    assert.deepEqual(await page.locator(".release-credits").allTextContents(),metadata.relations.map(r=>"作詞："+r.credits[0].name+"　作曲："+r.credits[1].name));
    assert.equal(await page.locator(".release-metadata-sources a").count(),6);
    assert.deepEqual(await page.locator(".release-metadata-sources a").evaluateAll(ns=>ns.map(n=>[n.getAttribute("href"),n.target,n.rel])),metadata.relations.flatMap(r=>[r.sourceUrl,r.credits[0].sourceUrl]).map(url=>[url,"_blank","noopener noreferrer"]));
    assert.equal(await page.locator("a a,a button").count(),0);
    assert.deepEqual(await page.locator(".release-included-song-row").evaluateAll(ns=>ns.map(n=>n.getAttribute("href"))),["song/S090.html","song/S091.html","song/S092.html"]);
    assert.equal(await page.locator(".release-registration-details").isVisible(),false);
    if(width===390){
      const measured=await page.evaluate(async()=>{
        async function scan(){
          const max=document.documentElement.scrollHeight-innerHeight,samples=[];
          for(let y=525;y<max;y+=120){
            scrollTo({top:y,behavior:"instant"});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const b=document.getElementById("backToTopButton");await Promise.all(b.getAnimations().map(a=>a.finished));
            const rect=b.getBoundingClientRect(),prior=b.style.visibility;b.style.visibility="hidden";
            const blocked=[...document.querySelectorAll("a,button,input,select,summary")].filter(n=>n!==b&&n.getClientRects().length).filter(n=>{const t=n.getBoundingClientRect(),l=Math.max(t.left,rect.left),r=Math.min(t.right,rect.right),top=Math.max(t.top,rect.top),bottom=Math.min(t.bottom,rect.bottom);if(l>=r||top>=bottom)return false;const hit=document.elementFromPoint((l+r)/2,(top+bottom)/2);return hit===n||n.contains(hit);}).map(n=>n.tagName);
            b.style.visibility=prior;samples.push({y,blocked});
          }return samples;
        }
        const style=document.createElement("style");style.textContent=".release-content > .release-card {margin-right:0!important}";document.head.append(style);
        const withoutLane=await scan();style.remove();const withLane=await scan();return {withoutLane,withLane};
      });
      fs.writeFileSync(path.join(output,"R0052-synthetic-top-measurement.json"),JSON.stringify(measured,null,2));
      assert.ok(measured.withLane.every(sample=>sample.blocked.length===0));
    }
    await page.mouse.move(0,0);
    await page.evaluate(async()=>{document.activeElement?.blur();scrollTo({top:0,behavior:"instant"});await Promise.all([...document.querySelectorAll(".release-included-song-row")].flatMap(n=>n.getAnimations({subtree:true}).map(a=>a.finished)));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await page.screenshot({path:path.join(output,`R0052-synthetic-${width}.png`),fullPage:true});
    const unverified=structuredClone(metadata);unverified.relations.forEach(r=>r.verificationStatus="unconfirmed");
    await page.evaluate(async({release,metadata})=>(await import(document.querySelector('script[src*="release-v500"]').src)).renderSyntheticFixture(release,[],metadata),{release:read("releases/R0052.json"),metadata:unverified});
    assert.equal(await page.locator(".release-product-name,.release-credits,.release-metadata-sources").count(),0);
    assert.equal(JSON.stringify(metadata),before);
    assert.equal(requests.filter(url=>url.startsWith("https://example.test")).length,0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test("04J hides only R0052 technical details, preserving public coverage warnings and origin badges",async()=>{
  const release=read("releases/R0052.json");
  const {page,errors}=await pageFor(390,{fallback:true,fixture:{...release,includedSongsMeta:{...release.includedSongsMeta,status:"partial",pendingCount:2,publicNote:"利用者に必要な収録上の注意"}}});
  try{await ready(page,"R0052");assert.equal(await page.locator(".release-registration-details").isVisible(),false);assert.match(await page.locator(".release-registration-details").textContent(),/曲マスター上/);assert.equal(await page.locator(".release-coverage-note").isVisible(),true);assert.match(await page.locator(".release-coverage-note").textContent(),/利用者に必要な収録上の注意/);assert.match(await page.locator(".release-coverage-progress").textContent(),/確認中2件/);assert.equal(await page.locator(".release-origin").count(),3);assert.deepEqual(errors,[]);}finally{await page.close();}
});

test("future metadata presentation is explicit, verified, scoped, escaped and never imported from previews",async()=>{
  const {page}=await pageFor(1280);
  try{
    await ready(page,"R0052");
    assert.equal(await page.locator(".release-credits,.release-product-name").count(),0);
    const results=await page.evaluate(async()=>{
      const m=await import(document.querySelector('script[src*="release-v500"]').src);
      const item={relationId:"RT0090",verificationStatus:"verified",applicabilityMode:"explicit_relation",sourceUrl:"https://example.test/source",productName:"正式商品 < & >",credits:[{role:"lyricist",name:"確認済み作詞者",verificationStatus:"verified",applicabilityMode:"explicit_relation",sourceUrl:"https://example.test/credits"}]};
      const metadata={releaseId:"R0052",approved:true,relations:[item]};
      const render=x=>m.approvedRelationMetadataHtml("R0052","RT0090",x);
      return {
        valid:render(metadata),
        unapproved:render({...metadata,approved:false}),
        wrongRelease:render({...metadata,releaseId:"R0032"}),
        unverified:render({...metadata,relations:[{...item,verificationStatus:"unconfirmed"}]}),
        wrongEdition:render({...metadata,relations:[{...item,applicabilityMode:"edition_reference"}]}),
        invalid:render({...metadata,relations:{}}),
        duplicate:render({...metadata,relations:[item,item]}),
        helperMixed:m.commonDiscVariant([{variant:"A"},{variant:"B"}]),
        helperMissing:m.commonDiscVariant([{variant:"A"},{variant:null}]),
        members:m.verifiedBoxMembers
          ? true:false
      };
    });
    assert.match(results.valid,/作詞：確認済み作詞者/);assert.match(results.valid,/&lt; &amp; &gt;/);
    for(const key of ["unapproved","wrongRelease","unverified","wrongEdition","invalid","duplicate","helperMixed","helperMissing"])assert.equal(results[key],"");
    assert.equal(results.members,true);
  }finally{await page.close();}
});
