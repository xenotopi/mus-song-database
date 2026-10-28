"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const REVISION = "home-today-release-test";
let server;
let browser;
let baseUrl;

function jstDateContext() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter(part => ["year", "month", "day"].includes(part.type)).map(part => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, month: Number(parts.month), day: Number(parts.day), label: `${Number(parts.month)}月${Number(parts.day)}日` };
}

function homeData(todayOverrides = {}) {
  return {
    summary: { songCount: 117, eventCount: 353, venueCount: 154, performanceCount: 1000 },
    today: { ...jstDateContext(), events: [], releases: [], firstPerformedSongs: [], lastPerformedSongs: [], ...todayOverrides },
    recentPerformances: [], topSongs: [], topVenues: [], _cache: { revision: REVISION }
  };
}

function release(id, overrides = {}) {
  return { releaseId: id, releaseDate: "2012-09-05", releaseName: `Release ${id}`, classification: "CD", anniversary: 14, ...overrides };
}

async function installApiFixture(page, todayOverrides, options = {}) {
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    const action = url.searchParams.get("action");
    let data = {};
    if (action === "revision") data = { dataRevision: REVISION };
    if (action === "home") data = { ...homeData(todayOverrides), topSongs: options.topSongs || [] };
    if (action === "event") { const cur = JSON.parse(fs.readFileSync(path.join(ROOT,"data/current.json"))); data = JSON.parse(fs.readFileSync(path.join(ROOT,"data/snapshots",cur.revision,"events",url.searchParams.get("id")+".json"))).data.event; }
    if (action === "release") data = { releaseId: url.searchParams.get("id"), releaseDate: "2012-09-05", releaseName: "Wonderful Rush", classification: "CD", releaseType: "シングル", sourceMedia: "CD", officialReleaseUrl: "", todayEligible: true, note: "", relatedEvents: [], debutSongs: [] };
    return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, generatedAt: "2026-09-05T00:00:00+09:00", data })});` });
  });
}

async function openHome(todayOverrides, viewport = { width: 1280, height: 900 }, options = {}) {
  const page = await browser.newPage({ viewport, timezoneId: options.timezoneId, hasTouch: viewport.width === 390 });
  if (options.clock) await page.clock.install({ time: new Date(options.clock) });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
  await installApiFixture(page, todayOverrides, options);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#topSection").waitFor({ state: "visible", timeout: 45000 });
  await page.waitForFunction(() => document.querySelector("#todaySummary")?.textContent.includes("本日の記録"), null, { timeout: 45000 });
  return { page, issues };
}

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

test("Release 1件をEvent前へ表示し、summary・既存3カテゴリ・往復を維持する", async () => {
  const { page, issues } = await openHome({
    releases: [release("R0015", { releaseName: "Wonderful Rush" })],
    events: [{ eventId: "EV0001", eventName: "Event", date: "2012-09-05", category: "公式", eventType: "ライブ" }],
    firstPerformedSongs: [{ songId: "S001", songName: "First Song", date: "2012-09-05" }],
    lastPerformedSongs: [{ songId: "S002", songName: "Last Song", date: "2012-09-05" }]
  });
  assert.deepEqual(await page.locator("#todayContent .today-group h3").allTextContents(), ["この日に発売された作品", "この日に開催されたイベント", "この日に初披露された曲", "この日に最後に歌われた曲"]);
  assert.match(await page.locator("#todaySummary").innerText(), /本日の記録\s*4件.*リリース\s*1.*イベント\s*1.*初披露\s*1.*最終披露\s*1/s);
  const item = page.locator('#todayContent a[href="release/R0015.html"]');
  assert.match(await item.innerText(), /発売から14周年.*Wonderful Rush.*2012年｜CD/s);
  assert.doesNotMatch(await item.innerText(), /R0015|シングル/);
  await item.click();
  await page.locator("#releaseName").waitFor({ timeout: 45000 });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator('#todayContent a[href="release/R0015.html"]').waitFor({ timeout: 45000 });
  assert.deepEqual(issues, []);
  await page.close();
});

test("0件・欠損はgroup非表示、Releaseだけ存在時と全体空状態を区別する", async () => {
  for (const releases of [[], null, undefined, "invalid"]) {
    const overrides = { events: [], firstPerformedSongs: [], lastPerformedSongs: [] };
    if (releases !== undefined) overrides.releases = releases;
    const { page, issues } = await openHome(overrides);
    assert.equal(await page.getByRole("heading", { name: "この日に発売された作品" }).count(), 0);
    assert.match(await page.locator("#todayContent").innerText(), /今日はまだ記録がありません/);
    assert.match(await page.locator("#todaySummary").innerText(), /リリース\s*0/);
    assert.deepEqual(issues, []);
    await page.close();
  }
  const { page, issues } = await openHome({ releases: [release("R0015", { releaseName: "Wonderful Rush" })] });
  assert.equal(await page.locator(".today-empty-special").count(), 0);
  assert.equal(await page.getByRole("heading", { name: "この日に発売された作品" }).count(), 1);
  assert.deepEqual(issues, []);
  await page.close();
});

test("anniversary 0・null、無効ID・日付を安全に扱う", async () => {
  const { page, issues } = await openHome({ releases: [
    release("R0001", { anniversary: 0, releaseName: "本日作品" }),
    release("R0002", { anniversary: null, releaseDate: "invalid", releaseName: "周年なし" }),
    release("INVALID", { releaseName: "不正ID" })
  ] });
  const validItems = page.locator("#todayContent .today-group").first().locator(".today-item");
  assert.equal(await validItems.count(), 2);
  assert.match(await validItems.nth(0).innerText(), /本日発売/);
  assert.equal(await validItems.nth(1).locator(".today-anniversary-badge").count(), 0);
  assert.doesNotMatch(await validItems.nth(1).innerText(), /invalid年/);
  assert.doesNotMatch(await page.locator("#todayContent").innerText(), /不正ID/);
  assert.deepEqual(issues, []);
  await page.close();
});

test("API順の先頭6件と残りの折りたたみ、長文・escape・全viewportを維持する", async () => {
  const releases = Array.from({ length: 7 }, (_, index) => release(`R${String(index + 1).padStart(4, "0")}`, {
    releaseName: index === 0 ? "「ラブライブ！The School Idol Movie」特典付前売券第3弾 ユニットシングル Printemps「MUSEUMでどうしたい？」<script>window.__xss=1</script>" : `作品${index + 1}`,
    classification: index === 1 ? "<img src=x onerror=window.__xss=2>" : index === 2 ? "Blu-ray" : "CD"
  }));
  const { page, issues } = await openHome({ releases }, { width: 390, height: 900 });
  const items = page.locator("#todayContent .today-group").first().locator(".today-item");
  assert.equal(await items.count(), 7);
  assert.equal(await page.locator("#todayContent .today-group").first().locator(".today-item:visible").count(), 6);
  assert.deepEqual(await items.evaluateAll(nodes => nodes.map(node => /\/release\/(R\d{4})\.html$/.exec(new URL(node.href).pathname)?.[1])), ["R0001", "R0002", "R0003", "R0004", "R0005", "R0006", "R0007"]);
  const more = page.locator(".today-group-more");
  assert.equal(await more.getAttribute("open"), null);
  await more.locator("summary").press("Enter");
  assert.ok(await items.last().isVisible());
  assert.equal(await page.locator("#todayContent script, #todayContent img").count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  for (const width of [1440, 1280, 1024, 900, 768, 620, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
  }
  assert.deepEqual(issues, []);
  await page.close();
});

test("多数の収録曲は3曲を先に表示し、残りをキーボードで開閉して全リンクを維持する", async () => {
  const songs = Array.from({ length: 7 }, (_, i) => ({ songId: `S${String(i + 1).padStart(3, "0")}`, songName: `収録曲${i + 1}` }));
  for (const width of [1280, 390]) {
    const { page, issues } = await openHome({ releases: [release("R0088", { includedSongs: songs })] }, { width, height: 900 });
    const rows = page.locator(".today-release-song");
    assert.equal(await rows.count(), 7);
    assert.equal(await page.locator(".today-release-song:visible").count(), 3);
    assert.deepEqual(await rows.locator("a").evaluateAll(nodes => nodes.map(n => n.getAttribute("href"))), songs.map(s => `song/${s.songId}.html`));
    const summary = page.locator(".today-release-more > summary");
    assert.equal(await summary.innerText(), "残り4曲を見る");
    await summary.press("Enter");
    assert.equal(await page.locator(".today-release-song:visible").count(), 7);
    assert.deepEqual(await rows.locator("a").allTextContents(), songs.map(s => `「${s.songName}」`));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await summary.press("Enter");
    assert.equal(await page.locator(".today-release-song:visible").count(), 3);
    assert.deepEqual(issues, []);
    await page.close();
  }
});

test("JST年境界の周年はブラウザの現地年ではなく対象日の年を使用する", async () => {
  const { page, issues } = await openHome({
    dateKey: "2027-01-01", month: 1, day: 1, label: "1月1日",
    events: [{ eventId: "EV0001", eventName: "年境界fixture", date: "2012-01-01", category: "公式" }]
  }, { width: 390, height: 900 }, { clock: "2026-12-31T15:00:00Z", timezoneId: "America/Los_Angeles" });
  assert.equal(await page.evaluate(() => new Date().getFullYear()), 2026);
  assert.match(await page.locator(".today-anniversary-badge").innerText(), /15年前の今日/);
  assert.match(await page.locator("#todayDate").innerText(), /1月1日/);
  assert.deepEqual(issues, []);
  await page.close();
});

test("12月25日R0052/R0090のSong集合・順序・リンクとS100一意表示をPC・スマホで確認", async () => {
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current.json"), "utf8"));
  const releases = ["R0052", "R0090"].map(id => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots", current.revision, "releases", `${id}.json`), "utf8")).data;
    assert.equal(data.releaseDate.replaceAll("/", "-").slice(5), "12-25");
    return { ...data, anniversary: 2026 - Number(data.releaseDate.slice(0, 4)) };
  });
  for (const width of [1280, 390]) {
    const { page, issues } = await openHome({ dateKey: "2026-12-25", month: 12, day: 25, label: "12月25日", releases }, { width, height: 900 }, { clock: "2026-12-25T03:00:00Z" });
    const decline = page.getByRole("button", { name: "同意しない", exact: true });
    if (await decline.isVisible()) await decline.click();
    assert.equal(await page.locator(".today-release-entry").count(), 2);
    // Independent first-appearance projection from preserved Relation data, not renderer output.
    const expected = releases.map(r => r.includedSongs.filter((song,index,all) => all.findIndex(other => other.songId === song.songId) === index));
    assert.deepEqual(expected.map(rows => rows.length), [3,115]);
    assert.equal(await page.locator(".today-release-song").count(), 118);
    for (let i=0;i<releases.length;i++) {
      const entry=page.locator(".today-release-entry").nth(i),links=entry.locator(".today-release-song a"),ids=expected[i].map(song => song.songId);
      assert.equal(await entry.locator(".today-release-song").count(),ids.length);
      assert.equal(new Set(ids).size,ids.length);
      assert.deepEqual(await links.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href"))),ids.map(id=>"song/"+id+".html"));
      assert.deepEqual(await links.allTextContents(),expected[i].map(song=>"「"+song.songName.trim()+"」"));
    }
    assert.equal(releases[1].includedSongs.filter(song=>song.songId === "S100").length,2);
    assert.equal(await page.locator(".today-release-entry").nth(1).locator('.today-release-song a[href="song/S100.html"]').count(),1);
    assert.equal(await page.locator(".today-release-more").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.MUSDB_HOME_TODAY_QA_DIR) {
      await page.locator("#topSection").screenshot({ path: path.join(process.env.MUSDB_HOME_TODAY_QA_DIR, `today-${width}.png`) });
    }
    assert.deepEqual(issues, []);
    await page.close();
  }
});

test("既存Eventの曲一覧と記録なし表示をPC・スマホで確認する", async () => {
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current.json"), "utf8"));
  const event = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots", current.revision, "events/EV0001.json"), "utf8")).data.event;
  const date = String(event.date).replaceAll("/", "-");
  const month = Number(date.slice(5, 7)), day = Number(date.slice(8, 10));
  const context = { dateKey: `2026-${date.slice(5, 10)}`, month, day, label: `${month}月${day}日` };
  for (const width of [1280, 390]) {
    const { page, issues } = await openHome({ ...context, events: [event] }, { width, height: 900 }, { clock: `${context.dateKey}T03:00:00Z` });
    const decline = page.getByRole("button", { name: "同意しない", exact: true });
    if (await decline.isVisible()) await decline.click();
    const button = page.locator("[data-today-event]");
    assert.match(await button.getAttribute("aria-label"), new RegExp("の曲を見る$"));
    await button.press("Enter");
    const panel = page.locator(".today-event-songs");
    await panel.locator("li").first().waitFor();
    assert.equal(await panel.locator("li").count(), event.songs.length);
    assert.ok(await button.evaluate(n => n.getBoundingClientRect().height >= 44));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.MUSDB_HOME_TODAY_QA_DIR) await page.locator("#topSection").screenshot({ path: path.join(process.env.MUSDB_HOME_TODAY_QA_DIR, `event-${width}.png`) });
    assert.deepEqual(issues, []);
    await page.close();
    const empty = await openHome(context, { width, height: 900 }, { clock: `${context.dateKey}T03:00:00Z` });
    assert.match(await empty.page.locator("#todayContent").innerText(), /今日はまだ記録がありません/);
    if (process.env.MUSDB_HOME_TODAY_QA_DIR) await empty.page.locator("#topSection").screenshot({ path: path.join(process.env.MUSDB_HOME_TODAY_QA_DIR, `empty-${width}.png`) });
    assert.deepEqual(empty.issues, []);
    await empty.page.close();
  }
});

test("通常Blu-ray・店舗特典・収録曲なしを同じTodayで表示する", async () => {
  const releases = [
    release("R0021", { classification: "Blu-ray", includedSongs: [{ songId: "S044", songName: "夢なき夢は夢じゃない" }] }),
    release("R0032", { includedSongs: [{ songId: "S059", songName: "ぷわぷわーお！", benefitStore: "ゲーマーズ" }] }),
    release("R0052", { includedSongs: [
      { songId: "S090", songName: "CheerDay CheerGirl!", benefitStore: "ゲーマーズ" },
      { songId: "S091", songName: "同じ星が見たい", benefitStore: "ソフマップ" },
      { songId: "S092", songName: "Silent tonight", benefitStore: "アニメイト" }
    ] }),
    release("R0045", { classification: "CD", includedSongs: [
      { songId: "S079", songName: "Shangri-La Shower", benefitStore: null },
      { songId: "S080", songName: "るてしキスキしてる", benefitStore: null }
    ] }),
    release("R0015")
  ];
  const { page, issues } = await openHome({ releases });
  const entries = page.locator("#todayContent .today-release-entry");
  assert.equal(await entries.count(), 4);
  assert.deepEqual(await entries.nth(0).locator(".today-release-song").allTextContents(), ["収録特典曲「夢なき夢は夢じゃない」"]);
  assert.deepEqual(await entries.nth(1).locator(".today-release-song").allTextContents(), ["ゲーマーズ「ぷわぷわーお！」"]);
  assert.deepEqual(await entries.nth(2).locator(".today-release-song").allTextContents(), [
    "ゲーマーズ「CheerDay CheerGirl!」", "ソフマップ「同じ星が見たい」", "アニメイト「Silent tonight」"
  ]);
  assert.deepEqual(await entries.nth(3).locator(".today-release-song").allTextContents(), [
    "収録曲「Shangri-La Shower」", "収録曲「るてしキスキしてる」"
  ]);
  assert.deepEqual(await entries.nth(2).locator(".today-release-song a").evaluateAll(nodes => nodes.map(node => /\/song\/(S\d{3})\.html$/.exec(new URL(node.href).pathname)?.[1])), ["S090", "S091", "S092"]);
  assert.equal(await page.locator('#todayContent a[href="release/R0015.html"] + .today-release-songs').count(), 0);
  assert.equal(await page.locator("#todayContent a a").count(), 0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
    assert.equal(await entries.nth(2).locator(".today-release-song").count(), 3);
    assert.deepEqual(await entries.nth(2).locator(".today-release-song").evaluateAll(nodes => nodes.map(node => {
      const card = node.closest(".today-release-entry").getBoundingClientRect();
      const line = node.getBoundingClientRect();
      return Number.parseFloat(getComputedStyle(node).fontSize) >= 14 && line.left >= card.left && line.right <= card.right;
    })), [true, true, true], `${width}px song rows`);
  }
  assert.deepEqual(issues, []);
  await page.close();
});


// Home title-chip behavior: reuse the existing browser/server/date fixture.
const chipCurrent = JSON.parse(fs.readFileSync(path.join(ROOT,"data/current.json")));
const chipSnapshot = (type,id) => JSON.parse(fs.readFileSync(path.join(ROOT,"data/snapshots",chipCurrent.revision,type,id+".json"))).data;
const chipBox = chipSnapshot("releases","R0089");
const chipEvent = chipSnapshot("events","EV0354").event;
const chipTop = [...JSON.parse(fs.readFileSync(path.join(ROOT,"data/gap-rankings.json"))).payload.songs].sort((a,b)=>b.recordCount-a.recordCount||a.id.localeCompare(b.id)).slice(0,5).map((song,i)=>({rank:i+1,songId:song.id,songName:song.name,performanceCount:song.recordCount,eventCount:new Set(song.dates.flatMap(d=>d.all)).size}));
const chipShots = process.env.MUSDB_HOME_UI_QA_DIR;
async function chipState(locator) { return locator.evaluate(async n=>{ const arrow=n.querySelector('.mus-link-chevron');if(arrow){getComputedStyle(arrow).transform;await new Promise(requestAnimationFrame);await Promise.all(arrow.getAnimations().map(a=>a.finished));}const c=getComputedStyle(n);return {color:c.color,background:c.backgroundColor,decoration:c.textDecorationLine,transform:arrow?getComputedStyle(arrow).transform:null};}); }
async function chipMetrics(page) { return page.locator('#topSongs .home-rank,#topSongs .home-ranking-meta,#topSongs .home-ranking-count').evaluateAll(ns=>ns.map(n=>{const s=getComputedStyle(n);return {text:n.textContent,color:s.color,background:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,transform:s.transform};})); }
async function chipReady(page){await page.locator('#topSongs .home-ranking-row').nth(4).waitFor();await page.waitForFunction(()=>document.querySelectorAll('#todayContent .mus-link-chevron svg').length>0);const decline=page.getByRole('button',{name:'同意しない',exact:true});if(await decline.isVisible())await decline.click();}
for (const width of [1280,390]) {
 test('Today/TOP5 title-only hover, keyboard, links and expansion '+width,async()=>{
  const fixture={releases:[{...chipBox,anniversary:8}],events:[{...chipEvent}],firstPerformedSongs:[{songId:'S001',songName:'僕らのLIVE 君とのLIFE',date:'2010-01-01'}],lastPerformedSongs:[{songId:'S117',songName:'これから',date:'2016-01-01'}]};
  const {page,issues}=await openHome(fixture,{width,height:900},{topSongs:chipTop});try{await chipReady(page);const activate=async n=>width===390?n.tap():n.click();
   assert.deepEqual(await page.locator('#topSongs .home-ranking-name').allTextContents(),chipTop.map(x=>x.songName));assert.deepEqual(await page.locator('#topSongs .home-ranking-row').evaluateAll(ns=>ns.map(n=>n.getAttribute('href'))),chipTop.map(x=>'song/'+x.songId+'.html'));
   assert.deepEqual(await page.locator('#topSongs .home-rank').allTextContents(),chipTop.map(x=>String(x.rank)));assert.deepEqual(await page.locator('#topSongs .home-ranking-count').allTextContents(),chipTop.map(x=>x.performanceCount.toLocaleString('ja-JP')+'回'));assert.deepEqual(await page.locator('#topSongs .home-ranking-meta').allTextContents(),chipTop.map(x=>'イベント '+x.eventCount.toLocaleString('ja-JP')+'件'));
   const row=page.locator('#topSongs .home-ranking-row').first(),label=row.locator('.mus-link-label'),metrics=await chipMetrics(page);await row.scrollIntoViewIfNeeded();await page.mouse.move(0,0);const plain=await chipState(label),rowBg=await row.evaluate(n=>getComputedStyle(n).backgroundColor);const arrowBox=await row.locator('.mus-link-chevron').boundingBox();assert.equal(arrowBox.width,30);assert.equal(arrowBox.height,30);
   if(width===1280){await row.locator('.home-rank').hover();assert.deepEqual(await chipState(label),plain);assert.equal(await row.evaluate(n=>getComputedStyle(n).backgroundColor),rowBg);await row.locator('.home-ranking-meta').hover();assert.deepEqual(await chipState(label),plain);await label.hover();const hot=await chipState(label);assert.notEqual(hot.color,plain.color);assert.ok(hot.decoration.includes('underline'));assert.equal(await row.evaluate(n=>getComputedStyle(n).backgroundColor),rowBg);assert.deepEqual(await chipMetrics(page),metrics);}
   await page.mouse.move(0,0);await row.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await row.evaluate(n=>n.matches(':focus-visible')),true);assert.equal(await label.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');assert.deepEqual(await chipMetrics(page),metrics);
   const today=page.locator('#todayContent a.today-item').first(),todayLabel=today.locator('.mus-link-label');await today.scrollIntoViewIfNeeded();await page.mouse.move(0,0);const normal=await chipState(todayLabel),todayBg=await today.evaluate(n=>getComputedStyle(n).backgroundColor);
   if(width===1280){await today.locator('.home-ranking-meta').hover();assert.deepEqual(await chipState(todayLabel),normal);await todayLabel.hover();assert.notEqual((await chipState(todayLabel)).color,normal.color);assert.equal(await today.evaluate(n=>getComputedStyle(n).backgroundColor),todayBg);}
   await page.mouse.move(0,0);await today.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await todayLabel.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
   if(chipShots){fs.mkdirSync(chipShots,{recursive:true});await page.screenshot({path:path.join(chipShots,'today-'+width+'.png')});await row.scrollIntoViewIfNeeded();if(width===1280)await label.hover();await page.screenshot({path:path.join(chipShots,'top5-'+width+'.png')});}
   const songs=page.locator('.today-release-songs');assert.equal(await songs.locator('a').count(),19);assert.equal(await songs.locator('a:visible').count(),3);const more=songs.locator('details');assert.equal(await more.locator('summary').innerText(),'残り16曲を見る');await activate(more.locator('summary'));assert.equal(await songs.locator('a:visible').count(),19);await activate(more.locator('summary'));assert.equal(await songs.locator('a:visible').count(),3);
   const toggle=page.locator('[data-today-event="EV0354"]'),panel=page.locator('#today-songs-EV0354');assert.equal(await toggle.getAttribute('aria-expanded'),'false');await activate(toggle);await panel.locator('a').first().waitFor();assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await panel.locator('a').first().getAttribute('href'),'song/S077.html');assert.equal(await panel.locator('.mus-link-chevron').count(),1);await activate(toggle);assert.equal(await panel.isVisible(),false);await activate(toggle);assert.equal(await panel.isVisible(),true);assert.equal(await panel.locator('a').count(),1);
   for(const [selector,href,keyboard] of [['#todayContent a[href="release/R0089.html"]','release/R0089.html',false],['.today-release-song a','song/'+chipBox.includedSongs[0].songId+'.html',false],['.today-event-entry a.today-item','event.html?id=EV0354',false],['#topSongs .home-ranking-row','song/'+chipTop[0].songId+'.html',true]]){const link=page.locator(selector).first(),target=new URL(href,baseUrl+'/').href;await page.route(u=>u.href===target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>QA navigation boundary</title>'}));const dest=page.waitForURL(target);if(keyboard){await link.focus();await page.keyboard.press('Enter');}else await activate(link);await dest;assert.equal(page.url(),target);await page.goBack({waitUntil:'domcontentloaded'});await chipReady(page);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(issues,[]);
  }catch(e){if(chipShots){fs.mkdirSync(chipShots,{recursive:true});fs.writeFileSync(path.join(chipShots,'FAIL-'+width+'-behaviour.html'),await page.content());await page.screenshot({path:path.join(chipShots,'FAIL-'+width+'-behaviour.png'),fullPage:true}).catch(()=>{});}throw e;}finally{await page.close();}
 });
 test('Today/TOP5 long titles wrap with adjacent chips; missing IDs have no link '+width,async()=>{
  const long='長い作品名・曲名の折り返し LongUnbrokenTitle'.repeat(8),top=chipTop.map((x,i)=>i?x:{...x,songName:long});const {page,issues}=await openHome({releases:[{...chipBox,releaseName:long}],events:[{eventName:'リンク先のないイベント',date:'2016-01-01'}],firstPerformedSongs:[{songName:'リンク先のない曲'}],lastPerformedSongs:[]},{width,height:900},{topSongs:top});try{await chipReady(page);const titles=page.locator('#todayContent .today-group');const missingEvent=titles.filter({has:page.getByRole('heading',{name:'この日に開催されたイベント'})}),missingSong=titles.filter({has:page.getByRole('heading',{name:'この日に初披露された曲'})});assert.equal(await missingEvent.locator('a,.mus-link-chevron,button').count(),0);assert.equal(await missingSong.locator('a,.mus-link-chevron').count(),0);const tails=await page.locator('#todayContent a.today-item .mus-title-tail,#topSongs .home-ranking-row:first-child .mus-title-tail').evaluateAll(ns=>ns.map(n=>{const range=document.createRange();range.selectNodeContents(n.firstChild);const t=range.getBoundingClientRect(),a=n.querySelector('.mus-link-chevron').getBoundingClientRect();return {right:a.right,width:innerWidth,sameLine:Math.abs(a.y+a.height/2-t.y-t.height/2)<5,adjacent:a.x-t.right>=7&&a.x-t.right<=9,inside:n.closest('a').scrollWidth<=n.closest('a').clientWidth+1};}));assert.ok(tails.every(x=>x.right<=x.width+1&&x.sameLine&&x.adjacent&&x.inside),JSON.stringify(tails));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await page.locator('#topSongs .home-ranking-count').allTextContents(),chipTop.map(x=>x.performanceCount.toLocaleString('ja-JP')+'回'));assert.deepEqual(issues,[]);if(chipShots){await page.locator('#topSongs').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(chipShots,'long-top5-'+width+'.png')});}}catch(e){if(chipShots){fs.mkdirSync(chipShots,{recursive:true});fs.writeFileSync(path.join(chipShots,'FAIL-'+width+'-long.html'),await page.content());await page.screenshot({path:path.join(chipShots,'FAIL-'+width+'-long.png'),fullPage:true}).catch(()=>{});}throw e;}finally{await page.close();}
 });
}
