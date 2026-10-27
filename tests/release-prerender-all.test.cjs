"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const pointer = require("../data/current.json");
const snapshotManifest = require(`../data/snapshots/${pointer.revision}/manifest.json`);
const htmlManifestPath = path.join(root, "release", "manifest.json");
const { rendererFingerprint, RELEASE_RENDERER_FILES } = require("../tools/generate-release-pages.cjs");
const { validateReleaseBody } = require("../tools/validate-static-html.cjs");
const { parseSerializedHtml, textContent } = require("../tools/static-html-readonly-lib.cjs");
const { validateReleaseContentsData } = require("../tools/validate-release-contents.cjs");
const releaseList = require(`../data/snapshots/${pointer.revision}/release-list.json`).data;
const productContents = validateReleaseContentsData(require('../data/release-contents.json'),Object.fromEntries(releaseList.map(r=>[r.releaseId,require(`../data/snapshots/${pointer.revision}/releases/${r.releaseId}.json`).data])));
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function escapeText(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function assertReleaseDate(html, source) {
  const hero = parseSerializedHtml(html).ids.get("heroMeta");
  assert.ok(hero, `${source.releaseId} hero date container`);
  const displayed = textContent(hero);
  if (!source.releaseDate) { assert.match(displayed, /発売日未登録/); return; }
  assert.match(source.releaseDate, /^\d{4}-\d{2}-\d{2}$/, "snapshot date contract");
  const dates = [...displayed.matchAll(/\d{4}[-/]\d{2}[-/]\d{2}/g)].map(m => m[0]);
  assert.equal(dates.length, 1, `${source.releaseId} exactly one visible date`);
  assert.equal(dates[0].replaceAll("/", "-"), source.releaseDate, `${source.releaseId} date value`);
  assert.equal(dates[0], source.releaseDate.replaceAll("-", "/"), `${source.releaseId} approved display format`);
  if (["R0032", "R0052"].includes(source.releaseId)) assert.match(displayed, /Blu-ray最終巻発売日：/, "not the benefit CD distribution date");
}

test("Release prerender 114 raw HTML", () => {
  const manifest = JSON.parse(fs.readFileSync(htmlManifestPath, "utf8"));
  const ids = Object.keys(snapshotManifest.hashes.releases).sort();
  assert.equal(ids.length, 114);
  assert.deepEqual(Object.keys(manifest.pages).sort(), ids);
  assert.equal(manifest.count, 114);
  assert.equal(manifest.outputRevision, pointer.revision);
  assert.equal(manifest.dataRevision, snapshotManifest.dataRevision);
  assert.equal(manifest.rendererSha256, rendererFingerprint(), "Release renderer changed: regenerate all Release pages");
  const hashes = new Set();
  const canonicals = new Set();
  for (const id of ids) {
    const source = require(`../data/snapshots/${pointer.revision}/releases/${id}.json`).data;
    const html = fs.readFileSync(path.join(root, "release", `${id}.html`), "utf8");
    const canonical = `https://mus-song-db.com/release/${id}.html`;
    hashes.add(sha256(html)); canonicals.add(canonical);
    assert.equal(manifest.pages[id].path, `release/${id}.html`, id);
    assert.equal(manifest.pages[id].canonical, canonical, id);
    assert.equal(manifest.pages[id].sha256, sha256(html), id);
    assert.equal(manifest.pages[id].bytes, Buffer.byteLength(html), id);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, id);
    assert.ok(html.includes(`href="${canonical}"`), `${id} canonical`);
    assert.ok(html.includes(`content="${canonical}"`), `${id} og:url`);
    assert.ok(html.includes(`<title>${escapeText(source.releaseName)}｜μ's Song Database</title>`), `${id} title`);
    assert.ok(html.includes(`<h1 id="releaseName">${escapeText(source.releaseName)}</h1>`), `${id} h1`);
    assert.match(html, /<meta name="description" content="[^"]+">/, id);
    assert.match(html, /<meta property="og:title" content="[^"]+">/, id);
    assert.match(html, /<meta property="og:description" content="[^"]+">/, id);
    // SEO descriptions stay in metadata, not a duplicated visible paragraph.
    // Legitimate release-songs-note explanations must remain untouched.
    assert.doesNotMatch(html, /data-prerender-description\b/, `${id}: visible SEO description must not be generated`);
    validateReleaseBody(parseSerializedHtml(html), source, releaseList, productContents.get(id));
    assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large">/, id);
    assertReleaseDate(html, source);
    if (["R0032", "R0052"].includes(id)) {
      const expected = id === "R0032"
        ? "1期Blu-ray全巻購入特典。1期Blu-ray最終巻発売日基準：2013/09/25。収録情報：ぷわぷわーお！"
        : "2期Blu-ray全巻購入特典。2期Blu-ray最終巻発売日基準：2014/12/25。店舗別の収録情報：CheerDay CheerGirl!、同じ星が見たい、Silent tonight。";
      const metas = parseSerializedHtml(html).nodes.filter(n => n.tag === "meta");
      assert.equal(metas.find(n => n.attrs.name === "description").attrs.content, expected);
      assert.equal(metas.find(n => n.attrs.property === "og:description").attrs.content, expected);
      assert.equal(source.releaseDate, id === "R0032" ? "2013-09-25" : "2014-12-25");
    }
    assert.ok(html.includes(escapeText(source.releaseType || source.classification || "リリース")), `${id} type`);
    if (source.includedSongs?.length) assert.ok(html.includes(escapeText(source.includedSongs[0].displayName || source.includedSongs[0].songName)), `${id} tracks`);
    // Empty/not-applicable/special-held states are verified semantically by
    // validateReleaseBody, never collapsed to the same "no songs" sentence.
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(ld.length, 1, `${id} JSON-LD count`);
    const breadcrumb = JSON.parse(ld[0][1]);
    assert.equal(breadcrumb["@type"], "BreadcrumbList", id);
    assert.equal(breadcrumb.itemListElement.length, 3, id);
    assert.equal(breadcrumb.itemListElement[2].item, canonical, id);
    assert.equal(breadcrumb.itemListElement[2].name, source.releaseName, id);
    assert.ok(!html.includes("http://127.0.0.1"), `${id} local URL leak`);
  }
  assert.equal(hashes.size, 114);
  assert.equal(canonicals.size, 114);
});

test("visible Release dates reject different values and missing dates", () => {
  for (const id of ["R0032", "R0052"]) {
    const source = require(`../data/snapshots/${pointer.revision}/releases/${id}.json`).data;
    const raw = fs.readFileSync(path.join(root, "release", `${id}.html`), "utf8");
    const shown = source.releaseDate.replaceAll("-", "/");
    assert.doesNotThrow(() => assertReleaseDate(raw, source));
    for (const wrong of [shown.replace(/^\d{4}/, "2000"), shown.replace(/\d{2}$/, "01"), "未登録"]) {
      const changed = raw.replace(/(<p[^>]+id="heroMeta"[^>]*>)([\s\S]*?)(<\/p>)/, (_, a, b, c) => a + b.replace(shown, wrong) + c);
      assert.notEqual(changed, raw);
      assert.throws(() => assertReleaseDate(changed, source));
    }
  }
});

test("Release renderer dependencies are scoped to the capture path", () => {
  assert.equal(RELEASE_RENDERER_FILES.length, new Set(RELEASE_RENDERER_FILES).size);
  assert.ok(Object.isFrozen(RELEASE_RENDERER_FILES));
  const excludedImports = new Set(["assets/js/singer-links.js"]);
  for (const file of RELEASE_RENDERER_FILES) {
    assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
    assert.ok((!file.startsWith("data/") || ["data/release-sidecars/R0052.json","data/release-vocals.json","data/release-contents.json","data/release-media-products.json","data/song-credits.json","data/song-youtube.json","data/release-navigation.json","data/release-bluray-products.json","data/release-single-products.json","data/release-album-products.json"].includes(file)) && !file.startsWith("assets/css/"), file);
    const source = fs.readFileSync(path.join(root, file), "utf8");
    if (file.startsWith("assets/js/")) {
      for (const match of source.matchAll(/\bimport\s+(?:[^;]*?\sfrom\s+)?["'](\.\/[^"']+)["']/g)) {
        const dependency = path.posix.join(path.posix.dirname(file), match[1].split("?")[0]);
        assert.ok(RELEASE_RENDERER_FILES.includes(dependency) || excludedImports.has(dependency), `${file}: unreviewed capture dependency ${dependency}`);
      }
    }
    if (file === "release.html") {
      for (const match of source.matchAll(/<script[^>]+src="([^"?]+)/g)) {
        assert.ok(RELEASE_RENDERER_FILES.includes(match[1]), `unreviewed entry script ${match[1]}`);
      }
    }
  }
});

test("Every Release renderer dependency change rejects an unregenerated manifest without changing files", t => {
  const manifest = JSON.parse(fs.readFileSync(htmlManifestPath, "utf8"));
  const current = rendererFingerprint();
  assert.equal(manifest.rendererSha256, current);
  const readFileSync = fs.readFileSync;
  for (const file of RELEASE_RENDERER_FILES) {
    const absolute = path.join(root, file);
    const mock = t.mock.method(fs, "readFileSync", function (filename, ...args) {
      const result = readFileSync.call(this, filename, ...args);
      return filename === absolute ? `${result}\n/* simulated renderer change */\n` : result;
    });
    try {
      const changed = rendererFingerprint();
      assert.notEqual(changed, current, file);
      assert.throws(() => assert.equal(manifest.rendererSha256, changed), { code: "ERR_ASSERTION" }, `${file}: stale manifest must fail`);
    } finally {
      mock.mock.restore();
    }
  }
  assert.equal(rendererFingerprint(), current);
});

test("Release fingerprint ignores checkout line endings and does not read unrelated assets or snapshot data", t => {
  const current = rendererFingerprint();
  const readFileSync = fs.readFileSync;
  const readPaths = [];
  t.mock.method(fs, "readFileSync", function (filename, ...args) {
    readPaths.push(path.relative(root, filename).replace(/\\/g, "/"));
    return readFileSync.call(this, filename, ...args).replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  });
  assert.equal(rendererFingerprint(), current);
  assert.deepEqual(readPaths, [...RELEASE_RENDERER_FILES]);
});

test("Release sitemap uses only static URLs", () => {
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  assert.equal((sitemap.match(/<loc>https:\/\/mus-song-db\.com\/release\/R\d{4}\.html<\/loc>/g) || []).length, 114);
  assert.equal((sitemap.match(/release\.html\?id=/g) || []).length, 0);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 242);
});
