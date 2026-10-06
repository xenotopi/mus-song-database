"use strict";

// Snapshot-only generation: reuse the real Song renderer, not a second UI implementation.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("../tests/node_modules/playwright");
const root = path.resolve(__dirname, "..");
const { sha256, validateSnapshot } = require("./detail-snapshot-lib.cjs");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
function rendererFingerprint() {
  const files = ["song.html", "tools/generate-song-pages.cjs", ...["assets/js", "assets/css"].flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(file => /\.(js|css)$/.test(file)).map(file => `${dir}/${file}`))].sort();
  return sha256(files.map(file => `${file}\n${fs.readFileSync(path.join(root, file), "utf8")}`).join("\n"));
}

async function generateSongPages({ revision, ids } = {}) {
  const pointer = JSON.parse(fs.readFileSync(path.join(root, "data/current.json"), "utf8"));
  revision ||= pointer.revision;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", revision, "manifest.json"), "utf8"));
  const current = { revision, outputRevision: manifest.outputRevision || revision, dataRevision: manifest.dataRevision || revision };
  ids ||= Object.keys(manifest.hashes.songs).sort();
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !/^S\d{3}$/.test(id))) throw new Error("Invalid Song ID set");
  if (ids.length !== 3 && ids.length !== 117) throw new Error("Expected complete 117 Songs or 3-song PoC");
  const pages = [];
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname === "/data/current.json") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(current)); }
    const file = path.resolve(root, pathname.slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    if (pathname === "/song.html") return res.end(fs.readFileSync(file, "utf8").replace(/<script data-song-legacy-redirect>[\s\S]*?<\/script>/, ""));
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const started = Date.now();
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const id of ids) {
      const wrapper = JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", current.revision, "songs", `${id}.json`), "utf8"));
      validateSnapshot("song", id, wrapper, revision, current.dataRevision);
      if (sha256(wrapper.data) !== manifest.hashes.songs[id]?.sha256) throw new Error(`${id}: snapshot hash mismatch`);
      const song = wrapper.data;
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        // Discover is not part of Song snapshots. Do not fetch or invent Discover facts.
        if (url.searchParams.get("callback")) return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({ success: true, data: url.searchParams.get("action") === "revision" ? current : {} })});` });
        return route.abort();
      });
      await page.goto(`${origin}/song.html?id=${id}`);
      await page.waitForFunction(() => !document.getElementById("mainContent").hidden && document.getElementById("status").hidden);
      const dates = song.performances.map(p => p.date).filter(Boolean).sort();
      const title = `${song.displayName || song.songName}｜μ's Song Database`;
      const description = `${song.displayName || song.songName}の発売・収録情報と歌唱記録。発売日${song.releaseDate || "未登録"}、歌唱記録${song.performances.length}件。${dates.length ? `現行DBの初回歌唱日${dates[0]}、最終歌唱日${dates.at(-1)}。` : "現行DBに歌唱記録はありません。"}`;
      const canonical = `https://mus-song-db.com/song/${id}.html`;
      await page.evaluate(({ id, title, description, canonical, revision }) => {
        document.documentElement.dataset.songId = id;
        document.documentElement.dataset.prerenderRevision = revision;
        const base = document.createElement("base"); base.setAttribute("href", "../"); document.head.prepend(base);
        document.title = title;
        const meta = (key, value, property = false) => {
          const attr = property ? "property" : "name";
          let node = document.querySelector(`meta[${attr}="${key}"]`);
          if (!node) { node = document.createElement("meta"); node.setAttribute(attr, key); document.head.append(node); }
          node.content = value;
        };
        meta("description", description);
        for (const prefix of ["og", "twitter"]) {
          meta(`${prefix}:title`, title, prefix === "og");
          meta(`${prefix}:description`, description, prefix === "og");
        }
        meta("og:url", canonical, true);
        let link = document.querySelector('link[rel="canonical"]');
        if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.append(link); }
        link.href = canonical;
        document.querySelectorAll('a[href^="#"]').forEach(a => a.setAttribute("href", `song/${id}.html${a.getAttribute("href")}`));
        document.querySelectorAll('script[src*="google"], script[src*="callback"], script[src*="googletagmanager"]').forEach(n => n.remove());
        document.querySelectorAll('script[type="application/ld+json"]').forEach(n => n.remove());
        document.querySelectorAll("[href], [src]").forEach(node => {
          for (const attr of ["href", "src"]) {
            const value = node.getAttribute(attr);
            if (value?.startsWith(location.origin)) node.setAttribute(attr, value.slice(location.origin.length).replace(/^\//, ""));
          }
        });
        // Runtime-only fixed bars/header/footer are rebuilt by the shared helpers.
        document.querySelectorAll(".v46-detail-context, #backToTop").forEach(n => n.remove());
        document.getElementById("musdb-analytics-consent")?.remove();
        document.body.classList.remove("musdb-consent-visible");
        document.getElementById("songShareActions").hidden = true;
        // These features require live Discover data; empty mocks must not become published facts.
        for (const id of ["songSwitcher", "discoverySection", "songInsightsSection"]) document.getElementById(id).hidden = true;
        // Explicitly expose the ID and a factual description without changing the UI design.
        document.getElementById("heroMeta").textContent = `${id} ｜ ${document.getElementById("heroMeta").textContent}`;
        const note = document.createElement("p"); note.className = "detail-note"; note.dataset.prerenderDescription = ""; note.textContent = description;
        document.getElementById("songInfo").after(note);
      }, { id, title, description, canonical, revision: current.revision });
      const html = (await page.content()).replace(/[\t ]+$/gm, "") + "\n";
      if (await page.locator('link[rel="canonical"]').count() !== 1 || await page.locator("h1").innerText() !== (song.displayName || song.songName)) throw new Error(`${id}: rendered HTML validation failed`);
      if (html.includes("http://127.0.0.1") || html.includes("undefined件")) throw new Error(`${id}: runtime data leak`);
      pages.push({ id, html, title, description, canonical, hash: crypto.createHash("sha256").update(html).digest("hex") });
      await page.close();
    }
    // No output is replaced until every page has rendered and validated successfully.
    fs.mkdirSync(path.join(root, "song"), { recursive: true });
    for (const page of pages) fs.writeFileSync(path.join(root, "song", `${page.id}.html`), page.html);
    const outputManifest = {
      schemaVersion: 1, outputRevision: revision, dataRevision: current.dataRevision,
      source: "song-snapshot-and-existing-renderer", count: pages.length,
      rendererSha256: rendererFingerprint(),
      pages: Object.fromEntries(pages.map(page => [page.id, { path: `song/${page.id}.html`, sha256: page.hash, bytes: Buffer.byteLength(page.html), canonical: page.canonical }]))
    };
    fs.writeFileSync(path.join(root, "song/manifest.json"), JSON.stringify(outputManifest, null, 2) + "\n");
    console.log(`Generated ${ids.length} Song pages in ${Date.now() - started}ms; source ${revision}; no API requests.`);
    return outputManifest;
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
module.exports = { generateSongPages, rendererFingerprint };
if (require.main === module) {
  const revisionIndex = process.argv.indexOf("--revision");
  generateSongPages({ revision: revisionIndex >= 0 ? process.argv[revisionIndex + 1] : undefined }).catch(error => { console.error(error); process.exitCode = 1; });
}
