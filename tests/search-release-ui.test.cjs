"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const LONG_NAME = "「ラブライブ！The School Idol Movie」特典付前売券第3弾 ユニットシングル Printemps「MUSEUMでどうしたい？」";
let server;
let browser;
let baseUrl;

function searchData(query) {
  const empty = { singers: [], songs: [], releases: [], events: [], venues: [] };
  if (query === "missing") {
    return { query, results: { singers: [], songs: [], events: [], venues: [] }, counts: { singers: 0, songs: 0, releases: 0, events: 0, venues: 0 }, totalCount: 0, _cache: { revision: "search-release-test" } };
  }
  if (query === "none") {
    return { query, results: empty, counts: { singers: 0, songs: 0, releases: 0, events: 0, venues: 0 }, totalCount: 0, _cache: { revision: "search-release-test" } };
  }
  const fixtures = {
    "SUNNY DAY SONG": { releaseId: "R0058", releaseName: "SUNNY DAY SONG／？←HEARTBEAT", releaseDate: "2015-07-08", classification: "CD", releaseType: "シングル" },
    "μ's Best Album Best Live! Collection": { releaseId: "R0060", releaseName: "μ's Best Album Best Live! Collection", releaseDate: "2013-01-09", classification: "CD", releaseType: "ベストアルバム" },
    "Solo Live!": { releaseId: "R0061", releaseName: "ラブライブ！Solo Live! from μ's 南ことり", releaseDate: "2011-12-14", classification: "CD", releaseType: "Solo Live!" },
    "ラジオCD": { releaseId: "R0088", releaseName: "ラブライブ！μ's広報部～にこりんぱな～ vol.7", releaseDate: "2016-01-27", classification: "CD", releaseType: "ラジオCD" },
    "ライブBlu-ray": { releaseId: "R0072", releaseName: "ラブライブ！μ's 3rd Anniversary LoveLive! Blu-ray", releaseDate: "2013-12-25", classification: "Blu-ray", releaseType: "ライブBlu-ray" }
  };
  const releases = query === "long"
    ? [{ releaseId: "R0054", releaseName: `${LONG_NAME}<script>window.__xss=1</script>`, releaseDate: "2015-05-23", classification: "特典", releaseType: "前売券特典", matchAlias: "" }]
    : [{ ...(fixtures[query] || { releaseId: "R0015", releaseName: "Wonderful Rush", releaseDate: "2012-09-05", classification: "CD", releaseType: "シングル" }), matchAlias: "" }];
  const songs = query === "Wonderful Rush"
    ? [{ songId: "S032", songName: "Wonderful Rush", displayName: "Wonderful Rush", matchAlias: "" }]
    : query === "SUNNY DAY SONG" ? [{ songId: "S100", songName: "SUNNY DAY SONG", displayName: "SUNNY DAY SONG", matchAlias: "" }] : [];
  return { query, results: { singers: [{ singerId: "SN0001", displayName: "μ's", matchAlias: "" }], songs, releases, events: [{ eventId: "EV0001", eventName: "First LoveLive!", matchAlias: "" }], venues: [{ venueId: "VE0001", venueName: "会場", matchAlias: "" }] }, counts: { singers: 1, songs: songs.length, releases: 1, events: 1, venues: 1 }, totalCount: 4 + songs.length, _cache: { revision: "search-release-test" } };
}

async function installApiFixture(page) {
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    const action = url.searchParams.get("action");
    const data = action === "revision" ? { dataRevision: "search-release-test" } : searchData(url.searchParams.get("q") || "");
    return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, apiVersion: "test", generatedAt: "2026-09-09T00:00:00+09:00", data })});` });
  });
}

async function openPage(pathname, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
  await installApiFixture(page);
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
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

test("検索ページはSongとReleaseを区別し、ReleaseタブとURLを提供する", async () => {
  const { page, issues } = await openPage("/search.html?q=Wonderful%20Rush");
  await page.locator(".result-type.release").waitFor();
  assert.equal(await page.locator('[data-tab="releases"]').count(), 1);
  assert.equal(await page.locator(".result-type.song").count(), 1);
  assert.equal(await page.locator(".result-type.release").count(), 1);
  assert.equal(await page.locator('.result-row[href="release.html?id=R0015"]').count(), 1);
  assert.match(await page.locator('.result-row[href="release.html?id=R0015"] .result-meta').innerText(), /2012\/09\/05.*CD.*シングル/s);
  assert.equal(await page.locator("#summaryCount").innerText(), "5件");
  await page.locator('[data-tab="releases"]').click();
  assert.equal(await page.locator(".result-section").count(), 1);
  assert.match(await page.locator(".result-head").innerText(), /リリース.*1件/s);
  assert.deepEqual(issues, []);
  await page.close();
});

test("長いRelease名はescapeされ、390pxでoverflowしない", async () => {
  const { page, issues } = await openPage("/search.html?q=long", { width: 390, height: 844 });
  await page.locator(".result-type.release").waitFor();
  assert.equal(await page.locator(".result-title script").count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.locator(".result-title").allInnerTexts().then(values => values.join(" ")), /MUSEUMでどうしたい/);
  for (const width of [1440, 1280, 1080, 1024, 900, 768, 620, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
  }
  assert.deepEqual(issues, []);
  await page.close();
});

test("同名・Release固有名・releaseTypeをAPI結果どおり表示する", async () => {
  const cases = [
    ["SUNNY DAY SONG", "S100", "R0058"],
    ["μ's Best Album Best Live! Collection", "", "R0060"],
    ["Solo Live!", "", "R0061"],
    ["ラジオCD", "", "R0088"],
    ["ライブBlu-ray", "", "R0072"]
  ];
  for (const [query, songId, releaseId] of cases) {
    const { page, issues } = await openPage(`/search.html?q=${encodeURIComponent(query)}`);
    await page.locator(".result-type.release").waitFor();
    assert.equal(await page.locator(`.result-row[href="release.html?id=${releaseId}"]`).count(), 1);
    if (songId) assert.equal(await page.locator(`.result-row[href="song.html?id=${songId}"]`).count(), 1);
    assert.deepEqual(issues, []);
    await page.close();
  }
});

test("Release 0件とresults.releases欠損を安全に扱う", async () => {
  for (const query of ["none", "missing"]) {
    const { page, issues } = await openPage(`/search.html?q=${query}`);
    await page.locator('[data-tab="releases"]').click();
    await page.locator(".empty-state").waitFor();
    assert.match(await page.locator(".empty-state").innerText(), /候補が見つかりませんでした/);
    assert.deepEqual(issues, []);
    await page.close();
  }
});

test("共通ヘッダー候補はRelease最大1件、全体最大6件、キーボード遷移を維持する", async () => {
  const { page, issues } = await openPage("/about.html", { width: 390, height: 844 });
  const input = page.locator("#globalSearchInput");
  await input.fill("Wonderful Rush");
  await page.locator(".global-suggest-item").first().waitFor();
  assert.ok(await page.locator(".global-suggest-item").count() <= 6);
  assert.equal(await page.locator(".global-suggest-type.release").count(), 1);
  assert.equal(await page.locator('.global-suggest-item[href="song.html?id=S032"]').count(), 1);
  assert.equal(await page.locator('.global-suggest-item[href="release.html?id=R0015"]').count(), 1);
  await input.press("ArrowDown");
  assert.equal(await page.locator(".global-suggest-item.active").count(), 1);
  await input.press("Escape");
  assert.equal(await page.locator("#globalSearchSuggestions").isHidden(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(issues, []);
  await page.close();
});
