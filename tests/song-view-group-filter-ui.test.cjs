"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
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
let server, browser, base, qaDirectory;
const qaParent = fs.realpathSync(os.tmpdir());
test.before(async () => {
  qaDirectory = fs.mkdtempSync(path.join(qaParent, "musdb-song-group-ui-"));
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
test.after(async () => {
  try {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
  } finally {
    if (qaDirectory) {
      const target = fs.realpathSync(qaDirectory);
      assert.equal(path.dirname(target), qaParent);
      assert.equal(target, qaDirectory);
      fs.rmSync(target, { recursive: true });
    }
  }
});

async function open(width, query = "", mobile = false) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile });
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
  return page.locator("#songsList .song-list-card").evaluateAll(nodes => nodes.map(node => new URL(node.href).pathname.match(/\/song\/(S\d+)\.html$/)?.[1]));
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
    await page.locator(".song-group-panel").screenshot({ path: path.join(qaDirectory, `song-group-filter-${width}.png`) });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#allSongSelect option").count(), 118);
    await page.locator("#songsList .song-list-card").first().click();
    await page.waitForURL("**/song/S001.html");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("Existing sort query remains valid", async () => {
  const { page } = await open(1280, "?sort=performance&q=Snow%20halation");
  try { assert.equal(await page.locator("#songSort").inputValue(), "performance"); await count(page, 1); }
  finally { await page.close(); }
});

// Check glyph rectangles, not just the page's scrollWidth: overflowing text can
// collide inside a card without widening the document. Hidden native checkboxes
// are represented by the visible ::before grid cell.
async function assertContainedLayout(page, width) {
  const failures = await page.evaluate(() => {
    const errors = [], tolerance = 1;
    const inside = (a, b) => b.left >= a.left - tolerance && b.right <= a.right + tolerance && b.top >= a.top - tolerance && b.bottom <= a.bottom + tolerance;
    const collides = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
    function glyphs(node) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), rectangles = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        rectangles.push(...range.getClientRects());
      }
      return rectangles;
    }
    function enclosed(node, parent, label) {
      const outer = parent.getBoundingClientRect();
      if (!inside(outer, node.getBoundingClientRect()) || glyphs(node).some(rect => !inside(outer, rect))) errors.push(`${label}: outside parent`);
      if (node.scrollWidth > node.clientWidth + tolerance) errors.push(`${label}: internal horizontal overflow`);
    }
    for (const option of document.querySelectorAll('.song-group-option')) {
      if (!option.getClientRects().length) continue;
      const label = option.children[1], count = option.querySelector('small'), box = option.getBoundingClientRect(), style = getComputedStyle(option), before = getComputedStyle(option, '::before');
      enclosed(option, option.parentElement, label.textContent);
      enclosed(label, option, `${label.textContent}: label`);
      enclosed(count, option, `${label.textContent}: count`);
      const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const checkWidth = style.display.includes('grid') ? parseFloat(style.gridTemplateColumns) : parseFloat(before.flexBasis) + parseFloat(before.borderLeftWidth) + parseFloat(before.borderRightWidth);
      const height = parseFloat(before.height) + (before.boxSizing === 'border-box' ? 0 : parseFloat(before.borderTopWidth) + parseFloat(before.borderBottomWidth));
      const check = { left, right: left + checkWidth, top: box.top + (box.height - height) / 2, bottom: box.top + (box.height + height) / 2 };
      if (!inside(box, check)) errors.push(`${label.textContent}: check outside option`);
      if (glyphs(label).some(rect => collides(rect, count.getBoundingClientRect()) || collides(rect, check)) || glyphs(count).some(rect => collides(rect, check))) errors.push(`${label.textContent}: check/label/count collision`);
      if (getComputedStyle(count).whiteSpace !== 'nowrap') errors.push(`${label.textContent}: count wraps`);
    }
    for (const row of document.querySelectorAll('.song-group-row, .song-group-subgroups')) {
      if (!row.getClientRects().length) continue;
      const children = [...row.children];
      for (const child of children) enclosed(child, row, 'group child');
      for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) if (collides(children[i].getBoundingClientRect(), children[j].getBoundingClientRect())) errors.push('group options collide');
    }
    for (const stats of document.querySelectorAll('.song-list-stats')) {
      const cells = [...stats.children];
      for (const stat of cells) {
        enclosed(stat, stats, 'stat cell');
        enclosed(stat.querySelector('b'), stat, 'stat value');
        enclosed(stat.querySelector('span'), stat, 'stat label');
        if (glyphs(stat.querySelector('b')).some(a => glyphs(stat.querySelector('span')).some(b => collides(a, b)))) errors.push('stat value/label collision');
      }
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (collides(cells[i].getBoundingClientRect(), cells[j].getBoundingClientRect())) errors.push('stat cells collide');
    }
    return { errors, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
  });
  assert.deepEqual(failures.errors, [], JSON.stringify(failures));
  assert.ok(failures.documentWidth <= width + 1, `configured width ${width}: ${JSON.stringify(failures)}`);
  assert.ok(failures.viewportWidth <= width + 1, `mobile viewport expanded: ${JSON.stringify(failures)}`);
}

for (const width of [320, 360, 375, 390, 393, 430]) for (const percent of [100, 125, 150]) {
  test(`Mobile glyph containment and filters ${width}px / ${percent}%`, async () => {
    const { page, errors } = await open(width, '', true);
    try {
      // Chromium's mobile text-size-adjust exercises text-only scaling; it is
      // not a claim that physical iOS Safari page zoom has been tested.
      await page.locator('.songs-page').evaluate((node, value) => { node.style.webkitTextSizeAdjust = `${value}%`; }, percent);
      await more(page);
      const options = await page.locator('.song-group-option').allTextContents();
      await page.locator('.song-group-toggle').click();
      assert.equal(await page.locator('.song-group-panel').isVisible(), true);
      await assertContainedLayout(page, width);
      assert.equal(await page.locator('.song-group-option').count(), 9);
      assert.deepEqual(await page.locator('.song-group-option').allTextContents(), options);
      const values = await page.locator('.song-list-card').evaluateAll(cards => cards.map(card => ({ id: new URL(card.href).pathname.match(/S\d+/)[0], values: [...card.querySelectorAll('.song-list-stat b')].map(node => node.textContent) })));
      for (const card of values) {
        const song = songs.find(song => song.songId === card.id);
        assert.deepEqual(card.values, [`${song.performanceCount.toLocaleString('ja-JP')}回`, song.firstPerformanceDate.replaceAll('-', '/') || '—', song.lastPerformanceDate.replaceAll('-', '/') || '—']);
      }
      assert.ok(Math.abs(parseFloat(await page.locator('.song-list-stat b').first().evaluate(node => getComputedStyle(node).fontSize)) - 14 * percent / 100) < 0.1, 'text scaling must actually be active');
      await page.locator('input[data-group="general"]').check(); await count(page, 46);
      await page.locator('.song-group-actions [data-action="clear"]').click();
      await page.locator('input[data-key="unit:printemps"]').check(); await count(page, 9);
      assert.equal(await page.locator('input[data-group="unit"]:not([data-key])').evaluate(node => node.indeterminate), true);
      await assertContainedLayout(page, width);
      await page.locator('.song-group-actions [data-action="all"]').click(); await count(page, 117);
      await page.locator('.song-group-actions [data-action="clear"]').click(); await count(page, 117);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.song-group-toggle').getAttribute('aria-expanded'), 'false');
      await page.locator('#songSearch').fill('Snow halation'); await count(page, 1); assert.deepEqual(await ids(page), ['S003']);
      await page.locator('#songSearch').fill('');
      await page.locator('#songSort').selectOption('performance'); assert.equal((await ids(page))[0], songs.slice().sort((a, b) => b.performanceCount - a.performanceCount)[0].songId);
      assert.equal(new URL(page.url()).searchParams.get('sort'), 'performance');
      await assertContainedLayout(page, width);
      await page.locator('[data-performance="unperformed"]').click(); await count(page, songs.filter(song => !song.performanceCount).length);
      await assertContainedLayout(page, width);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test('Mobile long unbroken label and count remain separate', async () => {
  const { page, errors } = await open(320, '', true);
  try {
    await page.locator('.songs-page').evaluate(node => { node.style.webkitTextSizeAdjust = '150%'; });
    await page.locator('.song-group-toggle').click();
    const label = 'VeryLongUnbrokenEnglishLabel長い日本語の曲グループ名';
    await page.locator('.song-group-subgroup').first().evaluate((option, text) => { option.children[1].textContent = text; option.querySelector('small').textContent = '12345'; }, label);
    await assertContainedLayout(page, 320);
    assert.equal(await page.locator('.song-group-subgroup').first().locator('span').textContent(), label);
    assert.equal(await page.locator('.song-group-subgroup').first().locator('small').textContent(), '12345');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
