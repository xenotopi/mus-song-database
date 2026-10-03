"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
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
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S003"] td:nth-child(2)').innerText(), "49");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S041"] a').getAttribute("href"), "song.html?id=S041");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S046"] a').getAttribute("href"), "song.html?id=S046");
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
    assert.equal(await page.locator("#memberAnalyticsSummary tbody tr:first-child .member-analytics-maximum").innerText(), "702件");
    assert.equal(await page.locator("#memberAnalyticsSummary tbody tr:first-child .member-analytics-maximum").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await page.locator("#memberAnalyticsMobileSummary > div:first-child .member-analytics-maximum").count(), 3);
    assert.deepEqual(await page.locator('#memberAnalyticsTable [data-song-id="S001"] .member-analytics-maximum').allInnerTexts(), ["45", "45"]);
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S063"] .member-analytics-maximum').count(), 0);
    assert.equal(await page.locator('#memberAnalyticsMobileSongs [data-song-id="S063"] .member-analytics-maximum').count(), 0);
    assert.equal(await page.locator("#memberAnalyticsSummary thead th:nth-child(2)").evaluate(node => node.style.getPropertyValue("--member-color")), "var(--h)");
    assert.equal(await page.locator("#memberAnalyticsTable thead th:nth-child(2)").evaluate(node => node.style.getPropertyValue("--member-color")), "var(--h)");
    assert.equal(await page.locator('#memberAnalyticsTable [data-song-id="S003"] td:nth-child(2)').evaluate(node => getComputedStyle(node).fontWeight), "500");
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
