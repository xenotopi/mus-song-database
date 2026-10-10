"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const data = require("../data/amazon-products.json");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const fixtureAsin = "B000000000";
const fixtureUrl = new URL(`/dp/${fixtureAsin}`, "https://www.amazon.co.jp");
fixtureUrl.searchParams.set("tag", "mussongdb-22");
let server;
let browser;
let origin;

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(root, pathname.replace(/^\/+/, ""));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome" });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function openRelease(id, width, products) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/data/amazon-products.json", route => products == null ? route.continue() : route.fulfill({ contentType: "application/json", body: JSON.stringify(products) }));
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const callback = new URL(route.request().url()).searchParams.get("callback");
    return callback ? route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data: {} })});` }) : route.abort();
  });
  const loaded = page.waitForResponse(response => response.url().endsWith("/data/amazon-products.json"));
  await page.goto(`${origin}/release/${id}.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
  await loaded;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { page, errors };
}

test("production registry is empty and R0010 / R0094 have no Amazon DOM", async () => {
  assert.deepEqual(data, {});
  for (const id of ["R0010", "R0094"]) for (const width of [1280, 390]) {
    const { page, errors } = await openRelease(id, width, null);
    assert.equal(await page.locator(".release-amazon, .release-amazon-link, link[data-release-amazon-style]").count(), 0, `${id} ${width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${id} ${width} overflow`);
    assert.deepEqual(errors, [], `${id} ${width} errors`);
    await page.close();
  }
});

test("fixture product renders only at B placement with external-link attributes", async () => {
  for (const width of [1280, 390]) {
    const { page, errors } = await openRelease("R0010", width, { R0010: { asin: fixtureAsin, url: fixtureUrl.href } });
    const link = page.locator(".release-amazon-link");
    await link.waitFor({ state: "visible" });
    assert.equal(await link.innerText(), "Amazon.co.jpで見る");
    assert.equal(await link.getAttribute("href"), fixtureUrl.href);
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer sponsored");
    assert.equal(await page.locator("#officialRelease + .release-amazon").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width} overflow`);
    assert.deepEqual(errors, [], `${width} errors`);
    await page.close();
  }
});

test("unregistered or invalid products create no Amazon DOM", async () => {
  for (const products of [
    { R0094: { asin: fixtureAsin, url: fixtureUrl.href } },
    { R0010: { asin: fixtureAsin, url: "javascript:alert(1)" } },
    { R0010: { asin: fixtureAsin, url: "https://example.com/" } },
    { R0010: { asin: fixtureAsin, url: fixtureUrl.href.replace("mussongdb-22", "other-tag") } },
    { R0010: { asin: "B111111111", url: fixtureUrl.href } }
  ]) {
    const { page, errors } = await openRelease("R0010", 1280, products);
    assert.equal(await page.locator(".release-amazon, .release-amazon-link, link[data-release-amazon-style]").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
});
