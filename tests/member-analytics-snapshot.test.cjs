"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sha256, snapshotDataFingerprint } = require("../tools/detail-snapshot-lib.cjs");
const { validateMemberAnalytics } = require("../tools/member-analytics-lib.cjs");

const root = path.resolve(__dirname, "..");
const current = JSON.parse(fs.readFileSync(path.join(root, "data", "current.json"), "utf8"));
const revision = current.outputRevision;
const directory = path.join(root, "data", "snapshots", revision);
const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
const body = fs.readFileSync(path.join(directory, "member-analytics.json"), "utf8");
const wrapper = JSON.parse(body);

test("Member Analytics snapshot schema, revision and manifest hashes", () => {
  assert.equal(wrapper.snapshot.outputRevision, current.outputRevision);
  assert.equal(wrapper.snapshot.dataRevision, current.dataRevision);
  assert.equal(wrapper.snapshot.source, "public-api");
  assert.equal(manifest.counts.memberAnalytics, 1);
  assert.equal(manifest.memberAnalytics.sha256, sha256(wrapper.data));
  assert.equal(manifest.memberAnalytics.fileSha256, sha256(body));
  assert.equal(manifest.memberAnalytics.bytes, Buffer.byteLength(body));
  validateMemberAnalytics(wrapper.data);
  assert.equal(wrapper.data.songs.length, 117);
  assert.equal(wrapper.data.characterSummary.length, 9);
  assert.equal(wrapper.data.castSummary.length, 9);
});

test("Member Analytics representative Song counts", () => {
  const songs = new Map(wrapper.data.songs.map(song => [song.songId, song]));
  assert.deepEqual(songs.get("S003").characterCounts, [49, 15, 33, 27, 34, 50, 30, 26, 25]);
  assert.equal(songs.get("S003").characterTotal, 289);
  assert.deepEqual(songs.get("S003").castCounts, [18, 1, 0, 3, 9, 16, 4, 7, 14]);
  assert.equal(songs.get("S003").castTotal, 72);
  assert.deepEqual(songs.get("S041").characterCounts, [1, 0, 1, 1, 0, 0, 0, 0, 0]);
  assert.equal(songs.get("S041").characterTotal, 3);
  assert.equal(songs.get("S041").castTotal, 0);
  assert.equal(songs.get("S046").characterTotal, 180);
  assert.equal(songs.get("S046").castTotal, 14);
  assert.equal(songs.get("S045").characterTotal, 247);
  assert.equal(songs.get("S045").castTotal, 17);
  assert.equal(songs.get("S071").characterTotal, 84);
  assert.equal(songs.get("S071").castTotal, 9);
});

test("Member Analytics changes manifest fingerprint without altering old snapshot content", () => {
  const original = structuredClone(manifest);
  delete original.counts.memberAnalytics;
  delete original.memberAnalytics;
  assert.notEqual(snapshotDataFingerprint(original), snapshotDataFingerprint(manifest));
  assert.equal(manifest.counts.releases, 114);
  assert.equal(manifest.counts.songs, 117);
  assert.equal(manifest.counts.events, 353);
  assert.equal(manifest.counts.kamiparaDashboard, 1);
});
