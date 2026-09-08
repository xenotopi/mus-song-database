import { apiGet, escapeHtml, formatDate } from "./api.js?v=4.9.6&cache=revision-nonblocking";
import { renderCommon } from "./common.js?v=4.9.1&cache=revision-nonblocking";

renderCommon("release");
const $ = id => document.getElementById(id);
const elements = { breadcrumbName: $("breadcrumbName"), releaseName: $("releaseName"), heroMeta: $("heroMeta"), status: $("status"), mainContent: $("mainContent"), releaseInfo: $("releaseInfo"), officialRelease: $("officialRelease"), relatedEventsHost: $("relatedEventsHost"), debutSongs: $("debutSongs") };
const releaseId = String(new URLSearchParams(location.search).get("id") || "").trim();

function setLoading() {
  elements.releaseName.textContent = "読み込み中…";
  elements.heroMeta.textContent = "APIから実データを取得しています。";
  elements.status.hidden = false;
  elements.status.classList.remove("error");
  elements.status.textContent = "リリースデータを読み込んでいます...";
  elements.mainContent.hidden = true;
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
  elements.status.hidden = false;
  elements.status.classList.add("error");
  elements.status.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span><div class="release-status-actions">${retryable ? '<button id="retryButton" type="button">再試行</button>' : ""}<a href="releases.html">リリース一覧へ戻る</a></div>`;
  if (retryable) $("retryButton")?.addEventListener("click", loadRelease, { once: true });
}

function renderRelease(release) {
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
  if (String(release.sourceMedia || "").trim()) info.push(["曲マスター由来メディア", release.sourceMedia]);
  elements.releaseInfo.innerHTML = info.map(([label, value]) => `<div class="release-info-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
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
  const songs = Array.isArray(release.debutSongs) ? release.debutSongs : [];
  elements.debutSongs.innerHTML = songs.length ? `<div class="release-song-list">${songs.map(song => {
    const songName = String(song.songName || song.displayName || "曲名未設定");
    const displayName = String(song.displayName || "").trim();
    return `<a class="release-song-row" href="song.html?id=${encodeURIComponent(song.songId)}"><span class="release-song-copy"><span class="release-song-title">${escapeHtml(songName)}</span>${displayName && displayName !== songName ? `<span class="release-song-display">${escapeHtml(displayName)}</span>` : ""}</span><span class="release-song-arrow" aria-hidden="true">›</span></a>`;
  }).join("")}</div>` : `<div class="release-songs-empty">このリリースを初出・由来とする登録曲はありません</div>`;
  elements.status.hidden = true;
  elements.mainContent.hidden = false;
}

async function loadRelease() {
  if (!releaseId) { setError("リリースが指定されていません", "リリース一覧から見たい作品を選択してください。", false); return; }
  if (!/^R\d{4}$/.test(releaseId)) { setError("Release IDの形式が正しくありません", "リリース一覧から見たい作品を選択してください。", false); return; }
  setLoading();
  try {
    const response = await apiGet("release", { id: releaseId }, { timeoutMs: 20000, retryCount: 1, cache: true });
    renderRelease(response.data || {});
  } catch (error) {
    if (errorKind(error) === "not-found") { setError("該当するリリースが見つかりません", error?.message || "指定されたリリースは存在しません。", false); return; }
    console.error(error);
    setError("リリースデータを表示できません", error?.message || "APIへの接続に失敗しました。", true);
  }
}

loadRelease();
