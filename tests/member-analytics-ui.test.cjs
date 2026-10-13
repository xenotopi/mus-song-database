"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const current = JSON.parse(fs.readFileSync(path.join(root, 'data/current.json')));
const analytics = JSON.parse(fs.readFileSync(path.join(root, 'data/snapshots', current.revision, 'member-analytics.json'))).data;
const groups = JSON.parse(fs.readFileSync(path.join(root, 'data/song-view-groups.json')));
let server;
let browser;
let baseUrl;

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(root, pathname.replace(/^\/+/, ""));
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});

test.after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

for (const width of [1280, 390]) {
  test(`Member Analytics ${width}px loads 117 Songs and switches both views`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const requests = [];
    page.on("request", request => requests.push(request.url()));
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${baseUrl}/member-analytics.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#memberAnalyticsContent").waitFor({ state: "visible" });
    assert.equal(await page.locator("#memberAnalyticsSummary tbody tr").count(), 3);
    assert.equal(await page.locator("#memberAnalyticsSummary thead th").count(), 10);
    assert.equal(await page.locator("#memberAnalyticsMobileSummary > div").count(), 9);
    assert.equal(await page.locator("#memberAnalyticsTable tbody tr").count(), 117);
    assert.equal(await page.locator("#memberAnalyticsMobileSongs article").count(), 117);
    assert.equal(await page.locator('#memberAnalyticsFilters input:not([data-key])').count(), 6);
    assert.equal(await page.locator('#memberAnalyticsFilters input[data-key]').count(), 3);
    assert.equal(await page.locator('#memberAnalyticsFilterPanel').isHidden(), true);
    assert.equal(await page.locator('#memberAnalyticsFilterToggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#memberAnalyticsFilterText').innerText(), 'すべての曲グループ');
    assert.equal(await page.locator('#memberAnalyticsFilters input[data-group="game"] + span').innerText(), "スクフェス／スクパラ曲");
    assert.equal(await page.locator('#memberAnalyticsFilters input[data-group="general"] + span').innerText(), "TVアニメ・映画・CD・誌面企画・ラジオ系");
    assert.equal(await page.locator('#memberAnalyticsFilters input[data-group="duo-trio"] + span').innerText(), "デュオ・トリオ");
    assert.equal(requests.filter(url => url.endsWith("/data/song-view-groups.json")).length, 1);
    assert.equal(requests.filter(url => /data\/snapshots\/.*\/member-analytics\.json/.test(url)).length, 1);
    assert.equal(requests.filter(url => /script\.google.*[?&]action=(?:song|singer)/.test(url)).length, 0);
    assert.equal(await page.locator("#memberAnalyticsTable thead th").count(), 10);
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S003"] td').count(), 10);
    assert.equal(await page.locator(".member-analytics-total, .member-analytics-mobile-total").count(), 0);
    assert.equal(await page.locator(".member-analytics-section-head p").innerText(), "117 / 117曲 ｜ 曲ID順");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S003"] td:nth-child(2)').innerText(), "50");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S041"] a').getAttribute("href"), "song/S041.html");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S046"] a').getAttribute("href"), "song/S046.html");
    if (width === 1280) {
      const songCell = page.locator('#memberAnalyticsTable tbody tr').filter({ hasText: 'Mermaid festa vol.2 ～Passionate～' }).locator('.member-analytics-song').first();
      const lineCount = await songCell.evaluate(node => {
        const link = node.querySelector('a');
        return Math.round(link.getBoundingClientRect().height / parseFloat(getComputedStyle(link).lineHeight));
      });
      assert.equal(lineCount, 1);
      const memberWidths = await page.locator('#memberAnalyticsTable thead th.member-analytics-person-head').evaluateAll(nodes => nodes.map(cell => Math.round(cell.getBoundingClientRect().width)));
      assert.equal(new Set(memberWidths).size, 1);
    }
    assert.deepEqual(await page.locator("#memberAnalyticsSummary thead th").allInnerTexts(),
      ["指標", "穂乃果", "絵里", "ことり", "海未", "凛", "真姫", "希", "花陽", "にこ"]);
    assert.deepEqual((await page.locator("#memberAnalyticsTable thead th").allInnerTexts()).slice(1, 10),
      ["穂乃果", "絵里", "ことり", "海未", "凛", "真姫", "希", "花陽", "にこ"]);
    assert.equal(await page.locator(".member-analytics-rank-badge").count(), 0);
    assert.equal(await page.locator("#memberAnalyticsSummary tbody tr:first-child .member-analytics-maximum").innerText(), "703件");
    assert.equal(await page.locator("#memberAnalyticsSummary tbody tr:first-child .member-analytics-maximum").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await page.locator("#memberAnalyticsMobileSummary > div:first-child .member-analytics-maximum").count(), 3);
    assert.deepEqual(await page.locator('#memberAnalyticsTable [data-song-id="S001"] .member-analytics-maximum').allInnerTexts(), ["45", "45"]);
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S063"] .member-analytics-maximum').count(), 0);
    assert.equal(await page.locator('#memberAnalyticsMobileSongs [data-song-id="S063"] .member-analytics-maximum').count(), 0);
    assert.equal(await page.locator("#memberAnalyticsSummary thead th:nth-child(2)").evaluate(node => node.style.getPropertyValue("--member-color")), "var(--h)");
    assert.equal(await page.locator("#memberAnalyticsTable thead th:nth-child(2)").evaluate(node => node.style.getPropertyValue("--member-color")), "var(--h)");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S003"] td:nth-child(2)').evaluate(node => getComputedStyle(node).fontWeight), "700");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S001"] td.member-analytics-maximum').first().evaluate(node => getComputedStyle(node).fontWeight), "700");
    assert.equal(await page.locator('#memberAnalyticsSummary tbody td.member-analytics-maximum').first().evaluate(node => getComputedStyle(node).fontWeight), "800");
    assert.equal(await page.locator('#memberAnalyticsSummary tbody td:not(.member-analytics-maximum)').first().evaluate(node => getComputedStyle(node).fontWeight), "500");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S063"] td.member-analytics-zero').first().evaluate(node => getComputedStyle(node).fontWeight), "500");
    if (width === 390) {
      assert.equal(await page.locator('#memberAnalyticsMobileSummary .member-analytics-maximum').first().evaluate(node => getComputedStyle(node).fontWeight), "800");
      assert.equal(await page.locator('#memberAnalyticsMobileSongs [data-song-id="S001"] .member-analytics-maximum strong').first().evaluate(node => getComputedStyle(node).fontWeight), "700");
      assert.equal(await page.locator('#memberAnalyticsMobileSongs [data-song-id="S063"] .member-analytics-zero strong').first().evaluate(node => getComputedStyle(node).fontWeight), "500");
    }
    const groupInput = id => page.locator(`#memberAnalyticsFilters input[data-group="${id}"]:not([data-key])`);
    const subgroupInput = key => page.locator(`#memberAnalyticsFilters input[data-key="${key}"]`);
    await page.locator('#memberAnalyticsFilterToggle').click();
    assert.equal(await page.locator('#memberAnalyticsFilterPanel').isVisible(), true);
    assert.deepEqual(await page.locator('#memberAnalyticsFilters > .member-analytics-filter-row').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('.member-analytics-filter-group > label > input')].map(input => input.dataset.group))), [
      ["general", "blu-ray", "game"],
      ["solo", "duo-trio", "unit"]
    ]);
    if (width === 1280) {
      const rowPositions = await page.locator('#memberAnalyticsFilters > .member-analytics-filter-row').evaluateAll(rows => rows.map(row => ({ left: row.getBoundingClientRect().left, tops: [...row.children].map(child => child.getBoundingClientRect().top) })));
      assert.equal(rowPositions[0].left, rowPositions[1].left);
      assert.equal(new Set(rowPositions[0].tops).size, 1);
      assert.equal(new Set(rowPositions[1].tops).size, 1);
    }
    assert.equal(await page.locator('.member-analytics-filter-subgroups > .member-analytics-filter-subgroup').count(), 3);
    const hierarchy = await page.locator('.member-analytics-filter-unit').evaluate(node => {
      const parent = node.querySelector('.member-analytics-filter-option').getBoundingClientRect();
      const children = [...node.querySelectorAll('.member-analytics-filter-subgroup')].map(child => child.getBoundingClientRect());
      return { indented: children.every(child => child.left > parent.left), below: children.every(child => child.top > parent.bottom), compact: children[2].bottom - parent.top < 80 };
    });
    assert.deepEqual(hierarchy, { indented: true, below: true, compact: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const expectCount = async count => {
      assert.equal(await page.locator("#memberAnalyticsTable tbody tr").count(), count);
      assert.equal(await page.locator("#memberAnalyticsMobileSongs article").count(), count);
      assert.equal(await page.locator("#memberAnalyticsVisibleCount").innerText(), `${count} / 117曲`);
    };
    for (const [id, count] of [["solo", 13], ["duo-trio", 4], ["unit", 27], ["blu-ray", 21], ["game", 6]]) {
      await groupInput(id).check();
      await expectCount(count);
      assert.equal(await groupInput(id).evaluate(node => getComputedStyle(node.parentElement).backgroundColor), "rgb(237, 244, 251)");
      await groupInput(id).uncheck();
    }
    for (const [key, count] of [["unit:printemps", 9], ["unit:lily-white", 9], ["unit:bibi", 9]]) {
      await subgroupInput(key).check();
      await expectCount(count);
      assert.equal(await groupInput(key.split(":")[0]).evaluate(node => node.indeterminate), true);
      await subgroupInput(key).uncheck();
    }
    for (const id of ["solo", "duo-trio", "game"]) await groupInput(id).check();
    await subgroupInput("unit:printemps").check();
    await expectCount(32);
    const selectedStyles = await page.locator('#memberAnalyticsFilters input:checked').evaluateAll(nodes => nodes.map(node => {
      const label = node.parentElement;
      const style = getComputedStyle(label);
      const box = getComputedStyle(label, '::before');
      return [style.backgroundColor, style.borderColor, box.backgroundColor, style.outlineStyle];
    }));
    assert.equal(new Set(selectedStyles.map(style => style.join('|'))).size, 1);
    for (const id of ["solo", "duo-trio", "game"]) await groupInput(id).uncheck();
    await subgroupInput("unit:printemps").uncheck();
    await groupInput("game").check();
    await groupInput("solo").check();
    await expectCount(19);
    await page.locator('#memberAnalyticsFilterToggle').click();
    assert.equal(await page.locator('#memberAnalyticsFilterPanel').isHidden(), true);
    assert.equal(await page.locator('#memberAnalyticsFilterText').innerText(), '2グループを選択中');
    assert.equal(await page.locator("#memberAnalyticsTable tbody tr").first().getAttribute("data-song-id"), "S013");
    assert.equal(await page.locator("#memberAnalyticsTable tbody tr").last().getAttribute("data-song-id"), "S080");
    await page.locator('[data-mode="cast"]').click();
    await expectCount(19);
    assert.equal(await page.locator('#memberAnalyticsFilterText').innerText(), '2グループを選択中');
    await page.locator('#memberAnalyticsFilterToggle').click();
    assert.equal(await groupInput("solo").isChecked(), true);
    assert.equal(await groupInput("game").isChecked(), true);
    await groupInput("game").uncheck();
    await groupInput("solo").uncheck();
    await expectCount(117);
    await page.locator('[data-action="all"]').click();
    await expectCount(117);
    assert.equal(await page.locator('#memberAnalyticsFilterText').innerText(), '6グループを選択中');
    await page.locator('[data-action="clear"]').click();
    assert.equal(await page.locator('#memberAnalyticsFilterText').innerText(), 'すべての曲グループ');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#memberAnalyticsFilterPanel').isHidden(), true);
    assert.equal(await page.locator("#memberAnalyticsSummary tbody tr").count(), 3);
    assert.deepEqual((await page.locator("#memberAnalyticsTable thead th").allInnerTexts()).slice(1, 10),
      ["新田", "南條", "内田", "三森", "飯田", "Pile", "楠田", "久保", "徳井"]);
    assert.equal(await page.locator("#memberAnalyticsSummary thead th:nth-child(2)").evaluate(node => node.style.getPropertyValue("--member-color")), "var(--h)");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S003"] td:nth-child(2)').innerText(), "18");
    assert.deepEqual(await page.locator('#memberAnalyticsTable [data-song-id="S004"] .member-analytics-maximum').allInnerTexts(), ["1", "1"]);
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S020"] .member-analytics-maximum').count(), 0);
    assert.equal(await page.locator('#memberAnalyticsMobileSongs [data-song-id="S020"] .member-analytics-maximum').count(), 0);
    assert.match(page.url(), /mode=cast/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#memberAnalyticsContent").waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-mode="cast"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S003"] td:nth-child(2)').innerText(), "18");
    const layout = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      tableOverflow: document.querySelector(".member-analytics-table-wrap").scrollWidth > document.querySelector(".member-analytics-table-wrap").clientWidth,
      tableHeight: document.querySelector(".member-analytics-table-wrap").getBoundingClientRect().height,
      pageHeight: document.documentElement.scrollHeight
    }));
    assert.equal(layout.pageOverflow, false);
    assert.equal(layout.tableOverflow, false);
    assert.ok(layout.pageHeight > 900);
    if (width === 1280) assert.ok(layout.tableHeight > 1500);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

async function assertFilterGeometry(page, width) {
  const layout = await page.evaluate(() => {
    const problems = [], tolerance = 1;
    const inside = (outer, inner) => inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance && inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
    const collision = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
    function glyphs(node) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), rects = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        rects.push(...range.getClientRects());
      }
      return rects;
    }
    function enclosed(child, parent, name) {
      const outer = parent.getBoundingClientRect();
      if (!inside(outer, child.getBoundingClientRect()) || glyphs(child).some(rect => !inside(outer, rect))) problems.push(`${name}: outside parent`);
      if (child.scrollWidth > child.clientWidth + tolerance) problems.push(`${name}: horizontal content overflow`);
    }
    for (const option of document.querySelectorAll('.member-analytics-filter-option')) {
      if (!option.getClientRects().length) continue;
      const label = option.children[1], count = option.querySelector('small'), box = option.getBoundingClientRect(), style = getComputedStyle(option), pseudo = getComputedStyle(option, '::before');
      enclosed(option, option.parentElement, label.textContent);
      enclosed(label, option, `${label.textContent}: label`);
      enclosed(count, option, `${label.textContent}: count`);
      const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), checkWidth = parseFloat(style.gridTemplateColumns);
      const height = parseFloat(pseudo.height) + (pseudo.boxSizing === 'border-box' ? 0 : parseFloat(pseudo.borderTopWidth) + parseFloat(pseudo.borderBottomWidth));
      const check = { left, right: left + checkWidth, top: box.top + (box.height - height) / 2, bottom: box.top + (box.height + height) / 2 };
      if (!inside(box, check)) problems.push(`${label.textContent}: check outside option`);
      if (glyphs(label).some(rect => collision(rect, count.getBoundingClientRect()) || collision(rect, check)) || glyphs(count).some(rect => collision(rect, check))) problems.push(`${label.textContent}: check/label/count collision`);
      if (getComputedStyle(count).whiteSpace !== 'nowrap') problems.push(`${label.textContent}: count can wrap`);
      const minimum = option.classList.contains('member-analytics-filter-subgroup') ? 30 : 34;
      if (box.height < minimum - tolerance) problems.push(`${label.textContent}: tap target reduced`);
    }
    for (const row of document.querySelectorAll('.member-analytics-filter-row, .member-analytics-filter-subgroups')) {
      if (!row.getClientRects().length) continue;
      const children = [...row.children];
      children.forEach(child => enclosed(child, row, 'filter child'));
      for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) if (collision(children[i].getBoundingClientRect(), children[j].getBoundingClientRect())) problems.push('filter children collide');
    }
    const panel = document.querySelector('#memberAnalyticsFilterPanel');
    if (panel.getClientRects().length) {
      const outer = panel.getBoundingClientRect();
      for (const option of panel.querySelectorAll('.member-analytics-filter-option')) {
        const rect = option.getBoundingClientRect();
        if (rect.left < outer.left - tolerance || rect.right > outer.right + tolerance) problems.push('option outside panel width');
      }
      const actions = [...panel.querySelectorAll('.member-analytics-filter-actions button')];
      actions.forEach(button => enclosed(button, button.parentElement, 'action button'));
      if (collision(actions[0].getBoundingClientRect(), actions[1].getBoundingClientRect())) problems.push('action buttons collide');
    }
    return { problems, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
  });
  assert.deepEqual(layout.problems, [], JSON.stringify(layout));
  assert.ok(layout.documentWidth <= width + 1 && layout.viewportWidth <= width + 1, `configured width ${width}: ${JSON.stringify(layout)}`);
}

async function assertSnapshotValues(page, mode, expectedIds) {
  const countKey = mode === 'character' ? 'characterCounts' : 'castCounts';
  const source = new Map(analytics.songs.map(song => [song.songId, song]));
  const displayed = await page.evaluate(() => ({
    desktop: [...document.querySelectorAll('#memberAnalyticsTable tbody tr')].map(row => ({ id: row.dataset.songId, counts: [...row.querySelectorAll('td')].slice(1).map(node => Number(node.textContent)) })),
    mobile: [...document.querySelectorAll('#memberAnalyticsMobileSongs article')].map(row => ({ id: row.dataset.songId, counts: [...row.querySelectorAll('.member-analytics-mobile-counts strong')].map(node => Number(node.textContent)) })),
    summary: [...document.querySelectorAll('#memberAnalyticsSummary tbody tr')].map(row => [...row.querySelectorAll('td')].map(node => node.textContent))
  }));
  assert.deepEqual(displayed.desktop, displayed.mobile);
  assert.deepEqual(displayed.desktop.map(row => row.id).sort(), [...expectedIds].sort());
  for (const row of displayed.desktop) assert.deepEqual(row.counts, source.get(row.id)[countKey], row.id);
  const summary = analytics[mode === 'character' ? 'characterSummary' : 'castSummary'];
  assert.deepEqual(displayed.summary, [['performanceCount', '件'], ['uniqueSongCount', '曲'], ['eventCount', '件']].map(([key, unit]) => summary.map(row => `${row[key]}${unit}`)));
  assert.equal(await page.locator('#memberAnalyticsVisibleCount').textContent(), `${expectedIds.length} / 117曲`);
}

for (const width of [320, 360, 375, 390, 393, 430]) for (const percent of [100, 125, 150]) {
  test(`Member filter glyphs and snapshot values ${width}px / ${percent}%`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.goto(`${baseUrl}/member-analytics.html`, { waitUntil: 'domcontentloaded' });
      await page.locator('#memberAnalyticsContent').waitFor({ state: 'visible' });
      const decline = page.getByRole('button', { name: '同意しない', exact: true });
      if (await decline.isVisible()) await decline.click();
      // Text-only mobile Chromium scaling is a stress test, not physical Safari QA.
      await page.locator('.member-analytics-page').evaluate((node, scale) => { node.style.webkitTextSizeAdjust = `${scale}%`; }, percent);
      const allIds = analytics.songs.map(song => song.songId);
      await assertSnapshotValues(page, 'character', allIds);
      await page.locator('#memberAnalyticsFilterToggle').click();
      assert.equal(await page.locator('#memberAnalyticsFilterPanel').isVisible(), true);
      const options = await page.locator('.member-analytics-filter-option').evaluateAll(nodes => nodes.map(node => ({ label: node.children[1].textContent, count: node.querySelector('small').textContent })));
      assert.deepEqual(options, [
        { label: 'TVアニメ・映画・CD・誌面企画・ラジオ系', count: '46' }, { label: 'Blu-ray系', count: '21' }, { label: 'スクフェス／スクパラ曲', count: '6' },
        { label: 'ソロ曲', count: '13' }, { label: 'デュオ・トリオ', count: '4' }, { label: 'ユニット曲', count: '27' },
        { label: 'Printemps', count: '9' }, { label: 'lily white', count: '9' }, { label: 'BiBi', count: '9' }
      ]);
      assert.ok(Math.abs(parseFloat(await page.locator('.member-analytics-filter-option > span').first().evaluate(node => getComputedStyle(node).fontSize)) - 14 * percent / 100) < 0.1, 'scaling must actually be active');
      await assertFilterGeometry(page, width);
      const parent = id => page.locator(`#memberAnalyticsFilters input[data-group="${id}"]:not([data-key])`);
      for (const group of groups.groups) {
        await parent(group.id).check();
        const ids = groups.assignments.filter(item => item.group === group.id).flatMap(item => item.songIds);
        await assertSnapshotValues(page, 'character', ids);
        await assertFilterGeometry(page, width);
        await parent(group.id).uncheck();
      }
      const selectedIds = groups.assignments.find(item => item.group === 'unit' && item.subgroup === 'printemps').songIds;
      await page.locator('input[data-key="unit:printemps"]').check();
      assert.equal(await parent('unit').evaluate(node => node.indeterminate), true);
      await assertSnapshotValues(page, 'character', selectedIds);
      await page.locator('#memberAnalyticsFilterToggle').click();
      assert.equal(await page.locator('#memberAnalyticsFilterPanel').isHidden(), true);
      await page.locator('[data-mode="cast"]').click();
      await assertSnapshotValues(page, 'cast', selectedIds);
      await page.locator('#memberAnalyticsFilterToggle').click();
      assert.equal(await page.locator('input[data-key="unit:printemps"]').isChecked(), true);
      await assertFilterGeometry(page, width);
      await page.locator('[data-action="all"]').click(); await assertSnapshotValues(page, 'cast', allIds);
      assert.equal(await page.locator('#memberAnalyticsFilterText').textContent(), '6グループを選択中');
      await page.locator('[data-action="clear"]').click(); await assertSnapshotValues(page, 'cast', allIds);
      assert.equal(await page.locator('#memberAnalyticsFilterText').textContent(), 'すべての曲グループ');
      assert.deepEqual(await page.locator('.member-analytics-filter-option').evaluateAll(nodes => nodes.map(node => ({ label: node.children[1].textContent, count: node.querySelector('small').textContent }))), options);
      await assertFilterGeometry(page, width);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#memberAnalyticsFilterPanel').isHidden(), true);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test('Member filter long English/Japanese labels and multi-digit counts stay inside', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(`${baseUrl}/member-analytics.html`);
    await page.locator('#memberAnalyticsContent').waitFor({ state: 'visible' });
    await page.locator('.member-analytics-page').evaluate(node => { node.style.webkitTextSizeAdjust = '150%'; });
    await page.locator('#memberAnalyticsFilterToggle').click();
    const label = 'VeryLongUnbrokenEnglishLabel長い日本語の曲グループ名';
    await page.locator('.member-analytics-filter-subgroup').first().evaluate((option, value) => { option.children[1].textContent = value; option.querySelector('small').textContent = '12345'; }, label);
    await assertFilterGeometry(page, 320);
    assert.equal(await page.locator('.member-analytics-filter-subgroup').first().locator('span').textContent(), label);
    assert.equal(await page.locator('.member-analytics-filter-subgroup').first().locator('small').textContent(), '12345');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
