"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const revision = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "current.json"), "utf8")).revision;
const newerRevision = `sha256-${"b".repeat(64)}`;
let server;
let browser;
let baseUrl;

function pair(name, dataRevision) {
  return {
    event: {
      eventId: "EV0001", eventName: name, date: "2012-02-19", category: "公式",
      eventType: "ライブ", day: "", performance: "", note: "", venue: null,
      statistics: { songCount: 1, uniqueSongCount: 1, totalSingerCount: 9, averageSingerCount: 9 },
      songOrderIsSetlist: false, songs: [{ songId: "S001", songName: "僕らのLIVE 君とのLIFE", singer: "μ's", singerId: "SN0001", type: "公式" }],
      relatedReleases: [], navigation: { previous: null, next: null, events: [], totalCount: 1 },
      _cache: { revision: dataRevision }
    },
    discover: {
      eventId: "EV0001", firstPerformedSongs: [{ songId: "S001", songName: "僕らのLIVE 君とのLIFE" }],
      lastPerformedSongs: [], uniqueSongs: [], _cache: { revision: dataRevision }
    }
  };
}

function jsonp(route, data) {
  const callback = new URL(route.request().url()).searchParams.get("callback");
  return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data })});` });
}

async function openEvent({ staticValid = true, revisionValue = revision, blockApi = false, fresh = false, width = 1280 }) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const calls = [];
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/data/snapshots/**/events/EV0001.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(staticValid ? { snapshot: { revision }, data: pair("Static Event", revision) } : {})
  }));
  await page.route(/script\.google(?:usercontent)?\.com\//, async route => {
    const action = new URL(route.request().url()).searchParams.get("action");
    calls.push(action);
    if (blockApi) return route.abort();
    if (action === "revision") return jsonp(route, { dataRevision: revisionValue });
    if (fresh) await new Promise(resolve => setTimeout(resolve, 400));
    const latest = pair("Fresh Event", revisionValue);
    if (action === "event") return jsonp(route, latest.event);
    if (action === "discover") return jsonp(route, latest.discover);
    return route.abort();
  });
  await page.goto(`${baseUrl}/event.html?id=EV0001`, { waitUntil: "domcontentloaded" });
  return { page, calls, pageErrors };
}

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "event.html" : pathname.replace(/^\/+/, ""));
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    response.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
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

test("latest Static renders Event and discover before revision, with no detail JSONP", async () => {
  const { page, calls, pageErrors } = await openEvent({ width: 1280 });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  assert.equal(await page.locator("#eventName").innerText(), "Static Event");
  assert.equal(await page.locator("#firstEventCount").innerText(), "1曲");
  await page.waitForTimeout(200);
  assert.equal(calls.filter(action => action === "event" || action === "discover").length, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test("blocked JSONP leaves complete Static visible at 390px", async () => {
  const { page, calls, pageErrors } = await openEvent({ blockApi: true, width: 390 });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  assert.equal(await page.locator("#eventName").innerText(), "Static Event");
  assert.equal(await page.locator("#firstEventCount").innerText(), "1曲");
  assert.equal(calls.filter(action => action === "event" || action === "discover").length, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test("stale Static appears first and updates both datasets without resetting the song filter", async () => {
  const { page, calls, pageErrors } = await openEvent({ revisionValue: newerRevision, fresh: true });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  assert.equal(await page.locator("#eventName").innerText(), "Static Event");
  await page.locator('[data-filter="first"]').click();
  await page.waitForFunction(() => document.querySelector("#eventName")?.textContent === "Fresh Event");
  assert.equal(await page.locator("#firstEventCount").innerText(), "1曲");
  assert.equal(await page.locator('[data-filter="first"]').getAttribute("class").then(value => value.includes("active")), true);
  assert.equal(calls.filter(action => action === "event").length, 1);
  assert.equal(calls.filter(action => action === "discover").length, 1);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test("invalid Static falls back to API, and blocked API reaches the existing error state", async () => {
  const success = await openEvent({ staticValid: false });
  await success.page.waitForFunction(() => document.querySelector("#eventName")?.textContent === "Fresh Event");
  assert.equal(await success.page.locator("#firstEventCount").innerText(), "1曲");
  await success.page.close();
  const failure = await openEvent({ staticValid: false, blockApi: true });
  await failure.page.waitForFunction(() => document.querySelector("#eventName")?.textContent === "イベントデータを表示できません");
  assert.deepEqual(failure.pageErrors, []);
  await failure.page.close();
});
