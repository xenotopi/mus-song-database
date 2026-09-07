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
  await page.getByRole("button", { name: "すべて", exact: true }).click();
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

test("APIエラーを表示し、再試行で復旧する", async () => {
  const page = await browser.newPage();
  await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=releaseList/, route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto(`${baseUrl}/releases.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#retryButton").waitFor({ state: "visible", timeout: 45000 });
  assert.match(await page.locator("#status").innerText(), /取得できませんでした/);
  await page.unroute(/script\.google(?:usercontent)?\.com\/.*[?&]action=releaseList/);
  await page.locator("#retryButton").click();
  await page.locator("#allReleasesSection").waitFor({ state: "visible", timeout: 45000 });
  assert.equal(await page.locator("#totalReleasesChip").innerText(), "全90件");
  await page.close();
});
