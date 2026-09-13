import { apiGet, escapeHtml, formatDate } from "./api.js?v=5.3.0&cache=solo-live-schema";
import { renderCommon } from "./common.js?v=4.9.1&cache=revision-nonblocking";

renderCommon("release");
const $ = id => document.getElementById(id);
const elements = { breadcrumbName: $("breadcrumbName"), releaseName: $("releaseName"), heroMeta: $("heroMeta"), status: $("status"), mainContent: $("mainContent"), releaseInfo: $("releaseInfo"), officialRelease: $("officialRelease"), relatedEventsHost: $("relatedEventsHost"), childReleasesHost: $("childReleasesHost"), debutSongsSection: $("debutSongsSection"), debutSongs: $("debutSongs"), includedSongsSection: $("includedSongsSection"), includedSongsCount: $("includedSongsCount"), includedSongsContent: $("includedSongsContent") };
const releaseId = String(new URLSearchParams(location.search).get("id") || "").trim();

function setLoading() {
  elements.releaseName.textContent = "読み込み中…";
  elements.heroMeta.textContent = "APIから実データを取得しています。";
  elements.status.hidden = false;
  elements.status.classList.remove("error");
  elements.status.textContent = "リリースデータを読み込んでいます...";
  elements.mainContent.hidden = true;
  elements.debutSongsSection.hidden = true;
  elements.includedSongsSection.hidden = true;
}

function errorKind(error) {
  const code = String(error?.code || "").toUpperCase();
  if (code === "RELEASE_NOT_FOUND") return "not-found";
  return /見つかりません/.test(String(error?.message || "")) ? "not-found" : "network";
}

function setError(title, message, retryable) {
  elements.releaseName.textContent = title;
  elements.heroMeta.textContent = message;
  elements.breadcrumbName.textContent = title;
  document.title = `${title}｜μ's Song Database`;
  elements.mainContent.hidden = true;
  elements.debutSongsSection.hidden = true;
  elements.includedSongsSection.hidden = true;
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

function includedSongRow(song, grouped) {
  const title = String(song.displayName || song.songName || "曲名未設定");
  const position = grouped
    ? (song.track == null ? "" : `Track ${song.track}`)
    : [song.disc == null ? "" : `Disc ${song.disc}`, song.track == null ? "" : `Track ${song.track}`].filter(Boolean).join(" / ");
  const variant = song.variant == null ? "" : String(song.variant);
  return `<a class="release-included-song-row" href="song.html?id=${encodeURIComponent(song.songId)}"><span class="release-included-song-copy"><span class="release-included-song-title">${escapeHtml(title)}</span>${position || variant ? `<span class="release-included-song-meta">${position ? `<span>${escapeHtml(position)}</span>` : ""}${variant ? `<span class="release-variant">${escapeHtml(variant)}</span>` : ""}</span>` : ""}</span><span class="release-included-song-arrow" aria-hidden="true">›</span></a>`;
}

function renderIncludedSongs(release) {
  const songs = release.includedSongs;
  const meta = release.includedSongsMeta;
  if (!Array.isArray(songs) || !meta || typeof meta !== "object" || Array.isArray(meta) || !inclusionStatuses.has(String(meta.status || ""))) {
    inclusionError();
    return;
  }
  const valid = songs.every(song => song && typeof song === "object" && /^RT\d{4}$/.test(String(song.relationId || "")) && /^S\d{3,}$/.test(String(song.songId || "")) && (song.disc == null || Number.isInteger(Number(song.disc))) && (song.track == null || Number.isInteger(Number(song.track))) && (song.variant == null || typeof song.variant === "string"));
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
  elements.includedSongsCount.textContent = songs.length === 0 ? "" : `${songs.length}件`;
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
  const groups = [];
  const byDisc = new Map();
  songs.forEach(song => {
    const key = song.disc == null ? "__NO_DISC__" : String(song.disc);
    if (!byDisc.has(key)) {
      const group = { key, disc: song.disc == null ? null : song.disc, songs: [] };
      byDisc.set(key, group);
      groups.push(group);
    }
    byDisc.get(key).songs.push(song);
  });
  const noDiscIndex = groups.findIndex(group => group.disc == null);
  if (noDiscIndex >= 0 && noDiscIndex !== groups.length - 1) groups.push(groups.splice(noDiscIndex, 1)[0]);
  let listHtml;
  if (groups.length <= 1) {
    listHtml = `<div class="release-included-list">${songs.map(song => includedSongRow(song, false)).join("")}</div>`;
  } else if (groups.length === 2) {
    listHtml = groups.map(group => `<section class="release-disc-group"><h3 class="release-disc-heading">${group.disc == null ? "Disc情報なし" : `Disc ${escapeHtml(group.disc)}`}</h3><div class="release-included-list">${group.songs.map(song => includedSongRow(song, true)).join("")}</div></section>`).join("");
  } else {
    listHtml = groups.map((group, index) => `<details class="release-disc-details"${index === 0 ? " open" : ""}><summary>${group.disc == null ? "Disc情報なし" : `Disc ${escapeHtml(group.disc)}`}（${group.songs.length}件）</summary><div class="release-included-list">${group.songs.map(song => includedSongRow(song, true)).join("")}</div></details>`).join("");
  }
  elements.includedSongsContent.innerHTML = noteHtml + listHtml;
  elements.includedSongsSection.hidden = false;
}

function normalizedLabel(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja");
}

function editionLabel(value) {
  if (value === "individual") return "個別盤";
  if (value === "memorial_box") return "Memorial BOX";
  return "";
}

function renderRelease(release, releaseList = []) {
  const name = String(release.releaseName || "リリース名未設定");
  const date = release.releaseDate ? formatDate(release.releaseDate) : "発売日未登録";
  const classification = String(release.classification || "分類未設定");
  const releaseType = String(release.releaseType || "").trim();
  elements.releaseName.textContent = name;
  elements.breadcrumbName.textContent = name;
  elements.heroMeta.innerHTML = `<span>${escapeHtml(date)}</span><span>${escapeHtml(classification)}</span>${releaseType ? `<span>${escapeHtml(releaseType)}</span>` : ""}`;
  document.title = `${name}｜μ's Song Database`;
  const info = [["発売日", date], ["大分類", classification]];
  if (releaseType) info.push(["リリース種別", releaseType]);
  const officialName = String(release.officialName || "").trim();
  if (officialName && normalizedLabel(officialName) !== normalizedLabel(name)) info.push(["正式商品名", officialName]);
  const seriesName = String(release.releaseSeries?.shortName || release.releaseSeries?.name || "").trim();
  if (seriesName) info.push(["シリーズ", seriesName]);
  const edition = editionLabel(String(release.editionType || "").trim());
  if (edition) info.push(["エディション", edition]);
  const singerName = String(release.featuredSinger?.name || "").trim();
  if (singerName) info.push(["対象キャラクター／歌唱名義", singerName]);
  const catalogNumber = String(release.catalogNumber || "").trim();
  if (catalogNumber) info.push(["品番", catalogNumber]);
  if (String(release.sourceMedia || "").trim()) info.push(["曲マスター由来メディア", release.sourceMedia]);
  elements.releaseInfo.innerHTML = info.map(([label, value]) => `<div class="release-info-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const parentReleaseId = String(release.parentReleaseId || "").trim();
  const parentRelease = parentReleaseId ? releaseList.find(item => String(item.releaseId) === parentReleaseId) : null;
  if (parentRelease) elements.releaseInfo.insertAdjacentHTML("beforeend", `<div class="release-info-row"><dt>BOX</dt><dd><a href="release.html?id=${encodeURIComponent(parentReleaseId)}">${escapeHtml(parentRelease.releaseName || "BOX詳細を見る")}</a></dd></div>`);
  const officialUrl = String(release.officialReleaseUrl || "").trim();
  elements.officialRelease.innerHTML = officialUrl ? `<a class="release-official-link" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">公式作品ページを見る ↗</a>` : `<p class="release-official-empty">公式作品ページは未登録です</p>`;
  const relatedEvents = (Array.isArray(release.relatedEvents) ? release.relatedEvents : [])
    .map((event, index) => ({ event, index, order: Number(event?.order) }))
    .filter(({ event }) => event && typeof event === "object" && /^EV\d+$/.test(String(event.eventId || "")) && String(event.eventName || "").trim())
    .sort((a, b) => (Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER) - (Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ event }) => event);
  elements.relatedEventsHost.innerHTML = relatedEvents.length ? `<section class="release-related" aria-labelledby="relatedEventsHeading"><p class="release-section-kicker">RELATED EVENTS</p><h2 id="relatedEventsHeading">関連イベント</h2><div class="release-event-list">${relatedEvents.map(event => {
    const eventDate = String(event.date || "").trim();
    const relation = String(event.relation || "").trim();
    return `<a class="release-event-row" href="event.html?id=${encodeURIComponent(event.eventId)}"><span class="release-event-copy"><span class="release-event-title">${escapeHtml(event.eventName)}</span>${eventDate || relation ? `<span class="release-event-meta">${eventDate ? `<span>${escapeHtml(formatDate(eventDate))}</span>` : ""}${relation ? `<span>${escapeHtml(relation)}</span>` : ""}</span>` : ""}</span><span class="release-event-arrow" aria-hidden="true">›</span></a>`;
  }).join("")}</div></section>` : "";
  const children = String(release.editionType || "") === "memorial_box"
    ? releaseList.filter(item => String(item.parentReleaseId || "") === String(release.releaseId || ""))
    : [];
  elements.childReleasesHost.innerHTML = children.length ? `<section class="release-related" aria-labelledby="childReleasesHeading"><p class="release-section-kicker">INDIVIDUAL EDITIONS</p><h2 id="childReleasesHeading">個別盤</h2><div class="release-child-list">${children.map(child => {
    const childSinger = String(child.featuredSinger?.name || "").trim();
    return `<a class="release-child-row" href="release.html?id=${encodeURIComponent(child.releaseId)}"><span class="release-child-copy"><span class="release-child-title">${escapeHtml(child.releaseName || "リリース名未設定")}</span>${childSinger ? `<span class="release-child-meta"><span>${escapeHtml(childSinger)}</span></span>` : ""}</span><span class="release-child-arrow" aria-hidden="true">›</span></a>`;
  }).join("")}</div></section>` : "";
  const songs = Array.isArray(release.debutSongs) ? release.debutSongs : [];
  elements.debutSongsSection.hidden = songs.length === 0;
  elements.debutSongs.innerHTML = songs.length ? `<div class="release-song-list">${songs.map(song => {
    const songName = String(song.songName || song.displayName || "曲名未設定");
    const displayName = String(song.displayName || "").trim();
    return `<a class="release-song-row" href="song.html?id=${encodeURIComponent(song.songId)}"><span class="release-song-copy"><span class="release-song-title">${escapeHtml(songName)}</span>${displayName && displayName !== songName ? `<span class="release-song-display">${escapeHtml(displayName)}</span>` : ""}</span><span class="release-song-arrow" aria-hidden="true">›</span></a>`;
  }).join("")}</div>` : "";
  renderIncludedSongs(release);
  elements.status.hidden = true;
  elements.mainContent.hidden = false;
}

async function loadRelease() {
  if (!releaseId) { setError("リリースが指定されていません", "リリース一覧から見たい作品を選択してください。", false); return; }
  if (!/^R\d{4}$/.test(releaseId)) { setError("Release IDの形式が正しくありません", "リリース一覧から見たい作品を選択してください。", false); return; }
  setLoading();
  try {
    const response = await apiGet("release", { id: releaseId }, { timeoutMs: 20000, retryCount: 1, cache: true });
    const release = response.data || {};
    const needsReleaseList = Boolean(release.releaseSeries || release.parentReleaseId || release.editionType === "memorial_box" || release.releaseType === "Solo Live!");
    const releaseList = needsReleaseList
      ? (await apiGet("releaseList", {}, { timeoutMs: 30000, retryCount: 1, cache: true })).data || []
      : [];
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
    renderRelease(resolvedRelease, safeReleaseList);
  } catch (error) {
    if (errorKind(error) === "not-found") { setError("該当するリリースが見つかりません", error?.message || "指定されたリリースは存在しません。", false); return; }
    console.error(error);
    setError("リリースデータを表示できません", error?.message || "APIへの接続に失敗しました。", true);
  }
}

loadRelease();
