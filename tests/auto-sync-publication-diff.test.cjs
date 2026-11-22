'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {fileEntry, loadPublishedBaseline, trackedSourceMatches, comparePublication} = require('../tools/auto-sync/publication-diff.cjs');

const inventoryPath = 'data/sync-files.json';
const receiptPath = 'data/sync-release.json';
const songIds = Array.from({length:117}, (_,i) => 'S' + String(i + 1).padStart(3,'0'));
const releaseIds = Array.from({length:114}, (_,i) => 'R' + String(i + 1).padStart(4,'0'));
const encode = value => Buffer.from(JSON.stringify(value));
const entry = (name, value) => fileEntry(name, Buffer.from(value));

function finalize(files, release, snapshotManifest) {
  const inventoryBytes = encode({schemaVersion:1, files});
  const boundRelease = {...release, filesManifestSha256:fileEntry(inventoryPath,inventoryBytes).sha256};
  return {rows:[...files, fileEntry(inventoryPath,inventoryBytes), fileEntry(receiptPath,encode(boundRelease))],
    release:boundRelease, snapshotManifest, inventoryBytes};
}

function baseline({songs=songIds,releases=releaseIds,events=['EV0001'],generation='a',runId=1}={}) {
  const dataRevision = 'sha256-' + generation.repeat(64);
  const outputRevision = 'sha256-' + (generation==='a'?'b':'d').repeat(64);
  const prefix = `data/snapshots/${outputRevision}/`;
  const rows = [];
  function add(name, value) {
    const row = entry(name, value);
    rows.push(row);
    return {bytes:row.bytes, fileSha256:row.sha256};
  }
  function data(kind, ids) {
    return Object.fromEntries(ids.map(id => [id,add(prefix + kind + '/' + id + '.json', id + generation)]));
  }
  const snapshotManifest = {dataRevision, outputRevision, revision:outputRevision,
    hashes:{songs:data('songs',songs),releases:data('releases',releases),events:data('events',events)},
    counts:{songs:songs.length,releases:releases.length,events:events.length},
    releaseList:add(prefix+'release-list.json',generation),
    kamiparaDashboard:add(prefix+'kamipara-dashboard.json',generation),
    memberAnalytics:add(prefix+'member-analytics.json',generation)};
  const manifest = add(prefix + 'manifest.json', JSON.stringify(snapshotManifest));
  const current = add('data/current.json', outputRevision);
  add(prefix + 'revision.json', dataRevision);
  add('index.html', 'existing URL');
  add('assets/js/common.js', 'approved current common script');
  add('data/gap-rankings.json', generation);
  add('sitemap.xml', generation);
  for (const id of songs) add('song/'+id+'.html', id+generation);
  for (const id of releases) add('release/'+id+'.html', id+generation);
  for (const id of events) add('share/event/'+id+'.html', id+generation);
  return finalize(rows, {dataRevision,outputRevision,runId,sourceSha:'1'.repeat(40),fingerprint:'2'.repeat(64),
    currentSha256:current.fileSha256,snapshotManifestSha256:manifest.fileSha256}, snapshotManifest);
}

function modify(pkg, edit, release={}) {
  const payload = pkg.rows.filter(row => ![inventoryPath,receiptPath].includes(row.path));
  return finalize(edit(payload), {...pkg.release,...release}, pkg.snapshotManifest);
}

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
  const result=await comparePublication({baseline:before,candidate:next});
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
  const result=await comparePublication({baseline:before,candidate,proveSource:async()=>true});
  assert.equal(result.status,'FAIL');
  assert.equal(result.unexplained,2);
  assert.equal(result.changes.find(row=>row.path===extra).reason,'UNEXPECTED_SNAPSHOT_CHANGE');
  assert.equal(result.changes.find(row=>row.path==='index.html').reason,'EXISTING_URL_REMOVED');
});

test('an unexplained same-revision output, unknown package path and old snapshot mutation are blocked', async () => {
  const before=baseline();
  const candidate=modify(before,rows=>[...rows.map(row=>row.path==='song/S001.html'?entry(row.path,'spoofed page'):row),
    entry('assets/js/unexplained.js','unknown')]);
  const currentResult=await comparePublication({baseline:before,candidate});
  assert.equal(currentResult.status,'FAIL');
  assert.equal(currentResult.unexplained,2);
  const next=withExistingSnapshots(before,baseline({generation:'c',runId:2}));
  const oldFile='data/snapshots/'+before.release.outputRevision+'/events/EV0001.json';
  const result=await comparePublication({baseline:before,candidate:modify(next,rows=>rows.map(row=>row.path===oldFile?entry(row.path,'rewrite'):row))});
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

test('tracked static modifications and renderer changes are permitted with exact source proof', async () => {
  const before=baseline();
  const candidate=modify(before,rows=>rows.map(row=>row.path==='assets/js/common.js'?entry(row.path,'approved replacement'):
    row.path==='song/S001.html'?entry(row.path,'new renderer'):row),{sourceSha:'3'.repeat(40),fingerprint:'4'.repeat(64),runId:2});
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
