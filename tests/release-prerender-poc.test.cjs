"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const ids = ["R0010", "R0083", "R0094"];
const revision = require("../data/current.json").revision;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

async function main() {
  const hashes = new Set();
  for (const id of ids) {
    const html = fs.readFileSync(path.join(root, "release", `${id}.html`), "utf8");
    const release = require(`../data/snapshots/${revision}/releases/${id}.json`).data;
    hashes.add(crypto.createHash("sha256").update(html).digest("hex"));
    assert.match(html, new RegExp(`<title>${escapeRegex(release.releaseName)}｜μ's Song Database</title>`));
    assert.match(html, new RegExp(`https://mus-song-db.com/release/${id}\\.html`));
    assert.ok(html.includes(`<h1 id="releaseName">${release.releaseName}</h1>`));
    assert.ok(html.includes(release.releaseDate));
    assert.ok(html.includes(release.releaseType));
    assert.ok(html.includes(release.includedSongs?.[0]?.displayName || "収録楽曲の登録はありません"));
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.equal((html.match(/property="og:description"/g) || []).length, 1);
    assert.equal((html.match(/property="og:url"/g) || []).length, 1);
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.equal(JSON.parse(scripts[0][1])["@type"], "BreadcrumbList");
  }
  assert.equal(hashes.size, 3);
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, pathname.slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const width of [1280, 390]) {
      for (const id of ["R0001", ...ids, "R0114", "legacy-R0010", "legacy-R0094"]) {
        const releaseId = id.startsWith("legacy-") ? id.slice(7) : id;
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        await page.route("**/*", route => {
          const url = new URL(route.request().url());
          if (url.origin === origin) return route.continue();
          if (url.searchParams.get("callback")) return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({ success: true, data: {} })});` });
          return route.abort();
        });
        const url = id.startsWith("legacy") ? `${origin}/release.html?id=${releaseId}` : `${origin}/release/${id}.html`;
        await page.goto(url);
        if (id.startsWith("legacy")) await page.waitForURL(`${origin}/release/${releaseId}.html`);
        await page.waitForFunction(() => !document.getElementById("mainContent").hidden && document.getElementById("status").hidden, { timeout: 20000 });
        const release = require(`../data/snapshots/${revision}/releases/${releaseId}.json`).data;
        assert.equal(await page.locator("h1").innerText(), release.releaseName);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${id} ${width} overflow`);
        assert.deepEqual(errors, [], `${id} ${width} errors`);
        console.log(`${id} ${width}: PASS`);
        await page.close();
      }
      const invalid = await browser.newPage({ viewport: { width, height: 900 } });
      await invalid.goto(`${origin}/release.html?id=INVALID`);
      await invalid.locator("#status.error").waitFor({ state: "visible" });
      assert.ok(invalid.url().endsWith("release.html?id=INVALID"));
      await invalid.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log("raw HTML 3/3 distinct; browser 14/14 PASS");
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
main().catch(error => { console.error(error); process.exitCode = 1; });
