"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots", current.revision, "kamipara-dashboard.json"), "utf8"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

function server() {
  return http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
  });
}

test("Kamipara static-first, stale refresh, failures and deferred venues", async () => {
  const app = server();
  await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MUSDB_BROWSER_EXECUTABLE || edge });
  try {
    for (const mode of ["fresh", "stale", "static-fail", "revision-fail", "api-fail", "venue-fail"]) {
      const page = await browser.newPage({ viewport: { width: mode === "venue-fail" ? 390 : 1280, height: 900 } });
      const errors = [];
      const calls = { dashboard: 0, venue: 0 };
      const started = Date.now();
      const timing = {};
      page.on("domcontentloaded", () => { timing.domContentLoaded = Date.now() - started; });
      page.on("requestfinished", request => {
        const url = request.url();
        if (url.endsWith("/data/current.json")) timing.current = Date.now() - started;
        if (url.endsWith("/kamipara-dashboard.json")) timing.snapshot = Date.now() - started;
        if (url.includes("action=revision")) timing.revision = Date.now() - started;
        if (url.includes("action=kamiparaDashboard")) timing.dashboard = Date.now() - started;
      });
      page.on("pageerror", error => errors.push(error.message));
      if (mode === "static-fail") await page.route("**/kamipara-dashboard.json", route => route.fulfill({ status: 404 }));
      await page.route(/script\.google\.com\/macros\/s\//, async route => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");
        let payload;
        if (action === "revision") {
          if (mode === "fresh") await new Promise(resolve => setTimeout(resolve, 700));
          payload = mode === "revision-fail" ? { success: false, error: "offline" } : { success: true, data: { dataRevision: mode === "stale" || mode === "api-fail" ? `sha256-${"b".repeat(64)}` : current.revision } };
        } else if (action === "kamiparaDashboard") {
          calls.dashboard++;
          if (mode === "stale") await new Promise(resolve => setTimeout(resolve, 700));
          if (mode === "api-fail") payload = { success: false, error: "offline" };
          else {
            const data = structuredClone(fixture.data);
            data.songs[0].displayName = "更新済み楽曲";
            if (mode === "stale") data.revision = data._cache.revision = `sha256-${"b".repeat(64)}`;
            payload = { success: true, data };
          }
        } else if (action === "venue") {
          calls.venue++;
          await new Promise(resolve => setTimeout(resolve, 500));
          payload = mode === "venue-fail" && url.searchParams.get("id") === "VE0001" ? { success: false, error: "offline" } : { success: true, data: { venueName: "補完済み会場", _cache: { revision: current.revision } } };
        }
        const callback = url.searchParams.get("callback");
        await route.fulfill({ status: 200, contentType: "text/javascript", body: callback ? `${callback}(${JSON.stringify(payload)});` : JSON.stringify(payload) });
      });
      await page.goto(`http://127.0.0.1:${app.address().port}/kamipara.html`, { waitUntil: "domcontentloaded" });
      await page.locator("#kpContent:not([hidden])").waitFor();
      timing.main = Date.now() - started;
      assert.equal(await page.locator("#kpSongs .kp-song-card").count(), 10, mode);
      if (mode === "stale") {
        assert.equal(await page.locator("#kpSongs .kp-song-name").filter({ hasText: "更新済み楽曲" }).count(), 0);
        await page.locator('#kpYearFilter button[data-year="2019"]').click();
      }
      if (mode !== "static-fail") assert.match(await page.locator("#kpHistory").innerText(), /会場名を確認中|補完済み会場/);
      if (mode === "stale") {
        await page.locator("#kpSongs .kp-song-name").filter({ hasText: "更新済み楽曲" }).waitFor();
        assert.equal(await page.locator('#kpYearFilter button[data-year="2019"]').getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator("#kpHistory .kp-event:visible").count(), 2);
      }
      if (mode === "fresh" || mode === "revision-fail" || mode === "venue-fail") assert.equal(calls.dashboard, 0, mode);
      if (mode === "api-fail") assert.equal(await page.locator("#kpContent").isVisible(), true);
      if (mode === "static-fail") assert.equal(calls.dashboard, 1);
      await page.waitForTimeout(650);
      if (mode === "fresh" || mode === "stale") console.log(JSON.stringify({ mode, timing }));
      assert.equal(calls.venue, 4, mode);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, mode);
      assert.deepEqual(errors, [], mode);
      if (mode === "fresh") {
        const reloaded = Date.now();
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("#kpContent:not([hidden])").waitFor();
        console.log(JSON.stringify({ mode: "reload-with-venue-cache", main: Date.now() - reloaded, venueRequests: calls.venue }));
        assert.equal(calls.dashboard, 0);
        assert.equal(await page.locator("#kpHistory .kp-event").count(), 5);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => app.close(resolve));
  }
});
