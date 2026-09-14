const fs = require("node:fs");
const path = require("node:path");
const { sha256, validateDetail, validateSnapshot } = require("./detail-snapshot-lib.cjs");

const API = "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";
const root = path.resolve(__dirname, "..");
const expectedCounts = { R0088: 285, R0106: 31, S100: 22 };

function listArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1].split(",").map(value => value.trim()).filter(Boolean) : fallback;
}

async function api(action, params = {}) {
  const url = new URL(API);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${action}: HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload?.success) throw new Error(`${action}: API failure`);
  return payload;
}

function assertNoInternalLeak(value, location = "data") {
  const denied = new Set(["internalNote", "sourceResearchNote", "adminInfo", "pendingCandidateIds", "fixtureSourceUrl"]);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (denied.has(key)) throw new Error(`${location}: internal field leaked: ${key}`);
    assertNoInternalLeak(child, `${location}.${key}`);
  }
}

async function main() {
  if (!process.argv.includes("--fixture")) throw new Error("This tool only writes the fixture namespace; pass --fixture");
  const releases = listArg("--release", ["R0088", "R0106"]);
  const songs = listArg("--song", ["S100", "S003"]);
  const revisionResponse = await api("revision");
  const revision = String(revisionResponse.data?.dataRevision || "");
  if (!/^sha256-[a-f0-9]{64}$/.test(revision)) throw new Error("Invalid Public API revision");
  const generatedAt = new Date().toISOString();
  const targets = [...releases.map(id => ["release", id]), ...songs.map(id => ["song", id])];
  const details = await Promise.all(targets.map(async ([type, id]) => {
    const response = await api(type, { id });
    if (response.data?._cache?.revision !== revision) throw new Error(`${type}/${id}: API revision mismatch`);
    const data = { ...response.data };
    data._cache = { source: "static", hit: true, mode: "snapshot", revision };
    validateDetail(type, id, data);
    assertNoInternalLeak(data);
    const count = type === "release" ? data.includedSongs.length : data.includedReleases.length;
    if (expectedCounts[id] != null && count !== expectedCounts[id]) throw new Error(`${id}: expected ${expectedCounts[id]} relations, got ${count}`);
    return { type, id, data, count };
  }));

  const revisionDir = path.join(root, "data", "fixtures", revision);
  const manifest = { revision, generatedAt, releases: {}, songs: {} };
  for (const detail of details) {
    const wrapper = { snapshot: { revision, generatedAt, source: "public-api" }, data: detail.data };
    validateSnapshot(detail.type, detail.id, wrapper, revision);
    const json = `${JSON.stringify(wrapper, null, 2)}\n`;
    const relative = `${detail.type}s/${detail.id}.json`;
    const target = path.join(revisionDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, json, "utf8");
    manifest[`${detail.type}s`][detail.id] = { sha256: sha256(detail.data), bytes: Buffer.byteLength(json), count: detail.count };
  }
  fs.writeFileSync(path.join(revisionDir, "revision.json"), `${JSON.stringify({ revision, generatedAt }, null, 2)}\n`);
  fs.writeFileSync(path.join(revisionDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.join(root, "data", "fixtures"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "fixtures", "current.json"), `${JSON.stringify({ revision, basePath: `./${revision}/` }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ revision, generatedAt, targets: details.map(({ type, id, count }) => ({ type, id, count })) }, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
