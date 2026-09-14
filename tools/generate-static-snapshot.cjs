"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sha256, validateDetail, validateSnapshot } = require("./detail-snapshot-lib.cjs");

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

function switchCurrent(revision) {
  const revisionRoot = path.join(SNAPSHOT_ROOT, revision);
  const manifestPath = path.join(revisionRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Snapshot does not exist: ${revision}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.revision !== revision || manifest.counts?.releases !== 114 || manifest.counts?.songs !== 117) throw new Error("Snapshot manifest is not publishable");
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
  const [releaseListPayload, rankingsPayload] = await Promise.all([
    api("releaseList"),
    api("rankings", { limit: 1000, year: "", category: "", schema: "4.2.1" })
  ]);
  const releases = releaseListPayload.data;
  const songs = rankingsPayload.data?.songs;
  if (!Array.isArray(releases) || releases.length !== 114) throw new Error(`Release count mismatch: ${releases?.length}`);
  if (!Array.isArray(songs) || songs.length !== 117) throw new Error(`Song count mismatch: ${songs?.length}`);
  const releaseIds = releases.map(item => item.releaseId).sort();
  const songIds = songs.map(item => item.songId).sort();
  if (new Set(releaseIds).size !== 114 || new Set(songIds).size !== 117) throw new Error("Duplicate IDs in source lists");

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

  const revisionRoot = path.join(SNAPSHOT_ROOT, revision);
  const stagingRoot = path.join(SNAPSHOT_ROOT, `.staging-${process.pid}`);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });
  const manifest = { revision, generatedAt, counts: { releases: 114, songs: 117, details: 231 }, hashes: { releases: {}, songs: {} } };
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
  fs.writeFileSync(path.join(stagingRoot, "revision.json"), jsonText({ revision, generatedAt }), "utf8");
  fs.writeFileSync(path.join(stagingRoot, "manifest.json"), jsonText(manifest), "utf8");

  if (fs.existsSync(revisionRoot)) {
    const oldManifest = JSON.parse(fs.readFileSync(path.join(revisionRoot, "manifest.json"), "utf8"));
    const comparable = value => ({ counts: value.counts, hashes: value.hashes, releaseList: value.releaseList });
    if (sha256(comparable(oldManifest)) !== sha256(comparable(manifest))) throw new Error("Determinism check failed for existing revision");
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  } else {
    fs.renameSync(stagingRoot, revisionRoot);
  }
  process.stdout.write(`${JSON.stringify({ revision, releases: 114, songs: 117, details: 231, directory: path.relative(ROOT, revisionRoot) }, null, 2)}\n`);
}

const switchIndex = process.argv.indexOf("--switch-current");
const operation = switchIndex >= 0 ? Promise.resolve().then(() => switchCurrent(process.argv[switchIndex + 1])) : generate();
operation.catch(error => { console.error(error); process.exitCode = 1; });
