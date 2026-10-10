"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { rendererFingerprint, buildSongPageManifest } = require("../tools/generate-song-pages.cjs");
const { assertProductionSongManifest } = require("./helpers/song-prerender-manifest.cjs");
const root = path.resolve(__dirname, "..");
const current = require("../data/current.json");
const snapshotManifest = require(`../data/snapshots/${current.revision}/manifest.json`);
const published = require("../song/manifest.json");
const expected = {
  ids: Object.keys(snapshotManifest.hashes.songs).sort(), rendererSha256: rendererFingerprint(),
  outputRevision: current.revision, dataRevision: snapshotManifest.dataRevision
};
const oldRenderer = "0".repeat(64);
const partialIds = ["S001", "S003", "S117"];
function completeFixture(renderer = expected.rendererSha256) {
  const result = structuredClone(published);
  result.rendererSha256 = renderer;
  delete result.latestRendererSha256;
  for (const page of Object.values(result.pages)) page.rendererSha256 = renderer;
  return result;
}
function partialFixture() {
  const previous = completeFixture(oldRenderer);
  const pages = completeFixture().pages;
  return buildSongPageManifest({ previous, current, rendererSha256: expected.rendererSha256,
    generatedPages: Object.fromEntries(partialIds.map(id => [id, pages[id]])) });
}

test("A: all 117 current renderer pages pass production completeness", () => {
  assert.doesNotThrow(() => assertProductionSongManifest(completeFixture(), expected));
});

test("B/C: partial generation succeeds but 3 current + 114 old pages fail production despite current latestRendererSha256", () => {
  const previous = completeFixture(oldRenderer);
  const merged = partialFixture();
  assert.equal(merged.latestRendererSha256, expected.rendererSha256);
  assert.equal(merged.rendererSha256, oldRenderer);
  assert.equal(merged.count, 117);
  assert.equal(Object.values(merged.pages).filter(page => page.rendererSha256 === expected.rendererSha256).length, 3);
  assert.equal(Object.values(merged.pages).filter(page => page.rendererSha256 === oldRenderer).length, 114);
  for (const id of expected.ids.filter(id => !partialIds.includes(id))) assert.deepEqual(merged.pages[id], previous.pages[id]);
  assert.throws(() => assertProductionSongManifest(merged, expected), /complete-set renderer fingerprint is stale/);
  // Even incorrectly promoting the complete-set field cannot hide stale pages.
  merged.rendererSha256 = expected.rendererSha256;
  assert.throws(() => assertProductionSongManifest(merged, expected), /page renderer fingerprint is stale/);
});

test("C: latestRendererSha256 alone cannot establish complete-set freshness", () => {
  const fixture = completeFixture(oldRenderer);
  fixture.latestRendererSha256 = expected.rendererSha256;
  assert.throws(() => assertProductionSongManifest(fixture, expected), /complete-set renderer fingerprint is stale/);
  delete fixture.rendererSha256;
  assert.throws(() => assertProductionSongManifest(fixture, expected), /complete-set renderer fingerprint is stale/);
});

test("D/E: one stale page fails even when complete-set/latest fingerprints and every HTML hash match", () => {
  const fixture = completeFixture();
  fixture.latestRendererSha256 = expected.rendererSha256;
  fixture.pages.S117.rendererSha256 = oldRenderer;
  for (const page of Object.values(fixture.pages)) {
    const html = fs.readFileSync(path.join(root, page.path));
    assert.equal(crypto.createHash("sha256").update(html).digest("hex"), page.sha256);
  }
  assert.throws(() => assertProductionSongManifest(fixture, expected), /S117: page renderer fingerprint is stale/);
});

test("F: full generation replaces mixed state with all-current pages; actual formal output is complete", () => {
  const mixed = partialFixture();
  const rebuilt = buildSongPageManifest({ previous: null, current, rendererSha256: expected.rendererSha256,
    generatedPages: completeFixture().pages });
  assert.notEqual(mixed.rendererSha256, rebuilt.rendererSha256);
  assert.equal(Object.hasOwn(rebuilt, "latestRendererSha256"), false);
  assertProductionSongManifest(rebuilt, expected);
  assertProductionSongManifest(published, expected);
});

test("partial generation with unchanged renderer remains production-complete without mutating previous entries", () => {
  const previous = completeFixture();
  const before = structuredClone(previous);
  const generatedPages = Object.fromEntries(partialIds.map(id => [id, { ...previous.pages[id] }]));
  const merged = buildSongPageManifest({ previous, current, generatedPages, rendererSha256: expected.rendererSha256 });
  assertProductionSongManifest(merged, expected);
  assert.deepEqual(previous, before);
  assert.throws(() => buildSongPageManifest({ previous, current: { ...current, revision: "wrong" }, generatedPages,
    rendererSha256: expected.rendererSha256 }), /Partial generation cannot mix snapshot revisions/);
});

test("a standalone 3-song PoC and incomplete page/count sets are not production-complete", () => {
  const generatedPages = Object.fromEntries(partialIds.map(id => [id, completeFixture().pages[id]]));
  const poc = buildSongPageManifest({ previous: null, current, generatedPages, rendererSha256: expected.rendererSha256 });
  assert.equal(poc.count, 3);
  assert.throws(() => assertProductionSongManifest(poc, expected), /production manifest count/);
  const missing = completeFixture(); delete missing.pages.S117;
  assert.throws(() => assertProductionSongManifest(missing, expected), /complete production page set/);
  const wrongCount = completeFixture(); wrongCount.count = 116;
  assert.throws(() => assertProductionSongManifest(wrongCount, expected), /production manifest count/);
});
