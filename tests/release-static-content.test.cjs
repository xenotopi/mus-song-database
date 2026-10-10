"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const current = JSON.parse(fs.readFileSync(path.join(root, "data/current.json")));
const snapshotRoot = path.join(root, "data/snapshots", current.revision);
const snapshot = id => JSON.parse(fs.readFileSync(path.join(snapshotRoot, "releases", `${id}.json`)));
const dashboard = JSON.parse(fs.readFileSync(path.join(snapshotRoot, "kamipara-dashboard.json"))).data;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
let server, browser, origin;

test.before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const file = path.resolve(root, decodeURIComponent(url.pathname).slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    if (path.extname(file) === ".html") {
      let html = fs.readFileSync(file, "utf8").replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/, "");
      if (url.searchParams.has("unmarked")) html = html.replace(/ data-release-id="R\d{4}"/, "");
      if (url.searchParams.has("wrongMarker")) html = html.replace(/data-release-id="R\d{4}"/, 'data-release-id="R9999"');
      if (url.searchParams.has("hiddenBody")) html = html.replace('id="mainContent"', 'id="mainContent" hidden');
      return res.end(html);
    }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome" });
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
// Compare rendered content and visibility, not unrelated shared-header mutations.
function contentState(doc = document) {
  return {
    name: doc.getElementById("releaseName").textContent,
    hero: doc.getElementById("heroMeta").textContent,
    info: doc.getElementById("releaseInfo").textContent,
    mainHidden: doc.getElementById("mainContent").hidden,
    sections: ["debutSongsSection", "includedSongsSection", "kamiparaHistorySection", "kamiparaDashboardSection"].map(id => {
      const node = doc.getElementById(id);
      return { id, hidden: node.hidden, text: node.textContent };
    })
  };
}

async function open(id, width, options = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem("musdb_analytics_consent", "rejected");
    window.__releaseLoadingFrames = [];
    new MutationObserver(() => {
      if (!document.getElementById("mainContent")) return;
      window.__releaseLoadingFrames.push({ name: document.getElementById("releaseName").textContent,
        mainHidden: document.getElementById("mainContent").hidden, skeletonVisible: !document.getElementById("releaseSkeleton").hidden });
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
  });
  const errors = [], actions = [], started = deferred(), gate = deferred();
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (url.pathname.endsWith(`/releases/${id}.json`)) {
        if (options.forceApi) return route.fulfill({ contentType: "application/json", body: "{}" });
        if (options.hold === "static") { started.resolve(); await gate.promise; }
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(options.updatedWrapper || snapshot(id)) });
      }
      return route.continue();
    }
    const callback = url.searchParams.get("callback"), action = url.searchParams.get("action");
    if (!callback) return route.fulfill({ body: "" });
    actions.push(action);
    if (action === "release" && options.hold === "api") { started.resolve(); await gate.promise; }
    const result = action === "release" && options.failureCode
      ? { success: false, error: { code: options.failureCode, message: "テスト用取得失敗" } }
      : { success: true, data: action === "revision" ? current : action === "release" ? (options.apiData || snapshot(id).data)
        : action === "kamiparaDashboard" ? dashboard : action === "venue" ? { venueName: "テスト会場" } : {} };
    return route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify(result)});` });
  });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const raw = fs.readFileSync(path.join(root, "release", `${id}.html`), "utf8");
  const before = await page.evaluate(({ raw, code }) => (0, eval)(`(${code})`)(new DOMParser().parseFromString(raw, "text/html")), { raw, code: contentState.toString() });
  const url = options.legacy ? `/release.html?id=${id}` : `/release/${id}.html${options.unmarked ? "?unmarked=1" : options.wrongMarker ? "?wrongMarker=1" : options.hiddenBody ? "?hiddenBody=1" : ""}`;
  await page.goto(origin + url, { waitUntil: "domcontentloaded" });
  return { page, before, errors, actions, started, gate };
}

for (const width of [1280, 390]) for (const id of ["R0010", "R0067", "R0072", "R0094"]) {
  test(`${id} ${width}px: prerender survives delayed static load and updates successfully`, async () => {
    const updatedWrapper = snapshot(id);
    updatedWrapper.data.releaseName += "（更新fixture）";
    const { page, before, errors, started, gate } = await open(id, width, { hold: "static", updatedWrapper });
    try {
      await started.promise;
      await page.clock.runFor(500); // Past the real 120ms skeleton timer, without a fixed sleep.
      assert.deepEqual(await page.evaluate(contentState), before);
      assert.equal(await page.locator("#releaseSkeleton").isVisible(), false);
      assert.equal(await page.locator("#status").isVisible(), false);
      const frames = await page.evaluate(() => window.__releaseLoadingFrames);
      assert.ok(frames.length > 0);
      assert.ok(frames.every(f => f.name === before.name && !f.mainHidden && !f.skeletonVisible), JSON.stringify(frames));
      gate.resolve();
      await page.waitForFunction(name => document.getElementById("releaseName").textContent === name, updatedWrapper.data.releaseName);
      if (id === "R0072") await page.locator(".release-kp-song").first().waitFor();
      await page.waitForLoadState("networkidle");
      assert.equal(await page.locator("#mainContent").isVisible(), true);
      assert.equal(await page.locator("#status").isVisible(), false);
      assert.equal(await page.locator("#releaseSkeleton").isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
    } finally { gate.resolve(); await page.close(); }
  });
}

for (const width of [1280, 390]) test(`prerender ${width}px: delayed API fallback preserves content until success`, async () => {
  const apiData = snapshot("R0010").data; apiData.releaseName += "（API更新fixture）";
  const { page, before, errors, actions, started, gate } = await open("R0010", width, { forceApi: true, hold: "api", apiData });
  try {
    await started.promise; await page.clock.runFor(500);
    assert.deepEqual(await page.evaluate(contentState), before);
    assert.equal(await page.locator("#releaseSkeleton").isVisible(), false);
    gate.resolve();
    await page.waitForFunction(name => document.getElementById("releaseName").textContent === name, apiData.releaseName);
    assert.ok(actions.includes("release")); assert.deepEqual(errors, []);
  } finally { gate.resolve(); await page.close(); }
});

for (const width of [1280, 390]) for (const id of ["R0010", "R0067", "R0072", "R0094"]) test(`${id} ${width}px: communication failure retains content and retry recovers`, async () => {
  const options = { forceApi: true, failureCode: "TEMPORARY_UNAVAILABLE" };
  const { page, before, errors, actions, started, gate } = await open(id, width, options);
  try {
    await page.locator("#retryButton").waitFor();
    assert.deepEqual(await page.evaluate(contentState), before);
    assert.match(await page.locator("#status").innerText(), /保存済み.*最新データ/);
    assert.equal(await page.title(), `${before.name}｜μ's Song Database`);
    assert.equal(await page.locator("#releaseSkeleton").isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    options.failureCode = null;
    options.hold = "api";
    options.apiData = snapshot(id).data; options.apiData.releaseName += "（再試行fixture）";
    await page.locator("#retryButton").click();
    await started.promise; await page.clock.runFor(500);
    assert.deepEqual(await page.evaluate(contentState), before);
    assert.equal(await page.locator("#releaseSkeleton").isVisible(), false);
    gate.resolve();
    await page.waitForFunction(name => document.getElementById("releaseName").textContent === name, options.apiData.releaseName);
    assert.equal(await page.locator("#status").isVisible(), false);
    assert.ok(actions.filter(a => a === "release").length >= 3);
    assert.deepEqual(errors, []);
  } finally { gate.resolve(); await page.close(); }
});

test("prerender: not-found keeps title/content and retains non-retryable errorKind", async () => {
  const { page, before, errors } = await open("R0010", 390, { forceApi: true, failureCode: "RELEASE_NOT_FOUND" });
  try {
    await page.locator("#status.error").waitFor();
    assert.deepEqual(await page.evaluate(contentState), before);
    assert.equal(await page.locator("#retryButton").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const mode of ["legacy", "unmarked", "wrongMarker", "hiddenBody"]) test(`${mode}: no completed prerender content retains Loading/skeleton`, async () => {
  const { page, started, gate } = await open("R0010", 390, { [mode]: true, hold: "static" });
  try {
    await started.promise; await page.clock.runFor(500);
    assert.equal(await page.locator("#releaseName").innerText(), "読み込み中…");
    assert.equal(await page.locator("#mainContent").isVisible(), false);
    assert.equal(await page.locator("#releaseSkeleton").isVisible(), true);
    gate.resolve(); await page.locator("#mainContent").waitFor();
    assert.equal(await page.locator("#releaseName").innerText(), snapshot("R0010").data.releaseName);
    assert.equal(await page.locator("#releaseSkeleton").isVisible(), false);
  } finally { gate.resolve(); await page.close(); }
});
