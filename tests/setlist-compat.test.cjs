const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const apiRoot = path.resolve(root, '../musdb-public-api-appsscript');
const rawRoot = path.resolve(root, '../work/raw-appsscript-source');
const { validateEventSnapshot, validateSnapshot } = require('../tools/detail-snapshot-lib.cjs');
const context = vm.createContext({ console, Number, String, Map, Set });
vm.runInContext(fs.readFileSync(path.join(apiRoot, 'EventApi.js'), 'utf8'), context);
const setlist = (event, rows) => context.getEventSetlistData_(event, rows);
const current = JSON.parse(fs.readFileSync(path.join(root, 'data/current.json')));
const eventRoot = path.join(root, 'data/snapshots', 'sha256-caf2d998618089b07d155f23f8879331c405369a0c5a19c9dc150f676043389f', 'events');

test('all 353 current Events / 1400 rows keep RAW order, false and null API positions', () => {
  let count = 0, rowsCount = 0;
  for (const file of fs.readdirSync(eventRoot)) {
    const event = JSON.parse(fs.readFileSync(path.join(eventRoot, file))).data.event;
    const rows = event.songs.map(song => ({ '曲ID': song.songId, '曲名': song.songName, '歌唱者': song.singer, '種別': song.type, '備考': song.note, 'イベントID': event.eventId }));
    const map = new Map(event.songs.map(song => [event.category + '|' + song.singer, { singerId: song.singerId, displayName: song.singerDisplayName, category: song.singerCategory }]));
    Object.assign(context, {
      getApiEvents_: () => [{ 'イベントID': event.eventId, 'イベント名': event.eventName, 'イベント区分': event.category, '日付': event.date }],
      getApiRawRows_: () => rows, getApiVenues_: () => [],
      getApiSingingNameMaps_: () => ({ byKey: map }),
      getApiSingingNameKey_: (category, singer) => category + '|' + singer,
      formatApiDate_: value => value,
      calculateEventStatistics_: () => event.statistics,
      getEventRelatedReleases_: () => event.relatedReleases,
      getEventNavigation_: () => event.navigation
    });
    const result = context.getEventDetail_(event.eventId);
    assert.equal(result.songOrderIsSetlist, false);
    assert.deepEqual(Array.from(result.songs, song => song.songId), event.songs.map(song => song.songId));
    assert.ok(result.songs.every(song => song.setlistPosition === null));
    count++; rowsCount += result.songs.length;
  }
  assert.equal(count, 353); assert.equal(rowsCount, 1400);
});

test('all existing Static generations preserve optional/missing fields', () => {
  let generations = 0;
  for (const directory of fs.readdirSync(path.join(root, 'data/snapshots'))) {
    const generationRoot = path.join(root, 'data/snapshots', directory);
    if (!fs.existsSync(path.join(generationRoot,'manifest.json'))) continue;
    for (const [folder,type] of [['songs','song'],['releases','release']]) {
      const detailRoot=path.join(generationRoot,folder);
      if(!fs.existsSync(detailRoot))continue;
      for(const file of fs.readdirSync(detailRoot)) {
        const snapshot=JSON.parse(fs.readFileSync(path.join(detailRoot,file)));
        validateSnapshot(type,file.replace('.json',''),snapshot,directory,snapshot.snapshot.dataRevision||directory);
      }
    }
    generations++;
    const events = path.join(root, 'data/snapshots', directory, 'events');
    if (!fs.existsSync(events)) continue;
    for (const file of fs.readdirSync(events)) {
      const snapshot = JSON.parse(fs.readFileSync(path.join(events, file)));
      validateEventSnapshot(snapshot.data.event.eventId, snapshot, directory, snapshot.snapshot.dataRevision || directory);
    }
  }
  assert.ok(generations >= 6);
});

test('positive / mixed / duplicate positions allowed; incomplete true rejected', () => {
  for (const values of [[1,2,3], [25,26,27], [2,2,4]]) {
    const result = setlist({ songOrderIsSetlist: true }, values.map(setlistPosition => ({ setlistPosition })));
    assert.equal(result.confirmed, true); assert.deepEqual(Array.from(result.positions), values);
  }
  assert.throws(() => setlist({ songOrderIsSetlist: true }, [{}]), /missing/);
  for (const value of [0,-1,1.5,true,'invalid']) assert.throws(() => setlist({}, [{ setlistPosition: value }]), /Invalid/);
  assert.equal(setlist({}, [{}]).positions[0], null);
  assert.equal(setlist({songOrderIsSetlist: false}, [{setlistPosition: null}]).confirmed, false);
});

test('Static completeness validation permits duplicate positions but rejects missing', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(eventRoot, 'EV0040.json')));
  const revision = snapshot.snapshot.revision, data = snapshot.snapshot.dataRevision || revision;
  snapshot.data.event.songOrderIsSetlist = true;
  snapshot.data.event.songs.forEach((song, i) => song.setlistPosition = [25,25,27][i]);
  validateEventSnapshot('EV0040', snapshot, revision, data);
  delete snapshot.data.event.songs[0].setlistPosition;
  assert.throws(() => validateEventSnapshot('EV0040', snapshot, revision, data), /missing/);
});

test('RAW legacy/new headers accepted; optional defaults do not create columns', () => {
  const c = vm.createContext({ normalizeAdminValidationText_: value => String(value || '').trim(), String, Array });
  vm.runInContext(fs.readFileSync(path.join(rawRoot, 'AdminSingingRegistration.js'), 'utf8'), c);
  const raw = ['日付','イベント名','曲名','歌唱者','種別','備考','イベントID','曲ID'];
  const event = ['イベントID','イベント名','日付','会場ID','イベント区分','イベント種別','Day','公演','備考'];
  function sheet(headers) {
    const writes = [];
    return { writes, getLastColumn: () => headers.length,
      getRange: (r,col,n,width) => ({getValues: () => [Array.from({length:width}, (_,i) => headers[col-1+i] || '')], setValues: values => writes.push({col,values})}) };
  }
  for (const extended of [false,true]) {
    const rs = sheet(extended ? [...raw,'setlistPosition'] : raw);
    const es = sheet(extended ? [...event,'songOrderIsSetlist'] : event);
    const ss = { getSheetByName: name => name === '歌唱RAW' ? rs : es };
    assert.equal(c.assertAdminRegistrationRawShape_(ss), rs);
    assert.equal(c.assertAdminEventMasterShape_(ss), es);
    c.writeAdminOptionalSetlistDefault_(rs,2,1,9,'setlistPosition','');
    c.writeAdminOptionalSetlistDefault_(es,2,1,10,'songOrderIsSetlist',false);
    assert.equal(rs.writes.length, extended ? 1 : 0);
    assert.equal(es.writes.length, extended ? 1 : 0);
    if (extended) assert.equal(es.writes[0].values[0][0], false);
  }
});

test('API version 4 gives deterministic outputRevision without changing dataRevision', () => {
  const c = vm.createContext({ Utilities: { DigestAlgorithm:{SHA_256:1}, Charset:{UTF_8:1}, computeDigest: (_,input) => Array.from(crypto.createHash('sha256').update(input).digest()) } });
  // Keep this historical v4 contract independent of the current deployed version.
  vm.runInContext(fs.readFileSync(path.join(apiRoot,'DatabaseRevision.js'),'utf8')
    .replace(/MUSDB_PUBLIC_API_DATA_VERSION_ = '\d+'/, "MUSDB_PUBLIC_API_DATA_VERSION_ = '4'"), c);
  const data = 'sha256-fa43755a249789fc616d8cebf0910880091df8aaaa613bbdde6760a98bf2fe55';
  const actual = c.getOutputRevisionV490_(data);
  const expected = 'sha256-' + crypto.createHash('sha256').update(JSON.stringify({dataRevision:data,publicApiDataVersion:'4'})).digest('hex');
  assert.equal(actual, expected); assert.notEqual(actual,current.revision);
  console.log('version4 outputRevision:', actual);
});

test('RAW reader accepts 8/9 columns and generator sorts whole rows', () => {
  for (const width of [8,9]) {
    let requestedWidth;
    const sheet = { getLastColumn:()=>width, getLastRow:()=>2,
      getRange:(r,col,n,w)=>({getValues:()=>r===1 ? [['setlistPosition']] : (requestedWidth=w, [Array(w).fill('')])}) };
    const c=vm.createContext({CONFIG:{RAW_SHEET:'歌唱RAW'},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet})}});
    vm.runInContext(fs.readFileSync(path.join(rawRoot,'Common.js'),'utf8'),c);
    c.getRawData(); assert.equal(requestedWidth,width);
  }
  let sortedWidth;
  const c=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(rawRoot,'RawGenerator.js'),'utf8'),c);
  c.sortRawSheet_({getLastRow:()=>4,getLastColumn:()=>9,getRange:(r,col,n,w)=>({sort:()=>sortedWidth=w})});
  assert.equal(sortedWidth,9);
});

test('Event UI keeps old numbering and handles confirmed / duplicate / missing positions at 1280/390', async () => {
  const http=require('node:http');
  const {chromium}=require('playwright');
  const server=http.createServer((req,res)=>{
    const filename=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.json')?'application/json':'text/html');
    res.end(fs.readFileSync(filename));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const width of [1280,390]) for(const id of ['EV0001','EV0040','EV0348']) {
      const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
      await page.addInitScript(()=>localStorage.setItem('musdb_analytics_consent','rejected'));
      const legacyRevision = path.basename(path.dirname(eventRoot));
      const legacyDataRevision = JSON.parse(fs.readFileSync(path.join(eventRoot, id+'.json'))).snapshot.dataRevision;
      await page.route('**/data/current.json', route => route.fulfill({contentType:'application/json',body:JSON.stringify({revision:legacyRevision,outputRevision:legacyRevision,dataRevision:legacyDataRevision,basePath:`./${legacyRevision}/`})}));
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      await page.route(/script\.google(?:usercontent)?\.com\//,route=>{
        const callback=new URL(route.request().url()).searchParams.get('callback');
        return route.fulfill({contentType:'text/javascript',body:`${callback}(${JSON.stringify({success:true,data:{dataRevision:legacyDataRevision,outputRevision:legacyRevision}})});`});
      });
      const original=JSON.parse(fs.readFileSync(path.join(eventRoot,id+'.json')));
      for(const positions of [null,[27,25,25],[1,2,3],[25,26,27],[null,26,27]]) {
        if(positions && id!=='EV0040') continue;
        const snapshot=JSON.parse(JSON.stringify(original));
        if(positions) {
          snapshot.data.event.songOrderIsSetlist=true;
          snapshot.data.event.songs.forEach((song,i)=>song.setlistPosition=positions[i]);
        }
        await page.route('**/events/'+id+'.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(snapshot)}));
        await page.goto(`http://127.0.0.1:${server.address().port}/event.html?id=${id}`);
        await page.locator('.event-song-row').first().waitFor();
        const actual=(await page.locator('.event-song-order').allTextContents()).map(s=>Number(s.trim()));
        const valid=positions && positions.every(p=>Number.isInteger(p)&&p>0);
        const expected=valid ? positions.slice().sort((a,b)=>a-b) : snapshot.data.event.songs.map((s,i)=>i+1);
        assert.deepEqual(actual,expected);
        const names=await page.locator('.event-song-title').allTextContents();
        const songs=snapshot.data.event.songs.slice();
        if(valid)songs.sort((a,b)=>a.setlistPosition-b.setlistPosition);
        assert.deepEqual(names.map(s=>s.trim()),songs.map(s=>s.songName));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.deepEqual(errors,[]);
        await page.unroute('**/events/'+id+'.json');
      }
      await page.close();
    }
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
});
