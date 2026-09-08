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
let releaseFixture = [];

async function loadReleaseFixture() {
  const apiSource = fs.readFileSync(path.join(ROOT, "assets", "js", "api.js"), "utf8");
  const match = apiSource.match(/export\s+const\s+API_URL\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "active Public API URLを取得できること");
  const url = new URL(match[1]);
  url.searchParams.set("action", "releaseList");
  url.searchParams.set("fresh", "1");
  const response = await fetch(url);
  assert.equal(response.status, 200, "releaseList HTTP 200");
  const json = await response.json();
  assert.equal(json.success, true, "releaseList success");
  assert.equal(Array.isArray(json.data), true, "releaseList data array");
  return json.data;
}

async function installApiFixture(page) {
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    const action = url.searchParams.get("action");
    const data = action === "revision" ? { dataRevision: "release-list-test" } : action === "releaseList" ? releaseFixture : {};
    return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, apiVersion: "test", generatedAt: "2026-09-09T00:00:00+09:00", data })});` });
  });
}

test.before(async () => {
  releaseFixture = await loadReleaseFixture();
  assert.equal(releaseFixture.length, 90);
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "releases.html" : pathname.replace(/^\/+/, ""));
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
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

async function openPage(query = "") {
  const page = await browser.newPage();
  const issues = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  await installApiFixture(page);
  await page.goto(`${baseUrl}/releases.html${query}`, { waitUntil: "domcontentloaded" });
  await page.locator("#allReleasesSection").waitFor({ state: "visible", timeout: 45000 });
  return { page, issues };
}

test("releaseList 90件、初期24件、もっと見る、長い名称、escape、390px", async () => {
  const { page, issues } = await openPage();
  assert.equal(await page.locator("#totalReleasesChip").innerText(), "全90件");
  assert.equal(await page.locator(".release-list-card").count(), 24);
  await page.locator("#moreButton").click();
  assert.equal(await page.locator(".release-list-card").count(), 48);
  await page.locator("#releaseSearch").fill("MUSEUMでどうしたい");
  assert.match(await page.locator(".release-list-title").innerText(), /特典付前売券第3弾/);
  assert.equal(await page.locator(".release-list-title script").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(issues, []);
  await page.close();
});

test("新旧順とも日付なし末尾、分類・年・検索・0件", async () => {
  const { page, issues } = await openPage();
  for (const sort of ["new", "old"]) {
    await page.locator("#releaseSort").selectOption(sort);
    await page.locator("#moreButton").click();
    await page.locator("#moreButton").click();
    await page.locator("#moreButton").click();
    const dates = await page.locator(".release-list-date").allTextContents();
    const firstUndated = dates.indexOf("発売日未登録");
    if (firstUndated >= 0) assert.ok(dates.slice(firstUndated).every(value => value === "発売日未登録"));
  }
  await page.getByRole("button", { name: "Blu-ray", exact: true }).click();
  assert.ok((await page.locator(".release-list-category").allTextContents()).every(value => value === "Blu-ray"));
  await page.locator('[data-classification=""]').click();
  await page.locator("#releaseYear").selectOption("2015");
  assert.ok((await page.locator(".release-list-date").allTextContents()).every(value => value.startsWith("2015/")));
  await page.locator("#releaseYear").selectOption("");
  await page.locator("#releaseSearch").fill("Wonderful Rush");
  assert.equal(await page.locator(".release-list-card").count(), 1);
  await page.locator("#releaseSearch").fill("一致しない検索語0123456789");
  assert.equal(await page.locator(".releases-empty").innerText(), "条件に一致するリリースはありません");
  assert.deepEqual(issues, []);
  await page.close();
});

test("queryを復元する", async () => {
  const { page, issues } = await openPage("?q=Wonderful%20Rush&classification=CD&year=2012&sort=old");
  assert.equal(await page.locator("#releaseSearch").inputValue(), "Wonderful Rush");
  assert.equal(await page.locator("#releaseYear").inputValue(), "2012");
  assert.equal(await page.locator("#releaseSort").inputValue(), "old");
  assert.equal(await page.locator('[data-classification="CD"]').getAttribute("class"), "releases-filter-pill active");
  assert.equal(await page.locator(".release-list-card").count(), 1);
  assert.deepEqual(issues, []);
  await page.close();
});

test("大分類とリリース種別を2段階で絞り込む", async () => {
  const { page, issues } = await openPage();
  assert.equal(await page.locator("#resultText").innerText(), "24/90件表示");
  assert.equal(await page.locator("#releaseTypeBlock").isHidden(), true);

  await page.locator('[data-classification="CD"]').click();
  assert.equal(await page.locator("#resultText").innerText(), "24/62件表示");
  assert.equal(await page.locator("#releaseTypeBlock").isVisible(), true);
  assert.deepEqual((await page.locator("[data-release-type]").allTextContents()).map(value => value.trim()), ["すべて", "シングル", "Solo Live!", "ラジオCD", "サウンドトラック", "ベストアルバム", "コンプリートBOX", "企画アルバム"]);
  await page.locator('[data-release-type="シングル"]').click();
  assert.equal(await page.locator("#resultText").innerText(), "24/41件表示");
  assert.equal(new URL(page.url()).searchParams.get("type"), "シングル");
  assert.equal(await page.locator("#moreButton").isVisible(), true);
  await page.locator('[data-release-type="Solo Live!"]').click();
  assert.equal(await page.locator("#resultText").innerText(), "6/6件表示");
  assert.equal(await page.locator("#moreButton").isHidden(), true);

  await page.locator('[data-classification="Blu-ray"]').click();
  assert.equal(await page.locator("#resultText").innerText(), "23/23件表示");
  assert.deepEqual((await page.locator("[data-release-type]").allTextContents()).map(value => value.trim()), ["すべて", "アニメBlu-ray", "劇場版Blu-ray", "ライブBlu-ray", "映像集", "映像BOX"]);
  await page.locator('[data-release-type="ライブBlu-ray"]').click();
  assert.equal(await page.locator("#resultText").innerText(), "5/5件表示");
  assert.deepEqual((await page.locator(".release-list-card").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id")))).sort(), ["R0041", "R0060", "R0069", "R0074", "R0087"]);

  await page.locator('[data-classification="特典"]').click();
  assert.equal(await page.locator("#resultText").innerText(), "5/5件表示");
  assert.deepEqual((await page.locator("[data-release-type]").allTextContents()).map(value => value.trim()), ["すべて", "前売券特典", "全巻購入特典"]);
  await page.locator('[data-release-type="前売券特典"]').click();
  assert.deepEqual((await page.locator(".release-list-card").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id")))).sort(), ["R0054", "R0055", "R0056"]);
  await page.locator('[data-release-type="全巻購入特典"]').click();
  assert.deepEqual((await page.locator(".release-list-card").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id")))).sort(), ["R0032", "R0052"]);
  assert.deepEqual(issues, []);
  await page.close();
});

test("親変更でtype解除、query復元と不正query正規化", async () => {
  let opened = await openPage("?classification=Blu-ray&type=%E3%83%A9%E3%82%A4%E3%83%96Blu-ray");
  assert.equal(await opened.page.locator('[data-release-type="ライブBlu-ray"]').getAttribute("aria-pressed"), "true");
  assert.equal(await opened.page.locator("#resultText").innerText(), "5/5件表示");
  assert.deepEqual(opened.issues, []);
  await opened.page.close();

  for (const query of ["?classification=Blu-ray&type=%E3%82%B7%E3%83%B3%E3%82%B0%E3%83%AB", "?classification=CD&type=INVALID"]) {
    opened = await openPage(query);
    assert.equal(new URL(opened.page.url()).searchParams.has("type"), false);
    assert.match(await opened.page.locator("#resultText").innerText(), query.includes("Blu-ray") ? /23\/23件表示/ : /24\/62件表示/);
    assert.deepEqual(opened.issues, []);
    await opened.page.close();
  }
  opened = await openPage("?type=%E3%82%B7%E3%83%B3%E3%82%B0%E3%83%AB");
  assert.equal(new URL(opened.page.url()).searchParams.has("type"), false);
  assert.equal(await opened.page.locator("#resultText").innerText(), "24/90件表示");
  assert.equal(await opened.page.locator("#releaseTypeBlock").isHidden(), true);
  await opened.page.locator('[data-classification="CD"]').click();
  await opened.page.locator('[data-release-type="シングル"]').click();
  await opened.page.locator('[data-classification="Blu-ray"]').click();
  assert.equal(new URL(opened.page.url()).searchParams.has("type"), false);
  await opened.page.locator('[data-classification=""]').click();
  assert.equal(await opened.page.locator("#releaseTypeBlock").isHidden(), true);
  assert.deepEqual(opened.issues, []);
  await opened.page.close();
});

test("AND条件、pagination reset、全幅responsive", async () => {
  const { page, issues } = await openPage("?q=Wonderful%20Rush&classification=CD&type=%E3%82%B7%E3%83%B3%E3%82%B0%E3%83%AB&year=2012");
  assert.equal(await page.locator(".release-list-card").count(), 1);
  assert.match(await page.locator(".release-list-title").innerText(), /Wonderful Rush/);
  await page.locator("#releaseSearch").fill("");
  await page.locator("#releaseYear").selectOption("");
  await page.locator('[data-classification=""]').click();
  await page.locator("#moreButton").click();
  assert.equal(await page.locator(".release-list-card").count(), 48);
  await page.locator('[data-classification="CD"]').click();
  await page.locator('[data-release-type="シングル"]').click();
  assert.equal(await page.locator("#resultText").innerText(), "24/41件表示");
  for (const width of [1440, 1280, 1080, 1024, 900, 768, 620, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
  }
  assert.deepEqual(issues, []);
  await page.close();
});

test("APIエラーを表示し、再試行で復旧する", async () => {
  const page = await browser.newPage();
  await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=releaseList/, route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto(`${baseUrl}/releases.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#retryButton").waitFor({ state: "visible", timeout: 45000 });
  assert.match(await page.locator("#status").innerText(), /取得できませんでした/);
  await page.unroute(/script\.google(?:usercontent)?\.com\/.*[?&]action=releaseList/);
  await installApiFixture(page);
  await page.locator("#retryButton").click();
  await page.locator("#allReleasesSection").waitFor({ state: "visible", timeout: 45000 });
  assert.equal(await page.locator("#totalReleasesChip").innerText(), "全90件");
  await page.close();
});
