"use strict";

// Artifact inspection only. Never import the snapshot CLI (it executes on import),
// run a generator, infer a capture receipt, or repair a manifest/hash here.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { sha256, canonicalJson, validateSnapshot, validateEventSnapshot, validateKamiparaDashboard } = require("./detail-snapshot-lib.cjs");
const { validateMemberAnalytics } = require("./member-analytics-lib.cjs");
const songGenerator = require("./generate-song-pages.cjs");
const releaseGenerator = require("./generate-release-pages.cjs");
const { parseUniqueJson, parseSerializedHtml, descendants, textContent, visible, hasClass, requireCondition: check } = require("./static-html-readonly-lib.cjs");
const ROOT = path.resolve(__dirname, "..");
const REVISION = /^sha256-[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const COUNTS = { song: 117, release: 114 };
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const equal = (a, b, message) => check(canonicalJson(a) === canonicalJson(b), message);
const formatDate = value => value ? String(value).replaceAll("-", "/") : "—";
const classes = (node, name) => descendants(node, n => hasClass(n, name));
const cleanText = node => textContent(node).trim();

function exactIds(actual, expected, label) {
  check(Array.isArray(actual) && new Set(actual).size === actual.length, `${label}: duplicate IDs`);
  equal([...actual].sort(), [...expected].sort(), `${label}: incomplete/extra ID set`);
}
function one(nodes, message) { check(nodes.length === 1, message); return nodes[0]; }
function byId(doc, id, mustBeVisible = true) {
  const node = doc.ids.get(id);
  check(node && (!mustBeVisible || visible(node)), `${id}: missing/hidden body identifier`);
  return node;
}
function infoValues(node) {
  const labels = descendants(node, n => n.tag === "dt").map(cleanText);
  const values = descendants(node, n => n.tag === "dd").map(cleanText);
  check(labels.length === values.length && new Set(labels).size === labels.length, "Invalid basic-information list");
  return Object.fromEntries(labels.map((label, index) => [label, values[index]]));
}

function songDescription(song) {
  const dates = song.performances.map(p => p.date).filter(Boolean).sort();
  return `${song.displayName || song.songName}の発売・収録情報と歌唱記録。発売日${song.releaseDate || "未登録"}、歌唱記録${song.performances.length}件。${dates.length ? `現行DBの初回歌唱日${dates[0]}、最終歌唱日${dates.at(-1)}。` : "現行DBに歌唱記録はありません。"}`;
}
function releaseDescription(release) {
  const tracks = release.includedSongs;
  const content = tracks.length ? `収録情報：${tracks.slice(0, 3).map(s => s.displayName || s.songName).join("、")}${tracks.length > 3 ? `ほか${tracks.length - 3}件` : ""}。` : "収録楽曲の登録はありません。";
  return `${release.releaseName}（${release.releaseDate || "発売日未登録"}発売、${release.releaseType || release.classification || "リリース"}）の詳細。${content}`;
}

function validateHead(doc, type, id, data, revision) {
  const head = one(doc.html.children.filter(n => n.tag === "head"), "Missing head");
  const name = type === "song" ? data.displayName || data.songName : data.releaseName;
  const title = `${name}｜μ's Song Database`;
  const description = type === "song" ? songDescription(data) : releaseDescription(data);
  const canonical = `https://mus-song-db.com/${type}/${id}.html`;
  check(doc.html.attrs[`data-${type}-id`] === id, "HTML ID differs from snapshot");
  if (type === "song") check(doc.html.attrs["data-prerender-revision"] === revision, "HTML prerender revision mismatch");
  const h1 = one(doc.nodes.filter(n => n.tag === "h1"), "Missing/duplicate h1");
  check(visible(h1) && cleanText(h1) === name, "HTML h1 differs from snapshot");
  const titles = doc.nodes.filter(n => n.tag === "title");
  check(one(titles, "Missing/duplicate title").parent === head && cleanText(titles[0]) === title, "HTML title mismatch");
  const links = doc.nodes.filter(n => n.tag === "link" && (n.attrs.rel || "").split(/\s+/).includes("canonical"));
  const link = one(links, "Missing/duplicate canonical");
  check(link.parent === head && link.attrs.href === canonical, "Self-canonical mismatch");
  const base = one(doc.nodes.filter(n => n.tag === "base"), "Missing/duplicate base");
  check(base.parent === head && base.attrs.href === "../", "Static base URL mismatch");
  for (const [attr, key, value] of [["name", "description", description], ["property", "og:title", title],
    ["property", "og:description", description], ["property", "og:url", canonical], ["name", "robots", "index,follow,max-image-preview:large"]]) {
    const meta = one(doc.nodes.filter(n => n.tag === "meta" && n.attrs[attr] === key), `Missing/duplicate ${key}`);
    check(meta.parent === head && meta.attrs.content === value, `${key}: SEO value differs from snapshot`);
  }
  if (type === "song") for (const [key, value] of [["twitter:title", title], ["twitter:description", description]]) {
    const meta = one(doc.nodes.filter(n => n.tag === "meta" && n.attrs.name === key), `Missing/duplicate ${key}`);
    check(meta.parent === head && meta.attrs.content === value, `${key}: value mismatch`);
  }
  const scripts = doc.nodes.filter(n => n.tag === "script" && n.attrs.type === "application/ld+json");
  check(scripts.length === (type === "song" ? 2 : 1) && scripts.every(n => n.parent === head), "JSON-LD count/location mismatch");
  const ld = scripts.map(n => parseUniqueJson(textContent(n)));
  const breadcrumb = ld.find(v => v["@type"] === "BreadcrumbList");
  const breadcrumbItems = type === "song" ? [["ホーム", "https://mus-song-db.com/index.html"], ["曲一覧", "https://mus-song-db.com/songs.html"]]
    : [["ホーム", "https://mus-song-db.com/"], ["リリース", "https://mus-song-db.com/releases.html"]];
  const expected = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement:
    [...breadcrumbItems, [name, canonical]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) };
  equal(breadcrumb, expected, "BreadcrumbList differs from snapshot/canonical");
  if (type === "song") {
    const recording = { "@context": "https://schema.org", "@type": "MusicRecording", "@id": `${canonical}#recording`, url: canonical,
      name, description, identifier: { "@type": "PropertyValue", propertyID: "μ's Song Database Song ID", value: id },
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical } };
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.releaseDate || "")) recording.datePublished = data.releaseDate;
    equal(ld.find(v => v["@type"] === "MusicRecording"), recording, "MusicRecording differs from snapshot");
  }
  check(!doc.nodes.some(n => Object.hasOwn(n.attrs, "data-prerender-description")), "Visible SEO description must not exist");
  byId(doc, "mainContent");
}

function validateSongBody(doc, song) {
  const info = infoValues(byId(doc, "songInfo"));
  equal(info, { 表示名: song.displayName || song.songName, バージョン: song.version || "—", 収録CD: song.recordingCd || "—",
    発売日: formatDate(song.releaseDate), メディア: song.media || "—", 区分: song.category || "—" }, "Song basic information differs from snapshot");
  const stats = byId(doc, "songStats");
  const values = classes(stats, "value").map(cleanText);
  equal(values, ["eventCount", "officialEventCount", "soloEventCount", "performanceCount"].map(key => Number(song.statistics?.[key] ?? 0).toLocaleString("ja-JP")), "Song statistics differ from snapshot");
  const included = byId(doc, "includedReleasesContent");
  const groups = new Map();
  for (const row of song.includedReleases) if (!groups.has(row.releaseId)) groups.set(row.releaseId, row);
  const cards = classes(included, "song-included-release-card");
  check(classes(included, "song-included-release-link").length === cards.length, "Song included Release title/card count mismatch");
  const actual = cards.map(card => {
    const title = one(classes(card, "song-included-release-link"), "Song included Release title must be unique");
    const link = card.tag === "a" ? card : title;
    check(link.tag === "a", "Song included Release must have an actual anchor");
    if (card.tag === "a") check(descendants(card, n => n.tag === "a").length === 0, "Song included Release nested anchors");
    return [link.attrs.href, cleanText(title)];
  }).sort();
  equal(actual, [...groups.values()].map(r => [`release/${r.releaseId}.html`, r.releaseName]).sort(), "Song included Release identities differ from snapshot");
  check(classes(included, "song-included-relation-row").length === song.includedReleases.length, "Song included relation multiplicity mismatch");
  const history = byId(doc, "historyList");
  const rows = classes(history, "song-row"), performances = song.performances.slice(0, 20);
  check(rows.length === performances.length, "Song initial history count mismatch");
  rows.forEach((node, i) => {
    const performance = performances[i];
    const event = one(classes(node, "song-history-event-link"), "Song history Event missing/duplicated");
    check(event.attrs.href === `event.html?id=${encodeURIComponent(performance.eventId)}` && cleanText(event) === (performance.eventName || "イベント名未設定"), "Song history Event mismatch");
    const meta = one(classes(node, "song-meta"), "Song history metadata missing/duplicated");
    const body = textContent(meta);
    check(body.includes(formatDate(performance.date)) && body.includes(`歌唱者：${performance.singerDisplayName || performance.singer || "—"}`), "Song history date/singer mismatch");
  });
}

function validateReleaseBody(doc, release, releaseList) {
  const listItem = releaseList.find(r => r.releaseId === release.releaseId);
  const resolved = { ...release };
  for (const key of ["releaseSeries", "editionType", "parentReleaseId", "featuredSinger", "catalogNumber", "officialName"]) resolved[key] ??= listItem?.[key];
  const info = infoValues(byId(doc, "releaseInfo"));
  const expectedInfo = { 発売日: release.releaseDate ? formatDate(release.releaseDate) : "発売日未登録", 大分類: release.classification || "分類未設定" };
  if (release.releaseType?.trim()) expectedInfo["リリース種別"] = release.releaseType.trim();
  const normalized = text => String(text || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja");
  if (resolved.officialName?.trim() && normalized(resolved.officialName) !== normalized(release.releaseName)) expectedInfo["正式商品名"] = resolved.officialName.trim();
  const series = resolved.releaseSeries?.shortName || resolved.releaseSeries?.name;
  if (series?.trim()) expectedInfo["シリーズ"] = series.trim();
  if (resolved.editionType === "individual") expectedInfo["エディション"] = "個別盤";
  if (resolved.editionType === "memorial_box") expectedInfo["エディション"] = "Memorial BOX";
  if (resolved.featuredSinger?.name?.trim()) expectedInfo["対象キャラクター／歌唱名義"] = resolved.featuredSinger.name.trim();
  if (resolved.catalogNumber?.trim()) expectedInfo["品番"] = resolved.catalogNumber.trim();
  if (release.sourceMedia?.trim()) expectedInfo["曲マスター由来メディア"] = release.sourceMedia;
  const parent = releaseList.find(r => r.releaseId === resolved.parentReleaseId);
  if (parent) expectedInfo.BOX = parent.releaseName || "BOX詳細を見る";
  equal(info, expectedInfo, "Release basic/list-enriched information differs from snapshot");
  const children = resolved.editionType === "memorial_box" ? releaseList.filter(r => r.parentReleaseId === release.releaseId) : [];
  const childHost = byId(doc, "childReleasesHost");
  equal(classes(childHost, "release-child-row").map(n => [n.attrs.href, cleanText(one(classes(n, "release-child-title"), "Missing child title"))]).sort(), children.map(r => [`release/${r.releaseId}.html`, r.releaseName || "リリース名未設定"]).sort(), "Release child identities mismatch");
  const related = byId(doc, "relatedEventsHost");
  equal(classes(related, "release-event-row").map(n => [n.attrs.href, cleanText(one(classes(n, "release-event-title"), "Missing related Event title"))]).sort(), (release.relatedEvents || []).map(e => [`event.html?id=${encodeURIComponent(e.eventId)}`, e.eventName]).sort(), "Release related Event identities mismatch");
  const debut = byId(doc, "debutSongs", false);
  equal(classes(debut, "release-song-row").map(n => [n.attrs.href, cleanText(one(classes(n, "release-song-title"), "Missing debut title"))]).sort(),
    (release.debutSongs || []).map(s => [`song/${s.songId}.html`, s.songName || s.displayName || "曲名未設定"]).sort(), "Release debut Song identities mismatch");
  if (release.releaseId === "R0072") return;
  const included = byId(doc, "includedSongsContent", release.includedSongs.length > 0);
  const rows = classes(included, "release-included-song-row");
  equal(rows.map(n => [n.attrs.href, cleanText(one(classes(n, "release-included-song-title"), "Missing included title"))]).sort(),
    release.includedSongs.map(s => [`song/${s.songId}.html`, s.displayName || s.songName]).sort(), "Release included Song identities/multiplicity mismatch");
  check(!classes(included, "release-inclusion-error").length, "Release error DOM persisted");
}

function validateKamiparaBody(doc, data, venues) {
  const songs = classes(byId(doc, "includedSongsContent"), "release-kp-song");
  const history = byId(doc, "kamiparaHistory");
  byId(doc, "kamiparaHistorySection"); byId(doc, "kamiparaDashboardSection");
  check(!doc.nodes.some(n => hasClass(n, "release-inclusion-error") || hasClass(n, "release-kp-retry")), "R0072 error/retry DOM persisted");
  const expectedSongs = [...data.songs].sort((a, b) => a.trackNumber - b.trackNumber);
  check(songs.length === 10, "R0072 song count mismatch");
  songs.forEach((node, i) => {
    const song = expectedSongs[i];
    check(node.attrs["data-song-id"] === song.songId && cleanText(one(classes(node, "release-kp-track"), "Missing R0072 track")) === String(i + 1).padStart(2, "0"), "R0072 track order/ID mismatch");
    check(cleanText(one(descendants(node, n => n.tag === "h3"), "Missing R0072 Song title")) === (song.displayName || song.songName), "R0072 Song title mismatch");
  });
  const events = classes(history, "release-kp-event");
  check(events.length === 5 && classes(history, "release-kp-performance").length === 10, "R0072 history counts mismatch");
  const eventData = [...data.events].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.eventId.localeCompare(b.eventId));
  events.forEach((node, i) => {
    const event = eventData[i];
    check(node.attrs["data-event-id"] === event.eventId && node.attrs["data-venue-id"] === (event.venueId || ""), "R0072 Event/venue association mismatch");
    check(cleanText(one(descendants(node, n => n.tag === "h3"), "Missing R0072 Event title")) === event.eventName, "R0072 Event title mismatch");
    check(one(descendants(node, n => n.tag === "time"), "Missing R0072 date").attrs.datetime === event.date, "R0072 Event date mismatch");
    const names = classes(node, "release-kp-event-venue");
    const venueName = venues.get(event.venueId);
    check(names.length === (venueName ? 1 : 0) && (!venueName || cleanText(names[0]) === venueName), "R0072 venue enrichment differs from snapshot");
    const expectedRows = data.performances.filter(p => p.eventId === event.eventId).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.performanceId.localeCompare(b.performanceId));
    const rows = classes(node, "release-kp-performance");
    check(rows.length === expectedRows.length, "R0072 per-Event performance count mismatch");
    rows.forEach((row, index) => {
      const performance = expectedRows[index], song = data.songs.find(s => s.songId === performance.songId);
      const expected = `${performance.order == null ? "" : `${performance.order}. `}${song.displayName || song.songName}`;
      check(cleanText(one(descendants(row, n => n.tag === "p"), "Missing R0072 performance title")) === expected && textContent(row).includes(`実歌唱：${performance.actualSinger || "記載なし"}`), "R0072 performance differs from snapshot");
    });
  });
}

/**
 * captureProvenance v1 producer contract, NOT synthesized for old files:
 * {schemaVersion:1, outputRevision, dataRevision, rendererSha256,
 *  entry:"song.html"|"release.html", completion:"all-pages-and-enrichment",
 *  externalJsonp:"song-empty-discover-v1"|"release-kamipara-snapshot-v1",
 *  inputs:{snapshotRelativePath:{dataSha256,fileSha256,bytes}},
 *  outputs:{id:{sha256,bytes}}}
 * Only the actual successful capture producer may record this receipt. Matching
 * declarations prove consistency, not authenticity against a malicious writer.
 * Existing HTML cannot be grandfathered by hashing today's inputs afterwards.
 */
function validateProvenance(manifest, type, inputs, revision, dataRevision, fingerprint) {
  const receipt = manifest.captureProvenance;
  if (receipt === undefined) return false;
  check(object(receipt) && receipt.schemaVersion === 1, "Unsupported capture provenance schema");
  check(receipt.outputRevision === revision && receipt.dataRevision === dataRevision && receipt.rendererSha256 === fingerprint, "Capture provenance revision/renderer mismatch");
  check(receipt.entry === `${type}.html` && receipt.completion === "all-pages-and-enrichment" &&
    receipt.externalJsonp === (type === "song" ? "song-empty-discover-v1" : "release-kamipara-snapshot-v1"), "Capture completion/protocol is not verified");
  equal(receipt.inputs, inputs, "Capture inputs differ from independently validated snapshot files");
  equal(receipt.outputs, Object.fromEntries(Object.entries(manifest.pages).map(([id, p]) => [id, { sha256: p.sha256, bytes: p.bytes }])), "Capture receipt is not bound to these HTML outputs");
  return true;
}

function validateStaticHtml({ revision, repoRoot = ROOT, readFile = file => fs.readFileSync(file), readDirectory = directory => fs.readdirSync(directory) } = {}) {
  const result = { status: "FAIL", reusable: false, revision: revision ?? null, integrity: "FAIL", provenance: "UNVERIFIED", checked: { songs: 0, releases: 0, snapshotFiles: 0 }, issues: [] };
  let location = "arguments";
  try {
    check(typeof revision === "string" && REVISION.test(revision), "Explicit target revision required (sha256- plus 64 lowercase hex digits)");
    const fingerprints = { song: songGenerator.rendererFingerprint(), release: releaseGenerator.rendererFingerprint() };
    const observedFiles = new Map(), observedDirectories = new Map();
    function read(relative) {
      location = relative;
      const bytes = Buffer.from(readFile(path.join(repoRoot, relative)));
      const text = bytes.toString("utf8");
      check(Buffer.from(text).equals(bytes), "Invalid UTF-8 file");
      observedFiles.set(relative, digest(bytes));
      return { bytes, text };
    }
    function directory(relative) {
      location = relative;
      const entries = readDirectory(path.join(repoRoot, relative));
      check(Array.isArray(entries) && entries.every(e => typeof e === "string"), "Invalid directory entries");
      observedDirectories.set(relative, [...entries].sort());
      return entries;
    }
    function json(relative) { return parseUniqueJson(read(relative).text); }
    const prefix = `data/snapshots/${revision}/`;
    const snapshot = json(prefix + "manifest.json");
    check(object(snapshot) && object(snapshot.counts) && object(snapshot.hashes) && (snapshot.schemaVersion === undefined || snapshot.schemaVersion === 1), "Invalid snapshot manifest schema");
    check(snapshot.revision === revision && snapshot.outputRevision === revision && REVISION.test(snapshot.dataRevision), "Snapshot manifest revision mismatch");
    check(snapshot.counts.songs === 117 && snapshot.counts.releases === 114 && snapshot.counts.details === 231 && snapshot.counts.kamiparaDashboard === 1, "Snapshot independent counts mismatch");
    const dataRevision = snapshot.dataRevision; result.dataRevision = dataRevision;
    const sources = { song: new Map(), release: new Map() }, inputs = { song: {}, release: {} };
    function readSnapshot(relative, hash) {
      check(object(hash) && HASH.test(hash.sha256) && HASH.test(hash.fileSha256) && Number.isSafeInteger(hash.bytes) && hash.bytes > 0, "Invalid snapshot hash record");
      const { bytes, text } = read(prefix + relative), wrapper = parseUniqueJson(text);
      check(object(wrapper) && object(wrapper.snapshot) && wrapper.snapshot.revision === revision &&
        wrapper.snapshot.outputRevision === revision && wrapper.snapshot.dataRevision === dataRevision, "Snapshot wrapper revision/schema mismatch");
      check(sha256(wrapper.data) === hash.sha256 && digest(bytes) === hash.fileSha256 && bytes.length === hash.bytes, "Snapshot data/file hash or bytes mismatch");
      result.checked.snapshotFiles++;
      return { wrapper, input: { dataSha256: hash.sha256, fileSha256: hash.fileSha256, bytes: hash.bytes } };
    }
    for (const type of Object.keys(COUNTS)) {
      const group = `${type}s`, entries = snapshot.hashes[group];
      check(object(entries) && Object.keys(entries).length === COUNTS[type], `${group}: snapshot ID count mismatch`);
      check(Object.keys(entries).every(id => (type === "song" ? /^S\d{3}$/ : /^R\d{4}$/).test(id)), "Invalid capture source ID pattern");
      exactIds(directory(prefix + group).filter(f => f.endsWith(".json")), Object.keys(entries).map(id => `${id}.json`), `${group}: snapshot directory`);
      for (const [id, hash] of Object.entries(entries)) {
        const item = readSnapshot(`${group}/${id}.json`, hash);
        validateSnapshot(type, id, item.wrapper, revision, dataRevision);
        check(item.wrapper.data._cache?.revision === dataRevision, "Snapshot data cache revision mismatch");
        sources[type].set(id, item.wrapper.data); inputs[type][`${group}/${id}.json`] = item.input;
      }
    }
    const list = readSnapshot("release-list.json", snapshot.releaseList);
    check(Array.isArray(list.wrapper.data) && snapshot.releaseList.count === 114, "Release list schema/count mismatch");
    exactIds(list.wrapper.data.map(r => r.releaseId), [...sources.release.keys()], "Release list");
    const releaseList = list.wrapper.data; inputs.release["release-list.json"] = list.input;
    const kp = readSnapshot("kamipara-dashboard.json", snapshot.kamiparaDashboard);
    const dashboard = validateKamiparaDashboard(kp.wrapper.data, dataRevision);
    check(dashboard.songs.length === 10 && dashboard.events.length === 5 && dashboard.performances.length === 10, "Kamipara source counts mismatch");
    for (const [rows, key] of [[dashboard.songs, "songId"], [dashboard.events, "eventId"], [dashboard.performers, "performerId"], [dashboard.performances, "performanceId"]]) check(new Set(rows.map(r => r[key])).size === rows.length && rows.every(r => typeof r[key] === "string" && r[key]), "Kamipara duplicate/missing IDs");
    // The current secondary renderer only accepts these ten credited Songs and
    // requires all nine credited performers; count/hash agreement alone is not
    // enough to certify renderable source data.
    exactIds(dashboard.songs.map(s => s.songId), Array.from({ length: 10 }, (_, i) => `S${118 + i}`), "Kamipara credited Songs");
    check(Array.from({ length: 9 }, (_, i) => `KPS${String(i + 1).padStart(3, "0")}`).every(id => dashboard.performers.some(p => p.performerId === id)), "Kamipara credited performers missing");
    equal(dashboard.songs.map(s => s.trackNumber).sort((a, b) => a - b), Array.from({ length: 10 }, (_, i) => i + 1), "Kamipara source tracks invalid");
    check(dashboard.performances.every(p => dashboard.songs.some(s => s.songId === p.songId) && dashboard.events.some(e => e.eventId === p.eventId) && Array.isArray(p.performers) && p.performers.every(person => dashboard.performers.some(v => v.performerId === person.performerId))), "Kamipara source references invalid");
    inputs.release["kamipara-dashboard.json"] = kp.input;
    const venues = new Map();
    check(object(snapshot.hashes.events) && snapshot.counts.events === 353 && Object.keys(snapshot.hashes.events).length === 353, "Event auxiliary snapshot completeness mismatch");
    exactIds(directory(prefix + "events").filter(f => f.endsWith(".json")), Object.keys(snapshot.hashes.events).map(id => `${id}.json`), "Event snapshot directory");
    const wanted = new Set(dashboard.events.map(e => e.venueId).filter(Boolean));
    for (const [id, hash] of Object.entries(snapshot.hashes.events)) {
      const item = readSnapshot(`events/${id}.json`, hash);
      validateEventSnapshot(id, item.wrapper, revision, dataRevision);
      inputs.release[`events/${id}.json`] = item.input;
      const venue = item.wrapper.data.event.venue;
      if (wanted.has(venue?.venueId) && venue.venueName) {
        check(!venues.has(venue.venueId) || venues.get(venue.venueId) === venue.venueName, "Conflicting snapshot venue names");
        venues.set(venue.venueId, venue.venueName);
      }
    }
    if (snapshot.counts.memberAnalytics) {
      check(snapshot.counts.memberAnalytics === 1, "Member Analytics count mismatch");
      const member = readSnapshot("member-analytics.json", snapshot.memberAnalytics);
      validateMemberAnalytics(member.wrapper.data);
    }
    for (const type of Object.keys(COUNTS)) {
      const manifest = json(`${type}/manifest.json`);
      check(object(manifest) && manifest.schemaVersion === 1 && object(manifest.pages), "Invalid HTML manifest schema");
      check(manifest.count === COUNTS[type] && manifest.outputRevision === revision && manifest.dataRevision === dataRevision, "HTML manifest count/revision mismatch");
      exactIds(Object.keys(manifest.pages), [...sources[type].keys()], `${type}: HTML manifest`);
      exactIds(directory(type).filter(f => f.endsWith(".html")), [...sources[type].keys()].map(id => `${id}.html`), `${type}: HTML directory`);
      check(manifest.rendererSha256 === fingerprints[type], "HTML complete-set renderer fingerprint mismatch (latest is not sufficient)");
      for (const [id, entry] of Object.entries(manifest.pages)) {
        location = `${type}/manifest.json:${id}`;
        const canonical = `https://mus-song-db.com/${type}/${id}.html`;
        check(object(entry) && entry.path === `${type}/${id}.html` && entry.canonical === canonical && HASH.test(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes > 0, "Invalid HTML path/hash/bytes/canonical record");
        if (type === "song") check(entry.rendererSha256 === fingerprints.song && entry.structuredData === true, "Song page renderer/structured-data marker mismatch");
        const { bytes, text } = read(entry.path);
        check(digest(bytes) === entry.sha256 && bytes.length === entry.bytes, "HTML hash/bytes mismatch");
        check(!/http:\/\/127\.0\.0\.1|undefined件/.test(text), "HTML runtime/local URL leak");
        const doc = parseSerializedHtml(text), data = sources[type].get(id);
        validateHead(doc, type, id, data, revision);
        if (type === "song") validateSongBody(doc, data);
        else {
          validateReleaseBody(doc, data, releaseList);
          if (id === "R0072") validateKamiparaBody(doc, dashboard, venues);
        }
        result.checked[`${type}s`]++;
      }
      location = `${type}/manifest.json:captureProvenance`;
      if (!validateProvenance(manifest, type, inputs[type], revision, dataRevision, fingerprints[type])) result.issues.push({ severity: "UNVERIFIED", code: "INPUT_PROVENANCE_MISSING", location, message: "Generation-time input/output receipt absent; current inputs cannot prove past capture inputs" });
    }
    location = "renderer fingerprint recheck";
    check(songGenerator.rendererFingerprint() === fingerprints.song && releaseGenerator.rendererFingerprint() === fingerprints.release, "Renderer changed during validation");
    // Detect concurrent changes during inspection. The future switch workflow
    // still needs exclusive generation/switch access; this is not a lock/lease.
    for (const [relative, hash] of observedFiles) {
      location = relative;
      check(digest(Buffer.from(readFile(path.join(repoRoot, relative)))) === hash, "Artifact changed during validation");
    }
    for (const [relative, entries] of observedDirectories) {
      location = relative;
      equal([...readDirectory(path.join(repoRoot, relative))].sort(), entries, "Directory changed during validation");
    }
    result.integrity = "PASS";
    result.status = result.issues.length ? "UNVERIFIED" : "PASS";
    result.provenance = result.issues.length ? "UNVERIFIED" : "VERIFIED";
    result.reusable = result.status === "PASS";
  } catch (error) {
    result.status = "FAIL"; result.reusable = false;
    result.issues.push({ severity: "FAIL", code: "VALIDATION_FAILED", location, message: String(error?.message || error) });
  }
  return result;
}

module.exports = { validateStaticHtml };
if (require.main === module) {
  const args = process.argv.slice(2);
  const revision = args.length === 2 && args[0] === "--revision" ? args[1] : undefined;
  const result = validateStaticHtml({ revision });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "PASS" ? 0 : result.status === "UNVERIFIED" ? 2 : 1;
}
