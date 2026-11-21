"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), vm = require("node:vm");
const cp = require("node:child_process"), { createRequire } = require("node:module");
const { withSnapshotOperation, reusableSingerList } = require("../tools/snapshot-publication.cjs");
const { switchVerifiedCurrent } = require("../tools/snapshot-html-reuse.cjs");
const { createFixture, root: sourceRoot } = require("./helpers/static-html-validator-fixture.cjs");
const { beginCapture } = require("../tools/capture-provenance.cjs");
const { validateStaticHtml } = require("../tools/validate-static-html.cjs");
const songGenerator = require("../tools/generate-song-pages.cjs");
const releaseGenerator = require("../tools/generate-release-pages.cjs");

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musdb-auto-sync04-"));
  t.after(() => fs.rmdirSync(root)); // only the empty test-owned directory
  const fixture = createFixture(), files = fixture.files, hooks = {};
  const relative = file => path.relative(root, file).replace(/\\/g, "/");
  for (const file of new Set([...songGenerator.SONG_RENDERER_FILES, ...releaseGenerator.RELEASE_RENDERER_FILES])) {
    if (!files.has(file)) files.set(file, fs.readFileSync(path.join(sourceRoot, file)));
  }
  files.set("data/current.json", Buffer.from(JSON.stringify({ revision: `sha256-${"c".repeat(64)}` })));
  const io = {
    readFileSync(file, encoding) { const key = relative(file); hooks.read?.(key); if (!files.has(key)) throw Object.assign(Error("ENOENT: " + key), { code: "ENOENT" }); const b = Buffer.from(files.get(key)); return encoding ? b.toString(encoding) : b; },
    readdirSync(file) { const prefix = relative(file) + "/"; return [...files.keys()].filter(f => f.startsWith(prefix) && !f.slice(prefix.length).includes("/")).map(f => f.slice(prefix.length)); },
    writeFileSync(file, value, options) { const key = relative(file); if (options?.flag === "wx") assert.equal(files.has(key), false); files.set(key, Buffer.from(value)); hooks.written?.(key); },
    renameSync(a, b) { const from = relative(a), to = relative(b); if (files.has(from)) { files.set(to, files.get(from)); files.delete(from); } else { const names = [...files.keys()].filter(f => f.startsWith(from + "/")); assert.ok(names.length); for (const name of names) { files.set(to + name.slice(from.length), files.get(name)); files.delete(name); } } },
    unlinkSync(file) { assert.equal(files.delete(relative(file)), true); },
    existsSync(file) { const key = relative(file); return files.has(key) || [...files.keys()].some(f => f.startsWith(key + "/")); },
    mkdirSync() {},
    rmSync(file) { const key = relative(file); for (const f of [...files.keys()]) if (f === key || f.startsWith(key + "/")) files.delete(f); },
    rmdirSync() {}
  };
  const run = () => withSnapshotOperation(root, lease => switchVerifiedCurrent({ root, revision: fixture.revision, lease, io }));
  return { root, fixture, files, hooks, io, run };
}

test("both complete formal-protocol sets are reused without changing HTML, inputs or receipts", async t => {
  const f = setup(t), before = new Map(f.files);
  const result = await f.run();
  assert.equal(result.checked.songs, 117); assert.equal(result.checked.releases, 114); assert.equal(result.provenance, "VERIFIED");
  for (const [file, bytes] of before) if (file !== "data/current.json") assert.deepEqual(f.files.get(file), bytes, file);
  assert.deepEqual(JSON.parse(f.files.get("data/current.json")), { revision: f.fixture.revision, outputRevision: f.fixture.revision,
    dataRevision: f.fixture.dataRevision, basePath: `./${f.fixture.revision}/`, manifest: `./${f.fixture.revision}/manifest.json` });
});

const negative = [
  ["missing Song HTML", f => f.files.delete("song/S001.html")],
  ["missing Release HTML", f => f.files.delete("release/R0001.html")],
  ["modified HTML", f => f.fixture.editHtml("song", "S001", html => html + "tampered")],
  ["modified HTML manifest", f => f.fixture.editJson("release/manifest.json", m => { m.pages.R0001.sha256 = "0".repeat(64); })],
  ["missing Song provenance", f => f.fixture.editJson("song/manifest.json", m => { delete m.captureProvenance; })],
  ["missing Release provenance", f => f.fixture.editJson("release/manifest.json", m => { delete m.captureProvenance; })],
  ["renderer fingerprint changed", f => f.fixture.editJson("song/manifest.json", m => { m.rendererSha256 = "0".repeat(64); })],
  ["output revision mismatch", f => f.fixture.editJson("release/manifest.json", m => { m.outputRevision = f.fixture.dataRevision; })],
  ["data revision mismatch", f => f.fixture.editJson("song/manifest.json", m => { m.dataRevision = f.fixture.revision; })],
  ["missing ID", f => f.fixture.editJson("song/manifest.json", m => { delete m.pages.S117; })],
  ["extra HTML ID", f => f.files.set("song/S999.html", Buffer.from("unexpected"))],
  ["snapshot hash changed", f => f.files.set(f.fixture.prefix + "songs/S001.json", Buffer.from("{}"))],
  ["snapshot edited and rehashed without recapture", f => f.fixture.editSnapshot("songs/S001.json", data => { data.displayName = "changed"; })],
  ["receipt input modified", f => f.fixture.editJson("release/manifest.json", m => { m.captureProvenance.inputs["release-list.json"].bytes++; })]
];
for (const [name, change] of negative) test(name + " rejects reuse and preserves current", async t => {
  const f = setup(t), before = Buffer.from(f.files.get("data/current.json")); change(f);
  await assert.rejects(f.run(), /Verified HTML reuse rejected/);
  assert.deepEqual(f.files.get("data/current.json"), before);
});

for (const target of ["song/S001.html", "release/manifest.json", "tools/generate-song-pages.cjs", "data/current.json", "directory"]) {
  test("concurrent " + target + " mutation before pointer replacement is rejected", async t => {
    const f = setup(t), before = Buffer.from(f.files.get("data/current.json"));
    f.hooks.written = key => { if (key.includes(".current-")) { if (target === "directory") f.files.set("song/S999.html", Buffer.from("concurrent")); else f.files.set(target, Buffer.from("concurrent")); } };
    await assert.rejects(f.run(), /changed before commit/);
    assert.deepEqual(f.files.get("data/current.json"), target === "data/current.json" ? Buffer.from("concurrent") : before);
    assert.equal([...f.files.keys()].some(key => key.includes(".current-")), false);
  });
}

test("another process cannot enter an active generation/capture/switch lease", async t => {
  const f = setup(t), helper = path.join(sourceRoot, "tools/snapshot-publication.cjs");
  await withSnapshotOperation(f.root, async () => {
    const script = `require(${JSON.stringify(helper)}).withSnapshotOperation(${JSON.stringify(f.root)},()=>{throw Error('entered')}).catch(e=>{console.error(e.message);process.exitCode=1})`;
    const child = cp.spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
    assert.equal(child.status, 1); assert.match(child.stderr, /Concurrent snapshot\/capture operation/); assert.doesNotMatch(child.stderr, /Error: entered/);
    await withSnapshotOperation(f.root, lease => lease.assertHeld());
  });
  assert.equal(fs.existsSync(path.join(f.root, ".snapshot-operation.lock")), false);
});

test("a stale lease is rejected, never automatically stolen", async t => {
  const f = setup(t), file = path.join(f.root, ".snapshot-operation.lock"), evidence = "stale test owner";
  fs.writeFileSync(file, evidence);
  try { await assert.rejects(f.run(), /Concurrent snapshot/); assert.equal(fs.readFileSync(file, "utf8"), evidence); }
  finally { fs.unlinkSync(file); }
});

test("singerList reuse is cloned and requires both revisions and the API data revision", () => {
  const o = "output", d = "data", reference = { outputRevision: o, dataRevision: d, payload: { data: { _cache: { revision: d }, official: [] } } };
  const got = reusableSingerList(reference, o, d); got.data.official.push("mutated"); assert.deepEqual(reference.payload.data.official, []);
  assert.equal(reusableSingerList(undefined, o, d), undefined);
  for (const changed of [{ ...reference, outputRevision: "other" }, { ...reference, dataRevision: "other" },
    { ...reference, payload: { data: { _cache: { revision: "other" } } } }]) assert.throws(() => reusableSingerList(changed, o, d), /revision mismatch/);
});

test("both renderer fingerprints pin the shared lock and every local capture import", t => {
  for (const [generator, key] of [[songGenerator, "SONG_RENDERER_FILES"], [releaseGenerator, "RELEASE_RENDERER_FILES"]]) {
    const files = generator[key]; assert.ok(files.includes("tools/snapshot-publication.cjs"));
    for (const file of files) {
      const source = fs.readFileSync(path.join(sourceRoot, file), "utf8");
      for (const match of source.matchAll(/\b(?:import|require)\s*\(\s*["'](\.\/[^"']+)["']/g)) {
        const dependency = path.posix.join(path.posix.dirname(file), match[1].split("?")[0]);
        assert.ok(files.includes(dependency), `${file}: missing ${dependency}`);
      }
    }
    const current = generator.rendererFingerprint(), read = fs.readFileSync;
    const target = path.join(sourceRoot, "tools/snapshot-publication.cjs");
    const mock = t.mock.method(fs, "readFileSync", function(file, ...args) {
      const value = read.call(this, file, ...args);
      return file === target ? String(value) + "\n// simulated lock implementation change\n" : value;
    });
    try { assert.notEqual(generator.rendererFingerprint(), current, "changing the lock must invalidate an existing capture fingerprint"); }
    finally { mock.mock.restore(); }
  }
});

// Exercise the actual orchestration source with an in-memory public API and the
// real capture receipt producer. Fictional HTML is NOT a Chrome/browser PASS.
async function orchestration(t, reuse, transport = 'legacy', useCli = false) {
  const f = setup(t), source = new Map(f.files), sourceManifest = f.fixture.getJson(f.fixture.prefix + "manifest.json");
  const data = relative => JSON.parse(source.get(f.fixture.prefix + relative)).data;
  const character = require("../tools/member-analytics-lib.cjs").CHARACTER_MEMBERS;
  const cast = require("../tools/member-analytics-lib.cjs").CAST_MEMBERS;
  const members = character.map((name, i) => ({ key: "m" + i, character: name, cast: cast[i] }));
  const performances = Object.keys(sourceManifest.hashes.songs).flatMap(id => data(`songs/${id}.json`).performances);
  const singers = [
    { singerId: "SN0001", category: "公式", members, memberShorts: members.map(m => m.key), memberCount: 9, memberComposition: members.map(m => m.key).join("＆"), performanceCount: performances.filter(p => p.singerId === "SN0001").length },
    { singerId: "SN0054", category: "ソロ", members: [members[0]], memberShorts: [members[0].key], memberCount: 1, memberComposition: members[0].key, performanceCount: performances.filter(p => p.singerId === "SN0054").length }
  ];
  const singerList = { official: [singers[0]], solo: [singers[1]], summary: { official: 1, solo: 1, total: 2 }, _cache: { revision: f.fixture.dataRevision } };
  const apiCalls = [], captureCalls = [];
  let batchCalls = 0;
  function fetch(url) {
    const u = new URL(url), action = u.searchParams.get("action"), id = u.searchParams.get("id"); apiCalls.push(action);
    let payload;
    if (action === "revision") payload = { dataRevision: f.fixture.dataRevision, outputRevision: f.fixture.revision };
    else if (action === "releaseList") payload = data("release-list.json");
    else if (action === "rankings") payload = { songs: Object.keys(sourceManifest.hashes.songs).map(songId => ({ songId })) };
    else if (action === "kamiparaDashboard") payload = data("kamipara-dashboard.json");
    else if (action === "song" || action === "release") {
      payload = data(`${action}s/${id}.json`);
      if (action === "song") payload.performances = payload.performances.map(p => ({ ...p, singerCategory: "公式", type: "公式" }));
    }
    else if (action === "singerList") payload = singerList;
    else if (action === "eventHistory") payload = { events: Object.keys(sourceManifest.hashes.events).map(eventId => ({ eventId })), _cache: { revision: f.fixture.dataRevision } };
    else if (action === "venueHistory") payload = { venues: [1, 2, 3, 4].map(n => ({ venueId: "VE" + String(n).padStart(4, "0") })), _cache: { revision: f.fixture.dataRevision } };
    else if (action === "event" || action === "discover") payload = data(`events/${id}.json`)[action];
    else throw Error("Unexpected API action: " + action);
    return Promise.resolve({ ok: true, json: async () => structuredClone({ success: true, data: payload }) });
  }
  async function capture(type) {
    const generator = type === "song" ? songGenerator : releaseGenerator, rendererFiles = generator[type === "song" ? "SONG_RENDERER_FILES" : "RELEASE_RENDERER_FILES"];
    const manifest = JSON.parse(source.get(`${type}/manifest.json`)), ids = Object.keys(manifest.pages);
    const session = beginCapture({ root: f.root, type, revision: f.fixture.revision, ids, rendererFiles, rendererFingerprint: generator.rendererFingerprint, io: f.io });
    const pages = ids.map(id => ({ id, html: source.get(`${type}/${id}.html`).toString() }));
    captureCalls.push(...pages.map(p => `${type}/${p.id}`)); session.publish(pages, manifest);
  }
  for (const file of [...f.files.keys()]) if (file.startsWith(f.fixture.prefix)) f.files.delete(file);
  const actualRequire = createRequire(path.join(sourceRoot, "tools/generate-static-snapshot.cjs"));
  const module = { exports: {} };
  const request = name => name === "node:fs" ? f.io : name === "./generate-song-pages.cjs" ? { generateSongPages: () => capture("song") } :
    name === "./generate-release-pages.cjs" ? { generateReleasePages: () => capture("release") } :
    name === "./snapshot-html-reuse.cjs" ? { switchVerifiedCurrent: options => switchVerifiedCurrent({ ...options, io: f.io }) } :
    name === "./event-batch-client.cjs" && transport === 'batch-v1' ? { ...actualRequire(name), fetchEventBatches: async options => {
      batchCalls++; assert.equal(options.dataRevision, f.fixture.dataRevision); assert.equal(options.outputRevision, f.fixture.revision); assert.equal(options.batchSize, 8);
      assert.deepEqual(Array.from(options.ids), Object.keys(sourceManifest.hashes.events));
      return options.ids.map(id => data(`events/${id}.json`));
    } } : actualRequire(name);
  const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : ["2026-11-18T00:00:00Z"])); } };
  vm.runInNewContext(fs.readFileSync(path.join(sourceRoot, "tools/generate-static-snapshot.cjs"), "utf8"), {
    require: request, module, __dirname: path.join(f.root, "tools"), Buffer, URL, AbortSignal, structuredClone, Date: FixedDate,
    setTimeout, fetch, console, process: { pid: process.pid, argv: [], stdout: { write() {} } }
  });
  if (useCli) await module.exports.runCli();
  else if (transport === 'batch-v1') await module.exports.generate({ eventTransport: transport });
  else await module.exports.generate();
  assert.equal(batchCalls, transport === 'batch-v1' ? 1 : 0);
  assert.equal(apiCalls.filter(a => a === 'event' || a === 'discover').length, transport === 'batch-v1' ? 0 : Object.keys(sourceManifest.hashes.events).length * 2);
  assert.equal(captureCalls.length, 231); assert.equal(apiCalls.filter(a => a === "singerList").length, 1);
  const outputBefore = new Map(f.files);
  await module.exports.switchCurrent(f.fixture.revision, { reuseVerifiedHtml: reuse });
  assert.equal(captureCalls.length, reuse ? 231 : 462);
  const result = validateStaticHtml({ revision: f.fixture.revision, repoRoot: f.root, readFile: f.io.readFileSync, readDirectory: f.io.readdirSync });
  assert.equal(result.status, "PASS", JSON.stringify(result)); assert.equal(result.provenance, "VERIFIED");
  for (const [file, bytes] of outputBefore) if (file !== "data/current.json") assert.deepEqual(f.files.get(file), bytes, file);
  return f.files;
}

test("normal generation captures 231 once; verified switch preserves legacy HTML/data/provenance byte-for-byte", async t => {
  const legacy = await orchestration(t, false), reused = await orchestration(t, true);
  assert.deepEqual([...reused.keys()].sort(), [...legacy.keys()].sort());
  for (const [file, bytes] of legacy) assert.deepEqual(reused.get(file), bytes, file);
});

test("explicit batch orchestration preserves default CLI data/manifests/provenance; transport is tested independently", async t => {
  const legacy = await orchestration(t, true, 'legacy', true), batch = await orchestration(t, true, 'batch-v1');
  assert.deepEqual([...batch.keys()].sort(), [...legacy.keys()].sort());
  for (const [file, bytes] of legacy) assert.deepEqual(batch.get(file), bytes, file);
});
