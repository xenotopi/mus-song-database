"use strict";

// Fictional protocol fixtures, generated ONLY in memory. These receipts belong
// to the synthetic documents below; they are never inferred for published HTML
// and make no claim about a real production capture or historical performance.
const path = require("node:path");
const crypto = require("node:crypto");
const { sha256 } = require("../../tools/detail-snapshot-lib.cjs");
const songGenerator = require("../../tools/generate-song-pages.cjs");
const releaseGenerator = require("../../tools/generate-release-pages.cjs");
const { releaseBody } = require("./release-body-fixture.cjs");
const root = path.resolve(__dirname, "../..");
const revision = `sha256-${"a".repeat(64)}`;
const dataRevision = `sha256-${"b".repeat(64)}`;
const prefix = `data/snapshots/${revision}/`;
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const id = (p, number, width) => p + String(number).padStart(width, "0");
const pairs = fields => `<dl>${Object.entries(fields).map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join("")}</dl>`;

function buildFixture() {
  const files = new Map(), data = { song: {}, release: {} };
  const put = (file, value) => files.set(file, Buffer.from(value));
  const putJson = (file, value) => put(file, JSON.stringify(value, null, 2) + "\n");
  const cache = { revision: dataRevision };
  const manifest = { revision, outputRevision: revision, dataRevision, counts: { songs: 117, releases: 114, details: 231, kamiparaDashboard: 1, events: 353 }, hashes: { songs: {}, releases: {}, events: {} } };
  function snapshot(file, value) {
    putJson(prefix + file, { snapshot: { revision, outputRevision: revision, dataRevision, source: "synthetic-test-only" }, data: value });
    const bytes = files.get(prefix + file);
    return { sha256: sha256(value), fileSha256: hash(bytes), bytes: bytes.length };
  }
  for (let n = 1; n <= 117; n++) {
    const songId = id("S", n, 3), name = `Fixture Song ${n} <mix> & "test"`;
    data.song[songId] = { songId, songName: name, displayName: name, version: "通常", recordingCd: "Fixture CD", releaseDate: "2020-01-01", media: "CD", category: "シングル", includedReleases: [],
      performances: [{ eventId: "EV0001", eventName: "Fixture Event 1", date: "2020-01-01", singerId: "SN0001", singerDisplayName: "Fixture Singer" }],
      statistics: { eventCount: 1, officialEventCount: 1, soloEventCount: 0, performanceCount: 1 }, _cache: cache };
    manifest.hashes.songs[songId] = snapshot(`songs/${songId}.json`, data.song[songId]);
  }
  for (let n = 1; n <= 114; n++) {
    const releaseId = id("R", n, 4), songId = id("S", n, 3), song = data.song[songId];
    const songs = releaseId === "R0072" ? [] : releaseId === "R0052" ? ["ゲーマーズ","ソフマップ","アニメイト"].map((store,i)=>({relationId:id("RT",90+i,4),songId:id("S",90+i,3),songName:data.song[id("S",90+i,3)].songName,displayName:data.song[id("S",90+i,3)].displayName,benefitStore:store})) : [{ relationId: id("RT", n, 4), songId, songName: song.songName, displayName: song.displayName }];
    data.release[releaseId] = { releaseId, releaseName: `Fixture Release ${n}`, releaseDate: "2020-01-01", classification: "CD", releaseType: "シングル", sourceMedia: "CD", includedSongs: songs, includedSongsMeta: { status: releaseId === "R0072" ? "special_hold" : "complete" }, debutSongs: songs, relatedEvents: [], _cache: cache };
    manifest.hashes.releases[releaseId] = snapshot(`releases/${releaseId}.json`, data.release[releaseId]);
  }
  // Synthetic sidecar inputs, not production receipts or source-review records.
  const fixtureSource="https://akihata.jp/works/music/?ah=%E3%82%89&an=lovelive&at=k";
  const fixtureSidecar={schemaVersion:1,releaseId:"R0052",approvalScope:"public",relations:data.release.R0052.includedSongs.map(row=>({relationId:row.relationId,relationBinding:hash(JSON.stringify(["R0052",row.relationId,row.songId,row.benefitStore])),fields:Object.fromEntries(Object.entries({physicalMedia:"CD",qualifyingProducts:"2期Blu-ray",acquisitionCondition:"全巻特典"}).map(([key,value])=>{const sources=[{url:fixtureSource,edition:"2014 synthetic fixture"}];return [key,{value,sources,verificationStatus:"partial",displayApproval:"public",public:true,valueHash:hash(JSON.stringify([value,sources]))}];}))}))};
  putJson("data/release-sidecars/R0052.json",fixtureSidecar);
  const unitData=JSON.parse(require('node:fs').readFileSync(path.join(root,'data/song-unit-memberships.json'),'utf8'));
  putJson('data/song-unit-memberships.json',unitData);
  const affiliationNames={printemps:'Printemps',lily_white:'lily white',bibi:'BiBi'};
  // Fictional BOX with the same structural invariants as R0088; no production rows.
  const discCounts=[13,8,10,14,8,10,13,8,10,13,8,10,14,8,10,14,8,10,14,8,10,14,8,10,14,8,10];
  let relation=2000,ordinal=0;
  data.release.R0088.editionType="memorial_box";
  data.release.R0088.includedSongs=discCounts.flatMap((count,i)=>Array.from({length:count},(_,j)=>{
    const songId=id("S",ordinal++%46+1,3),song=data.song[songId];
    return {relationId:id("RT",++relation,4),songId,songName:song.songName,displayName:song.displayName,disc:i+1,track:j+1,variant:"Fixture Mix "+Math.floor(i/3)};
  }));
  for(let i=0;i<9;i++)Object.assign(data.release[id("R",106+i,4)],{parentReleaseId:"R0088",editionType:"individual",featuredSinger:{id:id("SN",i+1,4),name:"Fixture Member "+(i+1)}});
  for(const r of [data.release.R0088,...Array.from({length:9},(_,i)=>data.release[id("R",106+i,4)])])manifest.hashes.releases[r.releaseId]=snapshot("releases/"+r.releaseId+".json",r);
  const releaseList = Object.values(data.release).map(r => ({ releaseId: r.releaseId, releaseName: r.releaseName, ...(r.parentReleaseId?{parentReleaseId:r.parentReleaseId}:{}),...(r.editionType?{editionType:r.editionType}:{}),...(r.featuredSinger?{featuredSinger:r.featuredSinger}:{}) }));
  manifest.releaseList = { ...snapshot("release-list.json", releaseList), count: 114 };
  const kp = { revision: dataRevision, _cache: cache, summary: { songCount: 10, performerCount: 9, eventCount: 5, performanceCount: 10 },
    songs: Array.from({ length: 10 }, (_, i) => ({ songId: id("S", i + 118, 3), songName: `Fixture KP Song ${i + 1}`, displayName: `Fixture KP Song ${i + 1}`, trackNumber: i + 1 })),
    performers: Array.from({ length: 9 }, (_, i) => ({ performerId: id("KPS", i + 1, 3) })),
    events: Array.from({ length: 5 }, (_, i) => ({ eventId: id("KPE", i + 1, 3), eventName: `Fixture KP Event ${i + 1}`, date: `2020-01-0${i + 1}`, venueId: id("VE", i % 4 + 1, 4) })),
    performances: Array.from({ length: 10 }, (_, i) => ({ performanceId: id("KPR", i + 1, 4), eventId: id("KPE", Math.floor(i / 2) + 1, 3), songId: id("S", i + 118, 3), order: i + 1, actualSinger: "Fixture Singer", performers: [{ performerId: "KPS001" }] })) };
  manifest.kamiparaDashboard = snapshot("kamipara-dashboard.json", kp);
  for (let n = 1; n <= 353; n++) {
    const eventId = id("EV", n, 4);
    const value = { event: { eventId, eventName: `Fixture Event ${n}`, songs: [], statistics: {}, navigation: {}, relatedReleases: [], _cache: cache,
      ...(n <= 4 ? { venue: { venueId: id("VE", n, 4), venueName: `Fixture Venue ${n}` } } : {}) },
      discover: { eventId, firstPerformedSongs: [], lastPerformedSongs: [], uniqueSongs: [], _cache: cache } };
    manifest.hashes.events[eventId] = snapshot(`events/${eventId}.json`, value);
  }
  putJson(prefix + "manifest.json", manifest);

  function head(type, target, name, description, ld) {
    const canonical = `https://mus-song-db.com/${type}/${target}.html`, title = `${name}｜μ's Song Database`;
    const metadata = [["name", "description", description], ["property", "og:title", title], ["property", "og:description", description], ["property", "og:url", canonical], ["name", "robots", "index,follow,max-image-preview:large"]];
    if (type === "song") metadata.push(["name", "twitter:title", title], ["name", "twitter:description", description]);
    const items = type === "song" ? [["ホーム", "https://mus-song-db.com/index.html"], ["曲一覧", "https://mus-song-db.com/songs.html"]] : [["ホーム", "https://mus-song-db.com/"], ["リリース", "https://mus-song-db.com/releases.html"]];
    const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [...items, [name, canonical]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) };
    return `<head><base href="../"><title>${escape(title)}</title><link rel="canonical" href="${canonical}">${metadata.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escape(value)}">`).join("")}${[...ld, breadcrumb].map(v => `<script type="application/ld+json">${JSON.stringify(v).replace(/</g, "\\u003c")}</script>`).join("")}</head>`;
  }
  function kpBody() {
    return `<div id="includedSongsContent">${kp.songs.map(s => `<article class="release-kp-song" data-song-id="${s.songId}"><span class="release-kp-track">${String(s.trackNumber).padStart(2, "0")}</span><h3>${s.songName}</h3></article>`).join("")}</div><section id="kamiparaHistorySection"><div id="kamiparaHistory">${kp.events.map(e => `<details class="release-kp-event" data-event-id="${e.eventId}" data-venue-id="${e.venueId}"><summary><time datetime="${e.date}">${e.date}</time><h3>${e.eventName}</h3><span class="release-kp-event-venue">Fixture Venue ${Number(e.venueId.slice(2))}</span></summary>${kp.performances.filter(p => p.eventId === e.eventId).map(p => `<div class="release-kp-performance"><p>${p.order}. ${kp.songs.find(s => s.songId === p.songId).songName}</p><small>実歌唱：${p.actualSinger}</small></div>`).join("")}</details>`).join("")}</div></section><section id="kamiparaDashboardSection"></section>`;
  }
  for (const type of ["song", "release"]) {
    const fingerprint = (type === "song" ? songGenerator : releaseGenerator).rendererFingerprint();
    const hm = { schemaVersion: 1, outputRevision: revision, dataRevision, count: Object.keys(data[type]).length, rendererSha256: fingerprint, pages: {} };
    for (const [target, item] of Object.entries(data[type])) {
      let content, description, ld = [], name;
      const canonical = `https://mus-song-db.com/${type}/${target}.html`;
      if (type === "song") {
        name = item.displayName;
        description = `${name}の発売・収録情報と歌唱記録。発売日2020-01-01、歌唱記録1件。現行DBの初回歌唱日2020-01-01、最終歌唱日2020-01-01。`;
        ld = [{ "@context": "https://schema.org", "@type": "MusicRecording", "@id": `${canonical}#recording`, url: canonical, name, description,
          identifier: { "@type": "PropertyValue", propertyID: "μ's Song Database Song ID", value: target }, mainEntityOfPage: { "@type": "WebPage", "@id": canonical }, datePublished: item.releaseDate }];
        const affiliation=unitData.memberships.find(row=>row.songId===target);
        content = `<div id="songInfo">${pairs({ 表示名: name, バージョン: "通常", 収録CD: "Fixture CD", 発売日: "2020/01/01", メディア: "CD", 区分: "シングル", ...(affiliation?{所属ユニット:affiliationNames[affiliation.unitKey]}:{}) })}</div><div id="songStats">${[1, 1, 0, 1].map(n => `<div class="value">${n}</div>`).join("")}</div><div id="includedReleasesContent"></div><div id="historyList"><article class="song-row"><a class="song-history-event-link" href="event.html?id=EV0001">Fixture Event 1</a><span class="song-meta">2020/01/01 歌唱者：<a class="song-history-singer-link" href="singer.html?id=SN0001">Fixture Singer</a></span></article></div>`;
      } else {
        name = item.releaseName;
        description = `${name}（2020-01-01発売、シングル）の詳細。${item.includedSongs.length ? `収録情報：${item.includedSongs.slice(0,3).map(s=>s.displayName).join("、")}${item.includedSongs.length>3?"ほか"+(item.includedSongs.length-3)+"件":""}。` : "収録楽曲の登録はありません。"}`;
        if (target === "R0032") description = name + "。1期Blu-ray最終巻発売日基準：2020/01/01。収録情報：" + item.includedSongs.map(s => s.displayName).join("、");
        if (target === "R0052") description = name + "。2期Blu-ray最終巻発売日基準：2020/01/01。店舗別の収録情報：" + item.includedSongs.map(s => s.displayName).join("、") + "。";
        const kpHtml = target === "R0072" ? kpBody() : "", split = kpHtml.indexOf("</div><section");
        content = releaseBody(item, releaseList, target === "R0072" ? { kamipara: kpHtml.slice('<div id="includedSongsContent">'.length, split) } : {}).replace(/^<h1>[\s\S]*?<\/h1>/, "") + (target === "R0072" ? kpHtml.slice(split + 6) : "");
        if(target==="R0052")for(const row of item.includedSongs){const block='<div class="release-sidecar-info"><dl><div><dt>特典媒体</dt><dd>CD</dd></div><div><dt>対象商品</dt><dd>2期Blu-ray</dd></div><div><dt>入手条件</dt><dd>全巻特典</dd></div></dl><details><summary>出典</summary><a href="'+escape(fixtureSource)+'">畑亜貴 公式作品一覧（特典媒体・対象商品・入手条件）</a></details></div>';content=content.replace(new RegExp('(<a[^>]*data-relation-id="'+row.relationId+'"[\\s\\S]*?</a>)'),'$1'+block);}
      }
      const html = `<!DOCTYPE html><html data-${type}-id="${target}"${type === "song" ? ` data-prerender-revision="${revision}"` : ""}>${head(type, target, name, description, ld)}<body><h1>${escape(name)}</h1><main id="mainContent">${content}</main></body></html>\n`;
      put(`${type}/${target}.html`, html);
      const bytes = files.get(`${type}/${target}.html`);
      hm.pages[target] = { path: `${type}/${target}.html`, canonical, sha256: hash(bytes), bytes: bytes.length, ...(type === "song" ? { rendererSha256: fingerprint, structuredData: true } : {}) };
    }
    const groups = type === "song" ? ["songs"] : ["releases", "events"];
    const records = Object.fromEntries(groups.flatMap(group => Object.entries(manifest.hashes[group]).map(([id, v]) => [`${group}/${id}.json`, { dataSha256: v.sha256, fileSha256: v.fileSha256, bytes: v.bytes }])));
    if (type === "release") for (const [file, entry] of [["release-list.json", manifest.releaseList], ["kamipara-dashboard.json", manifest.kamiparaDashboard]]) records[file] = { dataSha256: entry.sha256, fileSha256: entry.fileSha256, bytes: entry.bytes };
    hm.captureProvenance = { schemaVersion: 1, outputRevision: revision, dataRevision, rendererSha256: fingerprint, entry: `${type}.html`, completion: "all-pages-and-enrichment", externalJsonp: type === "song" ? "song-empty-discover-v1" : "release-kamipara-snapshot-v1",
      inputs: records, outputs: Object.fromEntries(Object.entries(hm.pages).map(([id, p]) => [id, { sha256: p.sha256, bytes: p.bytes }])) };
    putJson(`${type}/manifest.json`, hm);
  }
  return files;
}

const base = buildFixture();
function createFixture() {
  const files = new Map([...base].map(([file, value]) => [file, Buffer.from(value)]));
  const getJson = file => JSON.parse(files.get(file).toString("utf8"));
  const putJson = (file, value) => files.set(file, Buffer.from(JSON.stringify(value, null, 2) + "\n"));
  function editJson(file, change) { const value = getJson(file); change(value); putJson(file, value); }
  function editHtml(type, id, change, updateHash = false) {
    const file = `${type}/${id}.html`;
    files.set(file, Buffer.from(change(files.get(file).toString("utf8"))));
    if (updateHash) editJson(`${type}/manifest.json`, m => {
      m.pages[id].sha256 = hash(files.get(file)); m.pages[id].bytes = files.get(file).length;
      if (m.captureProvenance) m.captureProvenance.outputs[id] = { sha256: m.pages[id].sha256, bytes: m.pages[id].bytes };
    });
  }
  function editSnapshot(relative, change) {
    editJson(prefix + relative, wrapper => change(wrapper.data));
    const wrapper = getJson(prefix + relative), bytes = files.get(prefix + relative);
    editJson(prefix + "manifest.json", m => {
      const record = { sha256: sha256(wrapper.data), fileSha256: hash(bytes), bytes: bytes.length };
      if (relative === "release-list.json") m.releaseList = { ...record, count: 114 };
      else if (relative === "kamipara-dashboard.json") m.kamiparaDashboard = record;
      else { const [group, file] = relative.split("/"); m.hashes[group][file.slice(0, -5)] = record; }
    });
  }
  const reads = [];
  function relative(file) { return path.relative(root, file).replace(/\\/g, "/"); }
  return { files, revision, dataRevision, prefix, editJson, editHtml, editSnapshot, getJson, putJson, reads,
    options: { revision, repoRoot: root, readFile(file) { const key = relative(file); reads.push(key); if (!files.has(key)) throw new Error(`ENOENT: ${key}`); return Buffer.from(files.get(key)); },
      readDirectory(directory) { const key = relative(directory) + "/"; return [...files.keys()].filter(f => f.startsWith(key) && !f.slice(key.length).includes("/")).map(f => f.slice(key.length)); } } };
}
module.exports = { createFixture, root };
