"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { beginCapture } = require("../tools/capture-provenance.cjs");
const { validateStaticHtml } = require("../tools/validate-static-html.cjs");
const songGenerator = require("../tools/generate-song-pages.cjs");
const releaseGenerator = require("../tools/generate-release-pages.cjs");
const { createFixture, root } = require("./helpers/static-html-validator-fixture.cjs");

// Fictional serialized outputs exercise the producer transaction in memory.
// Real browser/generator capture is tested separately below, never backfilled.
function setup() {
  const fixture = createFixture(), writes = [], renames = [], hooks = {};
  fixture.files.set("fixture-renderer.cjs", Buffer.from("synthetic renderer"));
  const relative = file => path.relative(root, file).replace(/\\/g, "/");
  const io = {
    readFileSync: fixture.options.readFile,
    readdirSync: fixture.options.readDirectory,
    existsSync: file => fixture.files.has(relative(file)),
    mkdirSync() {},
    writeFileSync(file, value, options) {
      const key = relative(file); writes.push(key); hooks.write?.(key);
      if (options?.flag === "wx") assert.equal(fixture.files.has(key), false);
      fixture.files.set(key, Buffer.from(value)); hooks.written?.(key);
    },
    renameSync(from, to) {
      const source = relative(from), target = relative(to); renames.push(target); hooks.rename?.(target);
      assert.ok(fixture.files.has(source)); fixture.files.set(target, fixture.files.get(source)); fixture.files.delete(source); hooks.renamed?.(target);
    },
    unlinkSync(file) { const key = relative(file); assert.match(key, /\.capture-.*\.tmp$/); fixture.files.delete(key); }
  };
  function start(type, subset) {
    const manifest = fixture.getJson(`${type}/manifest.json`), ids = subset || Object.keys(manifest.pages);
    let fingerprint = manifest.rendererSha256;
    const session = beginCapture({ root, type, revision: fixture.revision, ids, rendererFiles: ["fixture-renderer.cjs"], rendererFingerprint: () => fingerprint, io });
    const pages = ids.map(id => ({ id, html: fixture.files.get(`${type}/${id}.html`).toString() }));
    return { session, pages, manifest, changeRenderer() { fingerprint = "0".repeat(64); } };
  }
  return { fixture, io, hooks, writes, renames, start };
}
function withoutReceipts(f) { for (const type of ["song", "release"]) f.editJson(`${type}/manifest.json`, m => delete m.captureProvenance); }

for (const [type, count, inputs] of [["song", 117, 117], ["release", 114, 469]]) {
  test(`${type}: complete synthetic capture records every real input and captured output (${count})`, () => {
    const f = setup(); withoutReceipts(f.fixture); const { session, pages, manifest } = f.start(type);
    session.publish(pages, manifest);
    const receipt = f.fixture.getJson(`${type}/manifest.json`).captureProvenance;
    assert.equal(Object.keys(receipt.inputs).length, inputs); assert.equal(Object.keys(receipt.outputs).length, count);
    assert.equal(receipt.completion, "all-pages-and-enrichment");
    assert.equal(f.renames.at(-1), `${type}/manifest.json`);
    assert.equal(validateStaticHtml(f.fixture.options).status, "UNVERIFIED", "the other missing complete-set receipt prevents reuse");
    assert.throws(() => session.publish(pages, manifest), /already published/);
  });
}
test("only both completed synthetic capture sets make the independent validator PASS", () => {
  const f = setup(); withoutReceipts(f.fixture);
  for (const type of ["song", "release"]) { const { session, pages, manifest } = f.start(type); session.publish(pages, manifest); }
  assert.equal(validateStaticHtml(f.fixture.options).status, "PASS");
});
test("old manifests remain UNVERIFIED; no receipt is inferred at session start", () => {
  const f = setup(); withoutReceipts(f.fixture); f.start("song");
  assert.equal(f.writes.length, 0); assert.equal(validateStaticHtml(f.fixture.options).status, "UNVERIFIED");
});
test("partial Song capture drops old receipt even if all page fingerprints stay current", () => {
  const f = setup(), ids = ["S001", "S017", "S117"], previous = f.fixture.getJson("song/manifest.json"), before = structuredClone(previous);
  const { session, pages } = f.start("song", ids);
  const manifest = songGenerator.buildSongPageManifest({ previous, current: session.current, rendererSha256: session.rendererSha256,
    generatedPages: Object.fromEntries(ids.map(id => [id, previous.pages[id]])) });
  assert.deepEqual(previous, before); assert.equal(Object.hasOwn(manifest, "captureProvenance"), false);
  session.publish(pages, manifest); assert.equal(validateStaticHtml(f.fixture.options).status, "UNVERIFIED");
  assert.equal(f.renames.filter(p => p.endsWith(".html")).length, 3);
});
test("renderer changes during capture reject publication", () => {
  const f = setup(), c = f.start("song"); c.changeRenderer();
  assert.throws(() => c.session.publish(c.pages, c.manifest), /Renderer changed/); assert.equal(f.writes.length, 0);
});
test("renderer bytes cannot change while retaining a mocked identical fingerprint", () => {
  const f = setup(), c = f.start("song"); f.fixture.files.set("fixture-renderer.cjs", Buffer.from("changed"));
  assert.throws(() => c.session.publish(c.pages, c.manifest), /input\/renderer changed/); assert.equal(f.writes.length, 0);
});
for (const [type, file] of [["song", "songs/S001.json"], ["release", "releases/R0001.json"], ["release", "release-list.json"], ["release", "kamipara-dashboard.json"], ["release", "events/EV0353.json"]]) {
  test(`${file}: changed source rejects publication; HTTP source remains the pinned capture input`, () => {
    const f = setup(), c = f.start(type), key = f.fixture.prefix + file, initial = c.session.source(key);
    f.fixture.editSnapshot(file, data => { if (Array.isArray(data)) data[0].note = "changed input"; else data.note = "changed input"; });
    assert.deepEqual(c.session.source(key), initial);
    assert.throws(() => c.session.publish(c.pages, c.manifest), /changed during capture/); assert.equal(f.writes.length, 0);
  });
}
test("revision mismatch and corrupt source hashes fail before capture", () => {
  const f = setup(); f.fixture.editJson(f.fixture.prefix + "songs/S001.json", w => w.snapshot.outputRevision = "wrong");
  assert.throws(() => f.start("song"), /input revision mismatch/);
  const g = setup(); g.fixture.files.set(g.fixture.prefix + "release-list.json", Buffer.from("{}"));
  assert.throws(() => g.start("release"), /input revision mismatch/); assert.equal(g.writes.length, 0);
});
test("source directory ID drift during capture rejects publication", () => {
  const f = setup(), c = f.start("release"); f.fixture.files.delete(f.fixture.prefix + "events/EV0353.json");
  assert.throws(() => c.session.publish(c.pages, c.manifest), /ENOENT|changed during capture/);
});
for (const fault of ["missing", "duplicate", "html", "bytes"]) {
  test(`captured output ${fault} is refused before a manifest write`, () => {
    const f = setup(), c = f.start("song");
    if (fault === "missing") c.pages.pop();
    if (fault === "duplicate") c.pages[1].id = c.pages[0].id;
    if (fault === "html") c.pages[0].html += " ";
    if (fault === "bytes") c.manifest.pages.S001.bytes++;
    assert.throws(() => c.session.publish(c.pages, c.manifest), /ID set|hash\/bytes/); assert.equal(f.writes.length, 0);
  });
}
test("staging write failure preserves prior artifacts and never creates a new receipt", () => {
  const f = setup(); withoutReceipts(f.fixture); const c = f.start("song"), before = new Map(f.fixture.files);
  f.hooks.write = () => { if (f.writes.length === 2) throw new Error("synthetic disk full"); };
  assert.throws(() => c.session.publish(c.pages, c.manifest), /disk full/); assert.deepEqual(f.fixture.files, before);
  assert.equal(validateStaticHtml(f.fixture.options).status, "UNVERIFIED");
});
test("silently truncated staging bytes fail readback verification", () => {
  const f = setup(), c = f.start("release");
  f.hooks.written = key => f.fixture.files.set(key, Buffer.from("truncated"));
  assert.throws(() => c.session.publish(c.pages, c.manifest), /staged bytes mismatch/); assert.equal(f.renames.length, 0);
  assert.equal([...f.fixture.files.keys()].some(key => key.includes(".capture-")), false);
});
for (const point of ["page", "final-manifest"]) {
  test(`${point} replacement failure invalidates old receipt and cannot reuse mixed output`, () => {
    const f = setup(), c = f.start("song"); let manifests = 0;
    f.hooks.rename = target => {
      if (target === "song/manifest.json") manifests++;
      if ((point === "page" && target === "song/S002.html") || (point === "final-manifest" && manifests === 2)) throw new Error("synthetic rename failure");
    };
    assert.throws(() => c.session.publish(c.pages, c.manifest), /rename failure/);
    assert.equal(Object.hasOwn(f.fixture.getJson("song/manifest.json"), "captureProvenance"), false);
    assert.equal(validateStaticHtml(f.fixture.options).reusable, false);
    assert.equal([...f.fixture.files.keys()].some(key => key.includes(".capture-")), false);
  });
}
test("input mutation during page replacement prevents final receipt commit", () => {
  const f = setup(), c = f.start("release");
  f.hooks.renamed = target => { if (target === "release/R0001.html") f.fixture.editSnapshot("release-list.json", data => { data[0].note = "changed during writes"; }); };
  assert.throws(() => c.session.publish(c.pages, c.manifest), /changed during capture/);
  assert.equal(Object.hasOwn(f.fixture.getJson("release/manifest.json"), "captureProvenance"), false);
  assert.equal(validateStaticHtml(f.fixture.options).reusable, false);
});
for (const type of ["song", "release"]) test(`${type}: real generator capture-start failure preserves existing files`, async t => {
  const watched = [`${type}/manifest.json`, `${type}/${type === "song" ? "S001" : "R0001"}.html`, "data/current.json"];
  const before = watched.map(file => fs.readFileSync(path.join(root, file)));
  t.mock.method(chromium, "launch", async () => { throw new Error("synthetic browser failure before capture"); });
  t.mock.method(fs, "writeFileSync", () => { throw new Error("must not write before capture completes"); });
  const generate = type === "song" ? songGenerator.generateSongPages : releaseGenerator.generateReleasePages;
  await assert.rejects(generate({ revision: require("../data/current.json").revision }), /browser failure/);
  assert.deepEqual(watched.map(file => fs.readFileSync(path.join(root, file))), before);
});
for (const type of ["song", "release"]) test(`${type}: failure during real generator page capture never publishes a receipt`, async t => {
  const watched = [`${type}/manifest.json`, `${type}/${type === "song" ? "S001" : "R0001"}.html`, "data/current.json"];
  const before = watched.map(file => fs.readFileSync(path.join(root, file)));
  let started = false, closed = false;
  t.mock.method(chromium, "launch", async () => ({
    async newPage() { return { async route() {}, async goto() { started = true; throw new Error("synthetic capture interruption"); } }; },
    async close() { closed = true; }
  }));
  t.mock.method(fs, "writeFileSync", () => { throw new Error("must not publish incomplete capture"); });
  const generate = type === "song" ? songGenerator.generateSongPages : releaseGenerator.generateReleasePages;
  await assert.rejects(generate({ revision: require("../data/current.json").revision }), /capture interruption/);
  assert.ok(started && closed); assert.deepEqual(watched.map(file => fs.readFileSync(path.join(root, file))), before);
});

// Opt-in expensive regression: real Chrome, actual full generator loops, actual
// snapshots/renderer and secondary enrichment. Intercept ONLY output filesystem
// operations into memory; production HTML/current/snapshots never get rewritten.
test("real formal Song117 + Release114 capture yields independently verified receipts", { skip: process.env.MUSDB_CAPTURE_PROVENANCE_INTEGRATION !== "1" }, async t => {
  const files = new Map(), calls = [], read = fs.readFileSync, write = fs.writeFileSync, mkdir = fs.mkdirSync;
  const rename = fs.renameSync, unlink = fs.unlinkSync, exists = fs.existsSync;
  const relative = file => path.relative(root, String(file)).replace(/\\/g, "/");
  const output = key => /^(song|release)\/(manifest\.json|S\d{3}\.html|R\d{4}\.html)(\.capture-.*\.tmp)?$/.test(key);
  t.mock.method(fs, "readFileSync", function(file, options) { const key = relative(file); return files.has(key) ? (typeof options === "string" ? files.get(key).toString(options) : Buffer.from(files.get(key))) : read.call(this, file, options); });
  t.mock.method(fs, "writeFileSync", function(file, value, options) { const key = relative(file); if (!output(key)) { assert.ok(key.startsWith(".."), `unexpected production write ${key}`); return write.call(this, file, value, options); } files.set(key, Buffer.from(value)); calls.push(key); });
  t.mock.method(fs, "mkdirSync", function(file, options) { const key = relative(file); if (["song", "release"].includes(key)) return; assert.ok(key.startsWith("..")); return mkdir.call(this, file, options); });
  t.mock.method(fs, "renameSync", function(from, to) { const a = relative(from), b = relative(to); assert.ok(output(a) && output(b)); assert.ok(files.has(a)); files.set(b, files.get(a)); files.delete(a); });
  t.mock.method(fs, "unlinkSync", function(file) { const key = relative(file); if (output(key)) return files.delete(key); return unlink.call(this, file); });
  t.mock.method(fs, "existsSync", function(file) { return files.has(relative(file)) || exists.call(this, file); });
  const revision = require("../data/current.json").revision;
  await songGenerator.generateSongPages({ revision });
  await releaseGenerator.generateReleasePages({ revision });
  const result = validateStaticHtml({ revision, readFile: file => files.get(relative(file)) || read(file) });
  assert.equal(result.status, "PASS", JSON.stringify(result)); assert.equal(result.reusable, true);
  assert.equal([...files.keys()].filter(key => key.endsWith(".html")).length, 231);
  assert.ok(calls.some(key => key.startsWith("song/manifest.json.capture-")));
  assert.ok(calls.some(key => key.startsWith("release/manifest.json.capture-")));
});
