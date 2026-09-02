"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(__dirname, "active-entrypoints.json");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

const EXPECTED_PAGES = Object.freeze([
  "404.html",
  "about.html",
  "event.html",
  "events.html",
  "gap-checker.html",
  "index.html",
  "rankings.html",
  "search.html",
  "singer.html",
  "singers.html",
  "song.html",
  "songs.html",
  "statistics.html",
  "venue.html",
  "venues.html"
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function decodeHtmlUrl(value) {
  return String(value || "").replace(/&amp;/g, "&");
}

function resolveLocalReference(fromFile, rawReference) {
  const reference = decodeHtmlUrl(rawReference).trim();
  if (!reference || /^(?:[a-z]+:)?\/\//i.test(reference) || /^(?:data|mailto):/i.test(reference)) {
    return null;
  }
  const cleanReference = reference.split(/[?#]/, 1)[0];
  if (!cleanReference) return null;
  const absolute = cleanReference.startsWith("/")
    ? path.resolve(ROOT, cleanReference.slice(1))
    : path.resolve(ROOT, path.dirname(fromFile), cleanReference);
  const relative = path.relative(ROOT, absolute);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${fromFile}: リポジトリ外参照 ${reference}`);
  return toPosix(relative);
}

function unique(values) {
  return [...new Set(values)];
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function extractImportReferences(source) {
  const references = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) references.push(match[1]);
  });
  return unique(references);
}

function extractHtmlEntrypoints(htmlFile) {
  const source = fs.readFileSync(path.join(ROOT, htmlFile), "utf8");
  const js = [];
  const css = [];
  for (const match of source.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gis)) {
    const reference = resolveLocalReference(htmlFile, match[2]);
    if (reference && reference.endsWith(".js")) js.push(reference);
  }
  for (const match of source.matchAll(/<link\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gis)) {
    const reference = resolveLocalReference(htmlFile, match[2]);
    if (reference && reference.endsWith(".css")) css.push(reference);
  }
  extractImportReferences(source).forEach((rawReference) => {
    const reference = resolveLocalReference(htmlFile, rawReference);
    if (reference && reference.endsWith(".js")) js.push(reference);
  });
  return { js: unique(js), css: unique(css) };
}

function extractJavaScriptDependencies(jsFile) {
  const source = fs.readFileSync(path.join(ROOT, jsFile), "utf8");
  return extractImportReferences(source)
    .map((reference) => resolveLocalReference(jsFile, reference))
    .filter((reference) => reference && reference.endsWith(".js"));
}

function extractJavaScriptCss(jsFile) {
  const source = fs.readFileSync(path.join(ROOT, jsFile), "utf8");
  const references = [];
  for (const match of source.matchAll(/new\s+URL\(\s*["']([^"']+\.css(?:[?#][^"']*)?)["']\s*,\s*import\.meta\.url\s*\)/g)) {
    references.push(resolveLocalReference(jsFile, match[1]));
  }
  return references.filter(Boolean);
}

function discoverActiveJavaScript() {
  const queue = Object.keys(manifest.pages).flatMap((page) => extractHtmlEntrypoints(page).js);
  const active = new Set();
  while (queue.length > 0) {
    const jsFile = queue.shift();
    if (active.has(jsFile)) continue;
    assert.ok(isFile(path.join(ROOT, jsFile)), `JavaScript参照切れ: ${jsFile}`);
    active.add(jsFile);
    queue.push(...extractJavaScriptDependencies(jsFile));
  }
  return [...active].sort();
}

test("主要HTMLがすべて存在する", () => {
  assert.deepEqual(Object.keys(manifest.pages).sort(), [...EXPECTED_PAGES].sort());
  EXPECTED_PAGES.forEach((page) => assert.ok(isFile(path.join(ROOT, page)), `HTMLなし: ${page}`));
});

test("HTMLのローカルJS/CSS参照が存在し、entrypoint一覧と一致する", () => {
  Object.entries(manifest.pages).forEach(([page, expected]) => {
    const actual = extractHtmlEntrypoints(page);
    assert.deepEqual(actual.js, expected.js, `${page}: JavaScript entrypoint不一致`);
    assert.deepEqual(actual.css, expected.css, `${page}: CSS entrypoint不一致`);
    [...actual.js, ...actual.css].forEach((asset) => {
      assert.ok(isFile(path.join(ROOT, asset)), `${page}: ローカル参照切れ ${asset}`);
    });
  });
});

test("active JavaScriptの再帰importが存在し、一覧と一致する", () => {
  const actual = discoverActiveJavaScript();
  assert.deepEqual(actual, [...manifest.activeJavaScript].sort());
});

test("active CSSの直接・動的参照が存在し、一覧と一致する", () => {
  const directCss = Object.keys(manifest.pages).flatMap((page) => extractHtmlEntrypoints(page).css);
  const dynamicCss = manifest.activeJavaScript.flatMap(extractJavaScriptCss);
  const actual = unique([...directCss, ...dynamicCss]).sort();
  assert.deepEqual(actual, [...manifest.activeCss].sort());
  actual.forEach((cssFile) => assert.ok(isFile(path.join(ROOT, cssFile)), `CSS参照切れ: ${cssFile}`));
});

test("active JavaScriptがnode --checkを通る", () => {
  discoverActiveJavaScript().forEach((jsFile) => {
    const result = spawnSync(process.execPath, ["--check", path.join(ROOT, jsFile)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${jsFile}: JavaScript構文エラー\n${result.stderr}`);
  });
});

test("Todayの日付判定はJST 0時で切り替わる", async () => {
  const modulePath = path.join(ROOT, "assets/js/home-date-v493.js");
  const source = fs.readFileSync(modulePath, "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { getJstDateKey, getMillisecondsUntilNextJstDay, isHomeResponseForJstDate } = await import(moduleUrl);

  const beforeMidnight = new Date("2026-08-31T14:59:59.000Z");
  const atMidnight = new Date("2026-08-31T15:00:00.000Z");
  assert.equal(getJstDateKey(beforeMidnight), "2026-08-31");
  assert.equal(getJstDateKey(atMidnight), "2026-09-01");
  assert.equal(getMillisecondsUntilNextJstDay(beforeMidnight.getTime()), 1000);

  const currentResponse = { data: { today: { dateKey: "2026-09-01" } } };
  const previousResponse = { data: { today: { dateKey: "2026-08-31" } } };
  assert.equal(isHomeResponseForJstDate(currentResponse, atMidnight), true);
  assert.equal(isHomeResponseForJstDate(previousResponse, atMidnight), false);
  assert.equal(isHomeResponseForJstDate({ data: { today: {} } }, atMidnight), false);
});
