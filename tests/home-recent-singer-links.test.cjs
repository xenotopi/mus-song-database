const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let server, browser, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
for (const width of [1280, 390]) test(`Home recent ID-only links ${width}px`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const current = JSON.parse(fs.readFileSync(path.join(root, 'data/current.json')));
  const events = ['EV0353', 'EV0347', 'EV0348'].map(id => {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'data/snapshots', current.revision, 'events', id + '.json'))).data.event;
    return { ...data, venueId: data.venue?.venueId, venueName: data.venue?.venueName, songs: [...data.songs, { songId: 'S003', songName: 'Snow halation', singer: '未解決名義', singerId: '' }] };
  });
  await page.route(/script\.google(?:usercontent)?\.com/, route => {
    const url = new URL(route.request().url());
    const data = url.searchParams.get('action') === 'revision' ? current : {
      summary: { songCount: 117, eventCount: 353, venueCount: 154, performanceCount: 1400 },
      today: { dateKey: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()), events: [], releases: [], firstPerformedSongs: [], lastPerformedSongs: [] },
      recentPerformances: events, topSongs: [], topVenues: []
    };
    return route.fulfill({ contentType: 'text/javascript', body: `${url.searchParams.get('callback')}(${JSON.stringify({ success: true, data })});` });
  });
  await page.goto(base + '/index.html');
  await page.waitForSelector('.recent-singer-link');
  const decline = page.getByRole('button', { name: '同意しない', exact: true });
  if (await decline.isVisible()) await decline.click();
  assert.deepEqual(await page.locator('.recent-singer-link').evaluateAll(nodes => nodes.map(a => new URL(a.href).searchParams.get('id'))), ['SN0054', 'SN0059', 'SN0072']);
  assert.equal(await page.locator('.recent-song-singer a[href*="name="]').count(), 0);
  assert.equal(await page.locator('.recent-song-singer').filter({ hasText: '未解決名義' }).locator('a').count(), 0);
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('.recent-event')).color === getComputedStyle(document.querySelector('.recent-singer-link')).color));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#recentList').scrollIntoViewIfNeeded();
  const styles = locator => locator.evaluate(node => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.textDecorationLine, style.textUnderlineOffset, style.transition];
  });
  const song = page.locator('.recent-song-name').first();
  await song.hover();
  const hoverStyle = await styles(song);
  for (const selector of ['.recent-event', '.recent-singer-link']) {
    const link = page.locator(selector).first();
    const before = await link.boundingBox();
    await link.hover();
    assert.deepEqual(await styles(selector === '.recent-event' ? link.locator('.recent-event-label') : link), hoverStyle);
    const after = await link.boundingBox();
    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    await page.keyboard.press('Tab');
    await link.focus();
    const focused = await styles(selector === '.recent-event' ? link.locator('.recent-event-label') : link);
    await song.focus();
    assert.deepEqual(focused, await styles(song));
  }
  await page.screenshot({ path: path.join(root, `outputs/home-recent-singer-${width}.png`) });
  await page.keyboard.press('Tab');
  await page.locator('.recent-singer-link').first().focus();
  assert(await page.locator('.recent-singer-link').first().evaluate(node => node.matches(':focus-visible')));
  for (const selector of ['.recent-singer-link', '.recent-event', 'a.recent-meta-link', '.recent-song-name']) {
    const link = page.locator(selector).first();
    assert(await link.count());
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(url => url.href.includes(href));
    await page.goBack();
    await page.waitForSelector('.recent-singer-link');
  }
  assert.deepEqual(errors, []);
  await page.close();
});
