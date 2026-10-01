"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sha256, validateDetail, validateSnapshot, validateEventSnapshot, validateKamiparaDashboard, snapshotDataFingerprint } = require("./detail-snapshot-lib.cjs");

const API = "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT_ROOT = path.join(ROOT, "data", "snapshots");
const DENIED_FIELDS = new Set(["internalNote", "sourceResearchNote", "adminInfo", "pendingCandidateIds", "fixtureSourceUrl"]);

async function api(action, params = {}, attempts = 8) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(API);
      url.searchParams.set("action", action);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.success) throw new Error(payload?.error?.message || "API failure");
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, Math.min(10000, 750 * (2 ** (attempt - 1)))));
    }
  }
  throw new Error(`${action}: ${lastError?.message || "request failed"}`);
}

function assertNoInternalLeak(value, location = "data") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (DENIED_FIELDS.has(key)) throw new Error(`${location}: internal field leaked: ${key}`);
    assertNoInternalLeak(child, `${location}.${key}`);
  }
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }

function assertRevision(payload, revision, label) {
  if (payload?.data?._cache?.revision !== revision) throw new Error(`${label}: revision mismatch`);
}

function validateEventReferences(id, data, references) {
  const { event, discover } = data;
  const check = (set, value, label) => {
    if (value && !set.has(value)) throw new Error(`${id}: unknown ${label} ${value}`);
  };
  check(references.venues, event.venue?.venueId, "venue");
  for (const song of event.songs) {
    check(references.songs, song.songId, "song");
    check(references.singers, song.singerId, "singer");
  }
  for (const release of event.relatedReleases) check(references.releases, release.releaseId, "release");
  for (const neighbor of [event.navigation.previous, event.navigation.next, ...(event.navigation.events || [])]) {
    check(references.events, neighbor?.eventId, "navigation Event");
  }
  for (const key of ["firstPerformedSongs", "lastPerformedSongs", "uniqueSongs"]) {
    for (const song of discover[key]) check(references.songs, song.songId, `discover ${key} song`);
  }
}

function validateEventFiles(root, manifest, revision) {
  const hashes = manifest.hashes?.events || {};
  const ids = Object.keys(hashes);
  if (manifest.counts?.events !== 353 || ids.length !== 353 || new Set(ids).size !== 353) {
    throw new Error("Event manifest count mismatch");
  }
  const files = fs.readdirSync(path.join(root, "events")).filter(name => name.endsWith(".json"));
  if (files.length !== 353) throw new Error("Event snapshot file count mismatch");
  for (const id of ids) {
    const body = fs.readFileSync(path.join(root, "events", `${id}.json`), "utf8");
    const wrapper = JSON.parse(body);
    const data = validateEventSnapshot(id, wrapper, revision);
    if (hashes[id].sha256 !== sha256(data) || hashes[id].fileSha256 !== sha256(body) ||
        hashes[id].bytes !== Buffer.byteLength(body)) throw new Error(`${id}: Event hash mismatch`);
  }
  return ids;
}

function validateBaseFiles(root, manifest, revision) {
  for (const [type, count] of [["release", 114], ["song", 117]]) {
    const group = `${type}s`;
    const entries = manifest.hashes?.[group] || {};
    if (Object.keys(entries).length !== count) throw new Error(`${group}: manifest count mismatch`);
    for (const [id, hash] of Object.entries(entries)) {
      const body = fs.readFileSync(path.join(root, group, `${id}.json`), "utf8");
      const wrapper = JSON.parse(body);
      validateSnapshot(type, id, wrapper, revision);
      if (hash.sha256 !== sha256(wrapper.data) || hash.fileSha256 !== sha256(body) ||
          hash.bytes !== Buffer.byteLength(body)) throw new Error(`${group}/${id}: hash mismatch`);
    }
  }
  const releaseListBody = fs.readFileSync(path.join(root, "release-list.json"), "utf8");
  const releaseList = JSON.parse(releaseListBody);
  if (releaseList.snapshot?.revision !== revision || releaseList.data?.length !== 114 ||
      manifest.releaseList?.sha256 !== sha256(releaseList.data) ||
      manifest.releaseList?.fileSha256 !== sha256(releaseListBody)) throw new Error("Release list mismatch");
  const kamiparaBody = fs.readFileSync(path.join(root, "kamipara-dashboard.json"), "utf8");
  const kamipara = JSON.parse(kamiparaBody);
  validateKamiparaDashboard(kamipara.data, revision);
  if (kamipara.snapshot?.revision !== revision || manifest.kamiparaDashboard?.sha256 !== sha256(kamipara.data) ||
      manifest.kamiparaDashboard?.fileSha256 !== sha256(kamiparaBody)) throw new Error("Kamipara hash mismatch");
}

async function generateAllEvents(revision, revisionRoot) {
  const baseManifest = JSON.parse(fs.readFileSync(path.join(revisionRoot, "manifest.json"), "utf8"));
  if (baseManifest.revision !== revision || baseManifest.counts?.releases !== 114 ||
      baseManifest.counts?.songs !== 117 || baseManifest.counts?.kamiparaDashboard !== 1) {
    throw new Error("Existing base snapshot is incomplete");
  }
  validateBaseFiles(revisionRoot, baseManifest, revision);
  if (baseManifest.counts?.events === 353) {
    validateEventFiles(revisionRoot, baseManifest, revision);
    process.stdout.write(`${JSON.stringify({ revision, events: 353, reused: true }, null, 2)}\n`);
    return;
  }
  if (baseManifest.counts?.events || fs.existsSync(path.join(revisionRoot, "events"))) {
    throw new Error("Partial Event snapshot already exists; current.json unchanged");
  }
  const [historyPayload, venuesPayload, singersPayload] = await Promise.all([
    api("eventHistory"), api("venueHistory"), api("singerList")
  ]);
  for (const [payload, label] of [[historyPayload, "eventHistory"], [venuesPayload, "venueHistory"], [singersPayload, "singerList"]]) {
    assertRevision(payload, revision, label);
  }
  const history = historyPayload.data.events;
  const eventIds = history?.map(item => item.eventId);
  if (!Array.isArray(eventIds) || eventIds.length !== 353 || new Set(eventIds).size !== 353) {
    throw new Error("eventHistory must contain 353 distinct Events");
  }
  const references = {
    events: new Set(eventIds),
    venues: new Set(venuesPayload.data.venues.map(item => item.venueId)),
    singers: new Set([...singersPayload.data.official, ...singersPayload.data.solo].map(item => item.singerId)),
    songs: new Set(Object.keys(baseManifest.hashes.songs)),
    releases: new Set(Object.keys(baseManifest.hashes.releases))
  };
  let completed = 0;
  const generatedAt = new Date().toISOString();
  const wrappers = await mapLimit(eventIds, 2, async id => {
    const wrapper = await eventSnapshot(id, revision, generatedAt);
    validateEventReferences(id, wrapper.data, references);
    completed += 1;
    if (completed % 25 === 0 || completed === 353) process.stdout.write(`Event ${completed}/353 validated\n`);
    return wrapper;
  }).catch(error => { throw new Error(`Event generation stopped after ${completed}/353 complete pairs: ${error.message}`); });
  const stagingRoot = path.join(SNAPSHOT_ROOT, `.staging-events-${process.pid}`);
  if (fs.existsSync(stagingRoot)) throw new Error(`Staging path already exists: ${stagingRoot}`);
  fs.mkdirSync(path.join(stagingRoot, "events"), { recursive: true });
  const manifest = structuredClone(baseManifest);
  manifest.counts.events = 353;
  manifest.eventsGeneratedAt = generatedAt;
  manifest.hashes.events = {};
  wrappers.forEach((wrapper, index) => {
    const id = eventIds[index];
    const body = jsonText(wrapper);
    fs.writeFileSync(path.join(stagingRoot, "events", `${id}.json`), body, "utf8");
    manifest.hashes.events[id] = { sha256: sha256(wrapper.data), fileSha256: sha256(body), bytes: Buffer.byteLength(body) };
  });
  validateEventFiles(stagingRoot, manifest, revision);
  fs.writeFileSync(path.join(stagingRoot, "manifest.json"), jsonText(manifest), "utf8");
  fs.renameSync(path.join(stagingRoot, "events"), path.join(revisionRoot, "events"));
  fs.renameSync(path.join(stagingRoot, "manifest.json"), path.join(revisionRoot, "manifest.json"));
  fs.rmdirSync(stagingRoot);
  process.stdout.write(`${JSON.stringify({ revision, events: 353, eventApi: 353, discoverApi: 353, directory: path.relative(ROOT, revisionRoot) }, null, 2)}\n`);
}

async function eventSnapshot(id, revision, generatedAt) {
  const [eventPayload, discoverPayload] = await Promise.all([
    api("event", { id }),
    api("discover", { type: "event", id })
  ]);
  const data = { event: eventPayload.data, discover: discoverPayload.data };
  const wrapper = { snapshot: { revision, generatedAt, source: "public-api" }, data };
  validateEventSnapshot(id, wrapper, revision);
  assertNoInternalLeak(data);
  return wrapper;
}

async function generateEventPreview(ids) {
  if (!ids.length || ids.some(id => !/^EV\d+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("--event-ids requires distinct Event IDs");
  }
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "current.json"), "utf8"));
  const revision = String((await api("revision")).data?.dataRevision || "");
  if (revision !== current.revision) throw new Error("Preview source and current.json revisions differ");
  const generatedAt = new Date().toISOString();
  const wrappers = await mapLimit(ids, 2, id => eventSnapshot(id, revision, generatedAt));
  const previewRoot = path.join(ROOT, "data", "event-static-preview", revision);
  const eventsRoot = path.join(previewRoot, "events");
  fs.mkdirSync(eventsRoot, { recursive: true });
  const hashes = {};
  wrappers.forEach((wrapper, index) => {
    const id = ids[index];
    const body = jsonText(wrapper);
    fs.writeFileSync(path.join(eventsRoot, `${id}.json`), body, "utf8");
    hashes[id] = { sha256: sha256(wrapper.data), fileSha256: sha256(body), bytes: Buffer.byteLength(body) };
  });
  fs.writeFileSync(path.join(previewRoot, "manifest.json"), jsonText({ revision, generatedAt, previewOnly: true, counts: { events: ids.length }, hashes: { events: hashes } }), "utf8");
  process.stdout.write(`${JSON.stringify({ revision, previewOnly: true, eventIds: ids, directory: path.relative(ROOT, previewRoot) }, null, 2)}\n`);
}

function switchCurrent(revision) {
  const revisionRoot = path.join(SNAPSHOT_ROOT, revision);
  const manifestPath = path.join(revisionRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Snapshot does not exist: ${revision}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.revision !== revision || manifest.counts?.releases !== 114 || manifest.counts?.songs !== 117) throw new Error("Snapshot manifest is not publishable");
  if (manifest.counts?.kamiparaDashboard && (!manifest.kamiparaDashboard || !fs.existsSync(path.join(revisionRoot, "kamipara-dashboard.json")))) throw new Error("Kamipara snapshot is not publishable");
  validateBaseFiles(revisionRoot, manifest, revision);
  if (manifest.counts?.events) validateEventFiles(revisionRoot, manifest, revision);
  fs.mkdirSync(SNAPSHOT_ROOT, { recursive: true });
  const temp = path.join(SNAPSHOT_ROOT, ".current.tmp.json");
  fs.writeFileSync(temp, jsonText({ revision, basePath: `./${revision}/`, manifest: `./${revision}/manifest.json` }), "utf8");
  fs.renameSync(temp, path.join(ROOT, "data", "current.json"));
  process.stdout.write(`${revision}\n`);
}

async function generate() {
  const revisionPayload = await api("revision");
  const revision = String(revisionPayload.data?.dataRevision || "");
  if (!/^sha256-[a-f0-9]{64}$/.test(revision)) throw new Error("Invalid revision");
  const revisionRoot = path.join(SNAPSHOT_ROOT, revision);
  if (fs.existsSync(revisionRoot)) {
    await generateAllEvents(revision, revisionRoot);
    return;
  }
  const [releaseListPayload, rankingsPayload, kamiparaPayload] = await Promise.all([
    api("releaseList"),
    api("rankings", { limit: 1000, year: "", category: "", schema: "4.2.1" }),
    api("kamiparaDashboard")
  ]);
  const releases = releaseListPayload.data;
  const songs = rankingsPayload.data?.songs;
  if (!Array.isArray(releases) || releases.length !== 114) throw new Error(`Release count mismatch: ${releases?.length}`);
  if (!Array.isArray(songs) || songs.length !== 117) throw new Error(`Song count mismatch: ${songs?.length}`);
  const releaseIds = releases.map(item => item.releaseId).sort();
  const songIds = songs.map(item => item.songId).sort();
  if (new Set(releaseIds).size !== 114 || new Set(songIds).size !== 117) throw new Error("Duplicate IDs in source lists");
  const kamipara = structuredClone(kamiparaPayload.data);
  if (kamipara._cache?.revision !== revision || kamipara.revision !== revision) throw new Error("Kamipara revision mismatch");
  kamipara._cache = { source: "static", hit: true, mode: "snapshot", revision };
  validateKamiparaDashboard(kamipara, revision);
  assertNoInternalLeak(kamipara);

  const targets = [...releaseIds.map(id => ({ type: "release", id })), ...songIds.map(id => ({ type: "song", id }))];
  const generatedAt = new Date().toISOString();
  const details = await mapLimit(targets, 2, async ({ type, id }) => {
    const payload = await api(type, { id });
    const sourceRevision = String(payload.data?._cache?.revision || "");
    if (sourceRevision !== revision) throw new Error(`${type}/${id}: revision mismatch (${sourceRevision})`);
    const data = structuredClone(payload.data);
    data._cache = { source: "static", hit: true, mode: "snapshot", revision };
    validateDetail(type, id, data);
    assertNoInternalLeak(data);
    return { type, id, data };
  });

  const stagingRoot = path.join(SNAPSHOT_ROOT, `.staging-${process.pid}`);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });
  const manifest = { revision, generatedAt, counts: { releases: 114, songs: 117, details: 231, kamiparaDashboard: 1 }, hashes: { releases: {}, songs: {} } };
  for (const { type, id, data } of details) {
    const wrapper = { snapshot: { revision, generatedAt, source: "public-api" }, data };
    validateSnapshot(type, id, wrapper, revision);
    const body = jsonText(wrapper);
    const relative = `${type}s/${id}.json`;
    const target = path.join(stagingRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, "utf8");
    manifest.hashes[`${type}s`][id] = { sha256: sha256(data), fileSha256: sha256(body), bytes: Buffer.byteLength(body) };
  }
  const releaseListWrapper = { snapshot: { revision, generatedAt, source: "public-api" }, data: releases };
  const releaseListBody = jsonText(releaseListWrapper);
  fs.writeFileSync(path.join(stagingRoot, "release-list.json"), releaseListBody, "utf8");
  manifest.releaseList = { count: releases.length, sha256: sha256(releases), fileSha256: sha256(releaseListBody), bytes: Buffer.byteLength(releaseListBody) };
  const kamiparaBody = jsonText({ snapshot: { revision, generatedAt, source: "public-api" }, data: kamipara });
  fs.writeFileSync(path.join(stagingRoot, "kamipara-dashboard.json"), kamiparaBody, "utf8");
  manifest.kamiparaDashboard = { sha256: sha256(kamipara), fileSha256: sha256(kamiparaBody), bytes: Buffer.byteLength(kamiparaBody) };
  fs.writeFileSync(path.join(stagingRoot, "revision.json"), jsonText({ revision, generatedAt }), "utf8");
  fs.writeFileSync(path.join(stagingRoot, "manifest.json"), jsonText(manifest), "utf8");

  if (fs.existsSync(revisionRoot)) {
    const oldManifest = JSON.parse(fs.readFileSync(path.join(revisionRoot, "manifest.json"), "utf8"));
    if (snapshotDataFingerprint(oldManifest) !== snapshotDataFingerprint(manifest)) throw new Error("Determinism check failed for existing revision");
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  } else {
    fs.renameSync(stagingRoot, revisionRoot);
  }
  await generateAllEvents(revision, revisionRoot);
  process.stdout.write(`${JSON.stringify({ revision, releases: 114, songs: 117, details: 231, kamiparaDashboard: 1, directory: path.relative(ROOT, revisionRoot) }, null, 2)}\n`);
}

const switchIndex = process.argv.indexOf("--switch-current");
const eventIdsIndex = process.argv.indexOf("--event-ids");
if (switchIndex >= 0 && eventIdsIndex >= 0) throw new Error("Preview generation cannot switch current.json");
const operation = switchIndex >= 0
  ? Promise.resolve().then(() => switchCurrent(process.argv[switchIndex + 1]))
  : eventIdsIndex >= 0
    ? generateEventPreview(process.argv.slice(eventIdsIndex + 1))
    : generate();
operation.catch(error => { console.error(error); process.exitCode = 1; });
