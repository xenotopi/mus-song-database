"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mus-song-db.com/";
const IMAGE = new URL("assets/images/og-default-v2.png", SITE).href;
const revision = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current.json"), "utf8")).revision;
const args = process.argv.slice(2);
const targets = [];

for (let i = 0; i < args.length; i += 2) {
  const type = args[i];
  const id = args[i + 1];
  if (!(["--song", "--event"].includes(type) && id && !id.startsWith("--"))) {
    throw new Error("Usage: node tools/generate-share-pages.cjs --song S003 --event EV0001 ...");
  }
  if (!(type === "--song" ? /^S\d+$/.test(id) : /^EV\d+$/.test(id))) throw new Error(`Invalid ID: ${id}`);
  targets.push({ type: type.slice(2), id });
}
if (!targets.length || targets.length > 4 || new Set(targets.map(item => `${item.type}/${item.id}`)).size !== targets.length) {
  throw new Error("Prototype requires 1–4 distinct Song/Event IDs");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function pageFor(type, id) {
  const source = path.join(ROOT, "data/snapshots", revision, `${type}s`, `${id}.json`);
  const wrapper = JSON.parse(fs.readFileSync(source, "utf8"));
  if (wrapper.snapshot?.revision !== revision) throw new Error(`${id}: snapshot revision mismatch`);
  const data = type === "song" ? wrapper.data : wrapper.data?.event;
  if (data?.[type === "song" ? "songId" : "eventId"] !== id) throw new Error(`${id}: snapshot ID mismatch`);

  const name = type === "song" ? data.displayName || data.songName : data.eventName;
  if (!name) throw new Error(`${id}: missing name`);
  const title = `${name}｜μ's Song Database`;
  const description = type === "song"
    ? `${name}の歌唱記録をμ's Song Databaseで見る。`
    : [data.date && `${data.date}開催`, data.venue?.venueName && `会場：${data.venue.venueName}`, `${name}の歌唱記録をμ's Song Databaseで見る。`].filter(Boolean).join("。").replace(/。。/g, "。");
  const detail = new URL(`${type}.html?id=${id}`, SITE).href;
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

for (const { type, id } of targets) {
  const output = path.join(ROOT, "share", type, `${id}.html`);
  const html = pageFor(type, id);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html, "utf8");
  process.stdout.write(`${path.relative(ROOT, output).replace(/\\/g, "/")}\n`);
}
