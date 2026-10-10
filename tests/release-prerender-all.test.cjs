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
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function escapeText(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

test("Release prerender 114 raw HTML", () => {
  const manifest = JSON.parse(fs.readFileSync(htmlManifestPath, "utf8"));
  const ids = Object.keys(snapshotManifest.hashes.releases).sort();
  assert.equal(ids.length, 114);
  assert.deepEqual(Object.keys(manifest.pages).sort(), ids);
  assert.equal(manifest.count, 114);
  assert.equal(manifest.outputRevision, pointer.revision);
  const hashes = new Set();
  const canonicals = new Set();
  for (const id of ids) {
    const source = require(`../data/snapshots/${pointer.revision}/releases/${id}.json`).data;
    const html = fs.readFileSync(path.join(root, "release", `${id}.html`), "utf8");
    const canonical = `https://mus-song-db.com/release/${id}.html`;
    hashes.add(sha256(html)); canonicals.add(canonical);
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
    assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large">/, id);
    assert.ok(html.includes(source.releaseDate || "発売日未登録"), `${id} date`);
    assert.ok(html.includes(escapeText(source.releaseType || source.classification || "リリース")), `${id} type`);
    if (source.includedSongs?.length) assert.ok(html.includes(escapeText(source.includedSongs[0].displayName || source.includedSongs[0].songName)), `${id} tracks`);
    else assert.ok(html.includes("収録楽曲の登録はありません") || html.includes("収録情報を確認中"), `${id} empty coverage`);
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

test("Release sitemap uses only static URLs", () => {
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  assert.equal((sitemap.match(/<loc>https:\/\/mus-song-db\.com\/release\/R\d{4}\.html<\/loc>/g) || []).length, 114);
  assert.equal((sitemap.match(/release\.html\?id=/g) || []).length, 0);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 241);
});
