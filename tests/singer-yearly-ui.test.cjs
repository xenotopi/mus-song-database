"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'assets/js/singer-v460.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(script.slice(script.indexOf('function buildYearly('), script.indexOf('\nfunction renderAnalysis(')), context);
const yearly = (items, metric) => JSON.parse(JSON.stringify(context.buildYearly(items, metric)));
const rows = [
  { eventId: 'EV01', date: '2013-02-01', songId: 'S001', performance: '昼' },
  { eventId: 'EV01', date: '2013-02-01', songId: 'S001', performance: '夜' },
  { eventId: 'EV02', date: '2014-02-01', songId: 'S002', eventName: '同じ公演名' },
  { eventId: 'EV02', date: '2014-02-01', songId: 'S003', eventName: '同じ公演名' },
  { eventId: 'EV03', date: '2014-02-01', songId: 'S002', eventName: '同じ公演名' }
];
test('events dedupe Event IDs, not Song, date, name, Day or performance', () => {
  assert.deepEqual(yearly(rows, 'events'), [{ year: '2013', count: 1 }, { year: '2014', count: 2 }]);
  assert.deepEqual(yearly(rows, 'performances'), [{ year: '2013', count: 2 }, { year: '2014', count: 3 }]);
});
test('valid-date record metric matches the previous buildYearly algorithm', () => {
  const counts = new Map(); rows.forEach(row => { const year = String(row.date || '').slice(0, 4); if (year) counts.set(year, (counts.get(year) || 0) + 1); });
  const legacy = [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year));
  assert.deepEqual(yearly(rows), legacy);
  assert.deepEqual(yearly(rows.slice().reverse()), legacy);
});
test('missing dates are retained as unknown year after sorted known years', () => {
  assert.deepEqual(yearly([{ date: '' }, { date: 'not-a-date' }, { date: '2021-01-01' }, { date: '2012-01-01' }]), [{ year: '2012', count: 1 }, { year: '2021', count: 1 }, { year: '', count: 2 }]);
});
test('missing Event IDs are excluded, matching API summary.eventCount', () => {
  const history = [{ date: '2020-01-01' }, { eventId: '  ', date: '2020-01-01' }, { eventId: ' E1 ', date: '' }, { eventId: 'E1', date: '' }];
  assert.deepEqual(yearly(history, 'events'), [{ year: '', count: 1 }]);
  assert.equal(yearly(history).reduce((n, row) => n + row.count, 0), 4);
});
test('one known year for an Event is retained without double-counting missing dates', () => {
  assert.deepEqual(yearly([{ eventId: 'E1' }, { eventId: 'E1', date: '2020-01-01' }], 'events'), [{ year: '2020', count: 1 }]);
});
test('contradictory Event years are unknown, never inferred or counted twice', () => {
  assert.deepEqual(yearly([{ eventId: 'E1', date: '2020-01-01' }, { eventId: 'E1', date: '2021-01-01' }], 'events'), [{ year: '', count: 1 }]);
});
for (const missing of [null, undefined, [], {}]) test(`empty/missing history ${JSON.stringify(missing)}`, () => {
  assert.deepEqual(yearly(missing, 'events'), []); assert.deepEqual(yearly(missing), []);
});
test('unrecognised metric is rejected', () => assert.throws(() => context.buildYearly(rows, 'other'), /Unknown yearly metric/));

test('scale matches Song Detail for small, large and empty maxima', () => {
  const song = fs.readFileSync(path.join(root, 'assets/js/song-v441.js'), 'utf8');
  const reference = vm.createContext({});
  vm.runInContext(song.slice(song.indexOf('function buildGraphScale_('), song.indexOf('\nfunction renderGraphScaleLabels_(')), reference);
  for (const max of [0, ...Array.from({ length: 200 }, (_, i) => i + 1)]) {
    assert.deepEqual(JSON.parse(JSON.stringify(context.buildGraphScale_(max))), JSON.parse(JSON.stringify(reference.buildGraphScale_(max))));
  }
});

const current = JSON.parse(fs.readFileSync(path.join(root, 'data/current.json')));
const histories = new Map();
for (const file of fs.readdirSync(path.join(root, 'data/snapshots', current.revision, 'events'))) {
  const event = JSON.parse(fs.readFileSync(path.join(root, 'data/snapshots', current.revision, 'events', file))).data.event;
  for (const song of event.songs) {
    if (!histories.has(song.singerId)) histories.set(song.singerId, []);
    histories.get(song.singerId).push({ ...song, eventId: event.eventId, date: event.date, eventName: event.eventName, day: event.day, performance: event.performance });
  }
}
test('all current 72 names: annual sums match independent Event/record totals and old records', () => {
  assert.equal(histories.size, 72);
  for (const [id, history] of histories) {
    const unique = new Set(history.map(row => row.eventId).filter(Boolean));
    assert.equal(yearly(history, 'events').reduce((n, row) => n + row.count, 0), unique.size, id);
    assert.equal(yearly(history).reduce((n, row) => n + row.count, 0), history.length, id);
    const legacy = new Map(); history.forEach(row => { const year = row.date.slice(0, 4); legacy.set(year, (legacy.get(year) || 0) + 1); });
    assert.deepEqual(yearly(history), [...legacy].map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year)), id);
  }
});

function payload(history) {
  return { singerId: 'SN0001', displayName: "μ's", summary: { performanceCount: history.length, eventCount: new Set(history.map(row => String(row.eventId || '').trim()).filter(Boolean)).size, uniqueSongCount: new Set(history.map(row => row.songId).filter(Boolean)).size }, history: history.map(row => ({ songName: 'テスト曲', eventName: 'テスト公演', ...row })), songs: [] };
}
let server, browser, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || 'chrome' });
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function open(width, data) {
  const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.route(/script\.google(?:usercontent)?\.com/, route => {
    const url = new URL(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: `${url.searchParams.get('callback')}(${JSON.stringify({ success: true, data: url.searchParams.get('action') === 'singer' ? data : current })});` });
  });
  await page.goto(`${base}/singer.html?id=SN0001`); await page.locator('#analysisSection:not([hidden])').waitFor();
  const no = page.getByRole('button', { name: '同意しない', exact: true }); if (await no.isVisible()) await no.click();
  return { page, errors };
}
async function chart(page) {
  return page.locator('.singer-year-row').evaluateAll(nodes => nodes.map(node => ({ year: node.querySelector('.singer-year-label').textContent, count: Number(node.querySelector('.singer-year-value').textContent.replace('件', '')), width: node.querySelector('.singer-year-bar').style.width })));
}
const metric = (page, name) => page.locator(`[data-yearly-metric="${name}"]`);
for (const width of [1280, 390]) {
  test(`Singer yearly switches, ratios, keyboard and independent history ${width}px`, async () => {
    const { page, errors } = await open(width, payload(rows));
    try {
      assert.equal(await page.getByRole('heading', { name: '年別の出演・歌唱記録' }).count(), 1);
      assert.equal(await metric(page, 'events').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await chart(page), [{ year: '2013', count: 1, width: '50%' }, { year: '2014', count: 2, width: '100%' }]);
      assert.equal((await chart(page)).reduce((n, row) => n + row.count, 0), Number(await page.locator('#eventCount').textContent()));
      await page.locator('[data-year="2014"]').click();
      await page.locator('.singer-event-toggle').first().click();
      await page.evaluate(() => { window.originalHistoryNode = document.querySelector('#historyList').firstElementChild; });
      const history = await page.locator('#historyList').innerHTML(), visible = await page.locator('#visibleHistoryCount').textContent();
      await metric(page, 'performances').focus(); await page.keyboard.press('Enter');
      assert.equal(await metric(page, 'performances').getAttribute('aria-pressed'), 'true');
      assert.equal(await metric(page, 'events').getAttribute('aria-pressed'), 'false');
      assert.deepEqual(await chart(page), [{ year: '2013', count: 2, width: '66.6667%' }, { year: '2014', count: 3, width: '100%' }]);
      assert.equal((await chart(page)).reduce((n, row) => n + row.count, 0), Number(await page.locator('#performanceCount').textContent()));
      assert.equal(await page.locator('#historyList').innerHTML(), history); assert.equal(await page.locator('#visibleHistoryCount').textContent(), visible);
      assert.equal(await page.evaluate(() => document.querySelector('#historyList').firstElementChild === window.originalHistoryNode), true);
      assert.equal(await page.locator('[data-year="2014"]').evaluate(node => node.classList.contains('active')), true);
      await metric(page, 'events').focus(); await page.keyboard.press('Space'); assert.equal(await metric(page, 'events').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#yearChart').getAttribute('aria-label'), '出演イベント数の年別集計');
      assert.equal(await metric(page, 'events').evaluate(node => node.matches(':focus-visible')), true);
      const layout = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth })); assert.ok(layout.document <= width && layout.viewport <= width);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
  test(`Singer unknown years and missing ID totals ${width}px`, async () => {
    const data = payload([{ eventId: 'E1', date: '' }, { eventId: 'E1', date: '' }, { eventId: '', date: '2020-01-01' }, { eventId: 'E2', date: '2021-01-01' }, { eventId: 'E2', date: '2022-01-01' }]);
    const { page, errors } = await open(width, data);
    try {
      assert.deepEqual(await chart(page), [{ year: '年不明', count: 2, width: '100%' }]);
      assert.match(await page.locator('#yearChartNote').textContent(), /イベントIDがない記録は含みません/);
      await metric(page, 'performances').click();
      assert.deepEqual((await chart(page)).map(row => [row.year, row.count]), [['2020', 1], ['2021', 1], ['2022', 1], ['年不明', 2]]);
      assert.equal((await chart(page)).reduce((n, row) => n + row.count, 0), data.summary.performanceCount);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
  test(`Singer empty/missing history ${width}px`, async () => {
    const data = payload([]); delete data.history;
    const { page, errors } = await open(width, data);
    try {
      assert.equal(await page.locator('.singer-year-row').count(), 0);
      assert.match(await page.locator('#yearChart').textContent(), /年別データはありません/);
      await metric(page, 'performances').click(); assert.equal(await page.locator('.singer-year-row').count(), 0);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
  test(`Singer current snapshot μ's 24 events / 179 records ${width}px`, async () => {
    const data = payload(histories.get('SN0001')), { page, errors } = await open(width, data);
    try {
      assert.equal(data.summary.eventCount, 24); assert.equal(data.summary.performanceCount, 179);
      assert.equal((await chart(page)).reduce((n, row) => n + row.count, 0), 24);
      await metric(page, 'performances').click(); assert.equal((await chart(page)).reduce((n, row) => n + row.count, 0), 179);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

for (const width of [1280, 390, 320]) {
  test(`Singer scale, gridlines and exact bar ratio update with metric ${width}px`, async () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ eventId: `E${i % 5}`, date: '2020-01-01' }))
      .concat([{ eventId: 'OTHER', date: '2021-01-01' }]);
    const { page, errors } = await open(width, payload(history));
    try {
      for (const [name, max, labels] of [['events', 5, [0, 1, 3, 4, 5]], ['performances', 20, [0, 5, 10, 15, 20]], ['events', 5, [0, 1, 3, 4, 5]]]) {
        await metric(page, name).click();
        assert.deepEqual(await page.locator('.singer-chart-scale-labels > span').allTextContents(), labels.map(n => `${n}件`));
        assert.equal(await page.locator('.singer-year-scale').getAttribute('aria-hidden'), 'true');
        const geometry = await page.evaluate(() => {
          const bounds = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
          return { chart: bounds(document.querySelector('#yearChart')), axis: bounds(document.querySelector('.singer-chart-scale-labels')),
            ticks: [...document.querySelectorAll('.singer-chart-scale-labels > span')].map(bounds),
            rows: [...document.querySelectorAll('.singer-year-row')].map(row => ({
              track: bounds(row.querySelector('.singer-year-track')),
              count: Number(row.querySelector('.singer-year-value').textContent.replace('件', '')),
              width: parseFloat(row.querySelector('.singer-year-bar').style.width),
              lines: [...row.querySelectorAll('.singer-chart-gridline')].map(line => ({ position: parseFloat(line.style.left), left: bounds(line).left }))
            })), overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(geometry.overflow, false);
        geometry.ticks.forEach((tick, i) => {
          const limit = width <= 360 ? geometry.chart : geometry.axis;
          assert.ok(tick.left >= limit.left - 1 && tick.right <= limit.right + 1);
          if (i) assert.ok(geometry.ticks[i - 1].right <= tick.left + 1, 'tick labels do not overlap');
        });
        for (const row of geometry.rows) {
          assert.ok(Math.abs(row.track.left - geometry.axis.left) < 1);
          assert.ok(Math.abs(row.track.width - geometry.axis.width) < 1);
          assert.ok(Math.abs(row.width - row.count / max * 100) < 0.001);
          assert.equal(row.lines.length, labels.length - 2);
          row.lines.forEach((line, i) => {
            assert.ok(Math.abs(line.position - labels[i + 1] / max * 100) < 0.001);
            assert.ok(Math.abs(line.left - (row.track.left + row.track.width * line.position / 100)) < 1);
          });
        }
      }
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
