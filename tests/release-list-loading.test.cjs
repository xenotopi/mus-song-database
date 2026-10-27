"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const current = JSON.parse(fs.readFileSync(path.join(root, "data/current.json")));
const base = path.join(root, "data/snapshots", current.revision);
const read = file => JSON.parse(fs.readFileSync(path.join(base, file)));
const list = read("release-list.json");
let server, browser, origin;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, new URL(req.url, "http://localhost").pathname.slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file)) return res.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
    if (file.endsWith("release.html")) return res.end(fs.readFileSync(file, "utf8").replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/, ""));
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
test.after(async () => { await browser?.close(); await new Promise(r => server.close(r)); });
function bodyState() {
  return ["releaseName", "heroMeta", "releaseInfo", "childReleasesHost", "includedSongsContent"].map(id => document.getElementById(id).textContent);
}
async function open({ id = "R0094", width = 390, prerender = false, failure = false, staticFailure = false, enrich = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.clock.install(); await page.addInitScript(() => localStorage.setItem("musdb_analytics_consent", "rejected"));
  const gate = deferred(), started = deferred(), requests = [], errors = [];
  let settled = false;
  const detail = read(`releases/${id}.json`);
  const enriched = structuredClone(list);
  if (enrich) {
    for (const key of ["releaseSeries", "editionType", "parentReleaseId", "featuredSinger", "catalogNumber", "officialName"]) detail.data[key] = null;
    const item = enriched.data.find(row => row.releaseId === id);
    item.parentReleaseId = "R0088"; // Fixture-only BOX relationship verifies late enrichment.
    item.officialName = "正式商品名の補完fixture";
  }
  await page.route("**/*", async route => {
    const url = new URL(route.request().url()); requests.push(url);
    if (url.origin === origin) {
      if (url.pathname.endsWith(`/releases/${id}.json`)) return route.fulfill({ json: detail });
      if (url.pathname.endsWith("release-list.json")) {
        if (staticFailure || failure) return route.fulfill({ json: {} });
        started.resolve(); await gate.promise; settled = true; return route.fulfill({ json: enriched });
      }
      return route.continue();
    }
    const callback = url.searchParams.get("callback"), action = url.searchParams.get("action");
    if (!callback) return route.fulfill({ body: "" });
    if (action === "releaseList") { started.resolve(); await gate.promise; settled = true; }
    const payload = failure && action === "releaseList" ? { success: false, error: { message: "list unavailable", code: "TEST_LIST_FAILURE" } }
      : { success: true, data: action === "revision" ? current : action === "releaseList" ? enriched.data
        : action === "kamiparaDashboard" ? read("kamipara-dashboard.json").data : action === "venue" ? { venueName: "テスト会場" } : {} };
    return route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify(payload)});` });
  });
  page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${origin}/${prerender ? `release/${id}.html` : `release.html?id=${id}`}`, { waitUntil: "domcontentloaded" });
  return { page, gate, started, requests, errors, settled: () => settled };
}
async function ready(page) {
  await page.evaluate(async () => { await (await import(document.querySelector('script[src*="release-v500.js"]').src)).releaseReady; });
}
for (const width of [1280, 390]) {
  test(`no prerender ${width}px: basic body before delayed list, then complete enrichment`, async () => {
    const s = await open({ width, enrich: true });
    try {
      await s.started.promise; await s.page.clock.runFor(2000);
      assert.equal(s.settled(), false); assert.ok(await s.page.locator("#mainContent").isVisible());
      assert.equal(await s.page.locator("#releaseSkeleton").isVisible(), false);
      assert.equal(await s.page.locator('#releaseInfo a[href="release/R0088.html"]').count(), 0);
      s.gate.resolve(); await ready(s.page);
      const info = await s.page.locator("#releaseInfo").innerText();
      for (const value of ["シリーズ", "品番", "正式商品名", "対象キャラクター／歌唱名義"]) assert.ok(info.includes(value), value);
      assert.equal(await s.page.locator('#releaseInfo a[href="release/R0088.html"]').count(), 1);
      assert.equal(s.requests.filter(u => u.pathname === "/data/current.json").length, 1);
      assert.equal(s.requests.filter(u => u.pathname.endsWith("R0094.json")).length, 1);
      assert.equal(s.requests.filter(u => u.pathname.endsWith("release-list.json")).length, 1);
      assert.equal(s.requests.filter(u => ["release", "releaseList"].includes(u.searchParams.get("action"))).length, 0);
      assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(s.errors, []);
    } finally { s.gate.resolve(); await s.page.close(); }
  });
  for (const id of ["R0094", "R0088"]) for (const failure of [false, true]) test(`${id} prerender ${width}px: existing series/BOX/children preserved during list ${failure ? "outage" : "delay"}`, async () => {
    const s = await open({ width, id, prerender: true, failure });
    try {
      await s.started.promise;
      const before = await s.page.evaluate(bodyState);
      if (id === "R0088") assert.equal(await s.page.locator(".release-child-row").count(), 9);
      await s.page.clock.runFor(2000);
      assert.deepEqual(await s.page.evaluate(bodyState), before);
      assert.equal(await s.page.locator("#releaseSkeleton").isVisible(), false);
      assert.ok(await s.page.locator("#mainContent").isVisible());
      s.gate.resolve(); await ready(s.page);
      assert.deepEqual(await s.page.evaluate(bodyState), before);
      assert.equal(await s.page.locator("#status.error").count(), 0);
      assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(s.errors, []);
    } finally { s.gate.resolve(); await s.page.close(); }
  });
}
for (const failure of [false, true]) test(`no prerender: static list failure / API ${failure ? "failure preserves details" : "success enriches"}`, async () => {
  const s = await open({ staticFailure: true, failure, enrich: true });
  try {
    await s.started.promise; assert.ok(await s.page.locator("#mainContent").isVisible());
    const before = await s.page.evaluate(bodyState);
    s.gate.resolve(); await ready(s.page);
    assert.ok(await s.page.locator("#mainContent").isVisible()); assert.equal(await s.page.locator("#status.error").count(), 0);
    if (failure) assert.deepEqual(await s.page.evaluate(bodyState), before);
    else assert.equal(await s.page.locator('#releaseInfo a[href="release/R0088.html"]').count(), 1);
    assert.deepEqual(s.errors, []);
  } finally { s.gate.resolve(); await s.page.close(); }
});
test("memorial BOX children arrive after first basic render", async () => {
  const s = await open({ id: "R0088" });
  try {
    await s.started.promise; assert.ok(await s.page.locator("#mainContent").isVisible());
    assert.equal(await s.page.locator(".release-child-row").count(), 0);
    s.gate.resolve(); await ready(s.page); assert.equal(await s.page.locator(".release-child-row").count(), 9);
    assert.deepEqual(s.errors, []);
  } finally { s.gate.resolve(); await s.page.close(); }
});
test("R0072 runs Kamipara once; R0010 remains ad-free after final render", async () => {
  for (const id of ["R0072", "R0010"]) {
    const s = await open({ id, prerender: true });
    try {
      await ready(s.page); await s.page.waitForLoadState("networkidle");
      if (id === "R0072") {
        assert.equal(s.requests.filter(u => u.searchParams.get("action") === "kamiparaDashboard").length, 1);
        assert.equal(await s.page.locator(".release-kp-song").count(), 10);
        assert.equal(await s.page.locator(".release-kp-event").count(), 5);
        assert.equal(await s.page.locator(".release-kp-performance").count(), 10);
        assert.deepEqual(await s.page.locator(".release-kp-track").allTextContents(), Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0")));
        assert.equal(await s.page.locator(".release-inclusion-error,.release-kp-retry").count(), 0);
      } else assert.equal(await s.page.locator(".release-amazon-link").count(), 0);
      assert.deepEqual(s.errors, []);
    } finally { s.gate.resolve(); await s.page.close(); }
  }
});
