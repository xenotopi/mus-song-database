"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mus-song-db.com/";
const revision = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current.json"), "utf8")).revision;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots", revision, "manifest.json"), "utf8"));
const spots = {
  song: ["S003", "S089", "S001", "S011", "S117"],
  event: ["EV0001", "EV0108", "EV0052", "EV0222", "EV0353"]
};

function meta(html, name, attr = "content") {
  return html.match(new RegExp(`<meta (?:name|property)="${name}" ${attr}="([^"]*)">`))?.[1];
}
function escaped(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

test("all 470 share pages match current snapshots and remain outside sitemap", () => {
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /\/share\//);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 241);
  const paths = new Set();
  let total = 0;
  for (const [type, expected] of [["song", 117], ["event", 353]]) {
    const ids = Object.keys(manifest.hashes[`${type}s`]).sort();
    const files = fs.readdirSync(path.join(ROOT, "share", type)).filter(name => name.endsWith(".html"));
    assert.equal(ids.length, expected);
    assert.equal(files.length, expected);
    for (const id of ids) {
      const relative = `share/${type}/${id}.html`;
      assert.ok(files.includes(`${id}.html`));
      assert.ok(!paths.has(relative));
      paths.add(relative);
      total++;
      const html = fs.readFileSync(path.join(ROOT, relative), "utf8");
      const wrapper = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots", revision, `${type}s`, `${id}.json`), "utf8"));
      const data = type === "song" ? wrapper.data : wrapper.data.event;
      const name = type === "song" ? data.displayName || data.songName : data.eventName;
      const detail = (type === "song" ? `${SITE}song/${id}.html` : `${SITE}${type}.html?id=${id}`);
      const share = `${SITE}${relative}`;
      assert.equal(data[`${type}Id`], id);
      assert.ok(html.includes(escaped(name)));
      assert.ok(html.startsWith("<!doctype html>"));
      assert.ok(html.endsWith("</html>\n"));
      assert.ok(html.includes(`<title>${meta(html, "og:title")}</title>`));
      assert.ok(html.includes(`<meta name="description" content="${meta(html, "og:description")}">`));
      assert.ok(meta(html, "og:title"));
      assert.ok(meta(html, "og:description"));
      assert.equal(meta(html, "og:url"), share);
      assert.equal(meta(html, "og:type"), "website");
      assert.equal(meta(html, "og:image"), `${SITE}assets/images/og-default-v2.png`);
      assert.equal(meta(html, "twitter:card"), "summary_large_image");
      assert.equal(meta(html, "twitter:title"), meta(html, "og:title"));
      assert.equal(meta(html, "twitter:description"), meta(html, "og:description"));
      assert.equal(meta(html, "twitter:image"), meta(html, "og:image"));
      assert.equal(meta(html, "robots"), "noindex,follow");
      assert.ok(html.includes(`<link rel="canonical" href="${detail}">`));
      assert.ok(html.includes(`<a href="${detail}">`));
      assert.ok(html.includes(`location.replace(${JSON.stringify(detail)})`));
      assert.doesNotMatch(html, /xenotopi\.github\.io|http-equiv="refresh"/i);
    }
  }
  assert.equal(total, 470);
});

test("spot share actions and layouts work for Song and Event at 1280/390", { timeout: 120000 }, async () => {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.resolve(ROOT, pathname.slice(1) || "index.html");
    if (path.relative(ROOT, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
  try {
    const parser = await browser.newPage();
    for (const type of ["song", "event"]) {
      const htmls = Object.keys(manifest.hashes[`${type}s`]).map(id => fs.readFileSync(path.join(ROOT, "share", type, `${id}.html`), "utf8"));
      assert.equal(await parser.evaluate(items => items.every(html => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return Boolean(doc.querySelector("title")?.textContent && doc.querySelector('meta[property="og:url"]')?.content && doc.querySelector('link[rel="canonical"]')?.href && doc.querySelector("main a")?.href);
      }), htmls), true);
    }
    await parser.close();
    for (const width of [1280, 390]) {
      for (const [type, ids] of Object.entries(spots)) {
        for (const id of ids) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          const errors = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "share", { value: async data => { window.__sharedUrl = data.url; } });
            Object.defineProperty(navigator, "clipboard", { value: { writeText: async url => { window.__copiedUrl = url; } } });
          });
          await page.route(/script\.google(?:usercontent)?\.com/, route => route.abort());
          await page.goto(`${base}/${type}.html?id=${id}`, { waitUntil: "domcontentloaded" });
          const actions = type === "song" ? "#songShareActions" : "#eventShareActions";
          await page.locator(actions).waitFor({ state: "visible", timeout: 30000 });
          const share = `${base}/share/${type}/${id}.html`;
          const xId = type === "song" ? "#xShareButton" : "#eventXShareButton";
          const shareId = type === "song" ? "#shareButton" : "#eventShareButton";
          const copyId = type === "song" ? "#copyUrlButton" : "#eventCopyUrlButton";
          assert.equal(new URL(await page.locator(xId).getAttribute("href")).searchParams.get("url"), share);
          await page.locator(shareId).click({ force: true });
          assert.equal(await page.evaluate(() => window.__sharedUrl), share);
          await page.locator(copyId).click({ force: true });
          assert.equal(await page.evaluate(() => window.__copiedUrl), share);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
          assert.deepEqual(errors, [], `${type}/${id} at ${width}px`);
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
