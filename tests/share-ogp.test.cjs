"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mus-song-db.com/";
const cases = [
  ["song", "S003", "Snow halation"],
  ["song", "S089", "そして最後のページには"],
  ["event", "EV0001", "First LoveLive"],
  ["event", "EV0108", "Final LoveLive"]
];

test("four prototype pages contain individual raw metadata without meta refresh", () => {
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  for (const [type, id, title] of cases) {
    const html = fs.readFileSync(path.join(ROOT, "share", type, `${id}.html`), "utf8");
    assert.match(html, new RegExp(title));
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<meta property="og:title" content="[^"]+">/);
    assert.match(html, /<meta property="og:description" content="[^"]+">/);
    assert.match(html, new RegExp(`<meta property="og:url" content="${SITE}share/${type}/${id}\\.html">`));
    const detail = type === "song" ? `${SITE}song/${id}.html` : `${SITE}${type}.html?id=${id}`;
    assert.ok(html.includes(`<link rel="canonical" href="${detail}">`));
    assert.match(html, /<meta name="robots" content="noindex,follow">/);
    assert.match(html, /<meta property="og:type" content="website">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/mus-song-db\.com\/assets\/images\/og-default-v2\.png">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<meta name="twitter:title" content="[^"]+">/);
    assert.match(html, /<meta name="twitter:description" content="[^"]+">/);
    assert.match(html, /<meta name="twitter:image" content="[^"]+">/);
    assert.doesNotMatch(html, /http-equiv="refresh"/i);
    assert.doesNotMatch(sitemap, new RegExp(`share/${type}/${id}`));
  }
});

test("share pages redirect humans and retain a link when JavaScript is off", async () => {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = path.resolve(ROOT, pathname.slice(1));
    if (path.relative(ROOT, file).startsWith("..") || !fs.existsSync(file)) return response.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    response.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
  try {
    for (const [type, id] of [["song", "S003"], ["event", "EV0001"]]) {
      const detail = (type === "song" ? `${SITE}song/${id}.html` : `${SITE}${type}.html?id=${id}`);
      const page = await browser.newPage();
      await page.route(detail, route => route.fulfill({ contentType: "text/html", body: "<title>detail reached</title>" }));
      await page.goto(`${base}/share/${type}/${id}.html`);
      await page.waitForURL(detail);
      assert.equal(page.url(), detail);
      await page.close();

      const noJs = await browser.newPage({ javaScriptEnabled: false });
      await noJs.route(detail, route => route.fulfill({ contentType: "text/html", body: "<title>detail reached</title>" }));
      await noJs.goto(`${base}/share/${type}/${id}.html`);
      assert.equal(await noJs.locator("main a").getAttribute("href"), detail);
      await noJs.locator("main a").click();
      await noJs.waitForURL(detail);
      await noJs.close();
    }

    const song = await browser.newPage();
    await song.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: async data => { window.__sharedUrl = data.url; } });
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async url => { window.__copiedUrl = url; } } });
    });
    await song.route(/script\.google(?:usercontent)?\.com/, route => route.abort());
    await song.goto(`${base}/song.html?id=S003`, { waitUntil: "domcontentloaded" });
    await song.locator("#songShareActions").waitFor({ state: "visible", timeout: 30000 });
    const shareUrl = `${base}/share/song/S003.html`;
    assert.equal(new URL(await song.locator("#xShareButton").getAttribute("href")).searchParams.get("url"), shareUrl);
    await song.locator("#shareButton").click({ force: true });
    assert.equal(await song.evaluate(() => window.__sharedUrl), shareUrl);
    await song.locator("#copyUrlButton").click({ force: true });
    assert.equal(await song.evaluate(() => window.__copiedUrl), shareUrl);
    await song.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
