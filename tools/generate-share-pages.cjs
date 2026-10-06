"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sha256 } = require("./detail-snapshot-lib.cjs");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mus-song-db.com/";
const IMAGE = new URL("assets/images/og-default-v2.png", SITE).href;
const revision = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current.json"), "utf8")).revision;
const args = process.argv.slice(2);
const all = args.includes("--all");
const check = args.includes("--check");
const selection = args.filter(arg => arg !== "--check");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots", revision, "manifest.json"), "utf8"));
if (manifest.revision !== revision) throw new Error("Snapshot manifest revision mismatch");
const targets = [];

if (all) {
  if (selection.length !== 1 || manifest.counts?.songs !== 117 || manifest.counts?.events !== 353) {
    throw new Error("--all requires the complete current Song 117 / Event 353 snapshot");
  }
  for (const [type, count, pattern] of [["song", 117, /^S\d+$/], ["event", 353, /^EV\d+$/]]) {
    const ids = Object.keys(manifest.hashes?.[`${type}s`] || {}).sort();
    const files = fs.readdirSync(path.join(ROOT, "data/snapshots", revision, `${type}s`)).filter(name => name.endsWith(".json"));
    if (ids.length !== count || files.length !== count || ids.some(id => !pattern.test(id) || !files.includes(`${id}.json`))) {
      throw new Error(`${type}: incomplete snapshot set`);
    }
    targets.push(...ids.map(id => ({ type, id })));
  }
} else {
  for (let i = 0; i < selection.length; i += 2) {
    const type = selection[i];
    const id = selection[i + 1];
    if (!(type === "--song" || type === "--event") || !id || id.startsWith("--")) {
      throw new Error("Usage: --all [--check] or --song S003 --event EV0001 ...");
    }
    if (!(type === "--song" ? /^S\d+$/.test(id) : /^EV\d+$/.test(id))) throw new Error(`Invalid ID: ${id}`);
    targets.push({ type: type.slice(2), id });
  }
}
if (!targets.length || new Set(targets.map(item => `${item.type}/${item.id}`)).size !== targets.length) {
  throw new Error("Song/Event IDs must be distinct");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function pageFor(type, id) {
  const source = path.join(ROOT, "data/snapshots", revision, `${type}s`, `${id}.json`);
  const wrapper = JSON.parse(fs.readFileSync(source, "utf8"));
  if (wrapper.snapshot?.revision !== revision) throw new Error(`${id}: snapshot revision mismatch`);
  if (sha256(wrapper.data) !== manifest.hashes?.[`${type}s`]?.[id]?.sha256) throw new Error(`${id}: snapshot hash mismatch`);
  const data = type === "song" ? wrapper.data : wrapper.data?.event;
  if (data?.[type === "song" ? "songId" : "eventId"] !== id) throw new Error(`${id}: snapshot ID mismatch`);

  const name = type === "song" ? data.displayName || data.songName : data.eventName;
  if (!name) throw new Error(`${id}: missing name`);
  const title = `${name}｜μ's Song Database`;
  const description = type === "song"
    ? `${name}の歌唱記録をμ's Song Databaseで見る。`
    : [data.date && `${data.date}開催`, data.venue?.venueName && `会場：${data.venue.venueName}`, `${name}の歌唱記録をμ's Song Databaseで見る。`].filter(Boolean).join("。").replace(/。。/g, "。");
  const detail = new URL(type === "song" ? `song/${id}.html` : `${type}.html?id=${id}`, SITE).href;
  const share = new URL(`share/${type}/${id}.html`, SITE).href;
  const safeDetail = escapeHtml(detail);
  const safeShare = escapeHtml(share);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(IMAGE);
  const redirect = JSON.stringify(detail).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="${safeDetail}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeShare}">
  <meta property="og:image" content="${safeImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImage}">
</head>
<body>
  <main><p><a href="${safeDetail}">${escapeHtml(name)}の詳細を見る</a></p></main>
  <script>location.replace(${redirect});</script>
</body>
</html>
`;
}

const pages = targets.map(({ type, id }) => ({ type, id, html: pageFor(type, id) }));
for (const { type, id, html } of pages) {
  const output = path.join(ROOT, "share", type, `${id}.html`);
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== html) throw new Error(`${type}/${id}: generated HTML mismatch`);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, html, "utf8");
  }
}
process.stdout.write(`share pages ${check ? "checked" : "generated"}: Song ${pages.filter(item => item.type === "song").length}, Event ${pages.filter(item => item.type === "event").length}\n`);
