"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const { loadKamiparaCaptureData, captureJsonpData } = require("../tools/generate-release-pages.cjs");
const root = path.resolve(__dirname, "..");
const current = require("../data/current.json");
const snapshotRoot = path.join(root, "data/snapshots", current.revision);
const read = file => JSON.parse(fs.readFileSync(path.join(snapshotRoot, file)));
const capture = loadKamiparaCaptureData(snapshotRoot, read("manifest.json"), current.revision);
const tracks = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
let server, browser, origin;

test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, new URL(req.url, "http://localhost").pathname.slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    // Test the non-prerender renderer without the production legacy redirect.
    if (file.endsWith("release.html")) return res.end(fs.readFileSync(file, "utf8").replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/, ""));
    // Expose existing private render only in the virtual test response, to exercise
    // a second same-Release render without adding a production testing export.
    if (file.endsWith("release-v500.js")) return res.end(fs.readFileSync(file, "utf8") + "\nexport { renderRelease };\n");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome" });
});
test.after(async () => { await browser?.close(); await new Promise(r => server.close(r)); });

async function open(width, options = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem("musdb_analytics_consent", "rejected");
    window.__kpFrames = [];
    // Activate before module initialization, once the complete initial body has
    // parsed. Record all subsequent intermediate states, not just the final DOM.
    let active = false;
    new MutationObserver(() => {
      const host = document.getElementById("includedSongsContent");
      if (!host) return;
      const songs = host.querySelectorAll(".release-kp-song").length;
      if (songs === 10) active = true;
      if (!active) return;
      window.__kpFrames.push({ songs, loading: host.textContent.includes("読み込んでいます"),
        errors: host.querySelectorAll(".release-inclusion-error,.release-kp-retry").length,
        hidden: document.getElementById("mainContent").hidden || document.getElementById("includedSongsSection").hidden,
        skeleton: !document.getElementById("releaseSkeleton").hidden });
    }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
  });
  const stages = Object.fromEntries(["detail", "list", "dashboard", "venue"].map(stage => [stage, { started: deferred(), gate: deferred() }]));
  for (const [name, stage] of Object.entries(stages)) if (!(options.hold || []).includes(name)) stage.gate.resolve();
  const actions = [], errors = [];
  const detail = read("releases/R0072.json");
  if (options.list) detail.data.releaseSeries = "list-enrichment-fixture";
  const dashboard = structuredClone(capture.dashboard);
  dashboard.songs[0].displayName += "（更新fixture）";
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    const wait = async stage => { stages[stage].started.resolve(); await stages[stage].gate.promise; };
    if (url.origin === origin) {
      if (url.pathname.endsWith("/releases/R0072.json")) {
        if (options.forceApi) return route.fulfill({ json: {} });
        await wait("detail"); return route.fulfill({ json: detail });
      }
      if (url.pathname.endsWith("release-list.json")) { await wait("list"); return route.fulfill({ json: read("release-list.json") }); }
      return route.continue();
    }
    const callback = url.searchParams.get("callback"), action = url.searchParams.get("action");
    if (!callback) return route.fulfill({ body: "" });
    actions.push(action);
    if (action === "release") await wait("detail");
    if (action === "kamiparaDashboard") await wait("dashboard");
    if (action === "venue") await wait("venue");
    const data = action === "revision" ? current : action === "release" ? detail.data
      : action === "kamiparaDashboard" ? (options.invalidDashboard ? {} : dashboard) : captureJsonpData(url, capture);
    const payload = action === "kamiparaDashboard" && options.failedDashboard
      ? { success: false, error: { code: "TEST_UNAVAILABLE", message: "dashboard unavailable" } }
      : { success: true, data };
    const failed = action === "kamiparaDashboard" && options.failedDashboard
      ? ";window.__dashboardFailures = (window.__dashboardFailures || 0) + 1;" : "";
    return route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify(payload)});${failed}` });
  });
  page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(origin + (options.legacy ? "/release.html?id=R0072" : "/release/R0072.html"), { waitUntil: "domcontentloaded" });
  return { page, stages, actions, errors, options, detail, close: async () => { for (const s of Object.values(stages)) s.gate.resolve(); await page.close(); } };
}
async function ready(page) {
  await page.evaluate(async () => { await (await import(document.querySelector('script[src*="release-v500.js"]').src)).releaseReady; });
}
async function complete(page) {
  assert.equal(await page.locator(".release-kp-song").count(), 10);
  assert.deepEqual(await page.locator(".release-kp-track").allTextContents(), tracks);
  assert.equal(await page.locator(".release-kp-event").count(), 5);
  assert.equal(await page.locator(".release-kp-performance").count(), 10);
  assert.equal(await page.locator(".release-inclusion-error,.release-kp-retry").count(), 0);
  assert.ok(await page.locator("#includedSongsSection").isVisible());
  assert.ok(await page.locator("#kamiparaHistorySection").isVisible());
}
async function preserved(page) {
  await complete(page);
  assert.doesNotMatch(await page.locator("#includedSongsContent").innerText(), /読み込んでいます/);
  const frames = await page.evaluate(() => window.__kpFrames);
  assert.ok(frames.length > 0);
  assert.ok(frames.every(f => f.songs === 10 && !f.loading && !f.hidden && !f.skeleton && !f.errors), JSON.stringify(frames));
}

for (const width of [1280, 390]) {
  for (const forceApi of [false, true]) test(`R0072 ${width}px ${forceApi ? "API fallback" : "Static"}: preserve during detail/list/dashboard/venue, then latest update`, async () => {
    const s = await open(width, { hold: ["detail", "list", "dashboard", "venue"], list: true, forceApi });
    try {
      const before = await s.page.locator("#includedSongsContent").innerHTML();
      for (const name of ["detail", "list", "dashboard", "venue"]) {
        await s.stages[name].started.promise; await s.page.clock.runFor(500);
        assert.equal(await s.page.locator("#includedSongsContent").innerHTML(), before, name);
        await preserved(s.page); s.stages[name].gate.resolve();
      }
      await ready(s.page); await preserved(s.page);
      assert.match(await s.page.locator(".release-kp-song h3").first().innerText(), /更新fixture/);
      assert.equal(s.actions.filter(a => a === "kamiparaDashboard").length, 1);
      assert.equal(s.actions.filter(a => a === "venue").length, 4);
      assert.equal(await s.page.locator(".release-kp-event-venue").count(), 4);
      await s.page.locator('#kamiparaYearFilter [data-year="2013"]').click();
      assert.equal(await s.page.locator(".release-kp-event:visible").count(), capture.dashboard.events.filter(e => e.date.startsWith("2013")).length);
      await s.page.locator('#kamiparaYearFilter [data-year="all"]').click();
      assert.equal(await s.page.locator(".release-kp-event:visible").count(), 5);
      assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(s.errors, []);
    } finally { await s.close(); }
  });
  test(`R0072 ${width}px: invalid dashboard preserves completed static body`, async () => {
    const s = await open(width, { invalidDashboard: true });
    try { await ready(s.page); await preserved(s.page); assert.deepEqual(s.errors, []); }
    finally { await s.close(); }
  });
  test(`R0072 ${width}px: dashboard request failure and API retry preserve static body`, async () => {
    const s = await open(width, { failedDashboard: true });
    try {
      await s.page.waitForFunction(() => window.__dashboardFailures >= 1);
      await s.page.clock.runFor(350);
      await ready(s.page); await preserved(s.page);
      assert.equal(s.actions.filter(a => a === "kamiparaDashboard").length, 2, "existing API retry retained");
      assert.equal(s.actions.filter(a => a === "venue").length, 0);
      assert.deepEqual(s.errors, []);
    } finally { await s.close(); }
  });
  test(`R0072 ${width}px no prerender: Loading, error/retry, then successful update`, async () => {
    const s = await open(width, { legacy: true, invalidDashboard: true, hold: ["dashboard"] });
    try {
      await s.stages.dashboard.started.promise;
      assert.match(await s.page.locator("#includedSongsContent").innerText(), /読み込んでいます/);
      assert.equal(await s.page.locator(".release-kp-song").count(), 0);
      s.stages.dashboard.gate.resolve(); await ready(s.page);
      assert.equal(await s.page.locator(".release-inclusion-error").count(), 1);
      assert.equal(await s.page.locator(".release-kp-retry").count(), 1);
      s.options.invalidDashboard = false;
      await s.page.locator(".release-kp-retry").click();
      await s.page.waitForFunction(() => document.querySelectorAll(".release-kp-song").length === 10);
      await complete(s.page); assert.deepEqual(s.errors, []);
    } finally { await s.close(); }
  });
}

test("validated non-prerender completion survives a subsequent same-Release render", async () => {
  const s = await open(390, { legacy: true, list: true });
  try {
    await ready(s.page); await complete(s.page);
    const before = await s.page.locator("#includedSongsContent").innerHTML();
    await s.page.evaluate(async data => {
      const main = await import(document.querySelector('script[src*="release-v500.js"]').src);
      main.renderRelease(data);
    }, s.detail.data);
    assert.equal(await s.page.locator("#includedSongsContent").innerHTML(), before);
    await preserved(s.page);
    assert.equal(s.actions.filter(a => a === "kamiparaDashboard").length, 1);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test("same R0072 rerender and concurrent secondary calls preserve DOM and share one pending render", async () => {
  const s = await open(390, { hold: ["dashboard"] });
  try {
    await s.stages.dashboard.started.promise;
    await s.page.evaluate(async data => {
      const main = await import(document.querySelector('script[src*="release-v500.js"]').src);
      main.renderRelease(data);
      const secondary = await import(new URL("assets/js/release-kamipara.js?v=1.0.0", document.baseURI));
      window.__pendingRenders = [secondary.renderKamiparaRelease(), secondary.renderKamiparaRelease()];
      window.__samePending = window.__pendingRenders[0] === window.__pendingRenders[1];
    }, s.detail.data);
    await preserved(s.page);
    assert.equal(await s.page.evaluate(() => window.__samePending), true);
    s.stages.dashboard.gate.resolve(); await ready(s.page);
    await s.page.evaluate(() => Promise.all(window.__pendingRenders));
    assert.equal(s.actions.filter(a => a === "kamiparaDashboard").length, 1);
    assert.equal(s.actions.filter(a => a === "venue").length, 4);
    await preserved(s.page); assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test("completed DOM guard rejects wrong Release, unmarked/incomplete/error DOM and invalid tracks", async () => {
  const s = await open(390, { hold: ["detail"] });
  try {
    const results = await s.page.evaluate(async () => {
      const { hasCompletedKamiparaContent } = await import(new URL("assets/js/release-kamipara.js?v=1.0.0", document.baseURI));
      const check = () => hasCompletedKamiparaContent("R0072");
      const host = document.getElementById("includedSongsContent"), history = document.getElementById("kamiparaHistory");
      const body = host.innerHTML, historyBody = history.innerHTML;
      const values = [check(), hasCompletedKamiparaContent("R0010")];
      document.documentElement.dataset.releaseId = "R0094"; values.push(check());
      delete document.documentElement.dataset.releaseId; values.push(check());
      document.documentElement.dataset.releaseId = "R0072";
      host.querySelector(".release-kp-song").remove(); values.push(check()); host.innerHTML = body;
      host.querySelector(".release-kp-track").textContent = "02"; values.push(check()); host.innerHTML = body;
      host.insertAdjacentHTML("beforeend", '<p class="release-inclusion-error">error</p>'); values.push(check()); host.innerHTML = body;
      history.querySelector(".release-kp-performance").remove(); values.push(check()); history.innerHTML = historyBody;
      document.getElementById("includedSongsSection").hidden = true; values.push(check());
      document.getElementById("includedSongsSection").hidden = false;
      values.push(check()); return values;
    });
    assert.deepEqual(results, [true, false, false, false, false, false, false, false, false, true]);
  } finally { await s.close(); }
});
