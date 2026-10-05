"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const current = JSON.parse(fs.readFileSync(path.join(root, "data/current.json")));
const songDir = path.join(root, "data/snapshots", current.revision, "songs");
const songs = fs.readdirSync(songDir).map(file => {
  const song = JSON.parse(fs.readFileSync(path.join(songDir, file))).data;
  const dates = song.performances.map(row => row.date).sort();
  return { ...song, songCategory: song.category, performanceCount: song.performances.length,
    firstPerformanceDate: dates[0] || "", lastPerformanceDate: dates.at(-1) || "" };
});
const master = JSON.parse(fs.readFileSync(path.join(root, "data/song-view-groups.json")));
let server, browser, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, "." + new URL(req.url, "http://localhost").pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    res.setHeader("content-type", `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8`);
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(chrome) ? chrome : undefined });
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });

async function open(width, query = "") {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route(/script\.google(?:usercontent)?\.com/, route => {
    const url = new URL(route.request().url());
    const data = url.searchParams.get("action") === "revision" ? current : { songs };
    return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({ success: true, data })});` });
  });
  await page.goto(`${base}/songs.html${query}`);
  await page.waitForSelector("#allSongsSection:not([hidden])");
  const decline = page.getByRole("button", { name: "同意しない", exact: true });
  if (await decline.isVisible()) await decline.click();
  return { page, errors };
}
async function ids(page) {
  return page.locator("#songsList .song-list-card").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id")));
}
async function more(page) { while (await page.locator("#moreButton").isVisible()) await page.locator("#moreButton").click(); }
async function count(page, expected) { assert.match(await page.locator("#resultText").textContent(), new RegExp(`^${expected} / 117曲`)); }

for (const width of [1280, 390]) test(`Song group filter ${width}px`, async () => {
  const { page, errors } = await open(width);
  try {
    assert.equal(await page.locator("#songSort").inputValue(), "id");
    assert.equal(await page.locator("#mediaFilters, #categoryFilters").count(), 0);
    await count(page, 117);
    await more(page);
    assert.deepEqual(await ids(page), songs.map(song => song.songId).sort());
    await page.locator(".song-group-toggle").click();
    const expected = { general: 46, "blu-ray": 21, game: 6, solo: 13, "duo-trio": 4, unit: 27 };
    for (const [group, size] of Object.entries(expected)) {
      await page.locator('.song-group-actions [data-action="clear"]').click();
      await page.locator(`input[data-group="${group}"]:not([data-key])`).check();
      await count(page, size);
    }
    for (const subgroup of ["printemps", "lily-white", "bibi"]) {
      await page.locator('.song-group-actions [data-action="clear"]').click();
      await page.locator(`input[data-key="unit:${subgroup}"]`).check();
      await count(page, 9);
      assert.equal(await page.locator('input[data-group="unit"]:not([data-key])').evaluate(node => node.indeterminate), true);
    }
    await page.locator('.song-group-actions [data-action="clear"]').click();
    await page.locator('input[data-group="game"]:not([data-key])').check();
    await page.locator('input[data-group="solo"]:not([data-key])').check();
    await count(page, 19);
    const expectedIds = master.assignments.filter(item => item.group === "solo").flatMap(item => item.songIds).sort()
      .concat(master.assignments.filter(item => item.group === "game").flatMap(item => item.songIds));
    assert.deepEqual(await ids(page), expectedIds);
    await page.locator("#songSearch").fill("存在しない曲名");
    await count(page, 0);
    assert.equal(await page.locator(".songs-empty").count(), 1);
    await page.locator("#songSearch").fill("");
    await page.locator('.song-group-actions [data-action="all"]').click();
    await count(page, 117);
    await page.locator('.song-group-actions [data-action="clear"]').click();
    await count(page, 117);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".song-group-toggle").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(".song-group-toggle").evaluate(node => node.matches(":focus-visible")), true);
    await page.locator("#songSearch").fill("Snow halation");
    await count(page, 1);
    assert.deepEqual(await ids(page), ["S003"]);
    await page.locator("#songSearch").fill("");
    await page.locator('[data-performance="unperformed"]').click();
    await count(page, songs.filter(song => !song.performanceCount).length);
    await page.locator('[data-performance=""]').click();
    await page.locator("#songSort").selectOption("performance");
    assert.equal(new URL(page.url()).searchParams.get("sort"), "performance");
    assert.equal((await ids(page))[0], songs.slice().sort((a, b) => b.performanceCount - a.performanceCount)[0].songId);
    for (const sort of ["recent", "first-old", "first-new", "gap", "name", "id"]) await page.locator("#songSort").selectOption(sort);
    await page.locator(".song-group-toggle").click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator(".song-group-panel").screenshot({ path: path.join(root, `outputs/song-group-filter-${width}.png`) });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#allSongSelect option").count(), 118);
    await page.locator("#songsList .song-list-card").first().click();
    await page.waitForURL("**/song.html?id=S001");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("Existing sort query remains valid", async () => {
  const { page } = await open(1280, "?sort=performance&q=Snow%20halation");
  try { assert.equal(await page.locator("#songSort").inputValue(), "performance"); await count(page, 1); }
  finally { await page.close(); }
});
