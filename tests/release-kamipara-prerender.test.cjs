"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const { loadKamiparaCaptureData, captureJsonpData, validateKamiparaCapture } = require("../tools/generate-release-pages.cjs");
const root = path.resolve(__dirname, "..");
const current = require("../data/current.json");
const snapshotRoot = path.join(root, "data/snapshots", current.revision);
const manifest = require(path.join(snapshotRoot, "manifest.json"));
const capture = loadKamiparaCaptureData(snapshotRoot, manifest, current.revision);
const release = require(path.join(snapshotRoot, "releases/R0072.json")).data;
const releaseList = require(path.join(snapshotRoot, "release-list.json")).data;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
let server, browser, origin;

test.before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const file = path.resolve(root, decodeURIComponent(url.pathname).slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    if (url.pathname === "/release.html") return res.end(fs.readFileSync(file, "utf8").replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/, ""));
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: "chrome" });
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });

test("Kamipara capture uses validated current snapshot and local venue sources", () => {
  assert.equal(capture.dashboard.songs.length, 10);
  assert.equal(capture.dashboard.performers.length, 9);
  assert.equal(capture.dashboard.events.length, 5);
  assert.equal(capture.dashboard.performances.length, 10);
  const url = action => new URL(`https://example.invalid/?action=${action}`);
  assert.equal(captureJsonpData(url("kamiparaDashboard"), capture), capture.dashboard);
  for (const [id, venue] of capture.venues) {
    const request = url("venue"); request.searchParams.set("id", id);
    assert.deepEqual(captureJsonpData(request, capture), venue);
  }
  const missing = url("venue"); missing.searchParams.set("id", "VE0155");
  assert.deepEqual(captureJsonpData(missing, capture), {});
});

test("Kamipara snapshot revision and hash mismatches fail before capture", () => {
  assert.throws(() => loadKamiparaCaptureData(snapshotRoot, manifest, "wrong-revision"), /revision mismatch/);
  assert.throws(() => loadKamiparaCaptureData(snapshotRoot, { ...manifest, dataRevision: "wrong-data-revision" }, current.revision), /revision mismatch/);
  assert.throws(() => loadKamiparaCaptureData(snapshotRoot, { ...manifest, kamiparaDashboard: { sha256: "wrong-hash" } }, current.revision), /hash mismatch/);
});

async function open({ width = 1280, javaScriptEnabled = true, forceApi = false, emptyDashboard = false, legacy = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, javaScriptEnabled });
  const errors = [], actions = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem("musdb_analytics_consent", "rejected"));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (forceApi && url.pathname.endsWith("/releases/R0072.json")) return route.fulfill({ contentType: "application/json", body: "{}" });
      return route.continue();
    }
    const callback = url.searchParams.get("callback");
    if (!callback) return route.fulfill({ body: "" });
    const action = url.searchParams.get("action"); actions.push(action);
    const data = action === "revision" ? current : action === "release" ? release : action === "releases" ? releaseList
      : action === "kamiparaDashboard" && emptyDashboard ? {} : captureJsonpData(url, capture);
    const completion = action === "venue" ? ";window.__kamiparaVenueResponses = (window.__kamiparaVenueResponses || 0) + 1;" : "";
    return route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data })});${completion}` });
  });
  const response = await page.goto(`${origin}/${legacy ? "release.html?id=R0072" : "release/R0072.html"}`);
  assert.equal(response.status(), 200);
  return { page, errors, actions };
}

test("Generator rejects the original empty-dashboard error DOM", async () => {
  const { page } = await open({ emptyDashboard: true, legacy: true });
  try {
    await assert.rejects(validateKamiparaCapture(page), /R0072: invalid Kamipara capture/);
    assert.equal(await page.locator(".release-inclusion-error").count(), 1);
    assert.equal(await page.locator(".release-kp-retry").count(), 1);
  } finally { await page.close(); }
});

test("Generator waits for the snapshot-backed secondary renderer", async () => {
  const { page, errors } = await open({ legacy: true });
  try {
    const state = await validateKamiparaCapture(page);
    assert.equal(state.performances, 10);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const fault of ["error", "retry", "song-count", "track-order", "event-count", "performance-count"]) {
  test(`Generator rejects invalid R0072 capture: ${fault}`, async () => {
    const { page } = await open({ javaScriptEnabled: false });
    try {
      await validateKamiparaCapture(page);
      await page.evaluate(fault => {
        if (fault === "error" || fault === "retry") {
          const node = document.createElement(fault === "error" ? "p" : "button");
          node.className = fault === "error" ? "release-inclusion-error" : "release-kp-retry";
          document.getElementById("includedSongsContent").append(node);
        } else if (fault === "song-count") document.querySelector(".release-kp-song").remove();
        else if (fault === "track-order") document.querySelector(".release-kp-track").textContent = "02";
        else if (fault === "event-count") document.querySelector("#kamiparaHistory .release-kp-event").remove();
        else document.querySelector("#kamiparaHistory .release-kp-performance").remove();
      }, fault);
      await assert.rejects(validateKamiparaCapture(page), /R0072: invalid Kamipara capture/);
    } finally { await page.close(); }
  });
}

for (const width of [1280, 390]) {
  for (const mode of ["raw", "static", "api-fallback"]) {
    test(`R0072 ${mode} at ${width}px preserves 10 tracks / 5 events / 10 performances`, async () => {
      const { page, errors, actions } = await open({ width, javaScriptEnabled: mode !== "raw", forceApi: mode === "api-fallback" });
      try {
        if (mode !== "raw") await page.waitForFunction(() => window.__kamiparaVenueResponses === 4 && document.querySelectorAll(".release-kp-song").length === 10);
        await validateKamiparaCapture(page);
        if (mode !== "raw") {
          await page.waitForFunction(() => document.querySelectorAll(".release-kp-event-venue").length === 4);
          assert.ok(actions.includes("kamiparaDashboard"));
          if (mode === "api-fallback") assert.ok(actions.includes("release"));
        }
        assert.equal(await page.locator("h1").innerText(), release.releaseName);
        assert.equal(await page.locator("[data-prerender-description]").count(), 1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }
}
