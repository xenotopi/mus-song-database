"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "current.json"), "utf8"));
const outputRevision = current.outputRevision || current.revision;
const dataRevision = current.dataRevision || outputRevision;
const newerOutputRevision = `sha256-${"b".repeat(64)}`;
const newerDataRevision = `sha256-${"c".repeat(64)}`;
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

async function openEvent({ staticValid = true, revisionValue = dataRevision, outputRevisionValue = outputRevision, blockApi = false, fresh = false, width = 1280, discoverGate = null, discoverFail = false, discoverOverride = null, emptySongs = false }) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const calls = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const fixture = (name, revision) => {
    const value = pair(name, revision);
    if (discoverOverride) Object.assign(value.discover, discoverOverride);
    if (emptySongs) value.event.songs = [];
    return value;
  };
  await page.route("**/data/snapshots/**/events/EV0001.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(staticValid ? {
      snapshot: { revision: outputRevision, outputRevision, dataRevision },
      data: fixture("Static Event", dataRevision)
    } : {})
  }));
  await page.route(/script\.google(?:usercontent)?\.com\//, async route => {
    const action = new URL(route.request().url()).searchParams.get("action");
    calls.push(action);
    if (blockApi) return route.abort();
    if (action === "revision") return jsonp(route, { dataRevision: revisionValue, outputRevision: outputRevisionValue });
    if (fresh) await new Promise(resolve => setTimeout(resolve, 400));
    const latest = fixture("Fresh Event", revisionValue);
    if (action === "event") return jsonp(route, latest.event);
    if (action === "discover") {
      if (discoverGate) await discoverGate;
      if (discoverFail) return route.fulfill({ contentType: "text/javascript", body: `${new URL(route.request().url()).searchParams.get("callback")}(${JSON.stringify({ success: false, error: "Controlled discover failure" })});` });
      return jsonp(route, latest.discover);
    }
    return route.abort();
  });
  await page.goto(`${baseUrl}/event.html?id=EV0001`, { waitUntil: "domcontentloaded" });
  return { page, calls, pageErrors, consoleErrors };
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

test("relative order is distinct from absolute order and raw order", async () => {
  for (const [eventId, expected, mode] of [
    ["EV0002", ["1", "2"], "relative"],
    ["EV0046", ["1"], "relative"],
    ["EV0092", ["1", "2", "3"], "relative"],
    ["EV0001", Array.from({ length: 18 }, (_, i) => String(i + 1)), "absolute"],
    ["EV0054", ["16", "17", "18", "19", "20", "21"], "absolute"],
    ["EV0103", ["11"], "absolute"],
    ["EV0217", ["21", "22", "22", "22", "22", "22", "22", "23"], "absolute"],
    ["EV0348", ["1"], "raw"]
  ]) for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/script\.google(?:usercontent)?\.com\//, route => route.abort());
    await page.goto(`${baseUrl}/event.html?id=${eventId}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainContent").waitFor({ state: "visible" });
    const labels = await page.locator(".event-song-order").allInnerTexts();
    assert.deepEqual(labels.map(value => value.trim()), expected.map(value => mode === "relative" ? `歌唱順 ${value}` : value));
    const note = await page.locator("#songOrderNote").innerText();
    assert.equal(note.includes("イベント全体の曲順ではなく"), mode === "relative");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test("incomplete relative order falls back to original RAW order", async () => {
  const eventId = "EV0092";
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route(`**/data/snapshots/**/events/${eventId}.json`, async route => {
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.data.event.songs[1].relativePosition = null;
    await route.fulfill({ response, body: JSON.stringify(snapshot) });
  });
  await page.route(/script\.google(?:usercontent)?\.com\//, route => route.abort());
  await page.goto(`${baseUrl}/event.html?id=${eventId}`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  assert.deepEqual((await page.locator(".event-song-order").allInnerTexts()).map(s => s.trim()), ["1", "2", "3"]);
  assert.deepEqual((await page.locator(".event-song-title").allInnerTexts()).map(s => s.trim()), ["KiRa-KiRa Sensation!", "それは僕たちの奇跡", "僕らは今のなかで"]);
  assert.equal((await page.locator("#songOrderNote").innerText()).includes("イベント全体の曲順ではなく"), false);
  await page.close();
});

test("latest Static renders Event and discover before revision, with no detail JSONP", async () => {
  const { page, calls, pageErrors } = await openEvent({ width: 1280 });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  assert.equal(await page.locator("#eventName").innerText(), "Static Event");
  assert.equal(await page.locator("#songList .event-song-badge.first").count(), 1);
  assert.equal(await page.locator('#eventInsightsSection, a[href="#eventInsightsSection"]').count(), 0);
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
  assert.equal(await page.locator("#songList .event-song-badge.first").count(), 1);
  assert.equal(calls.filter(action => action === "event" || action === "discover").length, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test("stale Static appears first and updates both datasets without resetting the song filter", async () => {
  const { page, calls, pageErrors } = await openEvent({ revisionValue: newerDataRevision, outputRevisionValue: newerOutputRevision, fresh: true });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  assert.equal(await page.locator("#eventName").innerText(), "Static Event");
  await page.locator('[data-filter="first"]').click();
  await page.waitForFunction(() => document.querySelector("#eventName")?.textContent === "Fresh Event");
  assert.equal(await page.locator("#songList .event-song-badge.first").count(), 1);
  assert.equal(await page.locator('[data-filter="first"]').getAttribute("class").then(value => value.includes("active")), true);
  assert.equal(calls.filter(action => action === "event").length, 1);
  assert.equal(calls.filter(action => action === "discover").length, 1);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test("invalid Static falls back to API, and blocked API reaches the existing error state", async () => {
  const success = await openEvent({ staticValid: false });
  await success.page.waitForFunction(() => document.querySelector("#eventName")?.textContent === "Fresh Event");
  await success.page.locator("#songList .event-song-badge.first").waitFor();
  assert.equal(await success.page.locator("#songList .event-song-badge.first").count(), 1);
  await success.page.close();
  const failure = await openEvent({ staticValid: false, blockApi: true });
  await failure.page.waitForFunction(() => document.querySelector("#eventName")?.textContent === "イベントデータを表示できません");
  assert.deepEqual(failure.pageErrors, []);
  await failure.page.close();
});

for (const width of [1280, 390]) {
  for (const mode of ["static", "delayed", "failed", "empty"]) test(`Event records removed, discover badges retained ${width} ${mode}`, async () => {
    let releaseDiscover;
    const gate = new Promise(resolve => { releaseDiscover = resolve; });
    const item = { songId: "S001", songName: "僕らのLIVE 君とのLIFE" };
    const badges = mode === "empty" ? [] : [item];
    const c = await openEvent({ width, staticValid: mode === "static" || mode === "empty", discoverGate: mode === "delayed" ? gate : null, discoverFail: mode === "failed", emptySongs: mode === "empty", discoverOverride: { firstPerformedSongs: badges, lastPerformedSongs: badges, uniqueSongs: badges } });
    const { page } = c;
    try {
      await page.locator("#mainContent").waitFor({ state: "visible" });
      assert.equal(await page.locator('#eventInsightsSection, #firstEventSongs, #lastEventSongs, #uniqueEventSongs, #firstEventCount, #lastEventCount, #uniqueEventCount, a[href="#eventInsightsSection"]').count(), 0);
      assert.equal(await page.getByRole("heading", { name: "このイベントの記録", exact: true }).count(), 0);
      assert.equal(await page.locator("#eventPerformersSection").isVisible(), true);
      const note = await page.locator("#songOrderNote").innerText();
      if (mode === "delayed") {
        assert.equal(await page.locator(".event-song-row").count(), 1);
        assert.equal(await page.locator(".event-song-badge").count(), 0);
        await page.locator('[data-filter="first"]').click();
        assert.equal(await page.locator(".event-song-row").count(), 0);
        releaseDiscover();
      }
      if (mode === "static" || mode === "delayed") {
        await page.locator(".event-song-badge.unique").waitFor();
        for (const flag of ["first", "last", "unique"]) {
          assert.equal(await page.locator(".event-song-badge." + flag).count(), 1);
          await page.locator(`[data-filter="${flag}"]`).click();
          assert.equal(await page.locator(".event-song-row").count(), 1);
        }
        await page.locator('[data-filter="all"]').click();
        assert.equal(await page.locator(".event-song-singer-link").innerText(), "μ's");
        assert.equal(await page.locator(".event-song-singer-link").getAttribute("href"), "singer.html?id=SN0001");
        assert.equal(c.calls.filter(a => a === "discover").length, mode === "static" ? 0 : 1);
      } else {
        if (mode === "failed") await page.waitForFunction(() => ![...document.scripts].some(s => /action=discover/.test(s.src)));
        assert.equal(await page.locator(".event-song-badge").count(), 0);
        assert.equal(await page.locator(".event-song-row").count(), mode === "empty" ? 0 : 1);
        for (const flag of ["first", "last", "unique"]) {
          await page.locator(`[data-filter="${flag}"]`).click();
          assert.equal(await page.locator(".event-song-row").count(), 0);
        }
        await page.locator('[data-filter="all"]').click();
        if (mode === "failed") assert.equal(c.calls.filter(a => a === "discover").length, 1);
      }
      assert.equal(await page.locator("#songOrderNote").innerText(), note);
      assert.equal(await page.locator("#status").isHidden(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(c.pageErrors, []);
      assert.deepEqual(c.consoleErrors, []);
    } finally { releaseDiscover(); await page.close(); }
  });
}
