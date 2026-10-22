"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const STATIC_CURRENT = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "current.json"), "utf8"));
const staticSong = id => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshots", STATIC_CURRENT.revision, "songs", `${id}.json`), "utf8")).data;
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const API_PATTERN = /script\.google(?:usercontent)?\.com/i;
let server;
let browser;
let baseUrl;
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), "musdb-song-release-type-a-"));

async function open04B(width, recordLimit) {
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const song=structuredClone(staticSong('S001'));
  if(recordLimit!==undefined)song.performances=song.performances.slice(0,recordLimit);
  else song.performances[0].eventName='長いイベント名の折返し '+('LongUnbrokenEnglishEventTitle'.repeat(3));
  await page.route('**/song.html?*',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(ROOT,'song.html'),'utf8').replace(/<script data-song-legacy-redirect>[\s\S]*?<\/script>/,'')}));
  await page.route('**/data/current.json',r=>r.fulfill({json:{}}));
  await page.route(API_PATTERN,r=>{const u=new URL(r.request().url()),action=u.searchParams.get('action');calls.push(action);const data=action==='revision'?STATIC_CURRENT:action==='song'?song:{topSingers:[{singerId:'SN0001',name:'μ’s',count:24}],relatedSongs:[],coPerformedSongs:[{songId:'S003',songName:'must not render'}],topVenues:[{venueId:'VE0001',venueName:'must not render'}],navigation:{previous:{songId:'S002',songName:'前の曲'},next:{songId:'S003',songName:'次の曲'},songs:[{songId:'S001',songName:song.songName},{songId:'S002',songName:'前の曲'}]}};return r.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success:true,data})});`});});
  await page.goto(baseUrl+'/song.html?id=S001',{waitUntil:'domcontentloaded'});await page.locator('#mainContent').waitFor({state:'visible'});await page.locator('.singer-rank-name').waitFor();
  const decline=page.getByRole('button',{name:'同意しない',exact:true});if(await decline.isVisible())await decline.click();
  return{context,page,errors,calls,song};
}

for(const width of [1280,390])test(`Song04B removed sections, gap action, Discover and history controls ${width}`,async()=>{
  const{context,page,errors,calls,song}=await open04B(width);try{
    assert.equal(await page.locator('#discoverySection,#songInsightsSection,#songDiscovery,#coPerformedSongs,#songTopVenues,.song-gap-cta').count(),0);
    assert.equal(await page.locator('a[href*="#discoverySection"]').count(),0);
    assert.equal(await page.locator('#songRecordsSection').isVisible(),true);assert.equal(await page.locator('#songAnalysisSection').isVisible(),true);
    const action=page.locator('#songGapCheckerLink');assert.equal(await action.innerText(),'この曲の『いつ振り』を調べる');assert.equal(await action.getAttribute('href'),'gap-checker.html?song=S001');
    assert.equal(await action.evaluate(e=>e.previousElementSibling.id==='gapChart'),true);assert.equal(await action.evaluate(e=>getComputedStyle(e).display),'inline-flex');
    assert.equal(await page.locator('.singer-rank-name').innerText(),'μ’s');assert.equal(await page.locator('.singer-rank-row').getAttribute('href'),'singer.html?id=SN0001');
    assert.equal(await page.locator('#previousSongButton').getAttribute('href'),'song/S002.html');assert.equal(await page.locator('#nextSongButton').getAttribute('href'),'song/S003.html');assert.equal(calls.filter(a=>a==='discover').length,1);
    const first=page.locator('#historyList .song-row').first(),link=first.locator('.song-history-event-link'),chip=link.locator('.mus-link-chevron');await link.scrollIntoViewIfNeeded();await chip.locator('svg').waitFor();
    await page.mouse.move(0,0);await page.waitForTimeout(220);const box=await link.boundingBox(),c=await chip.boundingBox();assert.equal(c.width,30);assert.equal(c.height,30);assert.equal((await chip.locator('svg').boundingBox()).width,16);
    assert.equal(await chip.evaluate(e=>{const n=e.parentElement.firstChild,r=document.createRange();r.selectNodeContents(n);const b=r.getBoundingClientRect(),c=e.getBoundingClientRect();return Math.abs(c.x-b.right-8)<1;}),true);
    assert.equal(await link.evaluate(e=>getComputedStyle(e).color),'rgb(23, 32, 51)');await link.hover();await page.waitForTimeout(250);assert.ok(Math.abs((await chip.boundingBox()).x-c.x-3)<.1);assert.deepEqual(await link.boundingBox(),box);
    await page.mouse.move(0,0);await page.keyboard.press('Tab');await link.focus();assert.equal(await link.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await chip.evaluate(e=>getComputedStyle(e).transform),'none');
    const singer=first.locator('.song-history-singer-link');assert.equal(await singer.evaluate(e=>getComputedStyle(e).textDecorationLine),'underline');assert.equal(await first.evaluate(e=>e.tagName),'ARTICLE');assert.equal(await first.locator('a a').count(),0);
    const eventBox=await link.boundingBox(),singerBox=await singer.boundingBox();assert.ok(eventBox.y+eventBox.height<=singerBox.y);assert.equal(await first.locator('.song-meta .type-badge a').count(),0);
    for(const type of['公式','ソロ','all']){await page.locator(`#historyFilters [data-filter="${type}"]`).click();const expected=type==='all'?song.performances:song.performances.filter(p=>String(p.type||p.category||'').trim()===type);assert.equal(await page.locator('#historyList .song-row').count(),Math.min(20,expected.length));assert.equal(await page.locator('#historyList .mus-link-chevron').count(),Math.min(20,expected.length));}
    await page.locator('#historyMoreButton').click();assert.equal(await page.locator('#historyList .song-row').count(),40);assert.equal(await page.locator('#historyList .mus-link-chevron').count(),40);
    const year=String(song.performances[0].date).slice(0,4);await page.locator(`#yearTimeline [data-year="${year}"]`).click();assert.equal(await page.locator('#historyList .song-row').count(),Math.min(20,song.performances.filter(p=>p.date.startsWith(year)).length));await page.locator('#historyYearReset').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
    await page.locator('#historySection').evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-80));await page.screenshot({path:path.join(screenshots,`04B-history-${width}.png`)});
    await page.locator('#gapChart').locator('..').screenshot({path:path.join(screenshots,`04B-gap-${width}.png`)});console.log('04B screenshots '+screenshots);
  }finally{await context.close();}
});
for(const width of [1280,390])for(const limit of[0,1])test(`Song04B gap checker remains usable with ${limit} records ${width}`,async()=>{
  const{context,page,errors}=await open04B(width,limit);try{assert.equal(await page.locator('#gapChart .gap-row').count(),0);assert.equal(await page.locator('#songGapCheckerLink').isVisible(),true);assert.equal(await page.locator('#songGapCheckerLink').getAttribute('href'),'gap-checker.html?song=S001');assert.deepEqual(errors,[]);}finally{await context.close();}
});

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "song.html" : pathname.replace(/^\/+/, ""));
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});

for (const width of [1280, 390]) test(`included Releases TYPE A static / dynamic / JS OFF ${width}`, async () => {
  for (const id of ["S017", "S046", "S100"]) {
    const song=staticSong(id),baseline=[];
    for(const mode of ["static","dynamic","off"]) {
      const context=await browser.newContext({viewport:{width,height:900},javaScriptEnabled:mode!=="off",hasTouch:width===390}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await context.route(API_PATTERN,route=>{const u=new URL(route.request().url());return route.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success:true,data:u.searchParams.get('action')==='revision'?STATIC_CURRENT:{}})});`});});
      if(mode==='dynamic')await page.route('**/song.html?*',async route=>{const html=fs.readFileSync(path.join(ROOT,'song.html'),'utf8').replace(/<script data-song-legacy-redirect>[\s\S]*?<\/script>/,'');await route.fulfill({contentType:'text/html',body:html});});
      // Destination documents only; the real Song renderer, snapshot and CSS run above.
      await context.route('**/release/R*.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><h1>Release destination</h1>'}));
      try {
        await page.goto(`${baseUrl}/${mode==='dynamic'?'song.html?id='+id:'song/'+id+'.html'}`,{waitUntil:'domcontentloaded'});
        await page.locator('#includedReleasesSection').waitFor({state:'visible'});
        if(mode!=='off'){await page.locator('#status').waitFor({state:'hidden'});const decline=page.getByRole('button',{name:'同意しない',exact:true});if(await decline.isVisible())await decline.click();}
        const cards=page.locator('.song-included-release-card');
        const groups=new Map();for(const row of song.includedReleases){if(!groups.has(row.releaseId))groups.set(row.releaseId,[]);groups.get(row.releaseId).push(row);}
        assert.equal(await cards.count(),groups.size);assert.equal(await page.locator('.song-included-relation-row').count(),song.includedReleases.length);
        const identities=[];
        for(const card of await cards.all()) {
          assert.equal(await card.evaluate(e=>e.tagName),'A');assert.equal(await card.locator('a,button').count(),0);
          const href=await card.getAttribute('href'),releaseId=href.match(/R\d{4}/)[0],rows=groups.get(releaseId);
          assert.equal(await card.locator('.song-included-release-link').textContent(),rows[0].releaseName);
          assert.equal(await card.locator('.song-included-relation-row').count(),rows.length);
          const positions=await card.locator('.song-included-relation-row').allTextContents();
          rows.forEach((r,i)=>{const p=[r.disc==null?'':`Disc ${r.disc}`,r.track==null?'':`Track ${r.track}`].filter(Boolean).join(' / ')||'位置情報なし';assert.ok(positions[i].includes(p));if(r.variant)assert.ok(positions[i].includes(r.variant));});
          identities.push({href,title:rows[0].releaseName,positions});
        }
        if(mode==='static')baseline.push(...identities);else assert.deepEqual(identities,baseline,'initial static, runtime and JS OFF identities/relations match');
        assert.equal(await page.locator('.song-included-series-heading a').count(),0);
        if(mode!=='off') {
          const card=cards.first(),chip=card.locator('.mus-link-chevron');await card.scrollIntoViewIfNeeded();await chip.locator('svg').waitFor();
          await page.mouse.move(0,0);await page.waitForTimeout(220);const rect=await card.boundingBox(),c=await chip.boundingBox(),svg=await chip.locator('svg').boundingBox();
          assert.equal(c.width,30);assert.equal(c.height,30);assert.equal(svg.width,16);assert.equal(svg.height,16);assert.ok(Math.abs(c.x+15-svg.x-8)<1);assert.ok(Math.abs(c.y+15-svg.y-8)<1);
          assert.equal(await chip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(242, 239, 255)');
          assert.equal(await chip.evaluate(e=>{const t=e.parentElement.firstChild,r=document.createRange();r.selectNodeContents(t);const b=r.getBoundingClientRect(),c=e.getBoundingClientRect();return Math.abs(c.x-b.right-8)<1&&Math.abs(c.y+c.height/2-b.y-b.height/2)<5;}),true);
          await card.hover();await page.waitForTimeout(250);assert.ok(Math.abs((await chip.boundingBox()).x-c.x-3)<.1);assert.deepEqual(await card.boundingBox(),rect);
          await page.mouse.move(0,0);await page.keyboard.press('Tab');await card.focus();assert.equal(await card.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
          await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await chip.evaluate(e=>getComputedStyle(e).transform),'none');assert.equal(await chip.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
          await page.emulateMedia({reducedMotion:'no-preference'});await page.mouse.move(0,0);await card.evaluate(e=>e.blur());await page.waitForTimeout(220);
          const href=await card.evaluate(e=>e.href);
          for(const options of[{button:'middle'},{modifiers:['Control']}]){const p=context.waitForEvent('page');await card.click(options);const tab=await p;await tab.waitForURL(href);await tab.close();}
          const b=await card.boundingBox();assert.equal(await card.evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+3,b.y+b.height/2)?.closest('a')===e;}),true);
          // Date and Relation areas belong to the same actual anchor, not an overlay.
          for(const child of['.song-included-release-date','.song-included-relation-row'])assert.equal(await card.locator(child).first().evaluate(e=>e.closest('a')?.classList.contains('song-included-release-card')),true);
          await page.mouse.click(b.x+3,b.y+b.height/2);await page.waitForURL(href);await page.goBack();await cards.first().waitFor();
          await cards.first().focus();await page.keyboard.press('Enter');await page.waitForURL(href);await page.goBack();await cards.first().waitFor();
          if(width===390){await cards.first().tap();await page.waitForURL(href);await page.goBack();await cards.first().waitFor();}
        } else {
          await cards.first().click();await page.waitForURL(/\/release\/R\d{4}\.html/);await page.goBack();await cards.first().waitFor();
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.equal(await cards.evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth)),true);
        if(mode==='static'){await page.locator('#includedReleasesSection').screenshot({path:path.join(screenshots,`${id}-${width}.png`)});await page.locator('#includedReleasesSection').evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-20));await page.screenshot({path:path.join(screenshots,`${id}-${width}-viewport.png`)});console.log('TYPE A screenshot '+path.join(screenshots,`${id}-${width}.png`));}
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    }
  }
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function openSong(songId, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  await page.route(API_PATTERN, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("action") !== "revision") { await route.continue(); return; }
    const callback = url.searchParams.get("callback");
    await route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data: { dataRevision: "song-release-test" } })});` });
  });
  await page.goto(`${baseUrl}/song.html?id=${encodeURIComponent(songId)}`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
  return { page, issues };
}

test("曲詳細とRelease詳細の相互リンク", { timeout: 5 * 60 * 1000 }, async t => {
  await t.test("S003・S046・S100は初期/描画後ともindexで自己参照canonical", async () => {
    const initial = fs.readFileSync(path.join(ROOT, "song.html"), "utf8");
    assert.match(initial, /<meta name="robots" content="index,follow,max-image-preview:large">/);
    for (const songId of ["S003", "S046", "S100"]) {
      const { page, issues } = await openSong(songId);
      assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "index,follow,max-image-preview:large");
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://mus-song-db.com/song/${songId}.html`);
      assert.match(await page.title(), /｜μ's Song Database$/);
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("S100は13作品・22件をRelease単位・Solo LiveシリーズでgroupしR0090の2relationを保持", async () => {
    const { page, issues } = await openSong("S100");
    assert.equal(await page.evaluate(() => {
      const history = document.querySelector("#historySection");
      const included = document.querySelector("#includedReleasesSection");
      return Boolean(history && included && (history.compareDocumentPosition(included) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), true, "収録リリースは歌唱履歴より後に配置");
    assert.equal(await page.locator("#includedReleasesCount").innerText(), "13作品・22件");
    assert.equal(await page.locator(".song-included-release-card").count(), 13);
    assert.equal(await page.locator(".song-included-relation-row").count(), 22);
    assert.equal(await page.locator(".song-included-series-group").count(), 1);
    const series = page.locator(".song-included-series-group");
    assert.match(await series.locator(".song-included-series-heading").innerText(), /Solo Live/);
    assert.equal(await series.locator(".song-included-release-card").count(), 10);
    assert.match(await series.locator(".song-included-release-card").first().innerText(), /Memorial BOX/);
    const debut = page.locator('.song-included-release-card[href="release/R0058.html"]');
    assert.equal(await debut.locator(".song-included-release-badge.debut").innerText(), "初出");
    const memorial = page.locator('.song-included-release-card[href="release/R0090.html"]');
    assert.equal(await memorial.locator(".song-included-relation-row").count(), 2);
    assert.equal(await memorial.locator(".song-included-variant").innerText(), "Movie Edit");
    assert.match(await memorial.innerText(), /Disc 12 \/ Track 3[\s\S]*Disc 12 \/ Track 4/);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("S046はR0081の通常版とBitter-Sweet Mixを別relationで表示", async () => {
    const { page, issues } = await openSong("S046");
    assert.equal(await page.locator("#includedReleasesCount").innerText(), "14作品・23件");
    const best = page.locator('.song-included-release-card[href="release/R0081.html"]');
    assert.equal(await best.locator(".song-included-relation-row").count(), 2);
    const mix = best.locator(".song-included-relation-row", { hasText: "Bitter-Sweet Mix" });
    assert.match(await mix.innerText(), /Disc 3 \/ Track 9/);
    assert.equal(await mix.locator(".song-included-variant").innerText(), "Bitter-Sweet Mix");
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("収録リリース0件とschema欠落は区別する", async () => {
    for (const testCase of [
      { id: "S100", value: [], expected: "収録リリースの登録はありません。", className: ".song-included-releases-empty" },
      { id: "S100", value: undefined, expected: "収録情報を表示できません。再読み込みしてください。", className: ".song-included-releases-error" }
    ]) {
      const page = await browser.newPage();
      await page.route("**/data/current.json", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
      await page.route(API_PATTERN, async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get("action") !== "song") { await route.continue(); return; }
        const callback = url.searchParams.get("callback");
        const payload = { success: true, data: structuredClone(staticSong(testCase.id)) };
        if (testCase.value === undefined) delete payload.data.includedReleases;
        else payload.data.includedReleases = testCase.value;
        await route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify(payload)});` });
      });
      await page.goto(`${baseUrl}/song.html?id=${testCase.id}`, { waitUntil: "domcontentloaded" });
      await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
      assert.equal((await page.locator(testCase.className).innerText()).replace(/\s+/g, ""), testCase.expected.replace(/\s+/g, ""));
      assert.equal(await page.locator("#status.error").count(), 0);
      await page.close();
    }
  });

  await t.test("欠損位置・日付・classification fallbackとXSSを安全に表示", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route("**/data/current.json", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route(API_PATTERN, async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("action") !== "song") { await route.continue(); return; }
      const callback = url.searchParams.get("callback");
      const payload = { success: true, data: structuredClone(staticSong("S100")) };
      payload.data.debutRelease = null;
      payload.data.includedReleases = [{ relationId: "RT9000", releaseId: "R9000", releaseName: "<img src=x onerror=alert(1)>", releaseDate: null, classification: "<script>alert(1)</script>", releaseType: "", disc: null, track: null, displayOrder: 1, variant: "<b>Movie Edit</b>" }];
      await route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify(payload)});` });
    });
    await page.goto(`${baseUrl}/song.html?id=S100`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    const section = page.locator("#includedReleasesSection");
    assert.match(await section.innerText(), /発売日未登録/);
    assert.match(await section.innerText(), /位置情報なし/);
    assert.match(await section.innerText(), /<script>alert\(1\)<\/script>/);
    assert.match(await section.innerText(), /<b>Movie Edit<\/b>/);
    assert.equal(await section.locator("img, script, b").count(), 0);
    assert.equal(await section.locator(".song-included-release-badge.debut").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.close();
  });

  await t.test("S100・S095・S032はdebutRelease.releaseIdへリンクする", async () => {
    for (const expected of [
      { songId: "S100", releaseId: "R0058", recordingCd: "SUNNY DAY SONG／？←HEARTBEAT" },
      { songId: "S095", releaseId: "R0054", recordingCd: "MUSEUMでどうしたい" },
      { songId: "S032", releaseId: "R0015", recordingCd: "Wonderful Rush" }
    ]) {
      const { page, issues } = await openSong(expected.songId);
      const link = page.locator("#songInfo .song-debut-release-link");
      assert.equal(await link.innerText(), expected.recordingCd);
      assert.equal(await page.locator("#releaseAction .release-detail-link").count(), 0);
      assert.match(new URL(await link.getAttribute("href"), baseUrl).pathname, new RegExp(`/release/${expected.releaseId}\\.html$`));
      const body = await page.locator("#releaseSection").innerText();
      assert.match(body, new RegExp(expected.recordingCd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(body, /発売日/);
      assert.match(body, /メディア/);
      assert.equal(await page.locator("#releaseSection .official-release-link[target='_blank']").count(), 1);
      assert.doesNotMatch(body, new RegExp(`Release ID|初出Release ID|debutRelease|${expected.releaseId}`));
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("debutReleaseなしではリンクを表示しない", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const issues = [];
    page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
    await page.route("**/data/current.json", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route(API_PATTERN, async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("action") !== "song") { await route.continue(); return; }
      const callback = url.searchParams.get("callback");
      const payload = { success: true, data: structuredClone(staticSong("S100")) };
      payload.data.debutRelease = null;
      await route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify(payload)});` });
    });
    await page.goto(`${baseUrl}/song.html?id=S100`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    assert.equal(await page.locator(".song-debut-release-link,.release-detail-link").count(), 0);
    assert.match(await page.locator("#releaseSection").innerText(), /SUNNY DAY SONG/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("S100からR0058を経由してS100・S101へ遷移できる", async () => {
    const { page, issues } = await openSong("S100", { width: 390, height: 844 });
    await page.locator("#songInfo .song-debut-release-link").click();
    await page.waitForURL(/release\/R0058\.html/);
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    assert.deepEqual((await page.locator(".release-included-song-row").filter({has:page.locator(".release-origin")}).evaluateAll(nodes => nodes.map(node => /\/song\/(S\d{3})\.html$/.exec(new URL(node.href).pathname)?.[1]))).sort(), ["S100", "S101"]);
    assert.equal(await page.locator("#debutSongsSection").isVisible(), false, "初出は収録行に統合し重複カードを出さない");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.locator(".release-included-song-row[href='song/S100.html']").click();
    await page.waitForURL(/song\/S100\.html/);
    await page.locator("#songInfo .song-debut-release-link").waitFor({ state: "visible", timeout: 45000 });
    await page.goBack();
    await page.locator(".release-included-song-row[href='song/S101.html']").click();
    await page.waitForURL(/song\/S101\.html/);
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("追加リンクは各viewportで横overflowを起こさない", async () => {
    const { page, issues } = await openSong("S095");
    for (const width of [1080, 900, 620, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
    }
    assert.deepEqual(issues, []);
    await page.close();
  });
});
