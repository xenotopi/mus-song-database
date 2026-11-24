'use strict';

const assert = require('node:assert/strict');
const {revisions, same, sha} = require('./policy.cjs');
const {sha256: dataSha} = require('../detail-snapshot-lib.cjs');
const {semantic} = require('../ci/read-only-network.cjs');

const INVENTORY = 'data/sync-files.json';
const RELEASE = 'data/sync-release.json';
const receiptPaths = new Set([INVENTORY, RELEASE]);
const contentHash = /^[a-f0-9]{64}$/;
const safeId = /^[A-Za-z0-9_-]+$/;
const snapshotFiles = [
  ['releaseList', 'release-list.json'],
  ['kamiparaDashboard', 'kamipara-dashboard.json'],
  ['memberAnalytics', 'member-analytics.json']
];

function fileEntry(path, bytes) {
  return {path, bytes: bytes.length, sha256: sha(bytes)};
}

function indexEntries(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0, 'Missing publication file inventory');
  const entries = new Map();
  for (const row of rows) {
    assert.equal(typeof row.path, 'string', 'Invalid inventory path');
    assert.ok(!/[\x00-\x20#?\\:]/.test(row.path) && row.path.split('/').every(part => part && part !== '.' && part !== '..'),
      'Invalid inventory path');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && contentHash.test(row.sha256), 'Invalid inventory entry');
    assert.ok(!entries.has(row.path), 'Duplicate inventory path ' + row.path);
    entries.set(row.path, row);
  }
  return entries;
}

function sameFile(before, after) {
  return before?.bytes === after?.bytes && before?.sha256 === after?.sha256;
}

function checkPackage({rows, release, snapshotManifest, readFile}) {
  const pair = revisions(release);
  assert.ok(same(snapshotManifest, pair) && snapshotManifest.revision === pair.outputRevision,
    'Snapshot manifest revision does not match publication');
  const inventory = indexEntries(rows);
  const base = 'data/snapshots/' + pair.outputRevision + '/';
  assert.equal(inventory.get(INVENTORY)?.sha256, release.filesManifestSha256, 'Published file inventory hash mismatch');
  assert.equal(inventory.get('data/current.json')?.sha256, release.currentSha256, 'Current file hash mismatch');
  assert.equal(inventory.get(base + 'manifest.json')?.sha256, release.snapshotManifestSha256, 'Snapshot manifest hash mismatch');
  assert.ok(inventory.has(RELEASE), 'Missing publication receipt');

  const catalog = {};
  const inputs = new Map();
  const expectedSnapshot = new Set([base + 'manifest.json', base + 'revision.json']);
  function checkSnapshotFile(relative, expected) {
    const entry = inventory.get(base + relative);
    assert.ok(entry && entry.bytes === expected?.bytes && entry.sha256 === expected?.fileSha256,
      'Snapshot file does not match its manifest ' + relative);
    assert.ok(contentHash.test(expected.sha256), 'Missing snapshot data hash ' + relative);
    inputs.set(relative, expected);
    expectedSnapshot.add(base + relative);
  }
  for (const [kind, fixedCount, canonical] of [['songs', 117, 'song'], ['releases', 114, 'release'], ['events', null, null]]) {
    const files = snapshotManifest.hashes?.[kind];
    assert.ok(files && typeof files === 'object' && !Array.isArray(files), 'Missing ' + kind + ' catalog');
    const ids = Object.keys(files).sort();
    assert.ok(ids.every(id => safeId.test(id)), 'Invalid ' + kind + ' ID');
    assert.equal(ids.length, snapshotManifest.counts?.[kind], 'Incorrect ' + kind + ' manifest count');
    if (fixedCount !== null) assert.equal(ids.length, fixedCount, 'Unexpected ' + kind + ' count');
    for (const id of ids) {
      checkSnapshotFile(kind + '/' + id + '.json', files[id]);
      if (canonical) assert.ok(inventory.has(canonical + '/' + id + '.html'), 'Missing canonical page ' + canonical + '/' + id);
    }
    catalog[kind] = ids;
  }
  for (const [key, filename] of snapshotFiles) checkSnapshotFile(filename, snapshotManifest[key]);
  for (const entry of expectedSnapshot) assert.ok(inventory.has(entry), 'Missing snapshot file ' + entry);
  return {pair, inventory, catalog, expectedSnapshot, base, inputs, readFile};
}

async function loadPublishedBaseline(published, {get, siteUrl}) {
  assert.equal(published?.verified, true, 'A verified public release is required for the publication diff');
  assert.equal(published.runId, published.release?.runId, 'Public run does not match its receipt');
  assert.ok(published.receiptEntry?.path === RELEASE, 'The public release receipt was not verified');
  const {bytes} = await get(new URL(INVENTORY, siteUrl));
  assert.equal(sha(bytes), published.release.filesManifestSha256, 'Verified public inventory bytes changed');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.schemaVersion, 1);
  return {release: published.release, snapshotManifest: published.snapshotManifest,
    readFile: async relative => (await get(new URL(relative.split('/').map(encodeURIComponent).join('/'), siteUrl))).bytes,
    rows: [...manifest.files, fileEntry(INVENTORY, bytes), published.receiptEntry]};
}

// A static file change is explainable when its exact bytes are tracked by the reviewed source.
// Use both source revisions for replacements, so an old file whose origin is unknown stays protected.
async function trackedSourceMatches(http, relative, row, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const filename = relative.split('/').map(encodeURIComponent).join('/');
  const response = await http.gh('/contents/' + filename + '?ref=' + commit, {allow404: true});
  if (!response) return false;
  const item = response.json();
  if (item.type !== 'file' || item.path !== relative || item.size !== row.bytes || item.encoding !== 'base64' ||
      typeof item.content !== 'string') return false;
  const bytes = Buffer.from(item.content, 'base64');
  return bytes.length === row.bytes && sha(bytes) === row.sha256;
}

async function boundFile(pkg, relative) {
  const bytes = await pkg.readFile(relative);
  assert.ok(Buffer.isBuffer(bytes) && sameFile(fileEntry(relative,bytes),pkg.inventory.get(relative)),
    'Generated evidence bytes do not match inventory ' + relative);
  return bytes;
}

async function captureProof(pkg, type) {
  const pages = JSON.parse(await boundFile(pkg,type+'/manifest.json'));
  const proof = pages.captureProvenance;
  assert.ok(proof?.schemaVersion === 1 && same(proof,pkg.pair) && same(pages,pkg.pair) &&
    proof.entry === type+'.html' && proof.completion === 'all-pages-and-enrichment' &&
    contentHash.test(proof.rendererSha256) && proof.rendererSha256 === pages.rendererSha256,
    'Missing validated capture provenance for '+type);
  const group = type+'s';
  const relevant = [...pkg.inputs].filter(([relative]) => relative.startsWith(group+'/') ||
    type === 'release' && (relative.startsWith('events/') || ['release-list.json','kamipara-dashboard.json'].includes(relative)));
  assert.deepEqual(new Map(Object.entries(proof.inputs)),
    new Map(relevant.map(([relative,{sha256,fileSha256,bytes}])=>[relative,{dataSha256:sha256,fileSha256,bytes}])),
    'Capture inputs differ from verified snapshot '+type);
  for (const outputs of [pages.pages,proof.outputs]) {
    assert.deepEqual(Object.keys(outputs).sort(),pkg.catalog[group]);
    for (const [id,row] of Object.entries(outputs)) {
      const relative = type+'/'+id+'.html';
      assert.ok(sameFile(row,pkg.inventory.get(relative)) && (outputs !== pages.pages || row.path === relative),
        'Capture output differs from verified file '+relative);
    }
  }
  return pages;
}

const derivedRenderers = {
  share:['tools/generate-share-pages.cjs'],
  sitemap:['tools/generate-sitemap.cjs'],
  gap:['tools/generate-gap-rankings.cjs','assets/js/gap-rankings-model.js']
};

async function comparePublication({baseline, candidate, verifiedDerived = {}, proveSource = async () => false,
  rendererChanged: changedRenderer = async () => false}) {
  const previous = checkPackage(baseline);
  const next = checkPackage(candidate);
  for (const kind of ['songs', 'releases']) assert.deepEqual(next.catalog[kind], previous.catalog[kind], 'Unexpected ' + kind + ' ID change');
  const events = new Set(next.catalog.events);
  for (const id of previous.catalog.events) assert.ok(events.has(id), 'Existing Event removed ' + id);

  const changes = [];
  const songs = new Set(next.catalog.songs);
  const releases = new Set(next.catalog.releases);
  const revisionChanged = !same(previous.pair, next.pair);
  const capture = new Map();
  const inputChanges = new Map();

  function changedInput(relative) {
    if (!inputChanges.has(relative)) inputChanges.set(relative,(async()=>{
      const before = previous.inputs.get(relative), after = next.inputs.get(relative);
      if (!before || !after) return before !== after;
      if (before.sha256 === after.sha256) return false;
      const value = async pkg => {
        const {data,snapshot} = JSON.parse(await boundFile(pkg,pkg.base+relative));
        assert.ok(same(snapshot,pkg.pair) && dataSha(data) === pkg.inputs.get(relative).sha256,
          'Snapshot data evidence differs from manifest '+relative);
        const payload = semantic(data);
        if (relative === 'kamipara-dashboard.json' && payload.revision === pkg.pair.dataRevision) delete payload.revision;
        return dataSha(payload);
      };
      return await value(previous) !== await value(next);
    })());
    return inputChanges.get(relative);
  }
  async function changedInputs(select) {
    for (const relative of new Set([...previous.inputs.keys(),...next.inputs.keys()])) {
      if (select(relative) && await changedInput(relative)) return true;
    }
    return false;
  }
  async function revisionOnly(relative) {
    const normalize = (bytes,pair) => bytes.toString('utf8')
      .replaceAll(pair.outputRevision,'{outputRevision}').replaceAll(pair.dataRevision,'{dataRevision}');
    return revisionChanged && normalize(await boundFile(previous,relative),previous.pair) ===
      normalize(await boundFile(next,relative),next.pair);
  }
  async function detailChanged(type,id,relative) {
    if (!capture.has(type)) capture.set(type,Promise.all([captureProof(previous,type),captureProof(next,type)]));
    const [oldPage,newPage] = await capture.get(type);
    if (oldPage.rendererSha256 !== newPage.rendererSha256) return true;
    const shared = key => type === 'release' && (key.startsWith('events/') ||
      ['release-list.json','kamipara-dashboard.json'].includes(key));
    if (await changedInputs(key => shared(key) || (id ? key === `${type}s/${id}.json` : key.startsWith(type+'s/')))) return true;
    if (id) return revisionOnly(relative);
    // A new revision changes capture file hashes and the output receipts even
    // for identical render inputs. Individual HTML differences are checked separately.
    const metadata = ({dataRevision,outputRevision,pages,captureProvenance,...rest}) => rest;
    return revisionChanged && dataSha(metadata(oldPage)) === dataSha(metadata(newPage));
  }

  async function explain(relative, before, after) {
    if (!after) return 'EXISTING_URL_REMOVED';
    if (receiptPaths.has(relative)) return 'PUBLICATION_RECEIPT';
    if (relative.startsWith('data/snapshots/')) {
      return !before && previous.pair.outputRevision !== next.pair.outputRevision && next.expectedSnapshot.has(relative)
        ? 'NEW_VERIFIED_SNAPSHOT' : 'UNEXPECTED_SNAPSHOT_CHANGE';
    }
    const detail = /^(song|release)\/([^/]+)\.html$/.exec(relative);
    const share = /^share\/(song|event)\/([^/]+)\.html$/.exec(relative);
    if (detail || /^(song|release)\/manifest\.json$/.test(relative)) {
      const type = relative.split('/')[0];
      const catalog = type === 'song' ? songs : releases;
      return (!detail || catalog.has(detail[2])) && await detailChanged(type,detail?.[2],relative)
        ? 'VERIFIED_DETAIL_GENERATION' : 'UNEXPECTED_DETAIL_CHANGE';
    }
    if (relative === 'data/current.json') {
      const {outputRevision,dataRevision} = next.pair;
      assert.deepEqual(JSON.parse(await boundFile(next,relative)),{revision:outputRevision,outputRevision,dataRevision,
        basePath:'./'+outputRevision+'/',manifest:'./'+outputRevision+'/manifest.json'});
      return revisionChanged ? 'VERIFIED_DERIVED_OUTPUT' : 'UNEXPECTED_DERIVED_CHANGE';
    }
    if (share || relative === 'sitemap.xml' || relative === 'data/gap-rankings.json') {
      if (!sameFile(verifiedDerived[relative],after)) return 'UNVERIFIED_DERIVED_OUTPUT';
      const paths = derivedRenderers[share ? 'share' : relative === 'sitemap.xml' ? 'sitemap' : 'gap'];
      let inputChanged = false;
      if (share) {
        const catalog = share[1] === 'song' ? songs : events;
        if (!catalog.has(share[2])) return 'UNEXPECTED_DERIVED_CHANGE';
        inputChanged = await changedInput(`${share[1]}s/${share[2]}.json`);
      } else if (relative === 'data/gap-rankings.json') {
        const [oldGap,newGap] = await Promise.all([boundFile(previous,relative),boundFile(next,relative)].map(p=>p.then(JSON.parse)));
        inputChanged = await changedInputs(key=>/^(songs|events)\//.test(key));
        // The checked generator also changes the source stamps when its payload is unchanged.
        inputChanged ||= revisionChanged && oldGap.payloadSha256 === newGap.payloadSha256 &&
          dataSha(oldGap.payload) === dataSha(newGap.payload);
      }
      return inputChanged || await changedRenderer(paths) ? 'VERIFIED_DERIVED_OUTPUT' : 'UNEXPECTED_DERIVED_CHANGE';
    }
    if (baseline.release.sourceSha !== candidate.release.sourceSha && await proveSource(relative, before, after)) {
      return 'TRACKED_SOURCE_CHANGE';
    }
    return 'UNEXPLAINED_FILE_CHANGE';
  }

  const allowedReasons = new Set(['PUBLICATION_RECEIPT', 'NEW_VERIFIED_SNAPSHOT', 'VERIFIED_DETAIL_GENERATION',
    'VERIFIED_DERIVED_OUTPUT', 'TRACKED_SOURCE_CHANGE']);
  const counts = {added: 0, changed: 0, deleted: 0};
  let unexplained = 0;
  for (const relative of [...new Set([...previous.inventory.keys(), ...next.inventory.keys()])].sort()) {
    const before = previous.inventory.get(relative);
    const after = next.inventory.get(relative);
    if (sameFile(before, after)) continue;
    const kind = !before ? 'added' : !after ? 'deleted' : 'changed';
    const reason = await explain(relative, before, after);
    counts[kind]++;
    if (!allowedReasons.has(reason)) unexplained++;
    changes.push({path: relative, kind, reason, before: before ?? null, after: after ?? null});
  }
  const status = unexplained ? 'FAIL' : changes.some(row => !receiptPaths.has(row.path)) ? 'PASS' : 'NO_OP';
  return {status, baseline: {runId: baseline.release.runId, filesManifestSha256: baseline.release.filesManifestSha256,
    receiptSha256: previous.inventory.get(RELEASE).sha256}, counts, unexplained, changes};
}

module.exports = {fileEntry, loadPublishedBaseline, trackedSourceMatches, comparePublication};
