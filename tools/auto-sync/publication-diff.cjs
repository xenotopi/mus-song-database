'use strict';

const assert = require('node:assert/strict');
const {revisions, same, sha} = require('./policy.cjs');

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

function checkPackage({rows, release, snapshotManifest}) {
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
  const expectedSnapshot = new Set([base + 'manifest.json', base + 'revision.json']);
  function checkSnapshotFile(relative, expected) {
    const entry = inventory.get(base + relative);
    assert.ok(entry && entry.bytes === expected?.bytes && entry.sha256 === expected?.fileSha256,
      'Snapshot file does not match its manifest ' + relative);
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
  return {pair, inventory, catalog, expectedSnapshot};
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

async function comparePublication({baseline, candidate, proveSource = async () => false}) {
  const previous = checkPackage(baseline);
  const next = checkPackage(candidate);
  for (const kind of ['songs', 'releases']) assert.deepEqual(next.catalog[kind], previous.catalog[kind], 'Unexpected ' + kind + ' ID change');
  const events = new Set(next.catalog.events);
  for (const id of previous.catalog.events) assert.ok(events.has(id), 'Existing Event removed ' + id);

  const changes = [];
  const songs = new Set(next.catalog.songs);
  const releases = new Set(next.catalog.releases);
  const revisionChanged = !same(previous.pair, next.pair);
  const rendererChanged = baseline.release.fingerprint !== candidate.release.fingerprint;

  async function explain(relative, before, after) {
    if (!after) return 'EXISTING_URL_REMOVED';
    if (receiptPaths.has(relative)) return 'PUBLICATION_RECEIPT';
    if (relative.startsWith('data/snapshots/')) {
      return !before && previous.pair.outputRevision !== next.pair.outputRevision && next.expectedSnapshot.has(relative)
        ? 'NEW_VERIFIED_SNAPSHOT' : 'UNEXPECTED_SNAPSHOT_CHANGE';
    }
    const detail = /^(song|release)\/([^/]+)\.html$/.exec(relative);
    const share = /^share\/(song|event)\/([^/]+)\.html$/.exec(relative);
    if (detail || relative === 'song/manifest.json' || relative === 'release/manifest.json') {
      const catalog = detail?.[1] === 'song' ? songs : releases;
      return (revisionChanged || rendererChanged) && (!detail || catalog.has(detail[2]))
        ? 'VERIFIED_DETAIL_GENERATION' : 'UNEXPECTED_DETAIL_CHANGE';
    }
    if (share || relative === 'sitemap.xml' || relative === 'data/gap-rankings.json' || relative === 'data/current.json') {
      const catalog = share?.[1] === 'song' ? songs : events;
      const allowedChange = relative === 'data/current.json' ? revisionChanged : revisionChanged || rendererChanged;
      return allowedChange && (!share || catalog.has(share[2])) ? 'VERIFIED_DERIVED_OUTPUT' : 'UNEXPECTED_DERIVED_CHANGE';
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
