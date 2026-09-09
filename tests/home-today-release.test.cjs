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

async function installApiFixture(page, todayOverrides) {
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    const action = url.searchParams.get("action");
    let data = {};
    if (action === "revision") data = { dataRevision: REVISION };
    if (action === "home") data = homeData(todayOverrides);
    if (action === "release") data = { releaseId: url.searchParams.get("id"), releaseDate: "2012-09-05", releaseName: "Wonderful Rush", classification: "CD", releaseType: "シングル", sourceMedia: "CD", officialReleaseUrl: "", todayEligible: true, note: "", relatedEvents: [], debutSongs: [] };
    return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, generatedAt: "2026-09-05T00:00:00+09:00", data })});` });
  });
}

async function openHome(todayOverrides, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
  await installApiFixture(page, todayOverrides);
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
  const item = page.locator('#todayContent a[href="release.html?id=R0015"]');
  assert.match(await item.innerText(), /発売から14周年.*Wonderful Rush.*2012年｜CD/s);
  assert.doesNotMatch(await item.innerText(), /R0015|シングル/);
  await item.click();
  await page.locator("#releaseName").waitFor({ timeout: 45000 });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator('#todayContent a[href="release.html?id=R0015"]').waitFor({ timeout: 45000 });
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

test("API順の先頭6件、長文・escape・全viewportを維持する", async () => {
  const releases = Array.from({ length: 7 }, (_, index) => release(`R${String(index + 1).padStart(4, "0")}`, {
    releaseName: index === 0 ? "「ラブライブ！The School Idol Movie」特典付前売券第3弾 ユニットシングル Printemps「MUSEUMでどうしたい？」<script>window.__xss=1</script>" : `作品${index + 1}`,
    classification: index === 1 ? "<img src=x onerror=window.__xss=2>" : index === 2 ? "Blu-ray" : "CD"
  }));
  const { page, issues } = await openHome({ releases }, { width: 390, height: 900 });
  const items = page.locator("#todayContent .today-group").first().locator(".today-item");
  assert.equal(await items.count(), 6);
  assert.deepEqual(await items.evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id"))), ["R0001", "R0002", "R0003", "R0004", "R0005", "R0006"]);
  assert.equal(await page.locator("#todayContent script, #todayContent img").count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  for (const width of [1440, 1280, 1024, 900, 768, 620, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
  }
  assert.deepEqual(issues, []);
  await page.close();
});
