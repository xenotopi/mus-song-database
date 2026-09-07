"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
let server;
let browser;
let baseUrl;

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "release.html" : pathname.replace(/^\/+/, ""));
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

async function openDetail(id, options = {}) {
  const page = await browser.newPage({ viewport: options.viewport || { width: 1280, height: 900 } });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/release.html${id == null ? "" : `?id=${encodeURIComponent(id)}`}`, { waitUntil: "domcontentloaded" });
  return { page, issues };
}

async function waitForDetail(page) {
  await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
}

function jsonpResult(route, data) {
  const url = new URL(route.request().url());
  const callback = url.searchParams.get("callback");
  return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, apiVersion: "test", generatedAt: "2026-09-07T00:00:00+09:00", data })});` });
}

test("Release詳細", async t => {
  await t.test("R0015とR0058の複数debutSongs・公式URL", async () => {
    for (const expected of [
      { id: "R0015", name: "Wonderful Rush", date: "2012/09/05", songs: ["S032", "S033"] },
      { id: "R0058", name: "SUNNY DAY SONG／？←HEARTBEAT", date: "2015/07/08", songs: ["S100", "S101"] }
    ]) {
      const { page, issues } = await openDetail(expected.id);
      await waitForDetail(page);
      assert.equal(await page.locator("#releaseName").innerText(), expected.name);
      assert.match(await page.locator("#releaseInfo").innerText(), new RegExp(expected.date.replaceAll("/", "\\/")));
      assert.deepEqual((await page.locator(".release-song-row").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id")))).sort(), expected.songs);
      const official = page.locator(".release-official-link");
      assert.equal(await official.getAttribute("target"), "_blank");
      assert.equal(await official.getAttribute("rel"), "noopener noreferrer");
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("R0054長文と各viewportでoverflowなし", async () => {
    const { page, issues } = await openDetail("R0054");
    await waitForDetail(page);
    assert.match(await page.locator("#releaseName").innerText(), /MUSEUMでどうしたい/);
    for (const width of [1080, 900, 620, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
    }
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("R0068のdebutSongs 0件は正常な空状態", async () => {
    const { page, issues } = await openDetail("R0068");
    await waitForDetail(page);
    assert.equal(await page.locator(".release-songs-empty").innerText(), "このリリースを初出・由来とする登録曲はありません");
    assert.doesNotMatch(await page.locator("body").innerText(), /収録曲なし|曲情報がありません/);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("URLなし・発売日なし・非表示項目・HTML escape", async () => {
    const { page, issues } = await openDetail("R9001");
    await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/, route => jsonpResult(route, {
      releaseId: "R9001", releaseDate: "", releaseName: "<img src=x onerror=alert(1)> 長いテスト作品", classification: "その他", sourceMedia: "テスト媒体", officialReleaseUrl: "", todayEligible: true, note: "SECRET_INTERNAL_NOTE", debutSongs: []
    }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForDetail(page);
    const body = await page.locator("body").innerText();
    assert.match(body, /発売日未登録/);
    assert.match(body, /公式作品ページは未登録です/);
    assert.doesNotMatch(body, /R9001|SECRET_INTERNAL_NOTE|todayEligible/);
    assert.equal(await page.locator("#releaseName img").count(), 0);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("idなし・形式不正ではAPIを呼ばない", async () => {
    for (const id of [null, "ABC"]) {
      const { page } = await openDetail(id);
      let releaseCalls = 0;
      await page.route(/script\.google(?:usercontent)?\.com\//, route => { if (new URL(route.request().url()).searchParams.get("action") === "release") releaseCalls += 1; return route.continue(); });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#status.error").waitFor({ state: "visible" });
      assert.match(await page.locator("#releaseName").innerText(), id == null ? /指定されていません/ : /形式が正しくありません/);
      assert.equal(await page.locator("#retryButton").count(), 0);
      assert.equal(releaseCalls, 0);
      await page.close();
    }
  });

  await t.test("存在しないIDはnot-foundで再試行なし", async () => {
    const { page, issues } = await openDetail("R9999");
    await page.locator("#status.error").waitFor({ state: "visible", timeout: 45000 });
    assert.equal(await page.locator("#releaseName").innerText(), "該当するリリースが見つかりません");
    assert.equal(await page.locator("#retryButton").count(), 0);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("APIエラー後の再試行で復旧", async () => {
    const { page } = await openDetail("R0015");
    await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/, route => route.fulfill({ status: 503, body: "unavailable" }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#retryButton").waitFor({ state: "visible", timeout: 45000 });
    assert.equal(await page.locator("#releaseName").innerText(), "リリースデータを表示できません");
    await page.unroute(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/);
    await page.locator("#retryButton").click();
    await waitForDetail(page);
    assert.equal(await page.locator("#releaseName").innerText(), "Wonderful Rush");
    await page.close();
  });

  await t.test("一覧から詳細、詳細から一覧へ遷移", async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/releases.html?q=Wonderful%20Rush`, { waitUntil: "domcontentloaded" });
    await page.locator(".release-list-card").waitFor({ state: "visible", timeout: 45000 });
    await page.locator(".release-list-card").click();
    await page.waitForURL(/release\.html\?id=R0015/);
    await waitForDetail(page);
    await page.locator(".release-back").click();
    await page.waitForURL(/releases\.html$/);
    await page.close();
  });
});
