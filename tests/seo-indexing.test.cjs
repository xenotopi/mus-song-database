"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = "https://xenotopi.github.io/mus-song-database/";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("detail indexing policy and sitemap", async t => {
  const sitemap = read("sitemap.xml");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, "&"));
  const releaseUrls = locations.filter(url => url.startsWith(`${SITE_ROOT}release.html?id=`));
  const songUrls = locations.filter(url => url.startsWith(`${SITE_ROOT}song.html?id=`));

  await t.test("SongとReleaseの初期robotsをindexへ統一", () => {
    for (const file of ["song.html", "release.html"]) {
      assert.match(read(file), /<meta name="robots" content="index,follow,max-image-preview:large">/);
    }
  });

  await t.test("ReleaseのIDなしcanonicalを初期HTMLに残さない", () => {
    assert.doesNotMatch(read("release.html"), /<link rel="canonical"/);
    assert.match(read("release.html"), /assets\/js\/seo-v351\.js/);
  });

  await t.test("SEO helperがReleaseを正式detail routeとして扱う", () => {
    const seo = read("assets/js/seo-v351.js");
    assert.match(seo, /"release\.html"/);
    assert.match(seo, /\^R\\d\{4\}\$/);
    assert.match(seo, /url\.searchParams\.set\("id", id\)/);
  });

  await t.test("sitemap XML構造・URL重複・件数", () => {
    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.equal(new Set(locations).size, locations.length);
    assert.equal(locations.length, 217);
    assert.equal(releaseUrls.length, 90);
    assert.equal(songUrls.length, 117);
  });

  await t.test("Release/Song detail URLは実在ID形式で安定順", () => {
    assert.deepEqual(releaseUrls, Array.from({ length: 90 }, (_, index) => `${SITE_ROOT}release.html?id=R${String(index + 1).padStart(4, "0")}`));
    assert.deepEqual(songUrls, Array.from({ length: 117 }, (_, index) => `${SITE_ROOT}song.html?id=S${String(index + 1).padStart(3, "0")}`));
  });

  await t.test("robots.txtは公開sitemapを参照", () => {
    assert.match(read("robots.txt"), new RegExp(`Sitemap:\\s*${SITE_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}sitemap\\.xml`));
  });
});
