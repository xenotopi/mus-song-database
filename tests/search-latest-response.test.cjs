"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const A = "Snow halation", B = "Wonderful Rush";
let server, browser, baseUrl;

function data(query, label = query) {
  return {
    query,
    results: { singers: [], venues: [],
      songs: [{ songId: query === A ? "S003" : "S032", songName: label }],
      releases: [{ releaseId: "R0015", releaseName: `${label} CD` }],
      events: [{ eventId: "EV0001", eventName: `${label} LIVE` }] },
    counts: { singers: 0, venues: 0, songs: 1, releases: 1, events: 1 }, totalCount: 3
  };
}

test.before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(ROOT, pathname.replace(/^\/+/, "") || "index.html");
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});
test.after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function open(width, { query = "", network = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const issues = [], routes = [];
  page.on("pageerror", e => issues.push(`page: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") issues.push(`console: ${m.text()}`); });
  page.on("requestfailed", r => issues.push(`request: ${r.url()} ${r.failure()?.errorText}`));
  await page.addInitScript(() => {
    window.__searchRequests = [];
    window.__searchCompleted = [];
    window.__searchEvents = [];
    window.__searchRequest = (action, params) => {
      if (action !== "search") throw new Error(`Unexpected action: ${action}`);
      return new Promise((resolve, reject) => window.__searchRequests.push({ query: params.q, resolve, reject }));
    };
  });
  // Only the Search page's apiGet import is intercepted. Real formatting/URL helpers
  // and common header code are retained; no production modules are rewritten.
  await page.route(url => url.origin === baseUrl && url.pathname === "/assets/js/api.js" && url.searchParams.get("cache") === "solo-live-schema", route => route.fulfill({
    contentType: "text/javascript",
    body: `export { buildSongUrl, escapeHtml, formatDate } from "/assets/js/api.js?search-test-real";
      ${network ? 'import { apiGet as realApiGet } from "/assets/js/api.js?search-test-real";' : ""}
      export function apiGet(action, params) {
        return ${network ? "realApiGet(action, params).finally(() => window.__searchCompleted.push(params.q))" : "window.__searchRequest(action, params)"};
      }`
  }));
  await page.route(/script\.google(?:usercontent)?\.com\//, async route => {
    const u = new URL(route.request().url());
    const callback = u.searchParams.get("callback"), action = u.searchParams.get("action");
    if (network && action === "search") { routes.push({ route, callback, query: u.searchParams.get("q") }); return; }
    await route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data: action === "revision" ? { dataRevision: "search-guard-test" } : data(u.searchParams.get("q") || "") })});` });
  });
  await page.goto(`${baseUrl}/search.html?keep=1${query ? `&q=${encodeURIComponent(query)}` : ""}`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof document.getElementById("searchButton").onclick === "function");
  await page.evaluate(() => {
    const original = window.MusDbAnalytics;
    window.MusDbAnalytics = { ...original, trackEvent(name, details) { window.__searchEvents.push({ name, details }); } };
  });
  return { page, issues, routes };
}

async function submit(page, query, count, enter = false) {
  await page.locator("#searchInput").fill(query);
  if (enter) await page.locator("#searchInput").press("Enter");
  else await page.locator("#searchButton").click();
  await page.waitForFunction(n => window.__searchRequests.length === n, count);
}

async function settle(page, index, query, { fail = false, label = query, error = "obsolete search failure" } = {}) {
  await page.evaluate(async ({ index, response, fail, error }) => {
    const request = window.__searchRequests[index];
    if (fail) request.reject(new Error(error));
    else request.resolve({ success: true, data: response });
    // Drain promise continuations, not a wall-clock sleep.
    await Promise.resolve();
    await Promise.resolve();
  }, { index, response: data(query, label), fail, error });
}

async function assertLatest(page, query, label = query) {
  assert.equal(await page.locator("#searchInput").inputValue(), query);
  assert.equal(new URL(page.url()).searchParams.get("q"), query);
  assert.equal(await page.locator("#summaryText").innerText(), `「${query}」の検索結果`);
  assert.equal(await page.locator("#summaryCount").innerText(), "3件");
  const titles = await page.locator("#resultsArea .result-title").allInnerTexts();
  assert.ok(titles.length > 0);
  assert.ok(titles.every(title => title.startsWith(label)), JSON.stringify(titles));
  assert.equal(await page.locator("#status").isHidden(), true);
}

async function finish({ page, issues }, expectedIssues = []) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "horizontal overflow");
  assert.deepEqual(issues, expectedIssues);
  await page.close();
}

for (const width of [1280, 390]) {
  test(`A reversed success keeps latest input/URL/results and analytics (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page } = ctx;
    await submit(page, A, 1); await submit(page, B, 2);
    await settle(page, 1, B); await assertLatest(page, B);
    await settle(page, 0, A); await assertLatest(page, B);
    assert.deepEqual(await page.evaluate(() => window.__searchEvents.map(e => e.name)), ["search_submit", "search_submit", "search_result"]);
    await finish(ctx);
  });
  test(`B obsolete rejection cannot replace latest success (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page } = ctx;
    await submit(page, A, 1); await submit(page, B, 2);
    await settle(page, 1, B); await settle(page, 0, A, { fail: true });
    await assertLatest(page, B); await finish(ctx);
  });
  test(`C empty search invalidates pending success without changing empty URL policy (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page } = ctx;
    await submit(page, A, 1); const url = page.url();
    await submit(page, "", 1); await settle(page, 0, A);
    assert.equal(await page.locator("#resultsArea").innerText(), "");
    assert.equal(await page.locator("#summaryText").innerText(), "検索語を入力してください。");
    assert.equal(await page.locator("#summaryCount").innerText(), "");
    assert.equal(await page.locator("#status").isHidden(), true);
    assert.equal(page.url(), url);
    assert.equal(await page.evaluate(() => window.__searchEvents.filter(e => e.name === "search_result").length), 0);
    await finish(ctx);
  });
  test(`D same query is guarded by invocation, not keyword (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page } = ctx;
    // Independent promises exercise the UI contract even when query strings match.
    // Actual apiGet in-flight/cache behavior is separately covered without modification.
    await submit(page, B, 1); await submit(page, B, 2);
    await settle(page, 1, B, { label: "Latest result" });
    await settle(page, 0, B, { label: "Obsolete result" });
    await assertLatest(page, B, "Latest result");
    assert.equal(await page.evaluate(() => window.__searchEvents.filter(e => e.name === "search_result").length), 1);
    await finish(ctx);
  });
  test(`E tabs use latest data during/after requests without refetch (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page } = ctx;
    await submit(page, A, 1); await submit(page, B, 2);
    await page.locator('[data-tab="releases"]').click(); await settle(page, 1, B);
    await settle(page, 0, A); await assertLatest(page, B);
    for (const category of ["songs", "events", "all"]) {
      await page.locator(`[data-tab="${category}"]`).click(); await assertLatest(page, B);
    }
    assert.equal(await page.evaluate(() => window.__searchRequests.length), 2);
    const event = await page.evaluate(() => window.__searchEvents.find(e => e.name === "search_result"));
    assert.equal(event.details.result_category, "releases"); assert.equal(event.details.result_count, 1);
    await finish(ctx);
  });
  test(`F obsolete success/error cannot clear latest loading (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page } = ctx;
    await submit(page, A, 1); await submit(page, "old failure", 2); await submit(page, B, 3);
    await settle(page, 0, A); await settle(page, 1, "old failure", { fail: true });
    assert.equal(await page.locator("#status .loading").count(), 1);
    assert.equal(await page.locator("#status").isVisible(), true);
    assert.equal(await page.locator("#resultsArea").innerText(), "");
    await settle(page, 2, B); await assertLatest(page, B); await finish(ctx);
  });
  test(`G initial query/Enter preserve replaceState history and other params (${width}px)`, async t => {
    const ctx = await open(width, { query: A }); t.after(() => ctx.page.close()); const { page } = ctx;
    await page.waitForFunction(() => window.__searchRequests.length === 1);
    await settle(page, 0, A); await assertLatest(page, A);
    const length = await page.evaluate(() => history.length);
    await submit(page, B, 2, true); await settle(page, 1, B); await assertLatest(page, B);
    assert.equal(await page.evaluate(() => history.length), length);
    assert.equal(new URL(page.url()).searchParams.get("keep"), "1");
    await finish(ctx);
  });
  test(`H normal search keeps categories, returned order and zero results (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page } = ctx;
    await submit(page, B, 1); await settle(page, 0, B); await assertLatest(page, B);
    assert.deepEqual(await page.locator("#resultsArea .result-type").allInnerTexts(), ["曲", "リリース", "イベント"]);
    await submit(page, "none", 2);
    await page.evaluate(async () => {
      window.__searchRequests[1].resolve({ data: { query: "none", results: {}, counts: {}, totalCount: 0 } });
      await Promise.resolve(); await Promise.resolve();
    });
    assert.equal(await page.locator("#summaryCount").innerText(), "0件");
    assert.equal(await page.locator(".empty-state").count(), 1);
    const event = await page.evaluate(() => window.__searchEvents.filter(e => e.name === "search_result").at(-1));
    assert.equal(event.details.is_zero_result, 1);
    await finish(ctx);
  });
  test(`latest failure retains the existing error UI and a later search recovers (${width}px)`, async t => {
    const ctx = await open(width); t.after(() => ctx.page.close()); const { page, issues } = ctx;
    await submit(page, A, 1);
    await settle(page, 0, A, { fail: true, error: "current search failure" });
    assert.equal(await page.locator("#summaryText").innerText(), "検索結果を取得できませんでした。");
    assert.equal(await page.locator("#status.error").innerText(), "current search failure");
    assert.equal(await page.locator("#resultsArea").innerText(), "");
    assert.equal(issues.length, 1);
    assert.match(issues[0], /^console:.*current search failure/s);
    const expectedIssues = [...issues]; // Only the intentionally current failure is logged.
    await submit(page, B, 2); await settle(page, 1, B); await assertLatest(page, B);
    await finish(ctx, expectedIssues);
  });
  test(`real JSONP network reversed completion retains latest Search (${width}px)`, async t => {
    const ctx = await open(width, { network: true }); t.after(() => ctx.page.close()); const { page, routes } = ctx;
    for (const query of [A, B]) {
      await page.locator("#searchInput").fill(query); await page.locator("#searchButton").click();
      await page.waitForFunction(() => document.querySelectorAll('script[src*="action=search"]').length > 0);
      // Callback/script creation is synchronous; route arrival is explicitly awaited.
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const poll = () => routes.some(r => r.query === query) ? resolve() : Date.now() > deadline ? reject(new Error("JSONP route not received")) : setTimeout(poll, 10);
        poll();
      });
    }
    for (const query of [B, A]) {
      const r = routes.find(r => r.query === query);
      await r.route.fulfill({ contentType: "text/javascript", body: `${r.callback}(${JSON.stringify({ success: true, data: data(query) })});` });
      await page.waitForFunction(q => window.__searchCompleted.includes(q), query);
      await assertLatest(page, B);
    }
    assert.equal(routes.length, 2);
    assert.equal(await page.evaluate(() => Object.keys(window).filter(k => k.startsWith("__musJsonpCallback_")).length), 0);
    await finish(ctx);
  });
}
