"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "current.json"), "utf8"));
const snapshot = (type, id) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshots", current.revision, `${type}s`, `${id}.json`), "utf8"));
let server;
let browser;
let baseUrl;

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "release.html" : pathname.replace(/^\/+/, ""));
    if (path.relative(ROOT, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});

test.after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function jsonp(route, data) {
  const callback = new URL(route.request().url()).searchParams.get("callback");
  await route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data })});` });
}

test("Release detail uses valid static data without detail or list API", async () => {
  const page = await browser.newPage();
  const apiActions = [];
  await page.route(/script\.google(?:usercontent)?\.com/, route => { apiActions.push(new URL(route.request().url()).searchParams.get("action")); return route.abort(); });
  await page.goto(`${baseUrl}/release.html?id=R0088`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  assert.equal(await page.locator("#includedSongsCount").innerText(), "285件");
  assert.deepEqual(apiActions.filter(action => action === "release" || action === "releaseList"), []);
  await page.close();
});

for (const failure of ["404", "corrupt", "mismatch"]) {
  test(`Release static ${failure} falls back to detail API`, async () => {
    const page = await browser.newPage();
    let releaseCalls = 0;
    await page.route(`**/data/snapshots/**/releases/R0001.json`, route => {
      if (failure === "404") return route.fulfill({ status: 404, body: "missing" });
      if (failure === "corrupt") return route.fulfill({ status: 200, contentType: "application/json", body: "{" });
      const value = snapshot("release", "R0001");
      value.snapshot.revision = `sha256-${"f".repeat(64)}`;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    });
    await page.route(/script\.google(?:usercontent)?\.com/, route => {
      const action = new URL(route.request().url()).searchParams.get("action");
      if (action === "revision") return jsonp(route, { dataRevision: current.revision });
      if (action === "release") { releaseCalls += 1; return jsonp(route, snapshot("release", "R0001").data); }
      return route.abort();
    });
    await page.goto(`${baseUrl}/release.html?id=R0001`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainContent").waitFor({ state: "visible" });
    assert.equal(releaseCalls, 1);
    assert.match(await page.locator("#releaseName").innerText(), /僕らのLIVE/);
    await page.close();
  });
}

test("valid static Release survives complete API outage", async () => {
  const page = await browser.newPage();
  await page.route(/script\.google(?:usercontent)?\.com/, route => route.abort());
  await page.goto(`${baseUrl}/release.html?id=R0106`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainContent").waitFor({ state: "visible" });
  assert.equal(await page.locator("#includedSongsCount").innerText(), "31件");
  await page.close();
});
