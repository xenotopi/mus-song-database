"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const api = "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

async function apiData(action, id) {
  const url = new URL(api);
  url.searchParams.set("action", action);
  if (id) url.searchParams.set("id", id);
  const response = await (await fetch(url)).json();
  assert.equal(response.success, true, `${action} API`);
  return response.data;
}

test("R0072だけ神パラ10曲とC2型の歌唱履歴を表示する", async () => {
  const dashboard = await apiData("kamiparaDashboard");
  const releases = new Map(await Promise.all(["R0072", "R0015"].map(async id => [id, await apiData("release", id)])));
  const venueIds = [...new Set(dashboard.events.map(event => event.venueId).filter(Boolean))];
  const venues = new Map(await Promise.all(venueIds.map(async id => [id, await apiData("venue", id)])));
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome" });
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let dashboardRequests = 0;
      await page.route(/script\.google(?:usercontent)?\.com\//, route => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");
        if (action === "kamiparaDashboard") dashboardRequests++;
        const data = action === "kamiparaDashboard" ? dashboard : action === "venue" ? venues.get(url.searchParams.get("id")) : action === "release" ? releases.get(url.searchParams.get("id")) : action === "revision" ? { dataRevision: dashboard.revision } : [];
        const payload = { success: true, data };
        const callback = url.searchParams.get("callback");
        return route.fulfill({ status: 200, contentType: "text/javascript", body: callback ? `${callback}(${JSON.stringify(payload)});` : JSON.stringify(payload) });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/release.html?id=R0072`);
      await page.locator("#includedSongsContent .release-kp-song").first().waitFor();
      assert.equal(await page.locator("#includedSongsContent .release-kp-song").count(), 10);
      assert.deepEqual(await page.locator(".release-kp-track").allTextContents(), Array.from({ length: 10 }, (_, index) => String(index + 1).padStart(2, "0")));
      assert.deepEqual(await page.locator("#includedSongsContent .release-kp-song h3").allTextContents(), [...dashboard.songs].sort((a, b) => a.trackNumber - b.trackNumber).map(song => song.displayName || song.songName));
      assert.match(await page.locator("#includedSongsContent").innerText(), /CV：矢澤にこ（徳井青空）/);
      assert.match(await page.locator("#includedSongsContent").innerText(), /歌唱記録未確認/);
      assert.equal(await page.locator("#includedSongsContent a[href*='song.html']").count(), 0);
      assert.equal(await page.locator("#debutSongsSection").isVisible(), false);
      assert.equal(await page.locator("#kamiparaHistory .release-kp-event").count(), 5);
      assert.equal(await page.locator("#kamiparaHistory .release-kp-performance").count(), 10);
      assert.equal(await page.locator("#kamiparaHistory .release-kp-event[open]").count(), 0);
      assert.deepEqual(await page.locator("#kamiparaYearFilter button").allTextContents(), ["全期間 10件", "2013 6件", "2015 1件", "2019 2件", "2023 1件"]);
      await page.locator("#kamiparaHistory .release-kp-event").nth(0).locator("summary").click();
      await page.locator("#kamiparaHistory .release-kp-event").nth(1).locator("summary").click();
      assert.equal(await page.locator("#kamiparaHistory .release-kp-event[open]").count(), 2);
      await page.locator('#kamiparaYearFilter button[data-year="2019"]').click();
      assert.equal(await page.locator("#kamiparaHistory .release-kp-event:visible").count(), 2);
      await page.locator("#kamiparaHistory .release-kp-event:visible").first().locator("summary").click();
      assert.match(await page.locator("#kamiparaHistory .release-kp-event:visible").first().innerText(), /アカペラ歌唱（1番のみ）/);
      assert.equal(await page.locator('#kamiparaDashboardSection a[href="kamipara.html"]').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await page.goto(`http://127.0.0.1:${server.address().port}/release.html?id=R0015`);
      await page.locator("#mainContent:not([hidden])").waitFor();
      assert.equal(await page.locator("#kamiparaHistorySection").isVisible(), false);
      assert.equal(await page.locator("#kamiparaDashboardSection").isVisible(), false);
      assert.equal(dashboardRequests, 1, "other Release must not request kamiparaDashboard");
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
