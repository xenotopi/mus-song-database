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

function eventFixture(relatedReleases) {
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
    _cache: { revision: "event-release-test" }
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

async function openEvent(relatedReleases, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  const actions = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");
    actions.push(action);
    if (action === "revision") return jsonp(route, { dataRevision: "event-release-test" });
    if (action === "event") return jsonp(route, eventFixture(relatedReleases));
    if (action === "discover") return jsonp(route, { uniqueSongs: [], firstPerformedSongs: [], lastPerformedSongs: [], _cache: { revision: "event-release-test" } });
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

test("0件・非Arrayでは関連リリースsectionを表示しない", async () => {
  for (const value of [[], null, {}]) {
    const { page, issues } = await openEvent(value);
    assert.equal(await page.locator("#relatedReleasesSection").isHidden(), true);
    assert.match(await page.locator("#songList").innerText(), /Wonderful Rush/);
    assert.deepEqual(issues, []);
    await page.close();
  }
});

test("1件を正式項目とReleaseリンクで表示する", async () => {
  const release = {
    releaseId: "R0041",
    releaseDate: "2014-07-23",
    releaseName: "ラブライブ！μ's →NEXT LoveLive! 2014～ENDLESS PARADE～",
    classification: "Blu-ray",
    releaseType: "ライブBlu-ray",
    relation: "収録公演"
  };
  const { page, issues, actions } = await openEvent([release]);
  const section = page.locator("#relatedReleasesSection");
  assert.equal(await section.isVisible(), true);
  assert.equal(await section.locator("h2").innerText(), "関連リリース");
  const text = await section.innerText();
  for (const expected of [release.releaseName, "2014/07/23", "Blu-ray", "ライブBlu-ray", "収録公演"]) assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(text.includes("R0041"), false);
  assert.equal(new URL(await section.locator("a").getAttribute("href"), baseUrl).searchParams.get("id"), "R0041");
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
    await page.locator(".event-release-row").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id"))),
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
  assert.equal(await page.locator(".event-release-row").count(), 1);
  assert.equal(await page.locator("#relatedReleasesSection script, #relatedReleasesSection img").count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.locator("#relatedReleasesSection").innerText(), /<script>/);
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
  const link = page.locator(".event-release-row");
  assert.equal(await link.evaluate(node => node.tagName), "A");
  await link.focus();
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("event-release-row")), true);
  assert.deepEqual(issues, []);
  await page.close();
});
