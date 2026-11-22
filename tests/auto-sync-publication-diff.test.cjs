'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {fileEntry, loadPublishedBaseline, trackedSourceMatches, comparePublication} = require('../tools/auto-sync/publication-diff.cjs');
const {sha256} = require('../tools/detail-snapshot-lib.cjs');

const inventoryPath = 'data/sync-files.json';
const receiptPath = 'data/sync-release.json';
const songIds = Array.from({length:117}, (_,i) => 'S' + String(i + 1).padStart(3,'0'));
const releaseIds = Array.from({length:114}, (_,i) => 'R' + String(i + 1).padStart(4,'0'));
const encode = value => Buffer.from(JSON.stringify(value));
const entry = (name, value) => fileEntry(name, Buffer.from(value));

function finalize(files, release, snapshotManifest, bodies) {
  const inventoryBytes = encode({schemaVersion:1, files});
  const boundRelease = {...release, filesManifestSha256:fileEntry(inventoryPath,inventoryBytes).sha256};
  return {rows:[...files, fileEntry(inventoryPath,inventoryBytes), fileEntry(receiptPath,encode(boundRelease))],
    release:boundRelease, snapshotManifest, inventoryBytes, bodies, readFile:relative=>bodies.get(relative)};
}

function baseline({songs=songIds,releases=releaseIds,events=['EV0001'],generation='a',payloadGeneration=generation,runId=1}={}) {
  const dataRevision = 'sha256-' + generation.repeat(64);
  const outputRevision = 'sha256-' + (generation==='a'?'b':'d').repeat(64);
  const prefix = `data/snapshots/${outputRevision}/`;
  const rows = [];
  const bodies = new Map();
  function add(name, value) {
    const row = entry(name, value);
    rows.push(row);
    bodies.set(name,Buffer.from(value));
    return {bytes:row.bytes, fileSha256:row.sha256};
  }
  const pair = {revision:outputRevision,dataRevision,outputRevision};
  function snapshot(relative,payload) {
    return {...add(prefix+relative,JSON.stringify({snapshot:pair,data:payload})),sha256:sha256(payload)};
  }
  function data(kind, ids) {
    return Object.fromEntries(ids.map(id => [id,snapshot(kind + '/' + id + '.json',
      {id,generation:payloadGeneration,_cache:{revision:dataRevision}})]));
  }
  const snapshotManifest = {dataRevision, outputRevision, revision:outputRevision,
    hashes:{songs:data('songs',songs),releases:data('releases',releases),events:data('events',events)},
    counts:{songs:songs.length,releases:releases.length,events:events.length},
    releaseList:snapshot('release-list.json',{generation:payloadGeneration}),
    kamiparaDashboard:snapshot('kamipara-dashboard.json',{generation:payloadGeneration}),
    memberAnalytics:snapshot('member-analytics.json',{generation:payloadGeneration})};
  const manifest = add(prefix + 'manifest.json', JSON.stringify(snapshotManifest));
  const current = add('data/current.json', JSON.stringify({...pair,basePath:'./'+outputRevision+'/',manifest:'./'+outputRevision+'/manifest.json'}));
  add(prefix + 'revision.json', dataRevision);
  add('index.html', 'existing URL');
  add('assets/js/common.js', 'approved current common script');
  const gap = {generation};
  add('data/gap-rankings.json', JSON.stringify({payload:gap,payloadSha256:sha256(gap)}));
  add('sitemap.xml', 'Song and Release IDs only');
  for (const id of songs) add('song/'+id+'.html', id+generation);
  for (const id of releases) add('release/'+id+'.html', id+generation);
  for (const id of events) add('share/event/'+id+'.html', id+generation);
  for (const [type,ids] of [['song',songs],['release',releases]]) {
    const pages = pageManifest(type,ids,rows,snapshotManifest,pair,'b'.repeat(64));
    add(type+'/manifest.json',JSON.stringify(pages));
  }
  return finalize(rows, {dataRevision,outputRevision,runId,sourceSha:'1'.repeat(40),fingerprint:'2'.repeat(64),
    currentSha256:current.fileSha256,snapshotManifestSha256:manifest.fileSha256}, snapshotManifest,bodies);
}

function pageManifest(type,ids,rows,snapshot,pair,rendererSha256) {
  const input = ([relative,{sha256:dataSha256,fileSha256,bytes}])=>[relative,{dataSha256,fileSha256,bytes}];
  const inputs = Object.fromEntries(Object.entries(snapshot.hashes[type+'s']).map(([id,row])=>input([type+'s/'+id+'.json',row])));
  if (type === 'release') {
    for (const [key,row] of Object.entries(snapshot.hashes.events)) Object.assign(inputs,Object.fromEntries([input(['events/'+key+'.json',row])]));
    Object.assign(inputs,Object.fromEntries([input(['release-list.json',snapshot.releaseList]),input(['kamipara-dashboard.json',snapshot.kamiparaDashboard])]));
  }
  const pages = Object.fromEntries(ids.map(id=>{
    const relative = type+'/'+id+'.html';
    return [id,rows.find(row=>row.path===relative)];
  }));
  const outputs = Object.fromEntries(Object.entries(pages).map(([id,{bytes,sha256}])=>[id,{bytes,sha256}]));
  return {...pair,rendererSha256,pages,captureProvenance:{schemaVersion:1,...pair,rendererSha256,
    entry:type+'.html',completion:'all-pages-and-enrichment',inputs,outputs}};
}

function modify(pkg, edit, release={}) {
  const payload = pkg.rows.filter(row => ![inventoryPath,receiptPath].includes(row.path));
  return finalize(edit(payload), {...pkg.release,...release}, pkg.snapshotManifest,pkg.bodies);
}

const derive = pkg => Object.fromEntries(pkg.rows.filter(row=>row.path.startsWith('share/')||row.path==='data/gap-rankings.json')
  .map(row=>[row.path,row]));

function withExistingSnapshots(before, next) {
  const retained = before.rows.filter(row => row.path.startsWith('data/snapshots/'));
  return modify(next, rows => [...rows,...retained]);
}

test('only a verified public inventory bound by the previous publication SHA may be the baseline', async () => {
  const saved=baseline();
  const publication={verified:true,runId:1,release:saved.release,snapshotManifest:saved.snapshotManifest,
    receiptEntry:saved.rows.find(row=>row.path===receiptPath)};
  const dependencies={get:async url=>{
    assert.equal(url.href,'https://example.invalid/'+inventoryPath);
    return {bytes:saved.inventoryBytes};
  },siteUrl:'https://example.invalid/'};
  const loaded=await loadPublishedBaseline(publication,dependencies);
  assert.deepEqual(loaded.rows,saved.rows);
  await assert.rejects(loadPublishedBaseline({...publication,verified:false},dependencies), /verified public release/);
  await assert.rejects(loadPublishedBaseline(publication,{...dependencies,get:async()=>({bytes:Buffer.from('{}')})}),/inventory bytes changed/);
});

test('identical payload and a new receipt both produce NO_OP', async () => {
  const before=baseline();
  assert.deepEqual((await comparePublication({baseline:before,candidate:before})).counts,{added:0,changed:0,deleted:0});
  const result=await comparePublication({baseline:before,candidate:modify(before,rows=>rows,{runId:2})});
  assert.equal(result.status,'NO_OP');
  assert.deepEqual(result.changes.map(row=>[row.path,row.reason]),[[receiptPath,'PUBLICATION_RECEIPT']]);
});

test('next verified revision permits existing Event updates and a new Event without removing old snapshots', async () => {
  const before=baseline();
  const next=withExistingSnapshots(before,baseline({generation:'c',events:['EV0001','EV0002'],runId:2}));
  const result=await comparePublication({baseline:before,candidate:next,verifiedDerived:derive(next)});
  assert.equal(result.status,'PASS');
  assert.equal(result.unexplained,0);
  assert.equal(result.counts.deleted,0);
  assert.ok(result.changes.some(row=>row.path==='share/event/EV0002.html'&&row.kind==='added'&&row.reason==='VERIFIED_DERIVED_OUTPUT'));
  assert.ok(result.changes.some(row=>row.path.startsWith('data/snapshots/')&&row.path.endsWith('/events/EV0002.json')&&row.reason==='NEW_VERIFIED_SNAPSHOT'));
});

test('an existing public URL and an unregistered JSON in the new snapshot cannot disappear or slip in', async () => {
  const before=baseline();
  const next=withExistingSnapshots(before,baseline({generation:'c',runId:2}));
  const extra='data/snapshots/'+next.release.outputRevision+'/unexpected.json';
  const candidate=modify(next,rows=>[...rows.filter(row=>row.path!=='index.html'),entry(extra,'unknown')]);
  const result=await comparePublication({baseline:before,candidate,verifiedDerived:derive(next),proveSource:async()=>true});
  assert.equal(result.status,'FAIL');
  assert.equal(result.unexplained,2);
  assert.equal(result.changes.find(row=>row.path===extra).reason,'UNEXPECTED_SNAPSHOT_CHANGE');
  assert.equal(result.changes.find(row=>row.path==='index.html').reason,'EXISTING_URL_REMOVED');
});

test('an unexplained same-revision output, unknown package path and old snapshot mutation are blocked', async () => {
  const before=baseline();
  const candidate=modify(before,rows=>[...rows.map(row=>row.path==='song/S001.html'?entry(row.path,'spoofed page'):row),
    entry('assets/js/unexplained.js','unknown')]);
  await assert.rejects(comparePublication({baseline:before,candidate}),/Capture output differs from verified file/);
  const unknown=modify(before,rows=>[...rows,entry('assets/js/unexplained.js','unknown')]);
  const unknownResult=await comparePublication({baseline:before,candidate:unknown});
  assert.equal(unknownResult.changes.find(row=>row.path==='assets/js/unexplained.js').reason,'UNEXPLAINED_FILE_CHANGE');
  assert.equal(unknownResult.status,'FAIL');
  const next=withExistingSnapshots(before,baseline({generation:'c',runId:2}));
  const oldFile='data/snapshots/'+before.release.outputRevision+'/events/EV0001.json';
  const result=await comparePublication({baseline:before,verifiedDerived:derive(next),candidate:modify(next,rows=>rows.map(row=>row.path===oldFile?entry(row.path,'rewrite'):row))});
  assert.equal(result.status,'FAIL');
  assert.equal(result.changes.find(row=>row.path===oldFile).reason,'UNEXPECTED_SNAPSHOT_CHANGE');
});

test('Song and Release counts and IDs are fixed, and existing Event IDs are required', async () => {
  const before=baseline();
  for (const [options, expected] of [
    [{songs:songIds.slice(1)},/songs count/],
    [{releases:releaseIds.slice(1)},/releases count/],
    [{songs:[...songIds.slice(1),'S999']},/songs ID change/],
    [{releases:[...releaseIds.slice(1),'R9999']},/releases ID change/],
    [{events:['EV0002']},/Existing Event removed EV0001/]
  ]) {
    await assert.rejects(comparePublication({baseline:before,candidate:baseline({...options,generation:'c',runId:2})}),expected);
  }
});

function renderedChange(before,rendererSha256) {
  const after={...before,bodies:new Map(before.bodies)};
  after.readFile=relative=>after.bodies.get(relative);
  const candidate=modify(after,rows=>{
    const next=rows.map(row=>row.path==='song/S001.html'?entry(row.path,'new output'):row);
    const manifest=pageManifest('song',songIds,next,before.snapshotManifest,before.snapshotManifest,rendererSha256);
    const body=encode(manifest);
    after.bodies.set('song/manifest.json',body);
    after.bodies.set('song/S001.html',Buffer.from('new output'));
    return next.map(row=>row.path==='song/manifest.json'?fileEntry(row.path,body):row);
  },{sourceSha:'3'.repeat(40),fingerprint:'4'.repeat(64),runId:2});
  return candidate;
}

test('a CI-only fingerprint change does not explain rewritten HTML even with matching output receipts', async () => {
  const before=baseline();
  const result=await comparePublication({baseline:before,candidate:renderedChange(before,'b'.repeat(64)),proveSource:async()=>true});
  assert.equal(result.status,'FAIL');
  assert.equal(result.changes.find(row=>row.path==='song/S001.html').reason,'UNEXPECTED_DETAIL_CHANGE');
});

test('a new revision and cache stamps do not explain unrelated HTML changes', async () => {
  const before=baseline();
  const candidate=withExistingSnapshots(before,baseline({generation:'c',payloadGeneration:'a',runId:2}));
  const result=await comparePublication({baseline:before,candidate,verifiedDerived:derive(candidate)});
  assert.equal(result.status,'FAIL');
  assert.equal(result.changes.find(row=>row.path==='song/S001.html').reason,'UNEXPECTED_DETAIL_CHANGE');
});

test('unverified generated output is rejected even when a real Event changed', async () => {
  const before=baseline();
  const next=withExistingSnapshots(before,baseline({generation:'c',runId:2}));
  const candidate=modify(next, rows=>rows.map(row=>row.path==='share/event/EV0001.html'?entry(row.path,'unexplained'):row));
  const result=await comparePublication({baseline:before,candidate,verifiedDerived:derive(next)});
  assert.equal(result.status,'FAIL');
  assert.equal(result.changes.find(row=>row.path==='share/event/EV0001.html').reason,'UNVERIFIED_DERIVED_OUTPUT');
});

test('tracked static modifications and renderer changes are permitted with exact source proof', async () => {
  const before=baseline();
  const candidate=modify(renderedChange(before,'c'.repeat(64)),rows=>rows.map(row=>
    row.path==='assets/js/common.js'?entry(row.path,'approved replacement'):row));
  let calls=0;
  const proveSource=async (relative,oldItem,newItem)=>{
    calls++;
    assert.equal(relative,'assets/js/common.js');
    assert.notEqual(newItem.sha256,oldItem.sha256);
    return true;
  };
  const result=await comparePublication({baseline:before,candidate,proveSource});
  assert.equal(calls,1);
  assert.equal(result.status,'PASS');
  assert.equal(result.changes.find(row=>row.path==='assets/js/common.js').reason,'TRACKED_SOURCE_CHANGE');
  assert.equal((await comparePublication({baseline:before,candidate})).status,'FAIL');
});

test('exact tracked source comparison checks path, file type, bytes, SHA256 and immutable ref', async () => {
  const item=entry('assets/js/common.js','new code');
  const hash='3'.repeat(40);
  const response={type:'file',path:item.path,size:item.bytes,encoding:'base64',content:Buffer.from('new code').toString('base64')};
  const mock = reply => ({gh:async(endpoint,options)=>{
    assert.equal(endpoint,'/contents/assets/js/common.js?ref='+hash);
    assert.deepEqual(options,{allow404:true});
    return reply===null?null:{json:()=>reply};
  }});
  assert.equal(await trackedSourceMatches(mock(response),item.path,item,hash),true);
  assert.equal(await trackedSourceMatches(mock({...response,content:Buffer.from('old code').toString('base64')}),item.path,item,hash),false);
  assert.equal(await trackedSourceMatches(mock({...response,type:'symlink'}),item.path,item,hash),false);
  assert.equal(await trackedSourceMatches(mock(null),item.path,item,hash),false);
});

test('snapshot byte mismatches, protected canonical files and duplicate inventory rows block promotion', async () => {
  const before=baseline();
  const prefix='data/snapshots/'+before.release.outputRevision+'/';
  for (const [edit, expected] of [
    [rows=>rows.map(row=>row.path===prefix+'songs/S001.json'?entry(row.path,'invalid'):row),/Snapshot file does not match/],
    [rows=>rows.filter(row=>row.path!=='release/R0001.html'),/Missing canonical page/],
    [rows=>[...rows,rows[0]],/Duplicate inventory path/]
  ]) await assert.rejects(comparePublication({baseline:before,candidate:modify(before,edit)}),expected);
});
