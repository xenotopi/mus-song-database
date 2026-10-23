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
const { validateSidecarBody } = require("./validate-release-sidecar.cjs");
const { validateVocalData, validateVocalBody } = require("./validate-release-vocals.cjs");
const { validateReleaseContentsData, validateReleaseContentsBody } = require("./validate-release-contents.cjs");
const { validateSongUnitMemberships, validateSongUnitBody } = require("./song-unit-membership-lib.cjs");
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
// Independent presentation expectations; do not import the browser formatter.
const singerLabel = (item, fallback) => ({SN0007:"Printemps",SN0011:"lily white",SN0013:"BiBi"})[item?.singerId || item?.id] || fallback;

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
  const names = tracks.slice(0, 3).map(s => s.displayName || s.songName).join("、");
  const basisDate = release.releaseDate ? formatDate(release.releaseDate) : "発売日未登録";
  if (release.releaseId === "R0032") return release.releaseName + "。1期Blu-ray最終巻発売日基準：" + basisDate + "。収録情報：" + names;
  if (release.releaseId === "R0052") return release.releaseName + "。2期Blu-ray最終巻発売日基準：" + basisDate + "。店舗別の収録情報：" + names + "。";
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

function validateSongBody(doc, song, memberships) {
  const info = infoValues(byId(doc, "songInfo"));
  equal(info, { 表示名: song.displayName || song.songName, バージョン: song.version || "—", 収録CD: song.recordingCd || "—",
    発売日: formatDate(song.releaseDate), メディア: song.media || "—", 区分: song.category || "—", ...(memberships.has(song.songId) ? { 所属ユニット: memberships.get(song.songId).label } : {}) }, "Song basic information differs from snapshot");
  validateSongUnitBody(doc, song.songId, memberships);
  const debutId = String(song.debutRelease?.releaseId || "").trim();
  const debutLinks = classes(byId(doc, "songInfo"), "song-debut-release-link");
  const linked = /^R\d{4}$/.test(debutId) && song.includedReleases.some(r => r.releaseId === debutId);
  equal(debutLinks.map(n => [n.tag, n.attrs.href, cleanText(n)]), linked ? [["a", `release/${debutId}.html`, song.recordingCd || "—"]] : [], "Song debut Release identity/link mismatch");
  for (const link of debutLinks) check(descendants(link,n=>n.attrs["data-site-icon"]==="chevron-right"&&n.attrs["aria-hidden"]==="true").length===1,"Song debut arrow must be decorative and unique");
  const officialSection = byId(doc, "releaseSection"), action = byId(doc, "releaseAction");
  check(!doc.ids.has("releaseTitle") && !doc.ids.has("releaseMeta") && classes(officialSection, "basic-release-label").length === 0, "Song duplicate basic Release information must be absent");
  check(descendants(officialSection, n => n.tag === "dl").length === 0 && classes(action, "release-detail-link").length === 0, "Song duplicate Release metadata/button must be absent");
  const officialUrl = String(song.officialReleaseUrl || "").trim(), officialLinks = classes(action, "official-release-link");
  equal(officialLinks.map(n => [n.tag, n.attrs.href, n.attrs.target, (n.attrs.rel || "").split(/\s+/).sort(), cleanText(n)]), officialUrl ? [["a", officialUrl, "_blank", ["noopener", "noreferrer"], "公式作品ページを見る"]] : [], "Song official work URL/behavior mismatch");
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
  equal(cleanText(byId(doc, "includedReleasesCount")), song.includedReleases.length ? `${groups.size}作品・${song.includedReleases.length}件` : "", "Song included Release/Relation total differs from snapshot");
  check(classes(included, "song-included-relation-empty").length === 0, "Song position placeholder must be absent");
  for (const card of cards) {
    const releaseId = (card.attrs.href || "").match(/^release\/(R\d{4})\.html$/)?.[1];
    const expected = song.includedReleases.filter(r => r.releaseId === releaseId).map(r => [
      [r.disc == null ? "" : `Disc ${r.disc}`, r.track == null ? "" : `Track ${r.track}`].filter(Boolean).join(" / "),
      r.variant == null ? "" : String(r.variant).replace(/\s+/g, " ").trim()
    ]).filter(([position, variant]) => position || variant);
    const rows = classes(card, "song-included-relation-row");
    equal(rows.map(row => {
      const children = row.children.filter(n => typeof n !== "string"), variants = children.filter(n => hasClass(n, "song-included-variant")), positions = children.filter(n => !hasClass(n, "song-included-variant"));
      check(positions.length <= 1 && variants.length <= 1 && children.every(n => n.tag === "span"), "Song position/variant structure invalid");
      const pair = [positions.length ? cleanText(positions[0]) : "", variants.length ? cleanText(variants[0]) : ""];
      check(pair.some(Boolean), "Song empty relation row must be omitted");
      return pair;
    }), expected, "Song displayed positions/variants/order differ from snapshot");
    check(classes(card, "song-included-relation-list").length === (expected.length ? 1 : 0), "Song empty relation list must be omitted");
  }
  const history = byId(doc, "historyList");
  const rows = classes(history, "song-row"), performances = song.performances.slice(0, 20);
  check(rows.length === performances.length, "Song initial history count mismatch");
  rows.forEach((node, i) => {
    const performance = performances[i];
    const event = one(classes(node, "song-history-event-link"), "Song history Event missing/duplicated");
    check(event.attrs.href === `event.html?id=${encodeURIComponent(performance.eventId)}` && cleanText(event) === (performance.eventName || "イベント名未設定"), "Song history Event mismatch");
    const meta = one(classes(node, "song-meta"), "Song history metadata missing/duplicated");
    const body = textContent(meta);
    check(body.includes(formatDate(performance.date)) && body.includes(`歌唱者：${singerLabel(performance, performance.singerDisplayName || performance.singer || "—")}`), "Song history date/singer mismatch");
    if(performance.singerId){const link=one(classes(node,"song-history-singer-link"),"Song singer link missing/duplicated");check(link.attrs.href===`singer.html?id=${encodeURIComponent(performance.singerId)}`&&cleanText(link)===singerLabel(performance,performance.singerDisplayName||performance.singer||"—"),"Song singer ID/link/display mismatch");}
  });
}

function validateReleaseBody(doc, release, releaseList, productContents = null) {
  const resolved = { ...release }, listItem = releaseList.find(r => r.releaseId === release.releaseId);
  for (const key of ["releaseSeries", "editionType", "parentReleaseId", "featuredSinger", "catalogNumber", "officialName"]) resolved[key] ??= listItem?.[key];
  if(doc.html.attrs["data-release-id"]) check(doc.html.attrs["data-release-id"]===release.releaseId,"Release body ID mismatch");
  check(cleanText(one(doc.nodes.filter(n=>n.tag==="h1"),"Release h1 must be unique"))===release.releaseName,"Release body title mismatch");
  const date=release.releaseDate?formatDate(release.releaseDate):"発売日未登録";
  equal(byId(doc,"heroMeta").children.filter(n=>typeof n!=="string").map(cleanText),
    [(["R0032","R0052"].includes(release.releaseId)?"Blu-ray最終巻発売日：":"")+date,release.classification||"分類未設定",...(release.releaseType?.trim()?[release.releaseType.trim()]:[])],"Release hero date/classification/type mismatch");
  const expectedInfo = {};
  const parent=/^R\d{4}$/.test(resolved.parentReleaseId||"")&&resolved.parentReleaseId!==release.releaseId?releaseList.find(r=>r.releaseId===resolved.parentReleaseId):null;
  if(resolved.officialName?.trim())expectedInfo["正式商品名"]=resolved.officialName.trim();
  const series=resolved.releaseSeries?.shortName||resolved.releaseSeries?.name;
  if(series?.trim())expectedInfo["シリーズ"]=series.trim();
  if(parent)expectedInfo["親BOX"]=parent.releaseName||"BOX詳細を見る";
  if(resolved.featuredSinger?.name?.trim())expectedInfo["対象キャラクター／歌唱名義"]=singerLabel(resolved.featuredSinger,resolved.featuredSinger.name.trim());
  if(resolved.editionType==="individual")expectedInfo["エディション"]="個別盤";
  if(resolved.editionType==="memorial_box")expectedInfo["エディション"]="Memorial BOX";
  if(resolved.catalogNumber?.trim())expectedInfo["品番"]=resolved.catalogNumber.trim();
  const info=byId(doc,"releaseInfo",false);
  equal(infoValues(info),expectedInfo,"Release basic/list-enriched information differs from snapshot");
  const fieldNames={"正式商品名":"official","シリーズ":"series","親BOX":"parent","対象キャラクター／歌唱名義":"featured","エディション":"edition","品番":"catalog"};
  const infoRows=info.children.filter(n=>typeof n!=="string");
  check(info.tag==="dl"&&infoRows.every(n=>n.tag==="div"&&hasClass(n,"release-info-row")),"Release information definition groups invalid");
  equal(infoRows.map(n=>n.attrs["data-release-info-field"]),Object.keys(expectedInfo).map(label=>fieldNames[label]),"Release information semantic fields / order mismatch");
  infoRows.forEach((row,i)=>{
    const pair=row.children.filter(n=>typeof n!=="string");
    equal(pair.map(n=>n.tag),["dt","dd"],"Release information dt/dd pair invalid");
    check(cleanText(pair[0])===Object.keys(expectedInfo)[i],"Release information label order mismatch");
    check(Object.hasOwn(row.attrs,"data-release-featured")===(row.attrs["data-release-info-field"]==="featured"),"Release featured identity marker mismatch");
  });
  check(visible(info)===(Object.keys(expectedInfo).length>0),"Release basic information visibility mismatch");
  const infoLinks=descendants(info,n=>n.tag==="a");
  equal(infoLinks.map(n=>[n.attrs.href,cleanText(n)]),parent?[["release/"+parent.releaseId+".html",parent.releaseName||"BOX詳細を見る"]]:[],"Release information links / related identities differ from verified snapshot references");
  check(!doc.nodes.some(n=>Object.hasOwn(n.attrs,"data-release-cv")||hasClass(n,"detail-context-bar")),"Release runtime context/CV persisted");
  const children=resolved.editionType==="memorial_box"?releaseList.filter(r=>r.parentReleaseId===release.releaseId):[];
  const excluded=new Set([release.releaseId,resolved.parentReleaseId,...children.map(r=>r.releaseId)]);
  const siblings=resolved.releaseSeries?.id?releaseList.filter(r=>r.releaseSeries?.id===resolved.releaseSeries.id&&!excluded.has(r.releaseId)):[];
  function links(id,cls,expected,titleClass){
    const rows=classes(byId(doc,id,expected.length>0),cls);
    equal(rows.map(n=>[n.attrs.href,cleanText(titleClass?one(classes(n,titleClass),"Missing Release link title"):n)]),expected,"Release related identities mismatch: "+id);
    rows.forEach(n=>check(n.tag==="a"&&!descendants(n,x=>x.tag==="a").length,"Release nested/non-anchor link"));
  }
  const url=r=>"release/"+r.releaseId+".html";
  links("parentReleaseHost","release-child-row",parent?[[url(parent),parent.releaseName||"BOX詳細を見る"]]:[]);
  links("childReleasesHost","release-child-row",children.map(r=>[url(r),r.releaseName||"リリース名未設定"]),"release-child-title");
  links("seriesReleasesHost","release-child-row",siblings.map(r=>[url(r),r.releaseName||"リリース名未設定"]));
  check(visible(byId(doc,"relatedReleasesSection",false))===Boolean(parent||children.length||siblings.length),"Release related section visibility mismatch");
  const events=[...(release.relatedEvents||[])].sort((a,b)=>(Number.isFinite(Number(a.order))?Number(a.order):Infinity)-(Number.isFinite(Number(b.order))?Number(b.order):Infinity));
  links("relatedEventsHost","release-event-row",events.map(e=>["event.html?id="+encodeURIComponent(e.eventId),e.eventName]),"release-event-title");
  check(visible(byId(doc,"relatedEventsSection",false))===Boolean(events.length),"Release Event section visibility mismatch");
  equal(descendants(byId(doc,"officialRelease"),n=>n.tag==="a").map(n=>n.attrs.href),release.officialReleaseUrl?.trim()?[release.officialReleaseUrl.trim()]:[],"Release official URL mismatch");
  const tracks=release.includedSongs,meta=release.includedSongsMeta;
  check(Array.isArray(tracks)&&object(meta)&&["complete","partial","not_applicable","special_hold","unreviewed"].includes(meta.status),"Release coverage status invalid");
  const seen=new Set();
  tracks.forEach(r=>{check(/^RT\d{4}$/.test(r.relationId)&&!seen.has(r.relationId),"Release RT ID duplicate/invalid");seen.add(r.relationId);});
  if(Number.isInteger(meta.confirmedCount))check(meta.confirmedCount===tracks.length,"Release coverage confirmed count mismatch");
  const ids=new Set(tracks.map(r=>r.songId)),origins=new Set((release.debutSongs||[]).map(r=>r.songId)),outside=(release.debutSongs||[]).filter(r=>!ids.has(r.songId));
  links("debutSongs","release-song-row",outside.map(s=>["song/"+s.songId+".html",s.songName||s.displayName||"曲名未設定"]),"release-song-title");
  check(visible(byId(doc,"debutSongsSection",false))===Boolean(outside.length),"Release independent origin visibility mismatch");
  const included=byId(doc,"includedSongsContent",tracks.length>0||release.releaseId==="R0072");
  check(!classes(included,"release-inclusion-error").length,"Release error DOM persisted");
  const countLabel=byId(doc,"includedSongsCount",false);
  const nav=byId(doc,"releaseSectionNav",false),sections=[["includedSongsSection","収録内容"],["kamiparaHistorySection","神パラ歌唱履歴"],["debutSongsSection","初出・由来"],["relatedReleasesSection","関連作品"],["relatedEventsSection","関連イベント"],["releaseInformationSection","作品情報"]].filter(([id])=>doc.ids.has(id)&&visible(doc.ids.get(id)));
  equal(descendants(nav,n=>n.tag==="a").map(n=>[n.attrs.href,cleanText(n)]),sections.map(([id,label])=>["/release/"+release.releaseId+".html#"+id,label]),"Release section navigation destination/order mismatch");
  check(visible(nav)===(sections.length>0),"Release section navigation visibility mismatch");
  if(release.releaseId==="R0072"){
    check(cleanText(countLabel)==="10曲","R0072 dedicated count label mismatch");
    check(meta.status==="special_hold"&&!tracks.length,"R0072 dedicated coverage mismatch");
    check(!classes(included,"release-included-song-row").length,"R0072 must not use normal Song links");
    check(classes(included,"release-kp-song").every(n=>n.tag==="article"&&!descendants(n,x=>x.tag==="a").length),"R0072 dedicated Song cards must stay nonlink");
    return; // Dedicated snapshot/body verification is mandatory at the caller.
  }
  const note=String(meta.publicNote||"").trim();
  const discNumbers=new Set(tracks.map(r=>r.disc)),uniqueSongs=new Set(tracks.map(r=>r.songId)).size;
  let expectedCount=tracks.length?(uniqueSongs===tracks.length?tracks.length+"曲":tracks.length+"件（"+uniqueSongs+"曲）"):"";
  if(tracks.length&&release.classification==="特典"&&release.releaseType==="全巻購入特典")expectedCount="店舗別特典CD";
  else if(tracks.length&&discNumbers.size>1&&!discNumbers.has(null)&&!discNumbers.has(undefined)){
    const registered=tracks.every(r=>Number.isInteger(r.disc)&&r.disc>0&&Number.isInteger(r.track)&&r.track>0)&&new Set(tracks.map(r=>r.disc+":"+r.track)).size===tracks.length;
    expectedCount=discNumbers.size+" Disc · "+(uniqueSongs===tracks.length?tracks.length+"曲":tracks.length+(registered?"トラック":"件")+"（"+uniqueSongs+"曲）");
  }
  if(productContents)expectedCount=productContents.discs.length+" Disc · "+productContents.tracks.length+"トラック";
  check(cleanText(countLabel)===expectedCount,"Release relation/unique Song count label mismatch");
  check(visible(byId(doc,"includedSongsSection",false))===!(meta.status==="not_applicable"&&!tracks.length&&!note),"Release coverage visibility mismatch");
  if(note)check(classes(included,"release-coverage-note").some(n=>visible(n)&&textContent(n).includes(note)),"Release publicNote missing/hidden");
  if(meta.status==="partial"&&Number.isFinite(Number(meta.confirmedCount))&&Number.isFinite(Number(meta.pendingCount)))
    equal(classes(included,"release-coverage-progress").map(cleanText),["確認済み"+Number(meta.confirmedCount)+"件 / 確認中"+Number(meta.pendingCount)+"件"],"Release coverage progress mismatch");
  const rows=classes(included,"release-included-song-row");
  check(rows.length===tracks.length,"Release included Song multiplicity mismatch");
  if(!tracks.length){
    if(meta.status==="complete")check(textContent(included).includes("収録楽曲の登録はありません"),"Release complete-empty state missing");
    if(meta.status==="unreviewed"&&!note)check(textContent(included).includes("収録情報を確認中"),"Release unreviewed state missing");
    return;
  }
  const hasStores=tracks.some(r=>String(r.benefitStore||"").trim()),stores=new Map();
  tracks.forEach(r=>{const s=hasStores?String(r.benefitStore||"").trim():"";if(!stores.has(s))stores.set(s,[]);stores.get(s).push(r);});
  const storeTitle=s=>release.classification==="特典"&&release.releaseType==="全巻購入特典"&&s?s+"｜"+release.releaseName:s||"店舗未登録";
  equal(classes(included,"release-store-heading").map(cleanText),hasStores?[...stores.keys()].map(storeTitle):[],"Release store headings mismatch");
  const groups=[],expectedRows=[];
  for(const[store,records]of stores){
    const discs=new Map();
    records.forEach(r=>{const d=r.disc==null?null:String(r.disc);if(!discs.has(d))discs.set(d,[]);discs.get(d).push(r);});
    const keys=[...discs.keys()].filter(d=>d!==null);if(discs.has(null))keys.push(null);
    const large=resolved.editionType==="memorial_box"&&!hasStores&&keys.length>=10;
    keys.forEach((disc,i)=>{
      const data=discs.get(disc),common=typeof data[0].variant==="string"&&data[0].variant.trim()&&data.every(r=>r.variant===data[0].variant)?data[0].variant:"";
      const group={store,disc,data,large,common:large?common:"",collapsible:keys.length>=2,open:keys.length<3||i===0};
      groups.push(group);expectedRows.push(...data.map(record=>({record,group})));
    });
  }
  const details=classes(included,"release-disc-details"),collapsible=groups.filter(g=>g.collapsible);
  equal(details.map(n=>n.attrs.id),collapsible.map(g=>"release-disc-"+(groups.indexOf(g)+1)),"Release Disc identities/order mismatch");
  details.forEach((n,i)=>check(Object.hasOwn(n.attrs,"open")===collapsible[i].open,"Release initial Disc state mismatch"));
  equal(classes(included,"release-disc-index").flatMap(nav=>descendants(nav,n=>n.tag==="a")).map(n=>[n.attrs.href,n.attrs["data-disc-target"]]),groups.filter(g=>g.collapsible&&!g.large).map(g=>{const id="release-disc-"+(groups.indexOf(g)+1);return["/release/"+release.releaseId+".html#"+id,id];}),"Release Disc index destination mismatch");
  const marked=new Set();
  rows.forEach((node,i)=>{
    const{record:r,group:g}=expectedRows[i];
    check(node.tag==="a"&&node.attrs["data-relation-id"]===r.relationId,"Release RT identity/order mismatch");
    check(node.attrs.href==="song/"+r.songId+".html"&&!descendants(node,n=>n.tag==="a").length,"Release included Song href/nested links mismatch");
    check(cleanText(one(classes(node,"release-included-song-title"),"Missing included title"))===(r.displayName||r.songName),"Release included Song title mismatch");
    equal(classes(node,"release-track-number").map(cleanText),r.track==null?[]:[String(r.track)],"Release Track mismatch");
    if(r.track==null&&tracks.some(r=>r.track!=null))check(textContent(node).includes("Track未登録"),"Release missing Track must not be invented");
    equal(classes(node,"release-variant").map(cleanText),!g.common&&r.variant!=null&&r.variant!==""?[String(r.variant)]:[],"Release variant omission/mismatch");
    const mark=origins.has(r.songId)&&!marked.has(r.songId);if(mark)marked.add(r.songId);
    equal(classes(node,"release-origin").map(cleanText),mark?["初出・由来"]:[],"Release origin set/multiplicity mismatch");
    function ancestor(pred){for(let n=node.parent;n;n=n.parent)if(pred(n))return n;}
    const host=ancestor(n=>hasClass(n,"release-disc-details")||hasClass(n,"release-disc-group"));
    if(g.disc!==null||g.collapsible){
      check(host,"Release Disc group missing");
      const title=one(descendants(host,n=>n.tag==="summary"||hasClass(n,"release-disc-heading")),"Release Disc heading missing");
      const trackCount=productContents?productContents.discs.find(d=>String(d.disc)===g.disc).tracks.length:g.data.length;
      equal(cleanText(title),(g.disc===null?"Disc未登録":"Disc "+g.disc)+(g.common?" · "+g.common:"")+trackCount+(g.data.every(r=>r.track!=null)?"トラック":"件"),"Release Disc/heading variant mismatch");
    }else check(!host,"Release unregistered Disc must not be invented");
    if(hasStores){const h=ancestor(n=>hasClass(n,"release-store-group"));check(h&&cleanText(one(classes(h,"release-store-heading"),"Missing store"))===storeTitle(g.store),"Release store association mismatch");}
  });
  const notes=classes(included,"release-registration-details");
  if(release.releaseId==="R0052")check(notes.length===1&&Object.hasOwn(notes[0].attrs,"hidden"),"R0052 technical note must remain hidden");
  if(marked.size)check(notes.some(n=>textContent(n).includes("曲マスター上")&&textContent(n).includes("収録バージョン")),"Release origin meaning missing");
  if(groups.some(g=>g.large)){
    check(!descendants(included,n=>["data-box-search","data-box-matches","data-box-jump","data-box-search-count"].some(a=>Object.hasOwn(n.attrs,a))||hasClass(n,"release-box-search")).length&&!textContent(included).includes("曲名から探す"),"Release removed BOX search present");
    const disc=one(descendants(included,n=>Object.hasOwn(n.attrs,"data-box-disc")),"Missing BOX Disc selector");
    equal(descendants(disc,n=>n.tag==="option").map(n=>n.attrs.value),groups.map((g,i)=>"release-disc-"+(i+1)),"Release BOX Disc selector mismatch");
    const member=one(descendants(included,n=>Object.hasOwn(n.attrs,"data-box-member")),"Missing BOX member selector");
    check(!Object.hasOwn(member.attrs,"disabled"),"Release BOX member enrichment incomplete");
    equal(descendants(member,n=>n.tag==="option").map(n=>[n.attrs.value,cleanText(n)]),[["","すべてのメンバー"],...children.map(r=>[r.featuredSinger?.id,r.featuredSinger?.name])],"Release BOX members mismatch");
    check(!textContent(one(descendants(included,n=>Object.hasOwn(n.attrs,"data-box-status")),"Missing BOX status")).trim(),"Release BOX pending/error status");
    equal(details.map(n=>(n.attrs.class||"").split(/\s+/).includes("is-selected")),groups.map((g,i)=>i===0),"Release BOX initial selection mismatch");
  }
  if(release.releaseId==="R0088")check(groups.length===27&&tracks.length===285&&ids.size===46&&children.length===9,"R0088 27/285/46/9 invariant mismatch");
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
    const sidecar = json("data/release-sidecars/R0052.json");
    const vocals = validateVocalData(json("data/release-vocals.json"), Object.fromEntries(sources.release));
    const contents = validateReleaseContentsData(json("data/release-contents.json"), Object.fromEntries(sources.release));
    const memberships = validateSongUnitMemberships(json("data/song-unit-memberships.json"), new Set(sources.song.keys()));
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
        if (type === "song") validateSongBody(doc, data, memberships);
        else {
          validateReleaseBody(doc, data, releaseList, contents.get(id));
          validateReleaseContentsBody(doc, data, contents.get(id));
          validateSidecarBody(doc, data, sidecar);
          validateVocalBody(doc, data, vocals);
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

module.exports = { validateStaticHtml, validateReleaseBody, validateKamiparaBody, releaseDescription };
if (require.main === module) {
  const args = process.argv.slice(2);
  const revision = args.length === 2 && args[0] === "--revision" ? args[1] : undefined;
  const result = validateStaticHtml({ revision });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "PASS" ? 0 : result.status === "UNVERIFIED" ? 2 : 1;
}
