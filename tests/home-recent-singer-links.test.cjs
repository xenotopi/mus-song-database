const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let server, browser, base;
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'musdb-home-recent-links-'));
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

for (const width of [1280, 390]) for (const fail of [false, true, 'timeout']) test(`Home singerList nonblocking text enrichment ${width}px failure=${fail}`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
  if (fail === 'timeout') await page.clock.install();
  page.on('pageerror', e => errors.push(e.message));page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const current = JSON.parse(fs.readFileSync(path.join(root, 'data/current.json')));
  const sources = ['EV0353','EV0347','EV0348'].map(id => JSON.parse(fs.readFileSync(path.join(root,'data/snapshots',current.revision,'events',id+'.json'))).data.event);
  const singers = sources.map(e => ({singerId:e.songs[0].singerId,displayName:e.songs[0].singerDisplayName}));
  assert.deepEqual(singers.map(s=>s.displayName), ['新田恵海','三森すずこ','飯田里穂＆久保ユリカ＆Pile']);
  const songs = sources.map(e => { const s={...e.songs[0]};delete s.singerDisplayName;return s; });
  songs.push({...songs[0]}, {...songs[0],singerId:'SN9999',singer:'未解決名義'}, {...songs[0],singerId:'SN0001',singer:'短縮',singerDisplayName:'正式キャラクター名義'}, {...songs[0],singerId:'SN8888',singer:'安全な短縮名'});
  let release;const gate=new Promise(r=>release=r);let calls=0;const exchanges=[];
  await page.route(/script\.google(?:usercontent)?\.com/, async route => {
    const u=new URL(route.request().url()),action=u.searchParams.get('action');let response;
    if(action==='singerList') { calls++;response=fail?{success:false,error:{message:'controlled singerList failure'}}:{success:true,data:{official:[{singerId:'SN0001',displayName:'μ’s'}],solo:[...singers,{singerId:'SN8888',displayName:'<img src=x onerror=alert(1)>'}]}}; }
    else response={success:true,data:action==='revision'?current:{summary:{songCount:117,eventCount:353,venueCount:154,performanceCount:1400},today:{dateKey:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()),events:[],releases:[],firstPerformedSongs:[],lastPerformedSongs:[]},recentPerformances:Array.from({length:6},()=>({...sources[0],songs})),topSongs:[],topVenues:[]}};
    const exchange={action,callback:u.searchParams.get('callback'),response,fulfilled:false};exchanges.push(exchange);
    if(action==='singerList')await gate;
    await route.fulfill({contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify(response)});`});exchange.fulfilled=true;
  });
  try {
    // A deliberately pending JSONP script delays window.load, not Home rendering.
    await page.goto(base+'/index.html', {waitUntil:'domcontentloaded'});await page.locator('.recent-singer-link').first().waitFor();
    assert.deepEqual(await page.locator('.recent-card').first().locator('.recent-singer-link').allTextContents(),songs.map(s=>s.singerDisplayName||s.singer));
    assert.equal(await page.locator('#status').isHidden(),true,'Home ready while singerList remains pending');
    const decline=page.getByRole('button',{name:'同意しない',exact:true});if(await decline.isVisible())await decline.click();
    await page.locator('.recent-singer-link').first().focus();await page.evaluate(()=>{window.originalSinger=document.querySelector('.recent-singer-link');window.originalCard=document.querySelector('.recent-card');});
    if (fail === 'timeout') {
      await page.waitForFunction(()=>[...document.scripts].some(s=>s.src.includes('action=singerList')));
      // Exercise the actual configured timeout with a virtual clock, not a sleep.
      await page.clock.runFor(15001);
      assert.equal(await page.locator('.recent-singer-link').first().textContent(), '新田');
    }
    release();
    if(!fail) await page.waitForFunction(()=>document.querySelector('.recent-singer-link')?.textContent==='新田恵海');
    else await page.waitForFunction(()=>![...document.scripts].some(s=>s.src.includes('action=singerList')));
    await page.waitForLoadState('load');
    const first=page.locator('.recent-card').first(),names=await first.locator('.recent-singer-link').allTextContents();
    assert.deepEqual(names,fail?songs.map(s=>s.singerDisplayName||s.singer):['新田恵海','三森すずこ','飯田里穂＆久保ユリカ＆Pile','新田恵海','未解決名義','正式キャラクター名義','<img src=x onerror=alert(1)>']);
    assert.equal(await page.evaluate(()=>window.originalSinger===document.querySelector('.recent-singer-link')&&window.originalCard===document.querySelector('.recent-card')&&document.activeElement===window.originalSinger),true);
    assert.equal(await first.locator('.recent-song-singer img').count(),0);
    assert.deepEqual(await first.locator('.recent-singer-link').evaluateAll(as=>as.map(a=>new URL(a.href).searchParams.get('id'))),songs.map(s=>s.singerId));
    assert.equal(await first.locator('.recent-song-singer').evaluateAll(es=>es.every(e=>e.querySelectorAll('.recent-singer-label').length===1&&e.textContent.startsWith('歌唱者：')&&getComputedStyle(e,'::before').content==='none')),true);
    await page.locator('#recentMoreButton').click();assert.equal(calls,1);assert.equal(await page.locator('.recent-card').count(),6);
    assert.deepEqual(await page.locator('.recent-card').last().locator('.recent-singer-link').allTextContents(),names);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.recent-song-singer').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth)),true);
    assert.deepEqual(errors,[]);
  } catch(error) {
    const diagnostic={error:error.stack,calls,errors,exchanges,dom:await page.evaluate(()=>({readyState:document.readyState,statusHidden:document.querySelector('#status')?.hidden,cards:document.querySelectorAll('.recent-card').length,names:[...document.querySelectorAll('.recent-singer-link')].map(e=>e.textContent),labels:[...document.querySelectorAll('.recent-singer-label')].map(e=>e.textContent)})).catch(()=>null)};
    const file=path.join(screenshots,`failure-${width}-${fail}.json`);fs.writeFileSync(file,JSON.stringify(diagnostic,null,2));console.log('Failure diagnostic: '+file);console.log(JSON.stringify({calls,errors,requests:exchanges.map(e=>({action:e.action,fulfilled:e.fulfilled})),dom:diagnostic.dom}));throw error;
  } finally {release();await page.close();}
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
  assert.equal(await page.locator('.recent-event .mus-title-chip').first().evaluate(e => getComputedStyle(e).color), 'rgb(23, 32, 51)');
  assert.equal(await page.locator('.recent-singer-link').first().evaluate(e => getComputedStyle(e).color), 'rgb(79, 70, 229)');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#recentList').scrollIntoViewIfNeeded();
  const styles = locator => locator.evaluate(node => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.textDecorationLine, style.textUnderlineOffset, style.transition];
  });
  const song = page.locator('.recent-song-name').first();
  await song.hover();
  assert.equal((await styles(song))[1], 'underline');
  for (const selector of ['.recent-event', '.recent-singer-link']) {
    const link = page.locator(selector).first();
    const before = await link.boundingBox();
    await link.hover();
    assert.equal((await styles(link))[1], 'underline');
    assert.equal(await link.evaluate(e => getComputedStyle(e).color), 'rgb(79, 70, 229)');
    const after = await link.boundingBox();
    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    await page.keyboard.press('Tab');
    await link.focus();
    assert.equal((await styles(link))[1], 'underline');
    assert.equal(await link.evaluate(e => getComputedStyle(e).outlineStyle), 'solid');
  }
  await page.screenshot({ path: path.join(screenshots, `home-recent-singer-${width}.png`) });
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
