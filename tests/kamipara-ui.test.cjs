"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const API = "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

test("神パラDashboardは実APIデータを1280pxと390pxで表示する", async () => {
  const apiResponse = await (await fetch(`${API}?action=kamiparaDashboard`)).json();
  assert.equal(apiResponse.success, true);
  const venueIds = [...new Set(apiResponse.data.events.map(event => event.venueId).filter(Boolean))];
  const venues = new Map(await Promise.all(venueIds.map(async id => [id, await (await fetch(`${API}?action=venue&id=${id}`)).json()])));
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    browser = await chromium.launch({ headless: true, executablePath: process.env.MUSDB_BROWSER_EXECUTABLE || (fs.existsSync(systemChrome) ? systemChrome : undefined) });
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/script\.google\.com\/macros\/s\//, async route => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");
        const payload = action === "kamiparaDashboard" ? apiResponse : action === "venue" ? venues.get(url.searchParams.get("id")) : { success: true, data: { dataRevision: apiResponse.data.revision } };
        const callback = url.searchParams.get("callback");
        await route.fulfill({ status: 200, contentType: "text/javascript", body: callback ? `${callback}(${JSON.stringify(payload)});` : JSON.stringify(payload) });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/kamipara.html`);
      await page.locator("#kpContent:not([hidden])").waitFor();
      assert.equal(await page.locator("#kpCharacters .kp-card").count(), 9);
      assert.equal(await page.locator("#kpSongs .kp-song-card").count(), 10);
      assert.equal(await page.locator("#kpHistory .kp-event").count(), 5);
      assert.equal(await page.locator("#kpHistory .kp-performance").count(), 10);
      assert.deepEqual(await page.locator("#kpContent > section h2").allTextContents(), ["神パラとμ'sの関係", "神パラ歌唱ヒストリー", "収録楽曲", "9人のキャラクター"]);
      assert.equal(await page.locator("#kpPresence").count(), 0);
      assert.match(await page.locator("#kpSongs").innerText(), /歌唱記録未確認/);
      assert.deepEqual(await page.locator("#kpYearFilter button").allTextContents(), ["全期間 10件", "2013 6件", "2015 1件", "2019 2件", "2023 1件"]);
      assert.equal(await page.locator('#kpYearFilter button[data-year="all"]').getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator("#kpHistory .kp-event[open]").count(), 0);
      await page.locator("#kpHistory .kp-event").nth(0).locator("summary").click();
      await page.locator("#kpHistory .kp-event").nth(1).locator("summary").click();
      assert.equal(await page.locator("#kpHistory .kp-event[open]").count(), 2);
      assert.match(await page.locator("#kpHistory .kp-event").first().innerText(), /15\. 革命ですね？神様！[\s\S]*20\. 閃光Resolution/);
      for (const [year, count] of [["2013", 1], ["2015", 1], ["2023", 1]]) {
        await page.locator(`#kpYearFilter button[data-year="${year}"]`).click();
        assert.equal(await page.locator("#kpHistory .kp-event:visible").count(), count);
        assert.equal(await page.locator(`#kpYearFilter button[data-year="${year}"]`).getAttribute("aria-pressed"), "true");
      }
      await page.locator('#kpYearFilter button[data-year="2019"]').click();
      assert.equal(await page.locator("#kpHistory .kp-event:visible").count(), 2);
      assert.equal(await page.locator("#kpHistory .kp-event:visible .kp-performance").count(), 2);
      await page.locator("#kpHistory .kp-event:visible").first().locator("summary").click();
      assert.match(await page.locator("#kpHistory .kp-event:visible").first().innerText(), /アカペラ歌唱（1番のみ）/);
      await page.locator('#kpYearFilter button[data-year="all"]').click();
      assert.equal(await page.locator("#kpHistory .kp-event:visible").count(), 5);
      assert.equal(await page.locator(".kp-easter").count(), 5);
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(horizontalOverflow, false, `${width}px horizontal overflow`);
      assert.deepEqual(errors, []);
      if (process.env.MUSDB_KAMIPARA_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.MUSDB_KAMIPARA_SCREENSHOT_DIR, `kamipara-${width}.png`), fullPage: true });
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
