const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let server, browser, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'content-type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

const liveResponses = new Map();
test('Phase3: all 17 breadcrumb pages use decorative small Chevrons', () => {
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));
  const breadcrumbs = pages.filter(name => fs.readFileSync(path.join(root, name), 'utf8').includes('site-breadcrumb-icon'));
  assert.equal(breadcrumbs.length, 17);
  for (const name of breadcrumbs) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(html, /›/);
    assert.match(html, /class="site-icon-inline site-breadcrumb-icon" data-site-icon="chevron-right" aria-hidden="true"/);
  }
  assert.match(fs.readFileSync(path.join(root, 'assets/js/gap-checker-v490.js'), 'utf8'), /" → "/); // Date range remains content.
});
if (process.env.ICON_PHASE2_LIVE === '1') for (const width of [1280, 390]) {
  for (const pathname of ['songs.html', 'singers.html', 'venues.html', 'search.html', '404.html', 'song.html?id=S003', 'event.html?id=EV0001', 'venue.html?id=VE0001', 'singer.html?id=SN0001', 'release.html?id=R0072', 'kamipara.html', 'member-analytics.html']) {
    test(`Phase2 live ${pathname} ${width}px`, { timeout: 120000 }, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.route(/script\.google(?:usercontent)?\.com\//, async route => {
        const original = new URL(route.request().url());
        const callback = original.searchParams.get('callback');
        const url = new URL(original.origin + original.pathname);
        for (const [key, value] of original.searchParams) if (!['callback', '_', '_ts', 't'].includes(key)) url.searchParams.set(key, value);
        const key = url.href;
        if (!liveResponses.has(key)) liveResponses.set(key, fetch(key, { signal: AbortSignal.timeout(60000) }).then(r => r.json()));
        const data = await liveResponses.get(key);
        await route.fulfill({ contentType: 'text/javascript', body: `${callback}(${JSON.stringify(data)});` });
      });
      try {
        await page.goto(`${base}/${pathname}`, { waitUntil: 'networkidle' });
        const decline = page.getByRole('button', { name: '同意しない', exact: true });
        if (await decline.isVisible()) await decline.click();
        assert.ok(await page.locator('[data-site-icon="search"] svg').count() >= 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (!pathname.startsWith('404')) {
          assert.ok(await page.locator('.site-breadcrumb-icon svg').count() > 0);
          assert.equal(await page.locator('.site-breadcrumb-icon').first().evaluate(n => n.closest('a,button') === null), true);
        }
        for (const arrow of await page.locator('[data-site-icon="chevron-right"] svg').all()) {
          assert.equal(await arrow.getAttribute('aria-hidden'), 'true');
          assert.equal(await arrow.getAttribute('focusable'), 'false');
        }
        const detailArrow = page.locator('a:has([data-site-icon="chevron-right"]):visible').first();
        if (await detailArrow.count()) {
          await detailArrow.focus();
          assert.equal(await detailArrow.evaluate(n => n === document.activeElement && !n.querySelector('a,button')), true);
          if (width === 1280) await detailArrow.hover();
          await detailArrow.screenshot({ path: path.join(os.tmpdir(), `phase3-${pathname.split('.')[0]}-${width}.png`), animations: 'disabled' });
        }
        assert.deepEqual(await page.locator('[data-site-icon="search"] svg').evaluateAll(nodes => nodes.map(n => [getComputedStyle(n).width, getComputedStyle(n).height, getComputedStyle(n).strokeWidth])), Array(await page.locator('[data-site-icon="search"] svg').count()).fill(['20px', '20px', '2px']));
        const disclosure = page.locator('summary:has(.site-disclosure-icon)').first();
        if (await disclosure.count()) {
          const details = disclosure.locator('..');
          await details.evaluate(n => n.open = false);
          await disclosure.click();
          assert.equal(await details.evaluate(n => n.open), true);
          assert.equal(await disclosure.evaluate(n => getComputedStyle(n, '::after').content), 'none');
          await disclosure.screenshot({ path: path.join(os.tmpdir(), `phase2-${pathname.split('.')[0]}-${width}.png`), animations: 'disabled' });
          await disclosure.click();
          assert.equal(await details.evaluate(n => n.open), false);
        }
        const toggle = page.locator('.singer-event-toggle, #memberAnalyticsFilterToggle').first();
        if (await toggle.count()) {
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          await toggle.screenshot({ path: path.join(os.tmpdir(), `phase2-${pathname.split('.')[0]}-${width}.png`), animations: 'disabled' });
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        }
        for (const external of await page.locator('a:has([data-site-icon="external-link"])').all()) assert.match(await external.getAttribute('href'), /^https?:\/\//);
        if (/^(song|event|venue)\.html/.test(pathname)) {
          assert.equal(await page.locator('[data-site-icon="arrow-left"]').count(), 1);
          const next = pathname.startsWith('song.html') ? '.song-switch-label [data-site-icon="arrow-right"]' : '[data-site-icon="arrow-right"]';
          assert.equal(await page.locator(next).count(), 1);
        }
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const top = page.locator('#backToTopButton');
        if (await top.evaluate(n => n.classList.contains('visible'))) {
          assert.equal(await top.locator('[data-site-icon="arrow-up"] svg').count(), 1);
          await top.click();
          await page.waitForFunction(() => scrollY < 5);
        }
        await page.locator('#siteHeader').screenshot({ path: path.join(os.tmpdir(), `phase2-header-${width}.png`), animations: 'disabled' });
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }
}

for (const width of [1280, 390]) for (const name of ['index', 'about']) {
  test(`${name}: 8 local Lucide icons, unchanged controls/layout at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // Deterministic API fixture: icons must not depend on Apps Script availability.
    await page.route(/script\.google(?:usercontent)?\.com\//, route => {
      const url = new URL(route.request().url());
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
      const data = url.searchParams.get('action') === 'revision' ? { dataRevision: 'icons-test' } : {
        summary: { songCount: 117, eventCount: 353, venueCount: 154, performanceCount: 1400 },
        today: { dateKey: `${parts.year}-${parts.month}-${parts.day}`, month: Number(parts.month), day: Number(parts.day), events: [], releases: [], firstPerformedSongs: [], lastPerformedSongs: [] },
        recentPerformances: [], topSongs: [], topVenues: [], _cache: { revision: 'icons-test' }
      };
      return route.fulfill({ contentType: 'text/javascript', body: `${url.searchParams.get('callback')}(${JSON.stringify({ success: true, data })});` });
    });
    await page.goto(`${base}/${name}.html`, { waitUntil: 'networkidle' });
    const decline = page.getByRole('button', { name: '同意しない', exact: true });
    if (await decline.isVisible()) await decline.click();
    const primary = '[data-site-icon="music-2"], [data-site-icon="calendar-days"], [data-site-icon="map-pin"], [data-site-icon="mic-vocal"], [data-site-icon="trophy"], [data-site-icon="chart-no-axes-column-increasing"], [data-site-icon="users-round"], [data-site-icon="history"]';
    const primaryIcons = page.locator(primary).locator('svg');
    assert.equal(await primaryIcons.count(), 8);
    assert.deepEqual(await primaryIcons.evaluateAll(nodes => nodes.map(n => ({ width: getComputedStyle(n).width, height: getComputedStyle(n).height, stroke: getComputedStyle(n).strokeWidth, hidden: n.getAttribute('aria-hidden'), focus: n.getAttribute('focusable') }))), Array(8).fill({ width: '24px', height: '24px', stroke: '2px', hidden: 'true', focus: 'false' }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const hosts = page.locator('[data-site-icon]');
    const before = await hosts.evaluateAll(nodes => nodes.map(n => [n.offsetWidth, n.offsetHeight, n.offsetLeft]));
    // Rendering twice must neither duplicate icons nor shift their host boxes.
    await page.evaluate(() => window.SiteIcons.render());
    assert.equal(await primaryIcons.count(), 8);
    assert.deepEqual(await hosts.evaluateAll(nodes => nodes.map(n => [n.offsetWidth, n.offsetHeight, n.offsetLeft])), before);
    const links = name === 'index' ? page.locator('.home-explore-card, .home-tool-card') : page.locator('a:has(.about-explore-icon)');
    assert.equal(await links.count(), name === 'index' ? 8 : 4);
    for (const link of await links.all()) {
      assert.match(await link.getAttribute('href'), /\.html$/);
      await link.focus();
      assert.equal(await link.evaluate(n => document.activeElement === n), true);
      if (width === 1280) await link.hover();
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement.blur());
    if (name === 'about') assert.equal(await page.locator('.about-record-item').nth(1).innerText(), '♪\n歌唱履歴');
    const section = name === 'index' ? '.home-explore' : '.about-record-grid';
    // Screenshot the actual content without changing layout or interaction styles.
    const target = page.locator(section);
    if (await target.count()) await target.screenshot({ path: path.join(os.tmpdir(), `icons-${name}-${width}.png`) });
    if (name === 'index') await page.locator('.home-tools').screenshot({ path: path.join(os.tmpdir(), `icons-tools-${width}.png`) });
    else await page.locator('a:has(.about-explore-icon)').first().locator('..').screenshot({ path: path.join(os.tmpdir(), `icons-about-explore-${width}.png`) });
    assert.deepEqual(errors, []);
    await page.close();
  });
}
