"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SITE_ROOT = "https://xenotopi.github.io/mus-song-database/";
const STATIC_PATHS = [
  "",
  "songs.html",
  "releases.html",
  "events.html",
  "venues.html",
  "singers.html",
  "rankings.html",
  "statistics.html",
  "about.html",
  "gap-checker.html"
];

function activeApiUrl() {
  const source = fs.readFileSync(path.join(ROOT, "assets", "js", "api.js"), "utf8");
  const match = source.match(/export\s+const\s+API_URL\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error("assets/js/api.jsからPublic API URLを取得できません。");
  return match[1];
}

async function fetchApi(action, params = {}) {
  const url = new URL(activeApiUrl());
  url.searchParams.set("action", action);
  url.searchParams.set("fresh", "1");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${action}: HTTP ${response.status}`);
  const json = await response.json();
  if (!json.success) throw new Error(`${action}: ${json.error?.message || "API error"}`);
  return json.data;
}

function uniqueSortedIds(values, pattern, label) {
  const ids = values.map(value => String(value || "").trim());
  const invalid = ids.filter(id => !pattern.test(id));
  if (invalid.length) throw new Error(`${label}: 不正ID ${invalid.join(", ")}`);
  const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b, "en"));
  if (unique.length !== ids.length) throw new Error(`${label}: ID重複があります。`);
  return unique;
}

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildXml(urls) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.flatMap(url => ["  <url>", `    <loc>${escapeXml(url)}</loc>`, "  </url>"]),
    "</urlset>",
    ""
  ].join("\n");
}

async function main() {
  const [releases, rankings] = await Promise.all([
    fetchApi("releaseList"),
    fetchApi("rankings", { limit: 1000, schema: "4.2.1" })
  ]);
  const releaseIds = uniqueSortedIds(releases.map(item => item.releaseId), /^R\d{4}$/, "Release");
  const songIds = uniqueSortedIds((rankings.songs || []).map(item => item.songId), /^S\d+$/, "Song");
  if (releaseIds.length !== 90) throw new Error(`Release件数: expected 90, actual ${releaseIds.length}`);
  if (songIds.length !== 117) throw new Error(`Song件数: expected 117, actual ${songIds.length}`);

  const urls = [
    ...STATIC_PATHS.map(value => new URL(value, SITE_ROOT).toString()),
    ...releaseIds.map(id => `${SITE_ROOT}release.html?id=${id}`),
    ...songIds.map(id => `${SITE_ROOT}song.html?id=${id}`)
  ];
  if (new Set(urls).size !== urls.length) throw new Error("sitemap URL重複があります。");

  const target = path.join(ROOT, "sitemap.xml");
  const xml = buildXml(urls);
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== xml) {
      throw new Error("sitemap.xmlが正式データと一致しません。generate-sitemapを実行してください。");
    }
  } else {
    fs.writeFileSync(target, xml, "utf8");
  }
  console.log(`sitemap: ${urls.length} URLs (Release ${releaseIds.length}, Song ${songIds.length})`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
