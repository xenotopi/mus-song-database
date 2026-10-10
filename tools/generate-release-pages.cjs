"use strict";

// Snapshot-backed capture of the existing Release Detail renderer.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("../tests/node_modules/playwright");
const { sha256, validateSnapshot } = require("./detail-snapshot-lib.cjs");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

async function generateReleasePages({ revision, ids } = {}) {
  const pointer = JSON.parse(fs.readFileSync(path.join(root, "data/current.json"), "utf8"));
  revision ||= pointer.revision;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", revision, "manifest.json"), "utf8"));
  ids ||= Object.keys(manifest.hashes.releases).sort();
  if (ids.length !== 114 || new Set(ids).size !== 114 || ids.some(id => !/^R\d{4}$/.test(id))) throw new Error("Expected 114 unique Release IDs");
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname === "/data/current.json") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ revision, outputRevision: revision, dataRevision: manifest.dataRevision })); }
    const file = path.resolve(root, pathname.slice(1));
    if (path.relative(root, file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": `${mime[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    if (pathname === "/release.html") return res.end(fs.readFileSync(file, "utf8").replace(/<script data-release-legacy-redirect>[\s\S]*?<\/script>/, ""));
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const pages = [];
    for (const id of ids) {
      const wrapper = JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", revision, "releases", `${id}.json`), "utf8"));
      validateSnapshot("release", id, wrapper, revision, manifest.dataRevision);
      if (sha256(wrapper.data) !== manifest.hashes.releases[id]?.sha256) throw new Error(`${id}: snapshot hash mismatch`);
      const release = wrapper.data;
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.searchParams.get("callback")) return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({ success: true, data: {} })});` });
        return route.abort();
      });
      await page.goto(`${origin}/release.html?id=${id}`);
      await page.waitForFunction(() => !document.getElementById("mainContent").hidden && document.getElementById("status").hidden);
      const name = release.releaseName;
      const date = release.releaseDate || "発売日未登録";
      const type = release.releaseType || release.classification || "リリース";
      const tracks = release.includedSongs || [];
      const trackText = tracks.length ? `収録情報：${tracks.slice(0, 3).map(song => song.displayName || song.songName).join("、")}${tracks.length > 3 ? `ほか${tracks.length - 3}件` : ""}。` : "収録楽曲の登録はありません。";
      const description = `${name}（${date}発売、${type}）の詳細。${trackText}`;
      const title = `${name}｜μ's Song Database`;
      const canonical = `https://mus-song-db.com/release/${id}.html`;
      await page.evaluate(({ id, title, description, canonical }) => {
        document.documentElement.dataset.releaseId = id;
        const base = document.createElement("base"); base.href = "../"; document.head.prepend(base);
        document.title = title;
        const meta = (key, value, property = false) => {
          const attr = property ? "property" : "name";
          let node = document.querySelector(`meta[${attr}="${key}"]`);
          if (!node) { node = document.createElement("meta"); node.setAttribute(attr, key); document.head.append(node); }
          node.content = value;
        };
        meta("description", description);
        meta("robots", "index,follow,max-image-preview:large");
        meta("og:title", title, true);
        meta("og:description", description, true);
        meta("og:url", canonical, true);
        let link = document.querySelector('link[rel="canonical"]');
        if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.append(link); }
        link.href = canonical;
        document.querySelectorAll('script[src*="google"],script[src*="callback"],script[src*="googletagmanager"]').forEach(node => node.remove());
        document.querySelectorAll("[href], [src]").forEach(node => {
          for (const attr of ["href", "src"]) {
            const value = node.getAttribute(attr);
            if (value?.startsWith(location.origin)) node.setAttribute(attr, value.slice(location.origin.length).replace(/^\//, ""));
          }
        });
        document.querySelectorAll(".v46-detail-context, #backToTop").forEach(node => node.remove());
        document.getElementById("musdb-analytics-consent")?.remove();
        document.body.classList.remove("musdb-consent-visible");
        const note = document.createElement("p"); note.className = "release-songs-note"; note.dataset.prerenderDescription = ""; note.textContent = description;
        document.getElementById("mainContent").after(note);
        const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "ホーム", item: "https://mus-song-db.com/" },
          { "@type": "ListItem", position: 2, name: "リリース", item: "https://mus-song-db.com/releases.html" },
          { "@type": "ListItem", position: 3, name: document.getElementById("releaseName").textContent, item: canonical }
        ] };
        const script = document.createElement("script"); script.type = "application/ld+json";
        script.textContent = JSON.stringify(breadcrumb).replace(/</g, "\\u003c"); document.head.append(script);
      }, { id, title, description, canonical });
      const html = (await page.content()).replace(/[\t ]+$/gm, "") + "\n";
      if (await page.locator('link[rel="canonical"]').count() !== 1 || await page.locator("h1").innerText() !== name) throw new Error(`${id}: raw HTML validation failed`);
      if (html.includes("http://127.0.0.1")) throw new Error(`${id}: local URL leaked`);
      pages.push({ id, html, sha256: crypto.createHash("sha256").update(html).digest("hex"), title, description, canonical });
      await page.close();
    }
    fs.mkdirSync(path.join(root, "release"), { recursive: true });
    for (const page of pages) fs.writeFileSync(path.join(root, "release", `${page.id}.html`), page.html);
    fs.writeFileSync(path.join(root, "release", "manifest.json"), JSON.stringify({ schemaVersion: 1, outputRevision: revision, dataRevision: manifest.dataRevision, count: pages.length, pages: Object.fromEntries(pages.map(({ id, html, sha256, canonical }) => [id, { path: `release/${id}.html`, sha256, bytes: Buffer.byteLength(html), canonical }])) }, null, 2) + "\n");
    return pages.map(({ html, ...rest }) => rest);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { generateReleasePages };
if (require.main === module) generateReleasePages().then(pages => console.log(`Generated ${pages.length} Release pages from current snapshot`)).catch(error => { console.error(error); process.exitCode = 1; });
