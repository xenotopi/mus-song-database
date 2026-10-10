"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/js/api.js"), "utf8");
const origin = "https://jsonp-test.invalid";
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome" }); });
test.after(async () => { await browser?.close(); });

for (const separateModules of [false, true]) {
  test(`browser JSONP success and cleanup: ${separateModules ? "different import queries" : "same module"}`, async () => {
    const page = await browser.newPage();
    const errors = [], callbacks = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>JSONP regression</title>" });
      if (url.origin === origin && url.pathname === "/api.js") return route.fulfill({ contentType: "text/javascript", body: source });
      const callback = url.searchParams.get("callback");
      assert.ok(callback, "all network calls must be fixture JSONP");
      callbacks.push(callback);
      return route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data: { id: url.searchParams.get("id") } })});` });
    });
    try {
      await page.goto(origin);
      const result = await page.evaluate(async separate => {
        const queries = separate ? ["release", "common", "kamipara"] : ["release", "release", "release"];
        const modules = await Promise.all(queries.map(query => import(`/api.js?instance=${query}`)));
        const originalNow = Date.now;
        let requests;
        try {
          Date.now = () => 1700000000000;
          requests = modules.map((module, id) => module.jsonpRequest({ action: "search", params: { id }, timeoutMs: 3000 }));
        } finally { Date.now = originalNow; }
        const names = [...document.querySelectorAll('script[src*="callback="]')].map(script => new URL(script.src).searchParams.get("callback"));
        const responses = await Promise.all(requests.map(request => request.promise));
        return { distinctInstances: modules[0].jsonpRequest !== modules[1].jsonpRequest, names, ids: responses.map(response => response.data.id), cleaned: names.every(name => !Object.hasOwn(window, name)), remainingScripts: document.querySelectorAll('script[src*="callback="]').length };
      }, separateModules);
      assert.equal(result.distinctInstances, separateModules);
      assert.equal(new Set(result.names).size, 3);
      assert.ok(result.names.every(name => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)));
      assert.deepEqual(result.ids, ["0", "1", "2"]);
      assert.equal(result.cleaned, true);
      assert.equal(result.remainingScripts, 0);
      assert.equal(new Set(callbacks).size, 3);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test("apiGet retains same-module in-flight deduplication and fresh cache reuse", async () => {
  const page = await browser.newPage();
  const errors = [];
  let releaseCalls = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>API cache regression</title>" });
    if (url.origin === origin && url.pathname === "/api.js") return route.fulfill({ contentType: "text/javascript", body: source });
    const callback = url.searchParams.get("callback"), action = url.searchParams.get("action");
    assert.ok(callback);
    assert.ok(["revision", "release"].includes(action));
    if (action === "release") releaseCalls++;
    const revision = `sha256-${"a".repeat(64)}`;
    const data = action === "revision" ? { dataRevision: revision } : { releaseId: "R0010", _cache: { revision } };
    return route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data })});` });
  });
  try {
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const api = await import("/api.js?instance=cache-regression");
      const load = () => api.apiGet("release", { id: "R0010" }, { cache: true, staleWhileRevalidate: false, timeoutMs: 3000, retryCount: 0 });
      const first = await Promise.all([load(), load()]);
      const cached = await load();
      return { ids: first.map(response => response.data.releaseId), cachedId: cached.data.releaseId, cacheSource: cached.cache.source };
    });
    assert.equal(releaseCalls, 1);
    assert.deepEqual(result.ids, ["R0010", "R0010"]);
    assert.equal(result.cachedId, "R0010");
    assert.ok(["session", "local"].includes(result.cacheSource), `cache source: ${result.cacheSource}`);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
