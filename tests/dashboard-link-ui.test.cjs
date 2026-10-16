"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), cp = require("node:child_process"), os = require("node:os");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), current = JSON.parse(fs.readFileSync(path.join(root, "data/current.json")));
const kp = JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", current.revision, "kamipara-dashboard.json"))).data;
const member = JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", current.revision, "member-analytics.json"))).data;
const eventDir = path.join(root, "data/snapshots", current.revision, "events");
const venues = new Map(fs.readdirSync(eventDir).map(file => JSON.parse(fs.readFileSync(path.join(eventDir,file))).data.event.venue).filter(v=>v?.venueId).map(v=>[v.venueId,v.venueName]));
const changed = new Set(["member-analytics.html", "kamipara.html", "assets/js/member-analytics.js", "assets/css/member-analytics.css"]);
let server, browser, base, shots;
test.before(async () => {
  shots = fs.mkdtempSync(path.join(os.tmpdir(), "musdb-link08-"));
  console.log("UI08 screenshots: " + shots);
  server = http.createServer((req, res) => {
    let name = new URL(req.url, "http://local").pathname.slice(1), old = name.startsWith("__baseline/");
    if (old) name = name.slice(11);
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {
      const body = old && changed.has(name) ? cp.execFileSync("git", ["show", "HEAD:" + name], {maxBuffer: 5e6}) : fs.readFileSync(file);
      res.setHeader("content-type", ({".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png"})[path.extname(file)] || "application/octet-stream");
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome"});
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function open(name, width, old = false) {
  const page = await browser.newPage({viewport: {width, height: 1000}}), errors = [], calls = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem("musdb_analytics_consent", "rejected"));
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const u = new URL(route.request().url()), action = u.searchParams.get("action"); calls.push(action);
    const data = action === "revision" ? {dataRevision: current.dataRevision, outputRevision: current.revision} : action === "venue" ? {venueName: venues.get(u.searchParams.get("id"))} : kp;
    return route.fulfill({contentType: "text/javascript", body: `${u.searchParams.get("callback")}(${JSON.stringify({success: true, data})});`});
  });
  await page.goto(`${base}/${old ? "__baseline/" : ""}${name}`);
  await page.locator(name.startsWith("member") ? "#memberAnalyticsContent" : "#kpContent").waitFor({state:"visible"});
  return {page, errors, calls};
}
async function chip(page, selector) {
  await page.bringToFront();
  const a = page.locator(selector).first(); await a.scrollIntoViewIfNeeded(); await a.locator(".mus-link-chevron svg").waitFor();
  const handle = await a.elementHandle(), icon = await a.locator(".mus-link-chevron").elementHandle();
  const sample = async () => {
    assert.equal(await a.evaluate((e, held) => e === held, handle), true);
    assert.equal(await a.evaluate((e, held) => e.querySelector(".mus-link-chevron") === held, icon), true);
    return a.evaluate(async e => {
      const c = e.querySelector(".mus-link-chevron"); getComputedStyle(c).transform;
      await new Promise(requestAnimationFrame); await Promise.all(c.getAnimations().map(a => a.finished)); await new Promise(requestAnimationFrame);
      const r = c.getBoundingClientRect(), b = e.getBoundingClientRect(), s = c.querySelector("svg").getBoundingClientRect();
      return {x:r.x+scrollX, size:[r.width,r.height,s.width,s.height], center:[s.x+s.width/2-r.x-r.width/2,s.y+s.height/2-r.y-r.height/2], box:[b.x+scrollX,b.y+scrollY,b.width,b.height], transform:getComputedStyle(c).transform, duration:getComputedStyle(c).transitionDuration};
    });
  };
  await page.mouse.move(0,0); await a.evaluate(e => e.blur()); const before = await sample();
  assert.deepEqual(before.size, [30,30,16,16]); assert.ok(before.center.every(n => Math.abs(n)<.1));
  await a.hover(); const hover = await sample(); assert.ok(Math.abs(hover.x-before.x-3)<.1); assert.deepEqual(hover.box,before.box);
  await page.mouse.move(0,0); await a.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  assert.equal(await a.evaluate(e => e.matches(":focus-visible") && getComputedStyle(e).outlineStyle === "solid"), true);
  await page.emulateMedia({reducedMotion:"reduce"}); const reduced = await sample(); assert.equal(reduced.transform,"none"); assert.equal(reduced.duration,"0s");
  await a.evaluate(e => e.blur()); await page.emulateMedia({reducedMotion:"no-preference"});
  await handle.dispose(); await icon.dispose();
}
async function clean(page, errors) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator("a a,a button,button a").count(), 0); assert.deepEqual(errors, []);
}
async function memberValues(p) {
  return p.evaluate(() => ({
    summary: document.querySelector("#memberAnalyticsSummary").textContent,
    rows: [...document.querySelectorAll("#memberAnalyticsTable tbody tr")].map(r => ({id:r.dataset.songId, href:r.querySelector("a").getAttribute("href"), text:r.textContent, cells:[...r.querySelectorAll("td")].slice(1).map(c => ({text:c.textContent, color:getComputedStyle(c).color, weight:getComputedStyle(c).fontWeight}))})),
    mobile: [...document.querySelectorAll("#memberAnalyticsMobileSongs article")].map(r => ({id:r.dataset.songId,href:r.querySelector("a").getAttribute("href"),text:r.textContent})),
    heads: [...document.querySelectorAll("#memberAnalyticsTable th")].map(c => ({text:c.textContent,width:c.getBoundingClientRect().width,position:getComputedStyle(c).position,color:c.style.getPropertyValue("--member-color")}))
  }));
}
for (const width of [1280,390]) {
  test(`Member title-only links: all117, counts, modes, filter and chip ${width}`, async () => {
    const {page:p,errors} = await open("member-analytics.html", width), {page:old} = await open("member-analytics.html", width, true);
    try {
      for (const mode of ["character","cast"]) {
        for (const page of [p,old]) await page.locator(`[data-mode="${mode}"]`).click();
        const values = await memberValues(p); assert.deepEqual(values,await memberValues(old));
        assert.equal(values.rows.length,117); assert.equal(new Set(values.rows.map(r=>r.id)).size,117);
        for (const r of values.rows) { assert.equal(r.href,`song/${r.id}.html`); assert.equal(r.cells.length,9); }
        assert.deepEqual(values.rows.map(r=>r.href), values.mobile.map(r=>r.href));
        assert.equal(await p.locator("#memberAnalyticsTable tbody tr td:not(:first-child) a,#memberAnalyticsMobileSongs article > a").count(),0);
        assert.equal(await p.locator("#memberAnalyticsTable tbody a .mus-link-chevron svg").count(),117);
        assert.equal(await p.locator("#memberAnalyticsMobileSongs a .mus-link-chevron svg").count(),117);
        const selector = width===1280?"#memberAnalyticsTable tbody a":"#memberAnalyticsMobileSongs a";
        assert.equal(await p.locator(selector).evaluateAll(links=>links.every(a=>{
          const box=a.getBoundingClientRect(), parent=a.closest("td,.member-analytics-mobile-song-head").getBoundingClientRect();
          const range=document.createRange(); range.selectNodeContents(a);
          return [...range.getClientRects(),box].every(r=>r.left>=parent.left-.1&&r.right<=parent.right+.1&&r.top>=parent.top-.1&&r.bottom<=parent.bottom+.1);
        })),true,"all117 titles and chips fit their own information region");
        await chip(p,width===1280?"#memberAnalyticsTable tbody a":"#memberAnalyticsMobileSongs a");
        assert.equal(new URL(p.url()).searchParams.get("mode") || "character",mode);
      }
      for (const page of [p,old]) { await page.locator("#memberAnalyticsFilterToggle").click(); await page.locator('input[data-group="blu-ray"]').check(); }
      assert.deepEqual(await memberValues(p), await memberValues(old));
      for (const action of ["all","clear"]) {
        for (const page of [p,old]) await page.locator(`[data-action="${action}"]`).click();
        assert.deepEqual(await memberValues(p),await memberValues(old));
        assert.equal(await p.locator("#memberAnalyticsTable tbody tr").count(),117);
      }
      await p.keyboard.press("Escape");
      // Zero counts remain visible information; official/solo counts are independent.
      assert.equal(await p.locator('#memberAnalyticsTable [data-song-id="S063"] td.member-analytics-zero').count(),member.songs.find(s=>s.songId==="S063").castCounts.filter(n=>n===0).length);
      const link = p.locator(width===1280?"#memberAnalyticsTable tbody a":"#memberAnalyticsMobileSongs a").first();
      await link.scrollIntoViewIfNeeded(); const popupPromise = p.context().waitForEvent("page"); await link.click({button:"middle"}); const popup = await popupPromise;
      await popup.waitForURL(new URL(await link.getAttribute("href"),p.url()).href); await popup.close();
      await clean(p,errors); await p.screenshot({path:path.join(shots,`member-${width}.png`)});
    } finally { await p.close(); await old.close(); }
  });
  test(`Kamipara dedicated theme, release-only link, counts and disclosures ${width}`, async () => {
    const {page:p,errors,calls} = await open("kamipara.html", width), {page:old} = await open("kamipara.html", width,true);
    try {
      const read = page => page.locator("#kpContent").evaluate(e => e.textContent.replace(/\s+/g," ").trim());
      await p.locator(".kp-event-venue").first().filter({hasText:venues.get(kp.events[0].venueId)}).waitFor();
      await old.locator(".kp-event-venue").first().filter({hasText:venues.get(kp.events[0].venueId)}).waitFor(); assert.equal(await read(p),await read(old));
      assert.equal(await p.locator("#kpSongs a,#kpHistory a,#kpCharacters a").count(),0);
      assert.equal(await p.locator('.kp-release a').getAttribute("href"),"release/R0072.html");
      assert.equal(await p.locator('.kp-release a').evaluate(e=>getComputedStyle(e).color),"rgb(238, 248, 252)");
      assert.equal(await p.locator('.kp-page').evaluate(e=>getComputedStyle(e).backgroundColor),await old.locator('.kp-page').evaluate(e=>getComputedStyle(e).backgroundColor));
      await chip(p,".kp-release a");
      for (const page of [p,old]) { await page.locator("#kpHistory summary").nth(0).click(); await page.locator("#kpHistory summary").nth(1).click(); }
      assert.equal(await p.locator("#kpHistory details[open]").count(),2);
      const order = page=>page.locator("#kpHistory .kp-performance-title").allTextContents(); assert.deepEqual(await order(p),await order(old));
      for (const year of ["2013","2019","all"]) {
        for (const page of[p,old]) await page.locator(`#kpYearFilter button[data-year="${year}"]`).click();
        assert.equal(await p.locator("#kpHistory details:visible").count(),await old.locator("#kpHistory details:visible").count());
      }
      assert.equal(calls.filter(a=>a==="kamiparaDashboard").length,0);
      await clean(p,errors); await p.locator(".kp-release").scrollIntoViewIfNeeded(); await p.screenshot({path:path.join(shots,`kamipara-${width}.png`)});
    } finally { await p.close(); await old.close(); }
  });
}
