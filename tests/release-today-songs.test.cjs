"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),test=require('node:test');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const current=JSON.parse(fs.readFileSync(path.join(ROOT,'data/current.json')));
const snapshot=path.join(ROOT,'data/snapshots',current.revision);
const read=p=>JSON.parse(fs.readFileSync(path.join(snapshot,p)));
let server,browser,base;
test.before(async()=>{server=http.createServer((req,res)=>{const p=path.resolve(ROOT,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');if(!p.startsWith(ROOT+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:process.env.MUSDB_E2E_BROWSER_CHANNEL||'chrome',headless:true});});
test.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function open(url,width=1280,options={}){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],calls={static:[],api:[]};
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(options.clock)await page.clock.install({time:new Date(options.clock)});
  await page.route('**/data/snapshots/**',async route=>{calls.static.push(route.request().url());if(options.staticInvalid&&/\/events\//.test(route.request().url()))return route.fulfill({status:200,json:{}});if((options.releaseFailure||options.releaseEmpty)&&/\/releases\//.test(route.request().url()))return route.fulfill({status:200,json:{}});return route.continue();});
  await page.route(/script\.google(?:usercontent)?\.com\//,async route=>{
    const u=new URL(route.request().url()),action=u.searchParams.get('action'),id=u.searchParams.get('id');calls.api.push({action,id});
    let data={},success=true;
    if(action==='revision')data={dataRevision:current.dataRevision,outputRevision:current.outputRevision};
    if(action==='home'){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(options.todayTime||Date.now())).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));
      data={summary:{songCount:117,eventCount:353,venueCount:154,performanceCount:1000},today:{dateKey:`${parts.year}-${parts.month}-${parts.day}`,month:+parts.month,day:+parts.day,label:`${+parts.month}月${+parts.day}日`,events:[{eventId:'EV0001',eventName:'Event one',date:'2011-01-01'},{eventId:'EV0002',eventName:'Event two',date:'2011-01-01'}],releases:[],firstPerformedSongs:[],lastPerformedSongs:[]},recentPerformances:[],topSongs:[],topVenues:[]};
    }
    if(action==='event'){if(options.eventFailure){success=false;}else data=options.eventData||read('events/'+id+'.json').data.event;}
    if(action==='release'){if(options.releaseFailure)success=false;else {data=read('releases/'+id+'.json').data;if(options.releaseEmpty)data={...data,includedSongs:[]};}}
    return route.fulfill({status:200,contentType:'text/javascript',body:`${u.searchParams.get('callback')}(${JSON.stringify({success,data,error:'controlled failure'})});`});
  });
  await page.goto(base+'/'+url);await page.locator(url.startsWith('releases')?'#allReleasesSection':'#topSection').waitFor({state:'visible'});
  const decline=page.getByRole('button',{name:'同意しない',exact:true});if(await decline.isVisible())await decline.click();
  return {page,errors,calls,options};
}
async function clean(ctx){assert.deepEqual(ctx.errors,[]);assert.equal(await ctx.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await ctx.page.close();}
for(const width of [1280,390]){
  test(`Release ${width}: R0021 / R0032 / R0052 real relations, sibling links, cached reload`,async()=>{
    const ctx=await open('releases.html?q=Blu-ray',width),{page,calls}=ctx;
    for(const [id,names]of [['R0021',['夢なき夢は夢じゃない']],['R0032',['ぷわぷわーお！']],['R0052',['CheerDay CheerGirl!','同じ星が見たい','Silent tonight']]]){
      const name=read('releases/'+id+'.json').data.releaseName;
      await page.locator('#releaseSearch').fill(name);await page.locator(`a.release-list-card[href="release/${id}.html"]`).scrollIntoViewIfNeeded();const card=page.locator(`[data-release-songs="${id}"]`);await card.locator('a').first().waitFor({state:'visible'});
      assert.deepEqual(await card.locator('a').allTextContents(),names);
      const releaseCard=page.locator(`a.release-list-card[href="release/${id}.html"]`);
      assert.equal(await releaseCard.locator('.release-list-category').innerText(),id==='R0021'?'Blu-ray':'特典');
      if(id!=='R0021')assert.equal(await releaseCard.locator('.release-list-meta-tag').count(),0);
      const bounds=await page.locator('.release-list-entry').evaluate(entry=>({title:entry.querySelector('.release-list-title').getBoundingClientRect().left,songs:entry.querySelector('.release-list-songs').getBoundingClientRect().left,titleSize:parseFloat(getComputedStyle(entry.querySelector('.release-list-title')).fontSize),songSize:parseFloat(getComputedStyle(entry.querySelector('.release-list-songs')).fontSize)}));
      assert.ok(Math.abs(bounds.title-bounds.songs)<0.5,JSON.stringify(bounds));assert.ok(bounds.songSize<bounds.titleSize);
      console.log(`coordinates ${width} ${id}: title=${bounds.title}, songs=${bounds.songs}`);
      if(process.env.MUSDB_RELEASE_SONGS_QA_DIR){await page.locator('.release-list-entry').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.MUSDB_RELEASE_SONGS_QA_DIR,`${width}-${id}.png`)});}
      assert.equal(await page.locator('a a').count(),0);assert.equal(await page.locator(`a.release-list-card[href="release/${id}.html"]`).count(),1);
      const rows=read('releases/'+id+'.json').data.includedSongs;for(let i=0;i<rows.length;i++)assert.equal(await card.locator('a').nth(i).getAttribute('href'),'song/'+rows[i].songId+'.html');
      if(id==='R0052')assert.match(await card.innerText(),/3曲.*ゲーマーズ.*CheerDay CheerGirl!.*ソフマップ.*同じ星が見たい.*アニメイト.*Silent tonight/s);
      await page.locator('#releaseSort').selectOption('old');await card.locator('a').first().waitFor();
      assert.equal(calls.static.filter(u=>u.endsWith('/releases/'+id+'.json')).length,1);
    }await clean(ctx);
  });
  test(`Release ${width}: zero relations and non-Blu-ray unchanged; filters/more`,async()=>{
    const ctx=await open('releases.html',width),{page}=ctx;
    assert.equal(await page.locator('.release-list-card').count(),24);await page.locator('#moreButton').click();assert.equal(await page.locator('.release-list-card').count(),48);
    await page.locator('[data-classification="CD"]').click();assert.equal(await page.locator('[data-release-songs]').count(),0);
    await page.locator('[data-classification="Blu-ray"]').click();const zero=read('release-list.json').data.find(x=>x.classification==='Blu-ray'&&!read('releases/'+x.releaseId+'.json').data.includedSongs.length);
    assert.ok(zero);await page.locator('#releaseSearch').fill(zero.releaseName);await page.locator('.release-list-card').waitFor();assert.equal(await page.locator('[data-release-songs]').count(),0);
    assert.equal(await page.locator('.release-list-song').count(),0);await clean(ctx);
  });
  test(`Today ${width}: no prefetch, independent expansion, cached reopening, Event/Song links`,async()=>{
    const ctx=await open('index.html',width),{page,calls}=ctx;
    assert.equal(calls.static.filter(u=>u.includes('/events/')).length,0);assert.equal(calls.api.filter(x=>x.action==='event').length,0);
    const buttons=page.locator('[data-today-event]');assert.equal(await buttons.count(),2);assert.equal(await buttons.nth(0).getAttribute('aria-expanded'),'false');
    await buttons.nth(0).press('Enter');const panel=page.locator('#today-songs-EV0001');await panel.locator('li').first().waitFor();
    assert.equal(await buttons.nth(1).getAttribute('aria-expanded'),'false');assert.equal(await buttons.nth(0).innerText(),'閉じる');
    assert.equal(await panel.locator('li').count(),read('events/EV0001.json').data.event.songs.length);
    assert.equal(await panel.locator('a').first().getAttribute('href'),'song/'+read('events/EV0001.json').data.event.songs.slice().sort((a,b)=>a.setlistPosition-b.setlistPosition)[0].songId+'.html');
    assert.equal(await page.locator('.today-event-entry a.today-item').first().getAttribute('href'),'event.html?id=EV0001');
    await buttons.nth(0).click();assert.equal(await panel.isVisible(),false);await buttons.nth(0).click();await buttons.nth(1).click();await page.locator('#today-songs-EV0002 li').first().waitFor();
    assert.equal(calls.static.filter(u=>u.endsWith('/events/EV0001.json')).length,1);assert.equal(calls.api.filter(x=>x.action==='event').length,0);await clean(ctx);
  });
}
test('Release failure preserves list and provides retry, no invented song',async()=>{const ctx=await open('releases.html?q='+encodeURIComponent(read('releases/R0021.json').data.releaseName),390,{releaseFailure:true});await ctx.page.locator('.release-list-card').scrollIntoViewIfNeeded();await ctx.page.locator('[data-release-songs] button').waitFor();assert.equal(await ctx.page.locator('.release-list-card').count(),1);assert.equal(await ctx.page.locator('.release-list-song').count(),0);ctx.options.releaseFailure=false;await ctx.page.locator('[data-release-songs] button').click();await ctx.page.locator('.release-list-song a').waitFor();await clean(ctx);});
test('Eligible Release with zero relations adds no visible supplement',async()=>{const ctx=await open('releases.html?q='+encodeURIComponent(read('releases/R0021.json').data.releaseName),390,{releaseEmpty:true});const finished=ctx.page.waitForEvent('requestfinished',{predicate:r=>new URL(r.url()).searchParams.get('action')==='release'});await ctx.page.locator('.release-list-card').scrollIntoViewIfNeeded();await finished;await ctx.page.waitForFunction(()=>!Object.keys(window).some(k=>k.startsWith('__musJsonpCallback_')));assert.equal(await ctx.page.locator('.release-list-song').count(),0);assert.equal(await ctx.page.locator('.release-list-songs').isVisible(),false);await clean(ctx);});
for(const mode of ['absolute','relative','raw','incomplete'])test('Today order '+mode+' preserves duplicates and escapes HTML',async()=>{
  const rows=[{songId:'S001',songName:'<img src=x onerror=alert(1)>',setlistPosition:2,relativePosition:null},{songId:'S002',songName:'Second',setlistPosition:1,relativePosition:null},{songId:'S001',songName:'Repeat',setlistPosition:3,relativePosition:null}];
  if(mode==='relative')rows.forEach((s,i)=>{s.setlistPosition=null;s.relativePosition=[2,1,3][i];});if(mode==='raw')rows.forEach(s=>s.setlistPosition=null);if(mode==='incomplete')rows[1].setlistPosition=null;
  const ctx=await open('index.html',390,{staticInvalid:true,eventData:{songs:rows,songOrderIsSetlist:['absolute','incomplete'].includes(mode)}});await ctx.page.locator('[data-today-event]').first().click();const p=ctx.page.locator('#today-songs-EV0001');await p.locator('li').first().waitFor();assert.deepEqual(await p.locator('a').allTextContents(),['absolute','relative'].includes(mode)?['Second',rows[0].songName,'Repeat']:[rows[0].songName,'Second','Repeat']);assert.equal(await p.locator('img').count(),0);assert.equal(await p.locator('li').count(),3);
  const ordered=['absolute','relative'].includes(mode);
  assert.equal(await p.locator(ordered?'ol':'ul').count(),1);
  assert.equal(await p.locator(ordered?'ul':'ol').count(),0);
  assert.deepEqual(await p.locator('li').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('value'))),ordered?['1','2','3']:[null,null,null]);
  assert.match(await p.locator('.today-event-order').innerText(),mode==='absolute'?/実際の歌唱順/:mode==='relative'?/イベント全体ではなく/:mode==='incomplete'?/不完全.*登録順/:/実際の歌唱順とは限りません/);
  assert.ok(await p.locator('a').first().evaluate(n=>n.getBoundingClientRect().height>=44));
  await clean(ctx);
});
for(const width of [1280,390])test(`Release ${width}: only 22 eligible releases, excluded rows make zero detail requests`,async()=>{
  const ctx=await open('releases.html',width),{page,calls}=ctx;
  while(await page.locator('#moreButton').isVisible())await page.locator('#moreButton').click();
  assert.equal(await page.locator('.release-list-card').count(),114);assert.equal(await page.locator('[data-release-songs]').count(),22);
  const list=read('release-list.json').data,eligible=list.filter(x=>(x.classification==='Blu-ray'&&x.releaseType==='アニメBlu-ray')||(x.classification==='特典'&&x.releaseType==='全巻購入特典')||['R0063','R0041','R0060','R0054','R0055','R0056'].includes(x.releaseId)).map(x=>x.releaseId);
  const excluded=['R0089','R0069','R0074','R0087','R0075','R0086','R0010'];
  for(const id of excluded){
    await page.locator('#releaseSearch').fill(list.find(x=>x.releaseId===id).releaseName);await page.locator(`a[href="release/${id}.html"]`).scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-release-songs]').count(),0);assert.equal(await page.locator('.release-list-song').count(),0);
    if(width===1280&&id==='R0089'&&process.env.MUSDB_RELEASE_SONGS_QA_DIR)await page.screenshot({path:path.join(process.env.MUSDB_RELEASE_SONGS_QA_DIR,'1280-R0089.png')});
  }
  assert.equal(calls.static.filter(u=>excluded.some(id=>u.endsWith('/releases/'+id+'.json'))).length,0);
  assert.equal(calls.api.filter(x=>x.action==='release'&&excluded.includes(x.id)).length,0);
  assert.ok(calls.static.filter(u=>/\/releases\//.test(u)).every(u=>eligible.includes(u.match(/(R\d{4})\.json$/)[1])));
  await clean(ctx);
});
test('Today zero and failed requests differ; retry succeeds',async()=>{const ctx=await open('index.html',390,{staticInvalid:true,eventFailure:true,eventData:{songs:[]}});await ctx.page.locator('[data-today-event]').first().click();const p=ctx.page.locator('#today-songs-EV0001');await p.locator('button').waitFor();assert.doesNotMatch(await p.innerText(),/登録済みの歌唱記録はありません/);ctx.options.eventFailure=false;await p.locator('button').click();await p.getByText('登録済みの歌唱記録はありません。').waitFor();await clean(ctx);});
test('JST rollover replaces expanded panels and rejects previous-day DOM',async()=>{
  const opts={clock:'2026-10-14T14:59:00Z',todayTime:'2026-10-14T14:59:00Z'},ctx=await open('index.html',390,opts);await ctx.page.locator('[data-today-event]').first().click();await ctx.page.locator('#today-songs-EV0001 li').first().waitFor();opts.todayTime='2026-10-14T15:01:00Z';await ctx.page.clock.runFor(120000);await ctx.page.waitForFunction(()=>document.querySelector('#todayDate').textContent.includes('10月15日'));assert.equal(await ctx.page.locator('[data-today-event]').first().getAttribute('aria-expanded'),'false');assert.equal(await ctx.page.locator('#today-songs-EV0001').isVisible(),false);await clean(ctx);
});
for(const width of [1280,390])test(`Release ${width}: other benefit source media remains unchanged`,async()=>{
  const list=read('release-list.json').data;
  const item=list.find(x=>x.classification==='特典'&&x.releaseType!=='全巻購入特典'&&x.sourceMedia&&x.sourceMedia!==x.classification);
  assert.ok(item);const ctx=await open('releases.html?q='+encodeURIComponent(item.releaseName),width);
  assert.equal(await ctx.page.locator(`a[href="release/${item.releaseId}.html"] .release-list-meta-tag`).innerText(),item.sourceMedia);
  await clean(ctx);
});
test('Extra Release IDs require the matching classification and release type',()=>{
  const source=fs.readFileSync(path.join(ROOT,'assets/js/releases-v500.js'),'utf8');
  const code=source.slice(source.indexOf('const EXTRA_SONG_SUPPLEMENTS'),source.indexOf('async function fillSongs'));
  const accepts=require('node:vm').runInNewContext(code+';hasSongSupplement');
  for(const id of ['R0063','R0041','R0060','R0054','R0055','R0056']){const item=read('release-list.json').data.find(x=>x.releaseId===id);assert.equal(accepts(item),true);assert.equal(accepts({...item,classification:'その他'}),false);assert.equal(accepts({...item,releaseType:'映像BOX'}),false);assert.equal(accepts({...item,releaseId:'R9999'}),false);}
});
for(const width of [1280,390])test(`Extra six Releases ${width}: formal Relation/song/link, alignment, one-line layout shift`,async()=>{
  const expected={R0063:'S109',R0041:'S075',R0060:'S104',R0054:'S095',R0055:'S096',R0056:'S097'};
  const ctx=await open('releases.html',width),{page,calls}=ctx;
  for(const [id,songId] of Object.entries(expected)){
    const d=read('releases/'+id+'.json').data;assert.equal(d.includedSongs.length,1);assert.equal(d.includedSongs[0].songId,songId);
    if(['R0041','R0060'].includes(id))assert.equal(d.includedSongsMeta.status,'not_applicable');
    await page.route('**/releases/'+id+'.json',async route=>{calls.static.push(route.request().url());await new Promise(r=>setTimeout(r,300));await route.continue();});
    await page.locator('#releaseSearch').fill(d.releaseName);const card=page.locator(`a.release-list-card[href="release/${id}.html"]`);await card.scrollIntoViewIfNeeded();
    const before=await page.locator('.release-list-entry').evaluate(x=>x.getBoundingClientRect().height);
    const songs=page.locator(`[data-release-songs="${id}"]`);await songs.locator('a').waitFor({state:'visible'});
    assert.equal(await songs.locator('a').innerText(),d.includedSongs[0].songName);assert.equal(await songs.locator('a').getAttribute('href'),'song/'+songId+'.html');
    const bounds=await page.locator('.release-list-entry').evaluate(x=>({title:x.querySelector('.release-list-title').getBoundingClientRect().left,songs:x.querySelector('.release-list-songs').getBoundingClientRect().left,height:x.getBoundingClientRect().height}));
    assert.ok(Math.abs(bounds.title-bounds.songs)<0.5,JSON.stringify(bounds));assert.ok(bounds.height-before<=58,`unexpected shift ${bounds.height-before}px`);
    console.log(`extra ${width} ${id}: left=${bounds.title}/${bounds.songs}, delayed height change=${bounds.height-before}px`);
    assert.equal(await page.locator('a a').count(),0);
    if(process.env.MUSDB_RELEASE_SONGS_QA_DIR){await page.locator('.release-list-entry').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.MUSDB_RELEASE_SONGS_QA_DIR,`${width}-${id}.png`)});}
  }await clean(ctx);
});
