"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateStaticHtml } = require("../tools/validate-static-html.cjs");
const { parseUniqueJson, parseSerializedHtml } = require("../tools/static-html-readonly-lib.cjs");
const { createFixture, root } = require("./helpers/static-html-validator-fixture.cjs");
const old = "0".repeat(64);

function reject(fixture, pattern) {
  const result = validateStaticHtml(fixture.options);
  assert.equal(result.status, "FAIL", JSON.stringify(result));
  assert.equal(result.reusable, false);
  assert.match(result.issues.find(issue => issue.severity === "FAIL").message, pattern);
  return result;
}

test("complete synthetic set with explicit input/output receipts passes independently of old current", () => {
  const fixture = createFixture();
  fixture.files.set("data/current.json", Buffer.from(JSON.stringify({ revision: `sha256-${old}` })));
  const result = validateStaticHtml(fixture.options);
  assert.equal(result.status, "PASS", JSON.stringify(result));
  assert.equal(result.reusable, true); assert.equal(result.provenance, "VERIFIED");
  assert.equal(result.checked.songs, 117); assert.equal(result.checked.releases, 114);
  assert.equal(fixture.reads.includes("data/current.json"), false);
});

for (const type of ["song", "release"]) {
  const id = type === "song" ? "S001" : "R0001";
  test(`${type}: missing HTML rejected`, () => { const f = createFixture(); f.files.delete(`${type}/${id}.html`); reject(f, /ID set/); });
  test(`${type}: one-byte modification rejected`, () => { const f = createFixture(); f.editHtml(type, id, html => html.replace("Fixture", "Xixture")); reject(f, /hash\/bytes/); });
  test(`${type}: wrong bytes rejected even when hash matches`, () => { const f = createFixture(); f.editJson(`${type}/manifest.json`, m => m.pages[id].bytes++); reject(f, /hash\/bytes/); });
  test(`${type}: missing manifest ID rejected`, () => { const f = createFixture(); f.editJson(`${type}/manifest.json`, m => delete m.pages[id]); reject(f, /ID set/); });
  test(`${type}: extra manifest ID rejected`, () => { const f = createFixture(); f.editJson(`${type}/manifest.json`, m => m.pages.extra = m.pages[id]); reject(f, /ID set/); });
  test(`${type}: duplicate JSON ID rejected before JSON.parse can discard it`, () => {
    const f = createFixture(), file = `${type}/manifest.json`, raw = f.files.get(file).toString();
    f.files.set(file, Buffer.from(raw.replace('"pages": {', `"pages": {"${id}": {},`)));
    reject(f, /Duplicate JSON key/);
  });
  test(`${type}: artifact revision cannot be replaced by old current`, () => { const f = createFixture(); f.editJson(`${type}/manifest.json`, m => m.outputRevision = `sha256-${old}`); reject(f, /revision/); });
  test(`${type}: old renderer rejected`, () => { const f = createFixture(); f.editJson(`${type}/manifest.json`, m => m.rendererSha256 = old); reject(f, /renderer/); });
  test(`${type}: invalid manifest schema rejected`, () => { const f = createFixture(); f.editJson(`${type}/manifest.json`, m => m.schemaVersion = 2); reject(f, /schema/); });
  test(`${type}: path traversal rejected without reading its target`, () => { const f = createFixture(); f.editJson(`${type}/manifest.json`, m => m.pages[id].path = "../private.json"); reject(f, /path/); assert.ok(!f.reads.some(r => r.includes("private"))); });
  test(`${type}: duplicate HTML ID rejected even with matching hash`, () => { const f = createFixture(); f.editHtml(type, id, h => h.replace("</main>", '<div id="mainContent"></div></main>'), true); reject(f, /Duplicate\/empty HTML ID/); });
  test(`${type}: HTML identity mismatch rejected even with matching hash`, () => { const f = createFixture(); f.editHtml(type, id, h => h.replace(`data-${type}-id="${id}"`, `data-${type}-id="wrong"`), true); reject(f, /HTML ID differs/); });
  test(`${type}: hidden completed body rejected even with matching hash`, () => { const f = createFixture(); f.editHtml(type, id, h => h.replace('id="mainContent"', 'id="mainContent" hidden=""'), true); reject(f, /missing\/hidden/); });
}

test("duplicate directory IDs are rejected", () => {
  const f = createFixture(), readDirectory = f.options.readDirectory;
  f.options.readDirectory = dir => { const entries = readDirectory(dir); return dir.endsWith(`${path.sep}song`) ? [...entries, "S001.html"] : entries; };
  reject(f, /duplicate IDs/);
});
test("unexpected HTML file is rejected even if manifests are complete", () => { const f = createFixture(); f.files.set("song/S999.html", Buffer.from("unexpected")); reject(f, /ID set/); });
test("Song 3-page partial manifest is not production complete", () => {
  const f = createFixture(); f.editJson("song/manifest.json", m => { m.count = 3; m.pages = Object.fromEntries(Object.entries(m.pages).slice(0, 3)); }); reject(f, /count/);
});
test("3 current + 114 old renderer pages rejected despite current latest/set fingerprint", () => {
  const f = createFixture(); f.editJson("song/manifest.json", m => { m.latestRendererSha256 = m.rendererSha256; Object.values(m.pages).slice(3).forEach(p => p.rendererSha256 = old); }); reject(f, /page renderer/);
});
test("one stale Song page rejected despite matching every HTML hash", () => { const f = createFixture(); f.editJson("song/manifest.json", m => m.pages.S117.rendererSha256 = old); reject(f, /page renderer/); });
test("latestRendererSha256 alone is not complete-set freshness", () => { const f = createFixture(); f.editJson("song/manifest.json", m => { m.latestRendererSha256 = m.rendererSha256; delete m.rendererSha256; }); reject(f, /complete-set renderer/); });

for (const [name, mutate, pattern] of [
  ["canonical", h => h.replace('rel="canonical" href="https://mus-song-db.com/song/S001.html"', 'rel="canonical" href="https://mus-song-db.com/song/S002.html"'), /canonical/],
  ["duplicate canonical", h => h.replace("</head>", '<link rel="canonical" href="https://mus-song-db.com/song/S001.html"></head>'), /duplicate canonical/],
  ["title", h => h.replace(/<title>[^<]*(?:&lt;[^<]*)?<\/title>/, "<title>Wrong</title>"), /title/],
  ["description", h => h.replace(/<meta name="description"[^>]+>/, '<meta name="description" content="Wrong">'), /description/],
  ["OGP", h => h.replace(/<meta property="og:url"[^>]+>/, '<meta property="og:url" content="https://example.invalid/">'), /og:url/],
  ["robots", h => h.replace('content="index,follow,max-image-preview:large"', 'content="noindex"'), /robots/],
  ["JSON-LD syntax", h => h.replace('"@type":"MusicRecording"', '"@type":broken'), /JSON/],
  ["JSON-LD semantic content", h => h.replace('"propertyID":"μ\'s Song Database Song ID","value":"S001"', '"propertyID":"μ\'s Song Database Song ID","value":"S002"'), /MusicRecording/],
  ["malformed HTML", h => h.replace("</main>", "</wrong>"), /Unbalanced/],
  ["body basic information", h => h.replace("Fixture CD", "Wrong CD"), /basic information/],
  ["body history", h => h.replace("歌唱者：Fixture Singer", "歌唱者：Wrong Singer"), /date\/singer/],
  ["visible SEO paragraph", h => h.replace("</main>", '<p data-prerender-description="">SEO</p></main>'), /Visible SEO/]
]) test(`matching hash cannot hide broken ${name}`, () => { const f = createFixture(); f.editHtml("song", "S001", mutate, true); reject(f, pattern); });

test("Release included Song mismatch rejected independently of head metadata and HTML hash", () => {
  const f = createFixture(); f.editHtml("release", "R0001", h => h.replace('class="release-included-song-title">Fixture Song 1', 'class="release-included-song-title">Wrong Song'), true); reject(f, /included Song/);
});
for (const [name, mutate, pattern] of [
  ["description", h => h.replace(/<meta name="description"[^>]+>/, '<meta name="description" content="Wrong">'), /description/],
  ["canonical", h => h.replace('rel="canonical" href="https://mus-song-db.com/release/R0001.html"', 'rel="canonical" href="https://mus-song-db.com/release/R0002.html"'), /canonical/],
  ["BreadcrumbList", h => h.replace('"position":3,"name":"Fixture Release 1"', '"position":3,"name":"Wrong"'), /BreadcrumbList/]
]) test(`Release ${name} mismatch rejected even with matching hash`, () => { const f = createFixture(); f.editHtml("release", "R0001", mutate, true); reject(f, pattern); });

for (const [name, mutate, pattern] of [
  ["missing song", h => h.replace('class="release-kp-song"', 'class="missing-song"'), /song count/],
  ["track order", h => h.replace('class="release-kp-track">01', 'class="release-kp-track">02'), /track order/],
  ["missing Event", h => h.replace('class="release-kp-event"', 'class="missing-event"'), /history counts/],
  ["missing performance", h => h.replace('class="release-kp-performance"', 'class="missing-performance"'), /history counts/],
  ["error DOM", h => h.replace("</main>", '<p class="release-inclusion-error">error</p></main>'), /error\/retry/],
  ["retry DOM", h => h.replace("</main>", '<button class="release-kp-retry">retry</button></main>'), /error\/retry/],
  ["wrong venue", h => h.replace('class="release-kp-event-venue">Fixture Venue 1', 'class="release-kp-event-venue">Wrong Venue'), /venue enrichment/],
  ["wrong performance singer", h => h.replace("実歌唱：Fixture Singer", "実歌唱：Wrong Singer"), /performance differs/]
]) test(`R0072 ${name} rejected`, () => { const f = createFixture(); f.editHtml("release", "R0072", mutate, true); reject(f, pattern); });

test("snapshot missing file rejected", () => { const f = createFixture(); f.files.delete(f.prefix + "songs/S001.json"); reject(f, /ID set/); });
test("snapshot raw hash mismatch rejected", () => { const f = createFixture(); const file = f.prefix + "songs/S001.json"; f.files.set(file, Buffer.concat([f.files.get(file), Buffer.from(" ")])); reject(f, /hash or bytes/); });
test("snapshot data hash mismatch rejected", () => { const f = createFixture(); f.editJson(f.prefix + "manifest.json", m => m.hashes.songs.S001.sha256 = old); reject(f, /hash or bytes/); });
test("snapshot count/schema mismatch rejected", () => { const f = createFixture(); f.editJson(f.prefix + "manifest.json", m => m.counts.releases = 113); reject(f, /counts/); });
test("source IDs outside the supported capture pattern rejected", () => { const f = createFixture(); f.editJson(f.prefix + "manifest.json", m => { m.hashes.songs.S1000 = m.hashes.songs.S001; delete m.hashes.songs.S001; }); reject(f, /source ID pattern/); });
test("snapshot wrapper revision mismatch rejected", () => { const f = createFixture(); f.editJson(f.prefix + "songs/S001.json", s => s.snapshot.outputRevision = `sha256-${old}`); reject(f, /wrapper revision/); });
test("snapshot detail schema invalid despite correct new hashes", () => { const f = createFixture(); f.editSnapshot("releases/R0001.json", r => r.includedSongsMeta = null); reject(f, /required field/); });
test("auxiliary Event schema invalid despite correct new hashes", () => { const f = createFixture(); f.editSnapshot("events/EV0353.json", d => d.event.songs = null); reject(f, /Event snapshot schema/); });
test("snapshot name changed with valid new hashes is still inconsistent with old HTML", () => { const f = createFixture(); f.editSnapshot("songs/S001.json", s => s.displayName = "Different Name"); reject(f, /h1/); });
test("duplicate Release list IDs rejected", () => { const f = createFixture(); f.editSnapshot("release-list.json", rows => rows[1].releaseId = rows[0].releaseId); reject(f, /duplicate IDs/); });
for (const file of ["release-list.json", "kamipara-dashboard.json", "events/EV0353.json"]) {
  test(`missing auxiliary ${file} rejected`, () => { const f = createFixture(); f.files.delete(f.prefix + file); reject(f, /ENOENT|ID set/); });
  test(`updated auxiliary ${file} invalidates its old capture receipt even if body remains unchanged`, () => {
    const f = createFixture(); f.editSnapshot(file, value => { if (Array.isArray(value)) value[0].note = "updated"; else value.note = "updated"; }); reject(f, /Capture inputs differ/);
  });
}
test("bad Kamipara snapshot references rejected before HTML inspection", () => { const f = createFixture(); f.editSnapshot("kamipara-dashboard.json", d => d.performances[0].songId = "missing"); reject(f, /references/); });
test("unsupported Kamipara credits rejected even when collection counts and hashes match", () => { const f = createFixture(); f.editSnapshot("kamipara-dashboard.json", d => d.songs[0].songId = "S500"); reject(f, /credited Songs/); });

test("missing historical capture receipts yields UNVERIFIED, never reuse", () => {
  const f = createFixture(); for (const type of ["song", "release"]) f.editJson(`${type}/manifest.json`, m => delete m.captureProvenance);
  const result = validateStaticHtml(f.options); assert.equal(result.status, "UNVERIFIED"); assert.equal(result.integrity, "PASS"); assert.equal(result.reusable, false); assert.equal(result.issues.length, 2);
});
test("provenance absence never masks a later integrity failure", () => {
  const f = createFixture(); for (const type of ["song", "release"]) f.editJson(`${type}/manifest.json`, m => delete m.captureProvenance);
  f.editHtml("release", "R0001", h => h.replace("Fixture", "Xixture")); reject(f, /hash\/bytes/);
});
test("partial receipt is invalid, not verified by filling from current inputs", () => { const f = createFixture(); f.editJson("song/manifest.json", m => delete m.captureProvenance.inputs["songs/S001.json"]); reject(f, /Capture inputs differ/); });
test("receipt cannot attest a different HTML output", () => { const f = createFixture(); f.editJson("release/manifest.json", m => m.captureProvenance.outputs.R0001.sha256 = old); reject(f, /bound to these HTML/); });
test("receipt must record completion after enrichment", () => { const f = createFixture(); f.editJson("release/manifest.json", m => m.captureProvenance.completion = "initial-body-only"); reject(f, /completion/); });
test("missing target revision fails before any snapshot read", () => { const f = createFixture(); delete f.options.revision; reject(f, /Explicit target/); assert.equal(f.reads.length, 0); });
test("storage/read exception is fail-closed", () => { const f = createFixture(); f.options.readFile = () => { throw new Error("EACCES synthetic"); }; reject(f, /EACCES/); });
test("fingerprint exception is fail-closed", t => { t.mock.method(require("../tools/generate-song-pages.cjs"), "rendererFingerprint", () => { throw new Error("fingerprint read failed"); }); reject(createFixture(), /fingerprint read failed/); });
test("artifact changed during inspection is rejected rather than reusing an obsolete check", () => {
  const f = createFixture(), readFile = f.options.readFile, reads = new Map();
  f.options.readFile = file => { const value = readFile(file), count = (reads.get(file) || 0) + 1; reads.set(file, count); return file.endsWith(`${path.sep}S001.html`) && count > 1 ? Buffer.concat([value, Buffer.from(" ")]) : value; };
  reject(f, /changed during validation/);
});
test("directory changed during inspection is rejected", () => {
  const f = createFixture(), readDirectory = f.options.readDirectory, reads = new Map();
  f.options.readDirectory = dir => { const value = readDirectory(dir), count = (reads.get(dir) || 0) + 1; reads.set(dir, count); return dir.endsWith(`${path.sep}song`) && count > 1 ? [...value, "extra.html"] : value; };
  reject(f, /Directory changed/);
});
test("validator never writes or invokes either generator", t => {
  for (const name of ["writeFileSync", "appendFileSync", "renameSync", "unlinkSync", "mkdirSync", "rmSync", "createWriteStream"]) t.mock.method(fs, name, () => { throw new Error(`write attempted: ${name}`); });
  for (const [file, name] of [["../tools/generate-song-pages.cjs", "generateSongPages"], ["../tools/generate-release-pages.cjs", "generateReleasePages"]]) t.mock.method(require(file), name, () => { throw new Error("generator invoked"); });
  const f = createFixture(), before = new Map([...f.files].map(([key, value]) => [key, Buffer.from(value)]));
  assert.equal(validateStaticHtml(f.options).status, "PASS"); assert.deepEqual(f.files, before);
});
test("strict readers reject duplicate JSON-LD/attributes and do not execute script text", () => {
  assert.throws(() => parseUniqueJson('{"name":"a","name":"b"}'), /Duplicate JSON/);
  assert.throws(() => parseSerializedHtml('<!DOCTYPE html><html><head></head><body><p id="a" id="b"></p></body></html>'), /Duplicate HTML attribute/);
  assert.doesNotThrow(() => parseSerializedHtml('<!DOCTYPE html><html><head><script>throw new Error("must never run");</script></head><body></body></html>'));
});
test("existing artifacts are inspected read-only; missing receipts are never inferred and CLI status matches", () => {
  // Derive the explicit artifact target, never use old data/current.json as truth.
  // This remains valid when a future authorized generator writes real receipts.
  const songManifest = JSON.parse(fs.readFileSync(path.join(root, "song/manifest.json")));
  const releaseManifest = JSON.parse(fs.readFileSync(path.join(root, "release/manifest.json")));
  const revision = songManifest.outputRevision;
  const expected = songManifest.captureProvenance && releaseManifest.captureProvenance ? "PASS" : "UNVERIFIED";
  const watched = ["data/current.json", "song/manifest.json", "release/manifest.json", "song/S001.html", "release/R0072.html"];
  const before = watched.map(file => fs.readFileSync(path.join(root, file)));
  const result = validateStaticHtml({ revision });
  assert.equal(result.status, expected, JSON.stringify(result)); assert.equal(result.reusable, expected === "PASS");
  assert.equal(result.checked.songs, 117); assert.equal(result.checked.releases, 114);
  const cli = spawnSync(process.execPath, [path.join(root, "tools/validate-static-html.cjs"), "--revision", revision], { encoding: "utf8" });
  assert.equal(cli.status, expected === "PASS" ? 0 : 2, cli.stderr); assert.equal(JSON.parse(cli.stdout).status, expected);
  assert.deepEqual(watched.map(file => fs.readFileSync(path.join(root, file))), before);
});
