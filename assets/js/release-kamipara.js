import { apiGet, escapeHtml, formatDate } from "./api.js?v=5.3.0&cache=solo-live-schema";

// C2 Dashboardと同じ公式収録クレジット・履歴表示方式をR0072で使用する。
const songCredits = Object.freeze({
  S118: ["KPS001", "KPS002", "KPS003", "KPS004", "KPS005"],
  S119: ["KPS001"], S120: ["KPS002"], S121: ["KPS003"],
  S122: ["KPS004"], S123: ["KPS005"], S124: ["KPS006"],
  S125: ["KPS007"], S126: ["KPS009"], S127: ["KPS008"]
});
const fullCastNames = Object.freeze({
  KPS001: "徳井青空", KPS002: "新田恵海", KPS003: "南條愛乃",
  KPS004: "楠田亜衣奈", KPS005: "久保ユリカ", KPS006: "Pile",
  KPS007: "飯田里穂", KPS008: "三森すずこ", KPS009: "内田彩"
});

const $ = id => document.getElementById(id);

function validate(data) {
  if (!data || !Array.isArray(data.songs) || !Array.isArray(data.performers) || !Array.isArray(data.events) || !Array.isArray(data.performances)) throw new Error("神パラデータの形式を確認できません。");
  const { songs, performers, events, performances } = data;
  const tracks = songs.map(song => song.trackNumber);
  if (songs.length !== 10 || events.length !== 5 || performances.length !== 10 || [...tracks].sort((a, b) => a - b).some((track, index) => track !== index + 1)) throw new Error("神パラの曲順・件数を確認できません。");
  const people = new Set(performers.map(person => person.performerId));
  const songIds = new Set(songs.map(song => song.songId));
  const eventIds = new Set(events.map(event => event.eventId));
  if (songs.some(song => !songCredits[song.songId] || songCredits[song.songId].some(id => !people.has(id))) || performances.some(row => !songIds.has(row.songId) || !eventIds.has(row.eventId))) throw new Error("神パラデータの参照を確認できません。");
}

function render(data, venues) {
  const { songs, performers, events, performances } = data;
  const people = new Map(performers.map(person => [person.performerId, person]));
  const songMap = new Map(songs.map(song => [song.songId, song]));
  const counts = new Map();
  performances.forEach(row => counts.set(row.songId, (counts.get(row.songId) || 0) + 1));
  $("includedSongsCount").textContent = "10曲";
  $("includedSongsContent").innerHTML = `<div class="release-kp-song-list">${[...songs].sort((a, b) => a.trackNumber - b.trackNumber).map(song => {
    const credits = songCredits[song.songId].map(id => {
      const person = people.get(id);
      return escapeHtml(`${person.characterName} ／ CV：${person.museCharacterName}（${fullCastNames[id] || person.castName}）`);
    }).join("<br>");
    const count = counts.get(song.songId) || 0;
    return `<article class="release-kp-song" data-song-id="${escapeHtml(song.songId)}"><span class="release-kp-track">${String(song.trackNumber).padStart(2, "0")}</span><div><h3>${escapeHtml(song.displayName || song.songName)}</h3><p>${credits}</p><small>${count ? `登録済み歌唱記録 ${count}件` : "歌唱記録未確認"}</small></div></article>`;
  }).join("")}</div>`;

  const eventRows = [...events].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.eventId).localeCompare(String(b.eventId)));
  const yearCounts = new Map();
  eventRows.forEach(event => {
    const year = String(event.date || "").slice(0, 4);
    yearCounts.set(year, (yearCounts.get(year) || 0) + performances.filter(row => row.eventId === event.eventId).length);
  });
  $("kamiparaYearFilter").innerHTML = [["all", "全期間", performances.length], ...[...yearCounts].sort(([a], [b]) => a.localeCompare(b)).map(([year, count]) => [year, year, count])]
    .map(([year, label, count]) => `<button type="button" data-year="${escapeHtml(year)}" aria-pressed="${year === "all"}">${escapeHtml(label)} ${count}件</button>`).join("");
  $("kamiparaHistory").innerHTML = eventRows.map(event => {
    const rows = performances.filter(row => row.eventId === event.eventId).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || String(a.performanceId).localeCompare(String(b.performanceId)));
    const venueName = venues.get(event.venueId);
    return `<details class="release-kp-event" data-year="${escapeHtml(String(event.date || "").slice(0, 4))}"><summary><span class="release-kp-event-heading"><time datetime="${escapeHtml(event.date || "")}">${escapeHtml(formatDate(event.date))}</time><h3>${escapeHtml(event.eventName)}</h3>${venueName ? `<span class="release-kp-event-venue">${escapeHtml(venueName)}</span>` : ""}</span><span class="release-kp-event-count">${rows.length}曲</span></summary><div class="release-kp-performances">${rows.map(row => `<div class="release-kp-performance"><p>${row.order == null ? "" : `${escapeHtml(row.order)}. `}${escapeHtml(songMap.get(row.songId).displayName || songMap.get(row.songId).songName)}</p><small>実歌唱：${escapeHtml(row.actualSinger || "記載なし")}${row.performanceForm ? ` ／ ${escapeHtml(row.performanceForm)}` : ""}</small></div>`).join("")}</div></details>`;
  }).join("");
  $("kamiparaYearFilter").onclick = event => {
    const selected = event.target.closest("button[data-year]");
    if (!selected || !$("kamiparaYearFilter").contains(selected)) return;
    const year = selected.dataset.year;
    $("kamiparaYearFilter").querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button === selected)));
    $("kamiparaHistory").querySelectorAll(".release-kp-event").forEach(item => { item.hidden = year !== "all" && item.dataset.year !== year; });
  };
  $("kamiparaHistorySection").hidden = false;
  $("kamiparaDashboardSection").hidden = false;
}

export async function renderKamiparaRelease() {
  const host = $("includedSongsContent");
  host.textContent = "神パラの収録情報を読み込んでいます…";
  try {
    const response = await apiGet("kamiparaDashboard", {}, { timeoutMs: 25000, retryCount: 1 });
    const data = response.data;
    validate(data);
    const venueIds = [...new Set(data.events.map(event => event.venueId).filter(Boolean))];
    const results = await Promise.allSettled(venueIds.map(id => apiGet("venue", { id }, { timeoutMs: 15000, retryCount: 0 })));
    const venues = new Map(results.map((result, index) => [venueIds[index], result.status === "fulfilled" ? result.value.data?.venueName : ""]).filter(([, name]) => name));
    render(data, venues);
  } catch (error) {
    host.innerHTML = `<p class="release-inclusion-error">神パラの収録情報を表示できませんでした。${escapeHtml(error.message || "再読み込みしてください。")}</p><button class="release-kp-retry" type="button">再試行</button>`;
    host.querySelector("button").addEventListener("click", renderKamiparaRelease, { once: true });
  }
}
