"use strict";

// Snapshot-backed capture of the existing Release Detail renderer.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("../tests/node_modules/playwright");
const { sha256, validateSnapshot, validateEventSnapshot, validateKamiparaDashboard } = require("./detail-snapshot-lib.cjs");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

// Code that produces/validates the serialized DOM on the query-URL capture path.
// External CSS is not inlined. Amazon's pathname-only branch and interactive
// search's singer-links helper do not run during capture. Snapshot data has its
// own revision/hash guards and must not be included in this renderer hash.
const RELEASE_RENDERER_FILES = Object.freeze([
  "release.html",
  "tools/generate-release-pages.cjs",
  "tools/detail-snapshot-lib.cjs",
  "assets/js/release-v500.js",
  "assets/js/release-kamipara.js",
  "assets/js/static-detail.js",
  "assets/js/api.js",
  "assets/js/common.js",
  "assets/js/icons.js",
  "assets/js/analytics.js",
  "assets/js/seo-v351.js"
].sort());

function rendererFingerprint() {
  // Normalize checkout line endings so Windows and CI hash the same source.
  return sha256(RELEASE_RENDERER_FILES.map(file =>
    `${file}\n${fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")}`
  ).join("\n"));
}

function loadKamiparaCaptureData(snapshotRoot, manifest, revision) {
  const wrapper = JSON.parse(fs.readFileSync(path.join(snapshotRoot, "kamipara-dashboard.json"), "utf8"));
  if (manifest.revision !== revision || (manifest.outputRevision && manifest.outputRevision !== revision) ||
      wrapper.snapshot?.revision !== revision || (wrapper.snapshot.outputRevision && wrapper.snapshot.outputRevision !== revision) ||
      wrapper.snapshot.dataRevision !== manifest.dataRevision) throw new Error("Kamipara snapshot revision mismatch");
  const dashboard = validateKamiparaDashboard(wrapper.data, manifest.dataRevision);
  if (sha256(dashboard) !== manifest.kamiparaDashboard?.sha256) throw new Error("Kamipara snapshot hash mismatch");
  const wanted = new Set(dashboard.events.map(event => event.venueId).filter(Boolean));
  const venues = new Map();
  // Only use verified venue records embedded in this generation's Event snapshots.
  // A venue absent from those snapshots stays unnamed; never consult the live API.
  for (const [id, entry] of Object.entries(manifest.hashes.events || {})) {
    const eventWrapper = JSON.parse(fs.readFileSync(path.join(snapshotRoot, "events", `${id}.json`), "utf8"));
    const venue = eventWrapper.data?.event?.venue;
    if (!wanted.has(venue?.venueId) || !venue.venueName) continue;
    validateEventSnapshot(id, eventWrapper, revision, manifest.dataRevision);
    if (sha256(eventWrapper.data) !== entry.sha256) throw new Error(`${id}: venue source hash mismatch`);
    if (venues.has(venue.venueId) && venues.get(venue.venueId).venueName !== venue.venueName) throw new Error(`${venue.venueId}: conflicting snapshot venue names`);
    venues.set(venue.venueId, { venueId: venue.venueId, venueName: venue.venueName });
  }
  return { dashboard, venues };
}

function captureJsonpData(url, kamipara) {
  if (url.searchParams.get("action") === "kamiparaDashboard") return kamipara.dashboard;
  if (url.searchParams.get("action") === "venue") return kamipara.venues.get(url.searchParams.get("id")) || {};
  return {};
}

async function validateKamiparaCapture(page) {
  await page.waitForFunction(() => document.querySelector(".release-inclusion-error, .release-kp-retry") ||
    (!document.getElementById("kamiparaHistorySection")?.hidden && document.querySelectorAll(".release-kp-song").length > 0));
  const state = await page.evaluate(() => ({
    errors: document.querySelectorAll(".release-inclusion-error, .release-kp-retry").length,
    songs: document.querySelectorAll(".release-kp-song").length,
    tracks: [...document.querySelectorAll(".release-kp-track")].map(node => node.textContent.trim()),
    events: document.querySelectorAll("#kamiparaHistory .release-kp-event").length,
    performances: document.querySelectorAll("#kamiparaHistory .release-kp-performance").length,
    historyVisible: document.getElementById("kamiparaHistorySection")?.hidden === false,
    dashboardVisible: document.getElementById("kamiparaDashboardSection")?.hidden === false
  }));
  if (state.errors || state.songs !== 10 || state.events !== 5 || state.performances !== 10 ||
      !state.historyVisible || !state.dashboardVisible ||
      state.tracks.join(",") !== "01,02,03,04,05,06,07,08,09,10") {
    throw new Error(`R0072: invalid Kamipara capture ${JSON.stringify(state)}`);
  }
  return state;
}

async function generateReleasePages({ revision, ids } = {}) {
  const rendererSha256 = rendererFingerprint();
  const pointer = JSON.parse(fs.readFileSync(path.join(root, "data/current.json"), "utf8"));
  revision ||= pointer.revision;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data/snapshots", revision, "manifest.json"), "utf8"));
  ids ||= Object.keys(manifest.hashes.releases).sort();
  if (ids.length !== 114 || new Set(ids).size !== 114 || ids.some(id => !/^R\d{4}$/.test(id))) throw new Error("Expected 114 unique Release IDs");
  const kamipara = loadKamiparaCaptureData(path.join(root, "data/snapshots", revision), manifest, revision);
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
        if (url.searchParams.get("callback")) return route.fulfill({ contentType: "text/javascript", body: `${url.searchParams.get("callback")}(${JSON.stringify({ success: true, data: captureJsonpData(url, kamipara) })});` });
        return route.abort();
      });
      await page.goto(`${origin}/release.html?id=${id}`);
      await page.waitForFunction(() => !document.getElementById("mainContent").hidden && document.getElementById("status").hidden);
      if (id === "R0072") await validateKamiparaCapture(page);
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
    if (rendererFingerprint() !== rendererSha256) throw new Error("Release renderer changed during capture; regenerate from stable sources");
    fs.mkdirSync(path.join(root, "release"), { recursive: true });
    for (const page of pages) fs.writeFileSync(path.join(root, "release", `${page.id}.html`), page.html);
    fs.writeFileSync(path.join(root, "release", "manifest.json"), JSON.stringify({ schemaVersion: 1, outputRevision: revision, dataRevision: manifest.dataRevision, rendererSha256, count: pages.length, pages: Object.fromEntries(pages.map(({ id, html, sha256, canonical }) => [id, { path: `release/${id}.html`, sha256, bytes: Buffer.byteLength(html), canonical }])) }, null, 2) + "\n");
    return pages.map(({ html, ...rest }) => rest);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { generateReleasePages, loadKamiparaCaptureData, captureJsonpData, validateKamiparaCapture, rendererFingerprint, RELEASE_RENDERER_FILES };
if (require.main === module) generateReleasePages().then(pages => console.log(`Generated ${pages.length} Release pages from current snapshot`)).catch(error => { console.error(error); process.exitCode = 1; });
