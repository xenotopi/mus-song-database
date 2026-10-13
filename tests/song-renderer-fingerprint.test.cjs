"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { rendererFingerprint, SONG_RENDERER_FILES, generateSongPages } = require("../tools/generate-song-pages.cjs");
const root = path.resolve(__dirname, "..");

test("LF, CRLF and mixed line endings yield the same Song renderer fingerprint", t => {
  const read = fs.readFileSync, current = rendererFingerprint();
  const files = new Set(SONG_RENDERER_FILES.map(file => path.join(root, file)));
  for (const style of ["LF", "CRLF", "mixed"]) {
    const mock = t.mock.method(fs, "readFileSync", function(file, ...args) {
      const value = read.call(this, file, ...args);
      if (!files.has(file)) return value;
      let newline = 0;
      const lf = String(value).replace(/\r\n/g, "\n");
      return style === "LF" ? lf : lf.replace(/\n/g, () => style === "CRLF" || newline++ % 2 ? "\r\n" : "\n");
    });
    try { assert.equal(rendererFingerprint(), current, style); } finally { mock.mock.restore(); }
  }
});

test("one real source character change is still detected in every Song dependency", t => {
  const read = fs.readFileSync, current = rendererFingerprint();
  for (const file of SONG_RENDERER_FILES) {
    const target = path.join(root, file);
    const mock = t.mock.method(fs, "readFileSync", function(filename, ...args) {
      const value = read.call(this, filename, ...args);
      if (filename !== target) return value;
      const source = String(value), index = source.search(/\S/);
      return source.slice(0, index) + (source[index] === "x" ? "y" : "x") + source.slice(index + 1);
    });
    try { assert.notEqual(rendererFingerprint(), current, file); } finally { mock.mock.restore(); }
  }
});

test("current uncommitted Git LF source and Windows checkout give identical verified results", t => {
  const { validateStaticHtml } = require("../tools/validate-static-html.cjs");
  const revision = JSON.parse(fs.readFileSync(path.join(root, "song/manifest.json"))).outputRevision;
  const local = validateStaticHtml({ revision });
  assert.equal(local.status, "PASS", JSON.stringify(local));
  const read = fs.readFileSync, sources = new Map();
  const releaseFiles = require("../tools/generate-release-pages.cjs").RELEASE_RENDERER_FILES;
  for (const file of new Set([...SONG_RENDERER_FILES, ...releaseFiles])) {
    const actual = read(path.join(root, file)), lf = Buffer.from(actual.toString("utf8").replace(/\r\n/g, "\n"));
    // Git's real clean filter, applied to CURRENT uncommitted bytes, not HEAD.
    // hash-object without -w neither stores blobs nor modifies the index.
    const gitId = execFileSync("git", ["hash-object", `--path=${file}`, "--stdin"], { cwd: root, input: actual, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    const lfId = crypto.createHash("sha1").update(`blob ${lf.length}\0`).update(lf).digest("hex");
    assert.equal(gitId, lfId, `${file}: Git-filtered source must match this LF view`);
    sources.set(path.join(root, file), lf);
  }
  t.mock.method(fs, "readFileSync", function(file, options) {
    const value = sources.get(file);
    return value ? typeof options === "string" ? value.toString(options) : Buffer.from(value) : read.call(this, file, options);
  });
  const published = validateStaticHtml({ revision });
  assert.deepEqual(published, local);
  assert.equal(published.reusable, true);
});

test("legacy CRLF fingerprint and stale capture receipt are rejected after EOL synchronization", () => {
  const { validateStaticHtml } = require("../tools/validate-static-html.cjs");
  const file = path.join(root, "song/manifest.json"), original = JSON.parse(fs.readFileSync(file));
  const legacy = "890d95cf58e33a429e7ccb2c0120e7ebe122f1ef994fa3ef36d196f50b2626d7";
  for (const field of ["renderer", "receipt"]) {
    const manifest = structuredClone(original);
    if (field === "renderer") {
      manifest.rendererSha256 = legacy;
      for (const entry of Object.values(manifest.pages)) entry.rendererSha256 = legacy;
    } else manifest.captureProvenance.rendererSha256 = legacy;
    const result = validateStaticHtml({ revision: original.outputRevision, readFile: target => target === file ? Buffer.from(JSON.stringify(manifest)) : fs.readFileSync(target) });
    assert.equal(result.status, "FAIL"); assert.equal(result.reusable, false);
    assert.match(result.issues.find(issue => issue.severity === "FAIL").message, /renderer|provenance/);
  }
});

test("Song fingerprint explicitly covers the entry and its transitive capture imports", () => {
  assert.ok(Object.isFrozen(SONG_RENDERER_FILES));
  assert.equal(new Set(SONG_RENDERER_FILES).size, SONG_RENDERER_FILES.length);
  assert.ok(SONG_RENDERER_FILES.includes("song.html"));
  assert.ok(SONG_RENDERER_FILES.includes("tools/generate-song-pages.cjs"));
  for (const file of SONG_RENDERER_FILES) {
    assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
    assert.ok(!file.startsWith("data/") && !file.startsWith("assets/css/"), file);
    const source = fs.readFileSync(path.join(root, file), "utf8");
    if (file === "song.html") {
      for (const match of source.matchAll(/<script[^>]+src="([^"?]+)/g)) {
        assert.ok(SONG_RENDERER_FILES.includes(match[1]), `unreviewed Song entry script: ${match[1]}`);
      }
    }
    for (const match of source.matchAll(/\bimport\s+(?:[^;]*?\sfrom\s+)?["'](\.\/[^"']+)["']|\b(?:import|require)\s*\(\s*["'](\.\/[^"']+)["']/g)) {
      const dependency = path.posix.join(path.posix.dirname(file), (match[1] || match[2]).split("?")[0]);
      assert.ok(SONG_RENDERER_FILES.includes(dependency), `${file}: unreviewed capture dependency ${dependency}`);
    }
  }
});

test("Every included Song dependency change alters the fingerprint without disk writes", t => {
  const current = rendererFingerprint();
  const readFileSync = fs.readFileSync;
  for (const file of SONG_RENDERER_FILES) {
    const absolute = path.join(root, file);
    const mock = t.mock.method(fs, "readFileSync", function (filename, ...args) {
      const value = readFileSync.call(this, filename, ...args);
      return filename === absolute ? `${value}\n/* simulated renderer change */\n` : value;
    });
    try { assert.notEqual(rendererFingerprint(), current, file); }
    finally { mock.mock.restore(); }
  }
  assert.equal(rendererFingerprint(), current);
});

test("Release/Event-only JS and unrelated CSS changes leave Song fingerprint unchanged", t => {
  const current = rendererFingerprint();
  const excluded = ["assets/js/release-v500.js", "assets/js/event-v310.js", "assets/css/release-amazon.css", "assets/css/member-analytics.css"];
  const readFileSync = fs.readFileSync;
  for (const file of excluded) {
    assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
    assert.ok(!SONG_RENDERER_FILES.includes(file), file);
    const mock = t.mock.method(fs, "readFileSync", function (filename, ...args) {
      const value = readFileSync.call(this, filename, ...args);
      return filename === path.join(root, file) ? `${value}\n/* unrelated change */\n` : value;
    });
    try { assert.equal(rendererFingerprint(), current, file); }
    finally { mock.mock.restore(); }
  }
});

test("Fingerprint reads only declared files, not asset directory inventories or snapshot data", t => {
  const current = rendererFingerprint();
  const reads = [];
  const readFileSync = fs.readFileSync;
  t.mock.method(fs, "readFileSync", function (filename, ...args) {
    reads.push(path.relative(root, filename).replace(/\\/g, "/"));
    return readFileSync.call(this, filename, ...args);
  });
  t.mock.method(fs, "readdirSync", () => { throw new Error("Unrelated asset additions must not affect fingerprint"); });
  assert.equal(rendererFingerprint(), current);
  assert.deepEqual(reads, [...SONG_RENDERER_FILES]);
});

test("Actual snapshot capture is unchanged without external CSS; outputs stay in memory", async t => {
  const ids = ["S001", "S017", "S117"];
  const before = new Map([...ids.map(id => `song/${id}.html`), "song/manifest.json"].map(file => [file, fs.readFileSync(path.join(root, file))]));
  const writes = new Map();
  const staged = new Map();
  const readFileSync = fs.readFileSync;
  const writeFileSync = fs.writeFileSync;
  const mkdirSync = fs.mkdirSync;
  const renameSync = fs.renameSync;
  const unlinkSync = fs.unlinkSync;
  t.mock.method(fs, "readFileSync", function (filename, options) {
    const relative = path.relative(root, filename).replace(/\\/g, "/");
    const value = staged.get(relative) ?? writes.get(relative);
    return value === undefined ? readFileSync.call(this, filename, options) : typeof options === "string" ? value : Buffer.from(value);
  });
  t.mock.method(fs, "writeFileSync", function (filename, value, ...args) {
    const relative = path.relative(root, filename).replace(/\\/g, "/");
    if (relative.startsWith("..")) return writeFileSync.call(this, filename, value, ...args);
    assert.ok(before.has(relative.split(".capture-")[0]), `unexpected production write: ${relative}`);
    staged.set(relative, String(value));
  });
  t.mock.method(fs, "renameSync", function (from, to) {
    const source = path.relative(root, from).replace(/\\/g, "/"), target = path.relative(root, to).replace(/\\/g, "/");
    if (source.startsWith("..")) return renameSync.call(this, from, to);
    assert.ok(staged.has(source) && before.has(target)); writes.set(target, staged.get(source)); staged.delete(source);
  });
  t.mock.method(fs, "unlinkSync", function (filename) {
    const relative = path.relative(root, filename).replace(/\\/g, "/");
    if (relative.startsWith("..")) return unlinkSync.call(this, filename);
    assert.match(relative, /\.capture-.*\.tmp$/); staged.delete(relative);
  });
  t.mock.method(fs, "mkdirSync", function (directory, ...args) {
    if (directory === path.join(root, "song")) return undefined; // Already exists; never modify it for this test.
    assert.ok(path.relative(root, directory).startsWith(".."), `unexpected production mkdir: ${directory}`);
    return mkdirSync.call(this, directory, ...args);
  });
  let emptyCss = false;
  const requestedCss = new Set();
  const launch = chromium.launch.bind(chromium);
  t.mock.method(chromium, "launch", async options => {
    const browser = await launch(options);
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async options => {
      const page = await newPage(options);
      const route = page.route.bind(page);
      page.route = (pattern, handler) => route(pattern, request => {
        const url = new URL(request.request().url());
        if (emptyCss && url.pathname.endsWith(".css")) {
          requestedCss.add(url.pathname.slice(1));
          return request.fulfill({ contentType: "text/css", body: "/* stylesheet omitted only in this in-memory test */" });
        }
        return handler(request);
      });
      return page;
    };
    return browser;
  });
  await generateSongPages({ ids });
  const styled = new Map(writes);
  writes.clear(); staged.clear(); emptyCss = true;
  await generateSongPages({ ids });
  // Canonical management attributes/placement can vary with the SEO debounce,
  // independently of CSS. Everything else in the serialized DOM must match.
  const canonical = /<link\b(?=[^>]*\brel="canonical")[^>]*>/g;
  for (const id of ids) {
    const file = `song/${id}.html`;
    assert.equal(writes.get(file).replace(canonical, ""), styled.get(file).replace(canonical, ""), file);
    assert.ok(writes.get(file).includes(`href="https://mus-song-db.com/song/${id}.html"`));
  }
  assert.deepEqual([...requestedCss].sort(), ["assets/css/analytics-consent.css", "assets/css/icons.css", "assets/css/style.css"]);
  assert.equal(JSON.parse(writes.get("song/manifest.json")).latestRendererSha256, rendererFingerprint());
  for (const [file, contents] of before) assert.deepEqual(readFileSync(path.join(root, file)), contents, `${file}: test must not alter production outputs`);
});
