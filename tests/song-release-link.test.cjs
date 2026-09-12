"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const API_PATTERN = /script\.google(?:usercontent)?\.com/i;
let server;
let browser;
let baseUrl;

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "song.html" : pathname.replace(/^\/+/, ""));
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function openSong(songId, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  await page.route(API_PATTERN, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("action") !== "revision") { await route.continue(); return; }
    const callback = url.searchParams.get("callback");
    await route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, data: { dataRevision: "song-release-test" } })});` });
  });
  await page.goto(`${baseUrl}/song.html?id=${encodeURIComponent(songId)}`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
  return { page, issues };
}

test("曲詳細とRelease詳細の相互リンク", { timeout: 5 * 60 * 1000 }, async t => {
  await t.test("S100は4作品・13件をRelease単位でgroupしR0090の2relationを保持", async () => {
    const { page, issues } = await openSong("S100");
    assert.equal(await page.locator("#includedReleasesCount").innerText(), "4作品・13件");
    assert.equal(await page.locator(".song-included-release-card").count(), 4);
    assert.equal(await page.locator(".song-included-relation-row").count(), 13);
    const debut = page.locator('.song-included-release-card:has(.song-included-release-link[href="release.html?id=R0058"])');
    assert.equal(await debut.locator(".song-included-release-badge.debut").innerText(), "初出");
    const memorial = page.locator('.song-included-release-card:has(.song-included-release-link[href="release.html?id=R0090"])');
    assert.equal(await memorial.locator(".song-included-relation-row").count(), 2);
    assert.equal(await memorial.locator(".song-included-variant").innerText(), "Movie Edit");
    assert.match(await memorial.innerText(), /Disc 12 \/ Track 3[\s\S]*Disc 12 \/ Track 4/);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("S046はR0081の通常版とBitter-Sweet Mixを別relationで表示", async () => {
    const { page, issues } = await openSong("S046");
    assert.equal(await page.locator("#includedReleasesCount").innerText(), "4作品・5件");
    const best = page.locator('.song-included-release-card:has(.song-included-release-link[href="release.html?id=R0081"])');
    assert.equal(await best.locator(".song-included-relation-row").count(), 2);
    const mix = best.locator(".song-included-relation-row", { hasText: "Bitter-Sweet Mix" });
    assert.match(await mix.innerText(), /Disc 3 \/ Track 9/);
    assert.equal(await mix.locator(".song-included-variant").innerText(), "Bitter-Sweet Mix");
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("収録リリース0件とschema欠落は区別する", async () => {
    for (const testCase of [
      { id: "S100", value: [], expected: "収録リリースの登録はありません。", className: ".song-included-releases-empty" },
      { id: "S100", value: undefined, expected: "収録情報を表示できません。再読み込みしてください。", className: ".song-included-releases-error" }
    ]) {
      const page = await browser.newPage();
      await page.route(API_PATTERN, async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get("action") !== "song") { await route.continue(); return; }
        const response = await route.fetch();
        const body = await response.text();
        const match = body.match(/^([^()]+)\((.*)\);?\s*$/s);
        assert.ok(match, "Song API JSONP response");
        const payload = JSON.parse(match[2]);
        if (testCase.value === undefined) delete payload.data.includedReleases;
        else payload.data.includedReleases = testCase.value;
        await route.fulfill({ status: 200, contentType: "text/javascript", body: `${match[1]}(${JSON.stringify(payload)});` });
      });
      await page.goto(`${baseUrl}/song.html?id=${testCase.id}`, { waitUntil: "domcontentloaded" });
      await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
      assert.equal((await page.locator(testCase.className).innerText()).replace(/\s+/g, ""), testCase.expected.replace(/\s+/g, ""));
      assert.equal(await page.locator("#status.error").count(), 0);
      await page.close();
    }
  });

  await t.test("欠損位置・日付・classification fallbackとXSSを安全に表示", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route(API_PATTERN, async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("action") !== "song") { await route.continue(); return; }
      const response = await route.fetch();
      const body = await response.text();
      const match = body.match(/^([^()]+)\((.*)\);?\s*$/s);
      assert.ok(match, "Song API JSONP response");
      const payload = JSON.parse(match[2]);
      payload.data.debutRelease = null;
      payload.data.includedReleases = [{ relationId: "RT9000", releaseId: "R9000", releaseName: "<img src=x onerror=alert(1)>", releaseDate: null, classification: "<script>alert(1)</script>", releaseType: "", disc: null, track: null, displayOrder: 1, variant: "<b>Movie Edit</b>" }];
      await route.fulfill({ status: 200, contentType: "text/javascript", body: `${match[1]}(${JSON.stringify(payload)});` });
    });
    await page.goto(`${baseUrl}/song.html?id=S100`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    const section = page.locator("#includedReleasesSection");
    assert.match(await section.innerText(), /発売日未登録/);
    assert.match(await section.innerText(), /位置情報なし/);
    assert.match(await section.innerText(), /<script>alert\(1\)<\/script>/);
    assert.match(await section.innerText(), /<b>Movie Edit<\/b>/);
    assert.equal(await section.locator("img, script, b").count(), 0);
    assert.equal(await section.locator(".song-included-release-badge.debut").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.close();
  });

  await t.test("S100・S095・S032はdebutRelease.releaseIdへリンクする", async () => {
    for (const expected of [
      { songId: "S100", releaseId: "R0058", recordingCd: "SUNNY DAY SONG／？←HEARTBEAT" },
      { songId: "S095", releaseId: "R0054", recordingCd: "MUSEUMでどうしたい" },
      { songId: "S032", releaseId: "R0015", recordingCd: "Wonderful Rush" }
    ]) {
      const { page, issues } = await openSong(expected.songId);
      const link = page.locator(".release-detail-link");
      assert.equal(await link.innerText(), "リリース詳細を見る");
      assert.equal(new URL(await link.getAttribute("href"), baseUrl).searchParams.get("id"), expected.releaseId);
      const body = await page.locator("#releaseSection").innerText();
      assert.match(body, new RegExp(expected.recordingCd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(body, /発売日/);
      assert.match(body, /メディア/);
      assert.equal(await page.locator("#releaseSection .official-release-link[target='_blank']").count(), 1);
      assert.doesNotMatch(body, new RegExp(`Release ID|初出Release ID|debutRelease|${expected.releaseId}`));
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("debutReleaseなしではリンクを表示しない", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const issues = [];
    page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
    await page.route(API_PATTERN, async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("action") !== "song") { await route.continue(); return; }
      const response = await route.fetch();
      const body = await response.text();
      const match = body.match(/^([^()]+)\((.*)\);?\s*$/s);
      assert.ok(match, "Song API JSONP response");
      const payload = JSON.parse(match[2]);
      payload.data.debutRelease = null;
      await route.fulfill({ status: 200, contentType: "text/javascript", body: `${match[1]}(${JSON.stringify(payload)});` });
    });
    await page.goto(`${baseUrl}/song.html?id=S100`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    assert.equal(await page.locator(".release-detail-link").count(), 0);
    assert.match(await page.locator("#releaseSection").innerText(), /SUNNY DAY SONG/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("S100からR0058を経由してS100・S101へ遷移できる", async () => {
    const { page, issues } = await openSong("S100", { width: 390, height: 844 });
    await page.locator(".release-detail-link").click();
    await page.waitForURL(/release\.html\?id=R0058/);
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    assert.deepEqual((await page.locator(".release-song-row").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id")))).sort(), ["S100", "S101"]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.locator(".release-song-row[href*='id=S100']").click();
    await page.waitForURL(/song\.html\?id=S100/);
    await page.locator(".release-detail-link").waitFor({ state: "visible", timeout: 45000 });
    await page.goBack();
    await page.locator(".release-song-row[href*='id=S101']").click();
    await page.waitForURL(/song\.html\?id=S101/);
    await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("追加リンクは各viewportで横overflowを起こさない", async () => {
    const { page, issues } = await openSong("S095");
    for (const width of [1080, 900, 620, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
    }
    assert.deepEqual(issues, []);
    await page.close();
  });
});
