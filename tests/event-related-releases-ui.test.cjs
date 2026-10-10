"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

let browser;
let server;
let baseUrl;

function findWindowsBrowser() {
  return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].find(candidate => fs.existsSync(candidate)) || "";
}

async function launchBrowser() {
  const options = { headless: true };
  const explicitExecutable = String(process.env.MUSDB_E2E_EXECUTABLE_PATH || "").trim();
  const explicitChannel = String(process.env.MUSDB_E2E_BROWSER_CHANNEL || "").trim();
  if (explicitExecutable) options.executablePath = explicitExecutable;
  else if (explicitChannel && explicitChannel !== "chromium") options.channel = explicitChannel;
  else if (!explicitChannel) {
    const windowsBrowser = findWindowsBrowser();
    if (windowsBrowser) options.executablePath = windowsBrowser;
  }
  return chromium.launch(options);
}

function eventFixture(relatedReleases, overrides = {}) {
  return {
    eventId: "EV0029",
    eventName: "Fixture Event",
    date: "2014-02-09",
    category: "公式",
    eventType: "公式ライブ",
    day: "Day2",
    performance: "",
    note: "",
    venue: null,
    statistics: {
      songCount: 1,
      uniqueSongCount: 1,
      totalSingerCount: 9,
      averageSingerCount: 9
    },
    songOrderIsSetlist: false,
    songOrderNote: "掲載順は実際の歌唱順ではありません。",
    songs: [{
      songId: "S032",
      songName: "Wonderful Rush",
      singer: "μ's",
      singerDisplayName: "μ's",
      singerCategory: "公式",
      type: "公式",
      note: ""
    }],
    relatedReleases,
    navigation: { previous: null, next: null, events: [], totalCount: 1 },
    _cache: { revision: "event-release-test" },
    ...overrides
  };
}

function jsonp(route, data) {
  const callback = new URL(route.request().url()).searchParams.get("callback");
  return route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: `${callback}(${JSON.stringify({ success: true, data })});`
  });
}

async function openEvent(relatedReleases, viewport = { width: 1280, height: 900 }, eventOverrides = {}, discoverOverrides = {}) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  const actions = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
  await page.route("**/data/snapshots/**/events/EV0029.json", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");
    actions.push(action);
    if (action === "revision") return jsonp(route, { dataRevision: "event-release-test" });
    if (action === "event") return jsonp(route, eventFixture(relatedReleases, eventOverrides));
    if (action === "discover") return jsonp(route, { uniqueSongs: [], firstPerformedSongs: [], lastPerformedSongs: [], _cache: { revision: "event-release-test" }, ...discoverOverrides });
    return jsonp(route, []);
  });
  await page.goto(`${baseUrl}/event.html?id=EV0029`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainContent").waitFor({ state: "visible", timeout: 30000 });
  return { page, issues, actions };
}

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "event.html" : pathname.replace(/^\/+/, ""));
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8`,
      "cache-control": "no-store"
    });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

test("0件・非Arrayでは基本情報に関連リリース行を作らない", async () => {
  for (const value of [[], null, {}]) {
    const { page, issues } = await openEvent(value);
    assert.equal(await page.locator("#eventInfo dt").filter({ hasText: "関連リリース" }).count(), 0);
    assert.equal(await page.locator("#relatedReleasesSection").count(), 0);
    assert.match(await page.locator("#songList").innerText(), /Wonderful Rush/);
    assert.deepEqual(issues, []);
    await page.close();
  }
});

test("1件を基本情報内のReleaseリンクで表示する", async () => {
  const release = {
    releaseId: "R0041",
    releaseDate: "2014-07-23",
    releaseName: "ラブライブ！μ's →NEXT LoveLive! 2014～ENDLESS PARADE～",
    classification: "Blu-ray",
    releaseType: "ライブBlu-ray",
    relation: "収録公演"
  };
  const { page, issues, actions } = await openEvent([release]);
  const section = page.locator("#eventInfo");
  const text = await section.innerText();
  assert.match(text, /関連リリース/);
  assert.match(text, new RegExp(release.releaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(text.includes("R0041"), false);
  assert.match(new URL(await section.locator('a[href^="release/"]').getAttribute("href"), baseUrl).pathname, /\/release\/R0041\.html$/);
  assert.equal(actions.filter(action => action === "release" || action === "releaseList").length, 0);
  assert.deepEqual(issues, []);
  await page.close();
});

test("複数件はAPI順のまま全件表示し、欠損メタだけ省略する", async () => {
  const releases = [
    { releaseId: "R0003", releaseDate: "", releaseName: "最後に届く長いリリース名".repeat(8), classification: "", releaseType: "", relation: "" },
    { releaseId: "R0001", releaseDate: "2020-01-01", releaseName: "先頭", classification: "CD", releaseType: "シングル", relation: "収録公演" },
    { releaseId: "R0002", releaseDate: "2020-01-02", releaseName: "中央", classification: "Blu-ray", releaseType: "ライブBlu-ray", relation: "収録公演" }
  ];
  const { page, issues } = await openEvent(releases, { width: 390, height: 900 });
  assert.deepEqual(
    await page.locator('#eventInfo a[href^="release/"]').evaluateAll(nodes => nodes.map(node => /\/release\/(R\d{4})\.html$/.exec(new URL(node.href).pathname)?.[1])),
    ["R0003", "R0001", "R0002"]
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(issues, []);
  await page.close();
});

test("不正IDを除外し、外部文字列をescapeする", async () => {
  const { page, issues } = await openEvent([
    { releaseId: "INVALID", releaseName: "不正", relation: "" },
    { releaseId: "R0041", releaseName: "<script>window.__xss=1</script>", relation: "<img src=x onerror=window.__xss=2>", classification: "CD", releaseType: "シングル" }
  ]);
  assert.equal(await page.locator('#eventInfo a[href^="release/"]').count(), 1);
  assert.equal(await page.locator("#eventInfo script, #eventInfo img").count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.locator("#eventInfo").innerText(), /<script>/);
  assert.deepEqual(issues, []);
  await page.close();
});

test("主要viewportで横overflowがなく通常a要素で遷移できる", async () => {
  const releases = [{ releaseId: "R0041", releaseDate: "2014-07-23", releaseName: "長いリリース名".repeat(20), classification: "Blu-ray", releaseType: "ライブBlu-ray", relation: "収録公演" }];
  const { page, issues } = await openEvent(releases);
  for (const width of [1440, 1280, 1024, 900, 768, 620, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
  }
  const link = page.locator('#eventInfo a[href^="release/"]');
  assert.equal(await link.evaluate(node => node.tagName), "A");
  await link.focus();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("href")?.startsWith("release/")), true);
  assert.deepEqual(issues, []);
  await page.close();
});

test("情報量の多い公式ライブは基本情報→披露曲→歌唱名義→記録の順で表示する", async () => {
  const songs = [
    { songId: "S001", songName: "曲A", singerId: "SN0001", singer: "μ's", singerDisplayName: "μ's", type: "公式" },
    { songId: "S002", songName: "曲B", singerId: "SN0002", singer: "新田恵海", singerDisplayName: "新田恵海", type: "公式" }
  ];
  const { page, issues } = await openEvent(
    [{ releaseId: "R0041", releaseName: "関連Blu-ray" }],
    { width: 1280, height: 900 },
    { eventId: "EV0001", eventName: "First LoveLive! 型fixture", venue: { venueId: "VE0001", venueName: "会場A", prefectureCity: "横浜市" }, songs },
    { firstPerformedSongs: [{ songId: "S001", songName: "曲A" }], lastPerformedSongs: [{ songId: "S002", songName: "曲B" }], uniqueSongs: [] }
  );
  await page.locator("#eventInsightsSection").waitFor({ state: "visible" });
  assert.deepEqual(await page.locator("#mainContent, #songsSection, #eventPerformersSection, #eventInsightsSection").evaluateAll(nodes => nodes.map(node => node.id)), ["mainContent", "songsSection", "eventPerformersSection", "eventInsightsSection"]);
  assert.equal(await page.locator('#eventInfo a[href="venue.html?id=VE0001"]').count(), 1);
  assert.equal(await page.locator('#eventInfo a[href="release/R0041.html"]').count(), 1);
  assert.equal(await page.locator('#eventInfo a[href="singer.html?id=SN0001"]').count(), 1);
  assert.equal(await page.locator('#eventInfo a[href="singer.html?id=SN0002"]').count(), 1);
  assert.equal(await page.locator("#songList .event-song-row").count(), 2);
  await page.locator('[data-filter="first"]').click();
  assert.equal(await page.locator("#songList .event-song-row").count(), 1);
  assert.deepEqual(await page.locator("#performerList .performer-row").evaluateAll(nodes => nodes.map(node => [node.querySelector(".performer-name").textContent.trim(), node.querySelector(".performer-count").textContent.trim()]).sort((a, b) => a[0].localeCompare(b[0], "ja"))), [["新田恵海", "1曲"], ["μ's", "1曲"]].sort((a, b) => a[0].localeCompare(b[0], "ja")));
  assert.equal(await page.locator("#firstEventCount").innerText(), "1曲");
  assert.equal(await page.locator("#lastEventCount").innerText(), "1曲");
  assert.equal(await page.locator("#uniqueEventCount").innerText(), "0曲");
  assert.equal(await page.locator("#relatedReleasesSection, #venueSection, #discoverySection, #eventRecordsSection").count(), 0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
  }
  assert.deepEqual(issues, []);
  await page.close();
});

test("少数曲のイベントは欠損項目を増やさず、記録0件を簡潔に表示する", async () => {
  const { page, issues } = await openEvent([], { width: 390, height: 900 });
  await page.locator("#eventInsightsSection").waitFor({ state: "visible" });
  assert.equal(await page.locator("#eventInfo dt").filter({ hasText: "会場" }).count(), 0);
  assert.equal(await page.locator("#eventInfo dt").filter({ hasText: "関連リリース" }).count(), 0);
  assert.equal(await page.locator('#eventInfo a[href^="singer.html"]').count(), 1);
  assert.equal(await page.locator("#eventInsightsSection .event-insight-card").count(), 3);
  assert.equal(await page.locator("#eventInsightsSection .empty").count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(issues, []);
  await page.close();
});
