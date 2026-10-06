"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const ids = ["S001", "S003", "S117"];
const current = JSON.parse(fs.readFileSync(path.join(root, "data/current.json")));
const snapshot = id => JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", current.revision, "songs", `${id}.json`))).data;
let server, browser, origin;
test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: "chrome" });
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
test("raw pages are distinct, factual, and have unique canonical metadata", () => {
  const hashes = new Set();
  for (const id of ids) {
    const raw = fs.readFileSync(path.join(root, "song", `${id}.html`), "utf8");
    const song = snapshot(id);
    hashes.add(crypto.createHash("sha256").update(raw).digest("hex"));
    assert.ok(raw.includes(song.songName));
    assert.match(raw, new RegExp(`data-song-id="${id}"`));
    assert.ok(raw.includes(`https://mus-song-db.com/song/${id}.html`));
    assert.ok(!raw.includes("undefined件"));
    assert.ok(!raw.includes('type="application/ld+json"'));
  }
  assert.equal(hashes.size, 3);
});
test("all 117 static pages parse, match snapshots, and pass build manifest hashes", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "song/manifest.json"), "utf8"));
  assert.equal(manifest.count, 117);
  assert.equal(manifest.outputRevision, current.revision);
  assert.equal(manifest.rendererSha256, require("../tools/generate-song-pages.cjs").rendererFingerprint());
  const page = await browser.newPage();
  const canonicals = new Set();
  for (const id of Object.keys(manifest.pages)) {
    const raw = fs.readFileSync(path.join(root, "song", `${id}.html`), "utf8");
    const song = snapshot(id);
    assert.equal(crypto.createHash("sha256").update(raw).digest("hex"), manifest.pages[id].sha256);
    const parsed = await page.evaluate(raw => {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      return { id: doc.documentElement.dataset.songId, h1: doc.querySelector("h1").textContent,
        title: doc.title, description: doc.querySelector('meta[name="description"]').content,
        canonical: doc.querySelector('link[rel="canonical"]').getAttribute("href"),
        canonicalCount: doc.querySelectorAll('link[rel="canonical"]').length,
        og: doc.querySelector('meta[property="og:url"]').content,
        robots: doc.querySelector('meta[name="robots"]').content };
    }, raw);
    assert.equal(parsed.id, id); assert.equal(parsed.h1, song.displayName || song.songName);
    assert.equal(parsed.title, `${song.displayName || song.songName}｜μ's Song Database`);
    assert.ok(parsed.description); assert.equal(parsed.canonicalCount, 1);
    assert.equal(parsed.canonical, `https://mus-song-db.com/song/${id}.html`);
    assert.equal(parsed.og, parsed.canonical); assert.ok(parsed.robots.startsWith("index,follow"));
    canonicals.add(parsed.canonical);
    assert.doesNotMatch(raw, /http:\/\/127\.0\.0\.1|xenotopi\.github\.io|data-song-legacy-redirect/);
  }
  assert.equal(canonicals.size, 117);
  await page.close();
});
test("generation failure preserves current and existing HTML", async () => {
  const before = ["data/current.json", "song/manifest.json", "song/S001.html"].map(file => fs.readFileSync(path.join(root, file), "utf8"));
  await assert.rejects(require("../tools/generate-song-pages.cjs").generateSongPages({ revision: `sha256-${"f".repeat(64)}` }));
  assert.deepEqual(["data/current.json", "song/manifest.json", "song/S001.html"].map(file => fs.readFileSync(path.join(root, file), "utf8")), before);
});
test("formal generation and current switching include Song HTML generation", () => {
  const source = fs.readFileSync(path.join(root, "tools/generate-static-snapshot.cjs"), "utf8");
  assert.equal((source.match(/await generateSongPages\(\{ revision \}\)/g) || []).length, 3);
  const switchSource = source.slice(source.indexOf("async function switchCurrent"), source.indexOf("async function generate()"));
  assert.ok(switchSource.indexOf("await generateSongPages") < switchSource.indexOf("fs.writeFileSync(temp"));
});
test("legacy Song bookmarks redirect to the new path and preserve fragments", async () => {
  const page = await browser.newPage();
  await page.route(/script\.google(?:usercontent)?\.com/, route => route.fulfill({ contentType: "text/javascript", body: `${new URL(route.request().url()).searchParams.get("callback")}(${JSON.stringify({ success: true, data: current })});` }));
  for (const id of ids) {
    await page.goto(`${origin}/song.html?id=${id}&temporary=1#historySection`, { waitUntil: "networkidle" });
    assert.equal(page.url(), `${origin}/song/${id}.html#historySection`);
    assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://mus-song-db.com/song/${id}.html`);
  }
  await page.close();
});
for (const width of [1280, 390]) test(`Event / Singer / Release link regression ${width}px`, async () => {
  const songs = Object.keys(JSON.parse(fs.readFileSync(path.join(root, "song/manifest.json"))).pages).map(snapshot);
  const singerId = "SN0001";
  const history = songs.flatMap(song => song.performances.filter(row => row.singerId === singerId).map(row => ({ ...row, songId: song.songId, songName: song.displayName || song.songName })));
  const singer = {
    singerId, displayName: history[0].singerDisplayName, category: history[0].singerCategory,
    summary: { performanceCount: history.length, uniqueSongCount: new Set(history.map(row => row.songId)).size, eventCount: new Set(history.map(row => row.eventId)).size },
    songs: songs.filter(song => song.performances.some(row => row.singerId === singerId)).map(song => {
      const dates = song.performances.filter(row => row.singerId === singerId).map(row => row.date).sort();
      return { songId: song.songId, songName: song.songName, performanceCount: dates.length, firstDate: dates[0], lastDate: dates.at(-1) };
    }), history
  };
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(() => localStorage.setItem("musdb_analytics_consent", "rejected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    const callback = url.searchParams.get("callback");
    if (!callback) return route.fulfill({ body: "" });
    const action = url.searchParams.get("action");
    return route.fulfill({ contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data: action === "revision" ? current : action === "singer" ? singer : {} })});` });
  });
  for (const [url, selector] of [["event.html?id=EV0001", ".event-song-title"], ["singer.html?id=SN0001", ".singer-song-row"], ["release.html?id=R0001", ".release-song-row"]]) {
    await page.goto(`${origin}/${url}`, { waitUntil: "networkidle" });
    const link = page.locator(`${selector}[href]`).first();
    await link.waitFor();
    const href = await link.getAttribute("href"); assert.match(href, /^song\/S\d{3}\.html$/);
    await link.click(); await page.waitForURL(`${origin}/${href}`);
    assert.ok(await page.locator("#mainContent").isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
  await context.close();
});
for (const id of ids) for (const width of [1280, 390]) for (const enabled of [false, true]) {
  test(`${id} ${width}px JavaScript ${enabled ? "ON" : "OFF"}`, async () => {
    const context = await browser.newContext({ javaScriptEnabled: enabled, viewport: { width, height: 900 } });
    if (enabled) await context.addInitScript(() => localStorage.setItem("musdb_analytics_consent", "rejected"));
    const page = await context.newPage();
    const errors = [], calls = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.searchParams.get("callback")) {
        const action = url.searchParams.get("action"); calls.push(action);
        if (action === "discover" && process.env.MUSDB_POC_LIVE_DISCOVER === "1") return route.continue();
        return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({ success: true, data: action === "revision" ? current : {} })});` });
      }
      return route.fulfill({ status: 200, body: "" });
    });
    await page.goto(`${origin}/song/${id}.html`, { waitUntil: "networkidle" });
    const song = snapshot(id);
    assert.equal(await page.locator("h1").innerText(), song.displayName || song.songName);
    assert.equal(await page.locator("h1").count(), 1);
    assert.ok(await page.locator("#songInfo").isVisible());
    assert.ok(await page.locator("#songStats").isVisible());
    assert.ok((await page.locator("#songStats").innerText()).includes(String(song.performances.length)));
    assert.ok((await page.locator("#songInfo").innerText()).includes(song.recordingCd));
    assert.ok(await page.locator("#songRecordsSection").isVisible());
    assert.equal(await page.title(), `${song.displayName || song.songName}｜μ's Song Database`);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://mus-song-db.com/song/${id}.html`);
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute("content"), `https://mus-song-db.com/song/${id}.html`);
    assert.equal(await page.locator("[data-prerender-description]").count(), 1);
    if (!enabled) assert.equal(await page.locator("#musdb-analytics-consent").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    if (enabled) {
      if (process.env.MUSDB_POC_LIVE_DISCOVER === "1") {
        assert.equal(await page.locator("#songPicker option").count(), 117);
        assert.ok(await page.locator("#songSwitcher").isVisible());
        const previous = await page.locator("#previousSongButton").getAttribute("href");
        const next = await page.locator("#nextSongButton").getAttribute("href");
        for (const href of [previous, next].filter(Boolean)) assert.match(href, /^song\/S\d{3}\.html$/);
      }
      assert.equal(calls.filter(a => a === "song").length, 0);
      assert.ok(await page.locator("#historySection").isVisible());
      for (const selector of ['#historyList a[href*="event.html"]', '#includedReleasesContent a[href*="release.html"]']) {
        const links = await page.locator(selector).evaluateAll(nodes => nodes.map(n => n.href));
        for (const href of links) assert.ok(!new URL(href).pathname.startsWith("/song/"), href);
      }
      assert.equal(new URL(await page.locator("#xShareButton").getAttribute("href")).searchParams.get("url"), `${origin}/share/song/${id}.html`);
    }
    if (enabled) {
      const dir = path.join(root, "tests/artifacts/song-prerender-poc"); fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${id}-${width}.png`) });
      if (process.env.MUSDB_POC_LIVE_DISCOVER === "1" && id === "S003") {
        await page.locator("#songPicker").selectOption("S001");
        await page.waitForURL(`${origin}/song/S001.html`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.getElementById("nextSongButton").getAttribute("href") === "song/S002.html");
        await page.locator("#nextSongButton").click({ force: true });
        await page.waitForURL(`${origin}/song/S002.html`, { waitUntil: "domcontentloaded" });
      }
    }
    await context.close();
  });
}
