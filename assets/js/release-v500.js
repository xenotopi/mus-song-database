import { buildSongUrl, apiGet, escapeHtml, formatDate } from "./api.js?v=5.3.0&cache=solo-live-schema&songUrls=1";
import { renderCommon } from "./common.js?v=4.10.1&cache=release-ux&songUrls=1";
import { buildSingerUrl } from "./singer-links.js?v=4.8.0";
import { setupDetailContext } from "./detail-context.js?v=4.6.1";
import { detailWithApiFallback, staticReleaseList, staticDetail } from "./static-detail.js?v=1.3.0";
import { renderKamiparaRelease, hasCompletedKamiparaContent } from "./release-kamipara.js?v=1.0.0";
import { renderAmazonProduct } from "./release-amazon.js";
import { attachReleaseSidecar } from "./release-sidecar.js?v=1.0.0";
import { singerDisplayName } from "./singer-display.js?v=1.0.0";
import { attachReleaseVocals } from "./release-vocals.js?v=1.3.0";
import { loadReleaseContents } from "./release-contents.js?v=1.1.0";
import { applyReleaseNavigation, loadReleaseNavigation, releaseNavigationModel } from "./release-navigation.js?v=1.0.0";
import { attachReleaseBluRay } from "./release-bluray.js?v=1.1.0";

renderCommon("release");
const $ = id => document.getElementById(id);
const elements = { breadcrumbName: $("breadcrumbName"), releaseName: $("releaseName"), heroMeta: $("heroMeta"), status: $("status"), skeleton: $("releaseSkeleton"), mainContent: $("mainContent"), releaseInfo: $("releaseInfo"), officialRelease: $("officialRelease"), relatedEventsHost: $("relatedEventsHost"), childReleasesHost: $("childReleasesHost"), debutSongsSection: $("debutSongsSection"), debutSongs: $("debutSongs"), includedSongsSection: $("includedSongsSection"), includedSongsCount: $("includedSongsCount"), includedSongsContent: $("includedSongsContent") };
const pathReleaseId = /^\/release\/(R\d{4})\.html$/.exec(location.pathname)?.[1] || "";
const releaseId = pathReleaseId || String(new URLSearchParams(location.search).get("id") || "").trim();
document.body.classList.toggle("release-box-top-safe", releaseId === "R0088");
// The generator marks completed Release HTML; never infer this from its title.
const hasPrerenderedContent = document.documentElement.dataset.releaseId === releaseId &&
  /^R\d{4}$/.test(releaseId) && !elements.mainContent.hidden;
let skeletonTimer = 0;

// Explicit document path: fragment-only URLs resolve against the formal page's
// ../ base, not against the Release that the reader is viewing.
export function releaseDocumentHref(fragment, current = location.href) {
  if (!/^[A-Za-z][\w:-]*$/.test(fragment)) throw new Error("Invalid Release fragment");
  const url = new URL(current);
  url.hash = fragment;
  return url.pathname + url.search + url.hash;
}

// ID-first references only. Members describe the existing live-history name;
// they must never be promoted to a recording credit or inferred from a title.
export function resolveReleasePerson(featured, data) {
  const id = String(featured?.id || "").trim(), name = String(featured?.name || "").trim();
  const official = Array.isArray(data?.official) ? data.official : [];
  const matches = official.filter(row => row.singerId === id);
  if (!/^SN\d{4}$/.test(id) || !name || matches.length !== 1 ||
      matches[0].category !== "公式" || matches[0].displayName !== name) return null;
  const result = { singerUrl: buildSingerUrl({ singerId: id }), cv: null, cvUrl: null };
  const row = matches[0], members = row.members;
  if (row.memberCount !== 1 || !Array.isArray(members) || members.length !== 1) return result;
  const member = members[0];
  if (!member.key || member.character !== name || !String(member.cast || "").trim()) return result;
  result.cv = member.cast;
  const solo = (Array.isArray(data?.solo) ? data.solo : []).filter(candidate =>
    candidate.category === "ソロ" && /^SN\d{4}$/.test(candidate.singerId || "") &&
    candidate.memberCount === 1 && candidate.displayName === member.cast &&
    Array.isArray(candidate.members) && candidate.members.length === 1 &&
    candidate.members[0].key === member.key && candidate.members[0].character === member.character &&
    candidate.members[0].cast === member.cast);
  if (solo.length === 1) result.cvUrl = buildSingerUrl(solo[0]);
  return result;
}

let singerListPromise, personGeneration = 0;
export let releasePersonReady = Promise.resolve();
function enrichReleasePerson(release) {
  const generation = ++personGeneration;
  const row = elements.releaseInfo.querySelector("[data-release-featured]");
  // Capture is snapshot-only. These references are optional runtime enrichment.
  if (window.__MUSDB_RELEASE_CAPTURE__ || release.releaseId === "R0072" ||
      !row || !/^SN\d{4}$/.test(String(release.featuredSinger?.id || ""))) return;
  singerListPromise ||= apiGet("singerList", {}, { timeoutMs: 30000, retryCount: 1, cache: true, cacheTtlMs: 300000 });
  releasePersonReady = singerListPromise.then(response => {
    if (generation !== personGeneration || !row.isConnected) return;
    const person = resolveReleasePerson(release.featuredSinger, response.data);
    if (!person) return;
    const dd = row.querySelector("dd"), anchor = document.createElement("a");
    anchor.href = person.singerUrl;
    anchor.textContent = singerDisplayName(release.featuredSinger, release.featuredSinger.name);
    anchor.setAttribute("aria-label", `${anchor.textContent}の歌唱記録`);
    dd.replaceChildren(anchor);
    if (!person.cv) return;
    const cvRow = document.createElement("div"), dt = document.createElement("dt"), value = document.createElement("dd");
    cvRow.className = "release-info-row"; cvRow.dataset.releaseInfoField = "cv"; cvRow.dataset.releaseCv = ""; dt.textContent = "CV";
    if (person.cvUrl) {
      const link = document.createElement("a"); link.href = person.cvUrl; link.textContent = person.cv;
      link.setAttribute("aria-label", `${person.cv}の歌唱記録`); value.append(link);
    } else value.textContent = person.cv;
    cvRow.append(dt, value); row.after(cvRow);
  }).catch(() => { /* Optional name metadata never clears successful Release content. */ });
}

function initializeReleaseContext() {
  document.body.classList.add("release-has-context");
  if (document.querySelector(".detail-context-bar[data-release-context]")) return;
  setupDetailContext({ typeLabel: "作品", titleSelector: "#releaseName", heroSelector: ".release-hero" });
  const bar = document.querySelector(".detail-context-bar");
  if (!bar) return;
  bar.dataset.releaseContext = "";
  const header = document.querySelector(".site-header");
  const update = () => {
    if (!bar.isConnected) return; // Capture removes the runtime bar before serialization.
    const offset = Math.max(0, header?.getBoundingClientRect().bottom || 0);
    document.body.style.setProperty("--release-context-top", `${offset}px`);
    document.body.style.setProperty("--release-anchor-offset", `${offset + bar.getBoundingClientRect().height + 12}px`);
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("pageshow", update);
  if (window.ResizeObserver) { const observer = new ResizeObserver(update); observer.observe(bar); if (header) observer.observe(header); }
  update();
}
initializeReleaseContext();

function hideSkeleton() {
  clearTimeout(skeletonTimer);
  skeletonTimer = 0;
  elements.skeleton.hidden = true;
}

function setLoading() {
  hideSkeleton();
  if (hasPrerenderedContent) {
    elements.status.hidden = true;
    elements.status.classList.remove("error");
    return;
  }
  skeletonTimer = window.setTimeout(() => { elements.skeleton.hidden = false; }, 120);
  elements.releaseName.textContent = "読み込み中…";
  elements.heroMeta.textContent = "APIから実データを取得しています。";
  elements.status.hidden = false;
  elements.status.classList.remove("error");
  elements.status.textContent = "リリースデータを読み込んでいます...";
  elements.mainContent.hidden = true;
  if ($("releaseSectionNav")) $("releaseSectionNav").hidden = true;
  elements.debutSongsSection.hidden = true;
  elements.includedSongsSection.hidden = true;
  $("kamiparaHistorySection").hidden = true;
  $("kamiparaDashboardSection").hidden = true;
}

function errorKind(error) {
  const code = String(error?.code || "").toUpperCase();
  if (code === "RELEASE_NOT_FOUND") return "not-found";
  return /見つかりません/.test(String(error?.message || "")) ? "not-found" : "network";
}

function setError(title, message, retryable) {
  hideSkeleton();
  if (hasPrerenderedContent) {
    title = "保存済みのリリース情報を表示しています。最新データを確認できませんでした。";
  } else {
    elements.releaseName.textContent = title;
    elements.heroMeta.textContent = message;
    elements.breadcrumbName.textContent = title;
    document.title = `${title}｜μ's Song Database`;
    elements.mainContent.hidden = true;
    if ($("releaseSectionNav")) $("releaseSectionNav").hidden = true;
    elements.debutSongsSection.hidden = true;
    elements.includedSongsSection.hidden = true;
    $("kamiparaHistorySection").hidden = true;
    $("kamiparaDashboardSection").hidden = true;
  }
  elements.status.hidden = false;
  elements.status.classList.add("error");
  elements.status.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span><div class="release-status-actions">${retryable ? '<button id="retryButton" type="button">再試行</button>' : ""}<a href="releases.html">リリース一覧へ戻る</a></div>`;
  if (retryable) $("retryButton")?.addEventListener("click", loadRelease, { once: true });
}

const inclusionStatuses = new Set(["complete", "partial", "special_hold", "unreviewed", "not_applicable"]);

function inclusionError() {
  elements.includedSongsCount.textContent = "";
  elements.includedSongsContent.innerHTML = '<p class="release-inclusion-error">収録情報を表示できません。再読み込みしてください。</p>';
  elements.includedSongsSection.hidden = false;
}

function titleChip(title) {
  const chars = Array.from(String(title));
  return `<span class="mus-title-chip">${escapeHtml(chars.slice(0, -2).join(""))}<span class="mus-title-tail">${escapeHtml(chars.slice(-2).join(""))}<span class="site-icon-inline mus-link-chevron" data-site-icon="chevron-right" aria-hidden="true"></span></span></span>`;
}

// Presentation-only helpers. Never normalize or rewrite registered variants.
export function commonDiscVariant(rows) {
  const variant = rows[0]?.variant;
  return typeof variant === "string" && variant.trim() && rows.every(row => row.variant === variant) ? variant : "";
}

export function inclusionCountLabel(release) {
  const rows = release.includedSongs || [], unique = new Set(rows.map(row => row.songId)).size;
  const discs = new Set(rows.map(row => row.disc));
  if (!rows.length) return "";
  if (release.classification === "特典" && release.releaseType === "全巻購入特典") return "店舗別特典CD";
  if (discs.size > 1 && !discs.has(null) && !discs.has(undefined)) {
    const registeredTracks = rows.every(row => Number.isInteger(row.disc) && row.disc > 0 && Number.isInteger(row.track) && row.track > 0) &&
      new Set(rows.map(row => row.disc + ":" + row.track)).size === rows.length;
    return unique === rows.length ? `${discs.size} Disc · ${rows.length}曲` :
      `${discs.size} Disc · ${rows.length}${registeredTracks ? "トラック" : "件"}（${unique}曲）`;
  }
  return unique === rows.length ? `${rows.length}曲` : `${rows.length}件（${unique}曲）`;
}

// Future adapter input, NOT a new snapshot/API contract. The current loader
// supplies no metadata. Preview fixtures and edition-unconfirmed credits are
// never imported. A separately approved adapter must resolve source and scope.
function approvedRelationMetadataItem(releaseId, relationId, metadata) {
  if (!metadata || metadata.releaseId !== releaseId || metadata.approved !== true) return null;
  const matches = (Array.isArray(metadata.relations) ? metadata.relations : []).filter(row => row?.relationId === relationId);
  const item = matches.length === 1 ? matches[0] : null;
  if (!item || item.verificationStatus !== "verified" || item.applicabilityMode !== "explicit_relation" ||
      !/^https:\/\//.test(String(item.sourceUrl || ""))) return null;
  return item;
}

function approvedCredits(item) {
  return (Array.isArray(item.credits) ? item.credits : []).filter(row =>
    ["lyricist", "composer"].includes(row.role) && typeof row.name === "string" && row.name.trim() &&
    row.verificationStatus === "verified" && row.applicabilityMode === "explicit_relation" && /^https:\/\//.test(String(row.sourceUrl || "")));
}

export function approvedRelationMetadataHtml(releaseId, relationId, metadata) {
  const item = approvedRelationMetadataItem(releaseId, relationId, metadata);
  if (!item) return "";
  const product = typeof item.productName === "string" && item.productName.trim() ?
    `<span class="release-product-name">${escapeHtml(item.productName)}</span>` : "";
  const credits = approvedCredits(item);
  return product + (credits.length ? `<span class="release-credits">${credits.map(row => `${row.role === "lyricist" ? "作詞" : "作曲"}：${escapeHtml(row.name)}`).join("　")}</span>` : "");
}

function includedSongRow(song, grouped, origin, partialTrack, options = {}) {
  const codeParts = options.managementCode?.match(/^([^ ]+)(?: (.+))?$/);
  const codeText = codeParts ? `<span class="release-management-code-value">${escapeHtml(codeParts[1])}</span>${codeParts[2] ? ` <span class="release-management-code-note">${escapeHtml(codeParts[2])}</span>` : ""}` : "";
  const code = options.showManagementCode ? `<span class="release-management-code"${options.managementCode ? ` aria-label="楽曲管理番号 ${escapeHtml(options.managementCode)}"` : ' aria-hidden="true"'}>${codeText}</span>` : "";
  if (song.contentOnly === true) return `<div class="release-product-track-row" data-product-disc="${song.disc}" data-product-track="${song.track}"><span class="release-track-number" aria-label="Track ${song.track}">${song.track}</span>${code}<span class="release-included-song-copy"><span class="release-product-track-title">${escapeHtml(song.officialTitle)}</span></span></div>`;
  const title = String(song.displayName || song.songName || "曲名未設定");
  const position = grouped
    ? (song.track == null ? (partialTrack ? "Track未登録" : "") : `Track ${song.track}`)
    : [song.disc == null ? "" : `Disc ${song.disc}`, song.track == null ? "" : `Track ${song.track}`].filter(Boolean).join(" / ");
  const variant = options.omitVariant || song.variant == null ? "" : String(song.variant);
  const track = grouped && song.track != null ? `<span class="release-track-number" aria-label="Track ${escapeHtml(song.track)}">${escapeHtml(song.track)}</span>` : "";
  const remainingPosition = track ? "" : position;
  const supplement = approvedRelationMetadataHtml(options.releaseId, song.relationId, options.metadata);
  const rowHtml = `<a class="release-included-song-row mus-card-link mus-chip-link" data-relation-id="${escapeHtml(song.relationId)}" href="${buildSongUrl(song.songId)}">${track}${code}<span class="release-included-song-copy"><span class="release-included-song-title">${titleChip(title)}</span>${supplement}${remainingPosition || variant || origin ? `<span class="release-included-song-meta">${remainingPosition ? `<span>${escapeHtml(remainingPosition)}</span>` : ""}${variant ? `<span class="release-variant">${escapeHtml(variant)}</span>` : ""}${origin ? '<span class="release-origin">初出・由来</span>' : ""}</span>` : ""}</span></a>`;
  if (!supplement) return rowHtml;
  const item = approvedRelationMetadataItem(options.releaseId, song.relationId, options.metadata);
  const sources = [...new Set([item.sourceUrl, ...approvedCredits(item).map(credit => credit.sourceUrl)])];
  // Sources have a separate destination: siblings of the Song anchor, never nested.
  return `<div class="release-metadata-entry">${rowHtml}<div class="release-metadata-sources">出典：${sources.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${sources.length === 1 ? "確認資料" : "資料" + (index + 1)}</a>`).join(" / ")}</div></div>`;
}

let boxView = null;
function renderIncludedSongs(release, approvedMetadata = null, productContents = null) {
  boxView = null;
  const registered = release.includedSongs;
  const songs = productContents?.tracks || registered;
  const meta = release.includedSongsMeta;
  if (!Array.isArray(songs) || !meta || typeof meta !== "object" || Array.isArray(meta) || !inclusionStatuses.has(String(meta.status || ""))) {
    inclusionError();
    return;
  }
  const valid = songs.every(song => song?.contentOnly === true ? Boolean(productContents) : song && typeof song === "object" && /^RT\d{4}$/.test(String(song.relationId || "")) && /^S\d{3,}$/.test(String(song.songId || "")) && (song.disc == null || Number.isInteger(Number(song.disc))) && (song.track == null || Number.isInteger(Number(song.track))) && (song.variant == null || typeof song.variant === "string"));
  if (!valid) {
    inclusionError();
    return;
  }
  const status = String(meta.status);
  const note = meta.publicNote == null ? "" : String(meta.publicNote).trim();
  elements.includedSongsSection.classList.toggle("is-empty", songs.length === 0);
  if (status === "not_applicable" && songs.length === 0 && !note) {
    elements.includedSongsSection.hidden = true;
    return;
  }
  const uniqueCount = new Set(registered.map(song => song.songId)).size;
  elements.includedSongsCount.textContent = productContents ? `${productContents.discCounts.length} Disc · ${songs.length}トラック` : inclusionCountLabel(release);
  const progress = status === "partial" && Number.isFinite(Number(meta.confirmedCount)) && Number.isFinite(Number(meta.pendingCount))
    ? `<span class="release-coverage-progress">確認済み${Number(meta.confirmedCount)}件 / 確認中${Number(meta.pendingCount)}件</span>` : "";
  const noteHtml = note || progress ? `<p class="release-coverage-note">${note ? escapeHtml(note) : ""}${progress}</p>` : "";
  if (songs.length === 0) {
    const empty = status === "complete"
      ? '<div class="release-songs-empty">収録楽曲の登録はありません。</div>'
      : status === "unreviewed" && !noteHtml
        ? '<p class="release-coverage-note">収録情報を確認中です。</p>'
        : "";
    elements.includedSongsContent.innerHTML = noteHtml + empty;
    elements.includedSongsSection.hidden = false;
    return;
  }
  const originIds = new Set((Array.isArray(release.debutSongs) ? release.debutSongs : []).map(song => song.songId));
  const marked = new Set();
  const stores = new Map();
  const hasStores = songs.some(song => String(song.benefitStore || "").trim());
  songs.forEach(song => {
    const store = hasStores ? String(song.benefitStore || "").trim() : "";
    if (!stores.has(store)) stores.set(store, []);
    stores.get(store).push(song);
  });
  let discId = 0;
  const renderStore = rows => {
    const discs = new Map();
    rows.forEach(song => {
      const key = song.disc == null ? null : String(song.disc);
      if (!discs.has(key)) discs.set(key, []);
      discs.get(key).push(song);
    });
    // Preserve the established rule: unspecified discs follow known discs.
    if (discs.has(null) && discs.size > 1) { const unknown = discs.get(null); discs.delete(null); discs.set(null, unknown); }
    const groups = [...discs].map(([disc, rows]) => ({ disc, rows, id: `release-disc-${++discId}` }));
    const largeBox = release.editionType === "memorial_box" && !hasStores && groups.length >= 10;
    const collapsible = groups.length >= 2;
    const index = largeBox ? `<div class="release-box-controls"><label>メンバーから探す<select data-box-member disabled><option value="">すべてのメンバー</option></select></label><label>Discから探す<select data-box-disc>${groups.map(group => `<option value="${group.id}">Disc ${escapeHtml(group.disc)}${commonDiscVariant(group.rows) ? " · " + escapeHtml(commonDiscVariant(group.rows)) : ""}</option>`).join("")}</select></label><a data-box-child hidden></a><p class="release-box-status" data-box-status role="status"></p></div>` : collapsible ? `<nav class="release-disc-index" aria-label="Disc索引">${groups.map(group => `<a href="${escapeHtml(releaseDocumentHref(group.id))}" data-disc-target="${group.id}">${group.disc == null ? "Disc未登録" : `Disc ${escapeHtml(group.disc)}`}</a>`).join("")}</nav><div class="release-disc-actions"><button type="button" data-discs-open="true">すべて開く</button><button type="button" data-discs-open="false">すべて閉じる</button></div>` : "";
    if (largeBox) boxView = { release, groups, members: [], host: null };
    const partialTrack = songs.some(song => song.track != null);
    const body = groups.map((group, i) => {
      const columnHeadings = productContents ? '<div class="release-track-columns" aria-hidden="true"><span>No.</span><span>管理番号</span><span>曲名</span></div>' : "";
      const content = `<div class="release-included-list${productContents ? " release-product-track-list" : ""}">${columnHeadings}${group.rows.map(song => {
        const origin = originIds.has(song.songId) && !marked.has(song.songId);
        if (origin) marked.add(song.songId);
        const headingVariant = largeBox ? commonDiscVariant(group.rows) : "";
        return includedSongRow(song, true, origin, partialTrack, { omitVariant: Boolean(headingVariant), releaseId: release.releaseId, metadata: approvedMetadata, showManagementCode: Boolean(productContents), managementCode: productContents?.managementCodes[`${song.disc}:${song.track}`] });
      }).join("")}</div>`;
      const headingVariant = largeBox ? commonDiscVariant(group.rows) : "";
      const label = `${group.disc == null ? "Disc未登録" : `Disc ${escapeHtml(group.disc)}`}${headingVariant ? " · " + escapeHtml(headingVariant) : ""}<span class="release-disc-count">${group.rows.length}${group.rows.every(row => row.track != null) ? "トラック" : "件"}</span>`;
      if (collapsible) return `<details class="release-disc-details${largeBox && i === 0 ? " is-selected" : ""}" id="${group.id}"${(largeBox || groups.length >= 3) ? (i === 0 ? " open" : "") : " open"}><summary>${label}<span class="site-icon-inline site-disclosure-icon" data-site-icon="chevron-down" aria-hidden="true"></span></summary>${content}</details>`;
      if (group.disc == null && groups.length === 1) return content;
      return `<section class="release-disc-group"><h3 class="release-disc-heading">${label}</h3>${content}</section>`;
    }).join("");
    return largeBox ? `<div class="release-large-box">${index}${body}</div>` : index + body;
  };
  const explanation = registered.length !== uniqueCount ? '<p class="release-registration-note">同じ曲の別収録バージョン等も、それぞれ1件として表示しています。</p>' : "";
  const originNote = songs.some(song => originIds.has(song.songId)) ? '<p class="release-registration-note">「初出・由来」は曲マスター上で、このリリースを初出・由来として登録している楽曲です。特定の収録バージョンの初出を意味しません。</p>' : "";
  const trackNote = songs.every(song => song.track == null) ? '<p class="release-registration-note">Track番号は未登録です。</p>' : "";
  const fullVolumeBenefit = release.classification === "特典" && release.releaseType === "全巻購入特典";
  const storeNote = hasStores ? `<p class="release-registration-note">${fullVolumeBenefit ? "店舗別の全巻購入特典をまとめた登録です。" : "店舗ごとの収録情報です。"}</p>` : "";
  const listHtml = [...stores].map(([store, rows]) => {
    const title = fullVolumeBenefit && store && String(release.releaseName || "").trim() ? `${store}｜${release.releaseName}` : store || "店舗未登録";
    return hasStores ? `<section class="release-store-group"><h3 class="release-store-heading">${escapeHtml(title)}</h3>${renderStore(rows)}</section>` : renderStore(rows);
  }).join("");
  const technicalNotes = storeNote + explanation + originNote + trackNote;
  const supplement = technicalNotes ? `<details class="release-registration-details"${release.releaseId === "R0052" ? " hidden" : ""}><summary>収録情報の注記（初出・由来／Trackなど）</summary>${technicalNotes}</details>` : "";
  // Coverage warnings remain ahead of the songs; technical definitions follow.
  elements.includedSongsContent.innerHTML = noteHtml + listHtml + supplement;
  elements.includedSongsContent.onclick = event => {
    const toggle = event.target.closest("button[data-discs-open]");
    if (toggle) {
      elements.includedSongsContent.querySelectorAll(".release-disc-details").forEach(details => { details.open = toggle.dataset.discsOpen === "true"; });
      return;
    }
    const link = event.target.closest("a[data-disc-target]");
    if (!link || !elements.includedSongsContent.contains(link)) return;
    const details = document.getElementById(link.dataset.discTarget);
    if (!details || !elements.includedSongsContent.contains(details)) return;
    event.preventDefault();
    details.open = true;
    const summary = details.querySelector("summary");
    summary.focus({ preventScroll: true });
    details.scrollIntoView({ block: "start" });
  };
  if (boxView) setupBoxView(boxView);
  elements.includedSongsSection.hidden = false;
}

// Exact child-disc content matching, never a disc-number/member offset.
export function verifiedBoxMembers(release, children) {
  const group = rows => {
    const map = new Map();
    for (const row of rows) { if (!map.has(row.disc)) map.set(row.disc, []); map.get(row.disc).push(row); }
    return [...map].map(([disc, rows]) => ({ disc, rows }));
  };
  const signature = rows => JSON.stringify(rows.map(row => [row.songId, row.songName, row.displayName, row.track, row.variant, row.benefitStore]));
  const discs = group(release.includedSongs), assigned = new Set(), singerIds = new Set();
  if (!children.length) throw new Error("BOX_MEMBERS_UNAVAILABLE");
  const members = children.map(child => {
    if (child.parentReleaseId !== release.releaseId || child.editionType !== "individual" ||
        !/^R\d{4}$/.test(String(child.releaseId)) || !/^SN\d+$/.test(String(child.featuredSinger?.id)) ||
        !child.featuredSinger?.name || singerIds.has(child.featuredSinger.id) || !Array.isArray(child.includedSongs)) throw new Error("BOX_MEMBER_REFERENCE");
    singerIds.add(child.featuredSinger.id);
    const variant = commonDiscVariant(child.includedSongs);
    if (!variant) throw new Error("BOX_MEMBER_VARIANT");
    const matches = group(child.includedSongs).map(childDisc => {
      const candidates = discs.filter(parentDisc => signature(parentDisc.rows) === signature(childDisc.rows));
      if (candidates.length !== 1 || assigned.has(candidates[0].disc)) throw new Error("BOX_MEMBER_AMBIGUOUS");
      assigned.add(candidates[0].disc);
      return candidates[0].disc;
    });
    return { id: child.featuredSinger.id, name: child.featuredSinger.name, releaseId: child.releaseId, discs: matches };
  });
  if (assigned.size !== discs.length) throw new Error("BOX_MEMBER_INCOMPLETE");
  return members;
}

function setupBoxView(view) {
  const host = elements.includedSongsContent.querySelector(".release-large-box");
  view.host = host;
  const memberSelect = host.querySelector("[data-box-member]"), discSelect = host.querySelector("[data-box-disc]");
  const selectedGroup = () => view.groups.find(group => group.id === discSelect.value);
  function show(id, jump = false) {
    const group = view.groups.find(group => group.id === id);
    if (!group) return;
    discSelect.value = id;
    host.querySelectorAll(".release-disc-details").forEach(details => {
      const selected = details.id === id;
      details.classList.toggle("is-selected", selected);
      details.open = selected;
    });
    const details = host.querySelector("#" + id);
    if (jump) {
      const target = details.querySelector("summary");
      target?.focus({ preventScroll: true });
      (target || details).scrollIntoView({ block: "start" });
    }
  }
  discSelect.addEventListener("change", () => show(discSelect.value, true));
  memberSelect.addEventListener("change", () => {
    const selectedMember = view.members.find(member => member.id === memberSelect.value) || null;
    const previous = selectedGroup();
    const groups = view.groups.filter(group => !selectedMember || selectedMember.discs.includes(group.rows[0]?.disc));
    discSelect.innerHTML = groups.map(group => `<option value="${group.id}">Disc ${escapeHtml(group.disc)}${commonDiscVariant(group.rows) ? " · " + escapeHtml(commonDiscVariant(group.rows)) : ""}</option>`).join("");
    const childLink = host.querySelector("[data-box-child]");
    childLink.hidden = !selectedMember;
    if (selectedMember) {
      childLink.href = "release/" + encodeURIComponent(selectedMember.releaseId) + ".html";
      childLink.textContent = selectedMember.name + "の個別盤を見る →";
    }
    show(groups.some(group => group.id === previous?.id) ? previous.id : groups[0].id);
  });
  view.setMembers = members => {
    view.members = members;
    memberSelect.innerHTML = '<option value="">すべてのメンバー</option>' + members.map(member => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join("");
    memberSelect.disabled = false;
    host.querySelector("[data-box-status]").textContent = "";
  };
}

const boxChildRequests = new Map();
async function hydrateBoxMembers(view, list, source) {
  if (!view || view !== boxView) return;
  const children = list.filter(child => child.parentReleaseId === view.release.releaseId && child.editionType === "individual");
  const status = view.host.querySelector("[data-box-status]");
  status.textContent = "メンバー情報を読み込んでいます…";
  try {
    if (source.source !== "static" || !children.length) throw new Error("BOX_SOURCE_UNAVAILABLE");
    const details = new Array(children.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, children.length) }, async () => {
      while (next < children.length) {
        const index = next++, child = children[index], key = source.revision + ":" + child.releaseId;
        if (!boxChildRequests.has(key)) {
          const request = staticDetail("release", child.releaseId).then(response => {
            if (response.revision !== source.revision || response.dataRevision !== source.dataRevision) throw new Error("BOX_REVISION_MISMATCH");
            return response.data;
          }).catch(error => { boxChildRequests.delete(key); throw error; });
          boxChildRequests.set(key, request);
        }
        details[index] = await boxChildRequests.get(key);
      }
    }));
    let members;
    try { members = verifiedBoxMembers(view.release, details); }
    catch (error) {
      children.forEach(child => boxChildRequests.delete(source.revision + ":" + child.releaseId));
      throw error;
    }
    if (boxView === view) view.setMembers(members);
  } catch {
    if (boxView !== view) return;
    status.innerHTML = 'メンバー情報を取得できません。Disc選択をご利用ください。 <button type="button" data-box-retry>再試行</button>';
    status.querySelector("button").addEventListener("click", () => { void hydrateBoxMembers(view, list, source); }, { once: true });
  }
}

function normalizedLabel(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja");
}

function editionLabel(value) {
  if (value === "individual") return "個別盤";
  if (value === "memorial_box") return "Memorial BOX";
  return "";
}

function updateSectionNav() {
  const nav = $("releaseSectionNav");
  if (!nav) return;
  const sections = [["includedSongsSection", "収録内容"], ["bluRayProductSection", "本編・特典"], ["kamiparaHistorySection", "神パラ歌唱履歴"], ["debutSongsSection", "初出・由来"], ["relatedReleasesSection", "関連作品"], ["relatedEventsSection", "関連イベント"], ["releaseInformationSection", "作品情報"]].filter(([id]) => $(id) && !$(id).hidden);
  nav.innerHTML = sections.map(([id, label]) => `<a href="${escapeHtml(releaseDocumentHref(id))}">${label}</a>`).join("");
  nav.hidden = sections.length === 0;
}

function renderRelease(release, releaseList = [], approvedMetadata = null, productContents = null, navigationData = null) {
  const name = String(release.releaseName || "リリース名未設定");
  const date = release.releaseDate ? formatDate(release.releaseDate) : "発売日未登録";
  const classification = String(release.classification || "分類未設定");
  const releaseType = String(release.releaseType || "").trim();
  elements.releaseName.textContent = name;
  elements.breadcrumbName.textContent = name;
  const dateLabel = ["R0032", "R0052"].includes(release.releaseId) ? `Blu-ray最終巻発売日：${date}` : date;
  elements.heroMeta.innerHTML = `<span>${escapeHtml(dateLabel)}</span><span>${escapeHtml(classification)}</span>${releaseType ? `<span>${escapeHtml(releaseType)}</span>` : ""}`;
  document.title = `${name}｜μ's Song Database`;
  const info = [];
  const parentReleaseId = String(release.parentReleaseId || "").trim();
  const parentMatches = /^R\d{4}$/.test(parentReleaseId) && parentReleaseId !== release.releaseId
    ? releaseList.filter(item => item.releaseId === parentReleaseId) : [];
  const parentRelease = parentMatches.length === 1 ? parentMatches[0] : null;
  const officialName = String(release.officialName || "").trim();
  if (officialName) info.push(["official", "正式商品名", officialName]);
  const seriesName = String(release.releaseSeries?.shortName || release.releaseSeries?.name || "").trim();
  if (seriesName) info.push(["series", "シリーズ", seriesName]);
  if (parentRelease) info.push(["parent", "親BOX", parentRelease.releaseName || "BOX詳細を見る", `release/${parentReleaseId}.html`]);
  const singerName = singerDisplayName(release.featuredSinger, release.featuredSinger?.name).trim();
  if (singerName) info.push(["featured", "対象キャラクター／歌唱名義", singerName]);
  const edition = editionLabel(String(release.editionType || "").trim());
  if (edition) info.push(["edition", "エディション", edition]);
  const catalogNumber = String(release.catalogNumber || "").trim();
  if (catalogNumber) info.push(["catalog", "品番", catalogNumber]);
  // Keep definition pairs in reading/Tab order. CSS pairs semantic fields, not
  // element positions, so missing fields and optional late CV do not shift rows.
  elements.releaseInfo.innerHTML = info.map(([field, label, value, href]) => `<div class="release-info-row" data-release-info-field="${field}"${field === "featured" ? " data-release-featured" : ""}><dt>${escapeHtml(label)}</dt><dd>${href ? `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>` : escapeHtml(value)}</dd></div>`).join("");
  elements.releaseInfo.hidden = info.length === 0;
  const parentHost = $("parentReleaseHost");
  const preserveRelated = hasPrerenderedContent && $("relatedReleasesSection")?.dataset.releaseNavigationReady && (!navigationData || releaseList.length !== 114);
  if (parentHost && !preserveRelated) parentHost.innerHTML = parentRelease ? `<section class="release-related"><h3>親BOX</h3><a class="release-child-row mus-card-link mus-chip-link" href="release/${encodeURIComponent(parentReleaseId)}.html">${titleChip(parentRelease.releaseName || "BOX詳細を見る")}</a></section>` : "";
  const officialUrl = String(release.officialReleaseUrl || "").trim();
  elements.officialRelease.innerHTML = officialUrl ? `<a class="release-official-link" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">公式作品ページを見る <span class="site-icon-inline " data-site-icon="external-link" aria-hidden="true"></span></a>` : `<p class="release-official-empty">公式作品ページは未登録です</p>`;
  const relatedEvents = (Array.isArray(release.relatedEvents) ? release.relatedEvents : [])
    .map((event, index) => ({ event, index, order: Number(event?.order) }))
    .filter(({ event }) => event && typeof event === "object" && /^EV\d+$/.test(String(event.eventId || "")) && String(event.eventName || "").trim())
    .sort((a, b) => (Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER) - (Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ event }) => event);
  elements.relatedEventsHost.innerHTML = relatedEvents.length ? `<section class="release-related" aria-labelledby="relatedEventsHeading"><p class="release-section-kicker">RELATED EVENTS</p><h2 id="relatedEventsHeading">関連イベント</h2><div class="release-event-list">${relatedEvents.map(event => {
    const eventDate = String(event.date || "").trim();
    const relation = String(event.relation || "").trim();
    return `<a class="release-event-row mus-card-link mus-chip-link" href="event.html?id=${encodeURIComponent(event.eventId)}"><span class="release-event-copy"><span class="release-event-title">${titleChip(event.eventName)}</span>${eventDate || relation ? `<span class="release-event-meta">${eventDate ? `<span>${escapeHtml(formatDate(eventDate))}</span>` : ""}${relation ? `<span>${escapeHtml(relation)}</span>` : ""}</span>` : ""}</span></a>`;
  }).join("")}</div></section>` : "";
  const children = String(release.editionType || "") === "memorial_box"
    ? releaseList.filter(item => String(item.parentReleaseId || "") === String(release.releaseId || ""))
    : [];
  if (!preserveRelated) elements.childReleasesHost.innerHTML = children.length ? `<section class="release-related" aria-labelledby="childReleasesHeading"><p class="release-section-kicker">INDIVIDUAL EDITIONS</p><h2 id="childReleasesHeading">個別盤</h2><div class="release-child-list">${children.map(child => {
    const childSinger = singerDisplayName(child.featuredSinger, child.featuredSinger?.name).trim();
    return `<a class="release-child-row mus-card-link mus-chip-link" href="release/${encodeURIComponent(child.releaseId)}.html"><span class="release-child-copy"><span class="release-child-title">${titleChip(child.releaseName || "リリース名未設定")}</span>${childSinger ? `<span class="release-child-meta"><span>${escapeHtml(childSinger)}</span></span>` : ""}</span></a>`;
  }).join("")}</div></section>` : "";
  const excludedIds = new Set([release.releaseId, parentReleaseId, ...children.map(child => child.releaseId)]);
  const siblings = release.releaseSeries?.id ? releaseList.filter(item => item.releaseSeries?.id === release.releaseSeries.id && !excludedIds.has(item.releaseId) && /^R\d{4}$/.test(String(item.releaseId))) : [];
  if ($("seriesReleasesHost") && !preserveRelated) $("seriesReleasesHost").innerHTML = siblings.length ? `<section class="release-related"><h3>同シリーズ</h3><div class="release-child-list">${siblings.map(item => `<a class="release-child-row mus-card-link mus-chip-link" href="release/${encodeURIComponent(item.releaseId)}.html">${titleChip(item.releaseName || "リリース名未設定")}</a>`).join("")}</div></section>` : "";
  if ($("relatedReleasesSection") && !preserveRelated) $("relatedReleasesSection").hidden = !parentRelease && !children.length && !siblings.length;
  applyReleaseNavigation(release, releaseList, navigationData);
  if ($("relatedEventsSection")) $("relatedEventsSection").hidden = relatedEvents.length === 0;
  const includedIds = new Set((Array.isArray(release.includedSongs) ? release.includedSongs : []).map(song => song.songId));
  const songs = (Array.isArray(release.debutSongs) ? release.debutSongs : []).filter(song => !includedIds.has(song.songId));
  elements.debutSongsSection.hidden = songs.length === 0;
  elements.debutSongs.innerHTML = songs.length ? `<div class="release-song-list">${songs.map(song => {
    const songName = String(song.songName || song.displayName || "曲名未設定");
    const displayName = String(song.displayName || "").trim();
    return `<a class="release-song-row mus-card-link mus-chip-link" href="${buildSongUrl(song.songId)}"><span class="release-song-copy"><span class="release-song-title">${titleChip(songName)}</span>${displayName && displayName !== songName ? `<span class="release-song-display">${escapeHtml(displayName)}</span>` : ""}</span></a>`;
  }).join("")}</div>` : "";
  if (release.releaseId === "R0072") {
    elements.includedSongsSection.classList.remove("is-empty");
    if (!hasCompletedKamiparaContent(releaseId)) {
      elements.includedSongsCount.textContent = "";
      elements.includedSongsContent.textContent = "神パラの収録情報を読み込んでいます…";
    }
    elements.includedSongsSection.hidden = false;
  } else if (!approvedMetadata && boxView?.host?.isConnected && boxView.release.releaseId === release.releaseId && boxView.release.includedSongs === release.includedSongs) {
    // Supplemental list metadata must not replace already usable BOX controls.
    boxView.release = release;
  } else renderIncludedSongs(release, approvedMetadata, productContents);
  hideSkeleton();
  elements.status.hidden = true;
  elements.mainContent.hidden = false;
  enrichReleasePerson(release);
  updateSectionNav();
}

async function loadRelease() {
  if (!releaseId) { setError("リリースが指定されていません", "リリース一覧から見たい作品を選択してください。", false); return; }
  if (!/^R\d{4}$/.test(releaseId)) { setError("Release IDの形式が正しくありません", "リリース一覧から見たい作品を選択してください。", false); return; }
  setLoading();
  try {
    const response = await detailWithApiFallback("release", releaseId, () => apiGet("release", { id: releaseId }, { timeoutMs: 20000, retryCount: 1, cache: true }));
    const release = response.data || {};
    const needsReleaseList = !hasPrerenderedContent || Boolean(release.releaseSeries || release.parentReleaseId || release.editionType === "memorial_box" || release.releaseType === "Solo Live!");
    let releaseList = [];
    if (needsReleaseList) {
      // List metadata is supplementary. Render basic details immediately only
      // when there is no completed static body to preserve (including BOX links).
      if (!hasPrerenderedContent) renderRelease(release);
      try {
        try { releaseList = (await staticReleaseList()).data || []; }
        catch { releaseList = (await apiGet("releaseList", {}, { timeoutMs: 30000, retryCount: 1, cache: true })).data || []; }
      } catch {
        // A list outage must not erase successful details or completed prerender.
        if (boxView) boxView.host.querySelector("[data-box-status]").textContent = "メンバー情報を取得できません。Disc選択をご利用ください。";
        if (pathReleaseId) void renderAmazonProduct(releaseId, elements.officialRelease);
        if (release.releaseId === "R0072") await renderKamiparaRelease();
        updateSectionNav();
        return;
      }
    }
    const safeReleaseList = Array.isArray(releaseList) ? releaseList : [];
    const listRelease = safeReleaseList.find(item => String(item.releaseId || "") === String(release.releaseId || ""));
    const resolvedRelease = listRelease ? {
      ...release,
      releaseSeries: release.releaseSeries ?? listRelease.releaseSeries,
      editionType: release.editionType ?? listRelease.editionType,
      parentReleaseId: release.parentReleaseId ?? listRelease.parentReleaseId,
      featuredSinger: release.featuredSinger ?? listRelease.featuredSinger,
      catalogNumber: release.catalogNumber ?? listRelease.catalogNumber,
      officialName: release.officialName ?? listRelease.officialName
    } : release;
    const productContents = await loadReleaseContents(resolvedRelease);
    const navigationData = safeReleaseList.length === 114 ? await loadReleaseNavigation() : null;
    if (navigationData && !releaseNavigationModel(releaseId, safeReleaseList, navigationData)) throw new Error("Release navigation list identity mismatch");
    renderRelease(resolvedRelease, safeReleaseList, null, productContents, navigationData);
    await attachReleaseSidecar(resolvedRelease, elements.includedSongsContent);
    await attachReleaseVocals(resolvedRelease, elements.includedSongsContent);
    await attachReleaseBluRay(resolvedRelease);
    await hydrateBoxMembers(boxView, safeReleaseList, response);
    if (pathReleaseId) void renderAmazonProduct(releaseId, elements.officialRelease);
    if (resolvedRelease.releaseId === "R0072") await renderKamiparaRelease();
    updateSectionNav();
  } catch (error) {
    if (errorKind(error) === "not-found") { setError("該当するリリースが見つかりません", error?.message || "指定されたリリースは存在しません。", false); return; }
    if (!hasPrerenderedContent) console.error(error);
    setError("リリースデータを表示できません", error?.message || "APIへの接続に失敗しました。", true);
  }
}

// Capture waits for snapshot-backed BOX enrichment, never optional live CV.
export const releaseReady = loadRelease();
