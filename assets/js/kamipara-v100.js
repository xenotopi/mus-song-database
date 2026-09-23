import { apiGet, escapeHtml, formatDate } from "./api.js?v=5.3.0&cache=solo-live-schema";
import { renderCommon } from "./common.js?v=4.9.1&cache=revision-nonblocking";

renderCommon();

const $ = id => document.getElementById(id);
// Official album track credits: https://catalog.bandainamcomusiclive.co.jp/release/63074/
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
const easterEggs = Object.freeze({
  KPS001: "しいたけ！", KPS002: "しゅんぎく！", KPS003: "ちゃわんむし！",
  KPS004: "たけのこ！", KPS005: "なすび！"
});

function credit(person) {
  return `${person.characterName}（CV：${person.museCharacterName}（${fullCastNames[person.performerId] || person.castName}））`;
}

function birthday(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})$/);
  return match ? `${Number(match[1])}月${Number(match[2])}日` : "不明";
}

function countBySong(performances) {
  const counts = new Map();
  for (const row of performances) counts.set(row.songId, (counts.get(row.songId) || 0) + 1);
  return counts;
}

function validate(data) {
  if (!data || !data.summary || !Array.isArray(data.songs) || !Array.isArray(data.performers) || !Array.isArray(data.events) || !Array.isArray(data.performances)) throw new Error("神パラデータの形式を確認できません。");
  const { summary, songs, performers, events, performances } = data;
  if (songs.length !== summary.songCount || performers.length !== summary.performerCount || events.length !== summary.eventCount || performances.length !== summary.performanceCount) throw new Error("神パラデータの件数が一致しません。");
  if (new Set(songs.map(x => x.songId)).size !== songs.length || new Set(performers.map(x => x.performerId)).size !== performers.length) throw new Error("神パラデータのIDが重複しています。");
  const people = new Set(performers.map(x => x.performerId));
  if (songs.some(song => !songCredits[song.songId] || songCredits[song.songId].some(id => !people.has(id)))) throw new Error("楽曲の公式クレジットとキャラクターを照合できません。");
  if (performances.some(row => !songs.some(song => song.songId === row.songId) || !events.some(event => event.eventId === row.eventId) || !Array.isArray(row.performers))) throw new Error("歌唱記録の参照を確認できません。");
}

function render(data, venues) {
  const { summary, songs, performers, events, performances } = data;
  const people = new Map(performers.map(person => [person.performerId, person]));
  const songMap = new Map(songs.map(song => [song.songId, song]));
  const counts = countBySong(performances);
  $("kpReleaseDate").textContent = String(songs[0]?.releaseDate || "2013-04-24").replaceAll("-", ".");

  $("kpMetrics").innerHTML = [
    [summary.songCount, "楽曲"], [summary.performerCount, "キャラクター"],
    [summary.eventCount, "イベント"], [summary.performanceCount, "歌唱記録"]
  ].map(([number, label]) => `<div class="kp-metric"><strong>${escapeHtml(number)}</strong><span>${escapeHtml(label)}</span></div>`).join("");

  $("kpCharacters").innerHTML = performers.map(person => `
    <article class="kp-card"><h3 class="kp-character-name">${escapeHtml(person.characterName)}</h3>
      <p class="kp-character-meta">CV：${escapeHtml(person.museCharacterName)}（${escapeHtml(fullCastNames[person.performerId] || person.castName)}）<br>誕生日：${escapeHtml(birthday(person.birthday))}</p>
      ${easterEggs[person.performerId] ? `<small class="kp-easter">${escapeHtml(easterEggs[person.performerId])}</small>` : ""}
    </article>`).join("");

  $("kpSongs").innerHTML = songs.map(song => {
    const credits = songCredits[song.songId].map(id => credit(people.get(id))).join("／");
    const count = counts.get(song.songId) || 0;
    return `<article class="kp-card kp-song-card" data-song-id="${escapeHtml(song.songId)}"><h3 class="kp-song-name">${escapeHtml(song.displayName || song.songName)}</h3>
      <p class="kp-song-meta">${escapeHtml(credits)}</p><span class="kp-song-count">${count ? `登録済み歌唱記録 ${count}件` : "歌唱記録未確認"}</span></article>`;
  }).join("");

  const eventRows = [...events].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.eventId).localeCompare(String(b.eventId)));
  $("kpHistory").innerHTML = eventRows.map(event => {
    const rows = performances.filter(row => row.eventId === event.eventId).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || String(a.performanceId).localeCompare(String(b.performanceId)));
    const venueName = venues.get(event.venueId);
    return `<article class="kp-card kp-event"><time class="kp-event-date" datetime="${escapeHtml(event.date || "")}">${escapeHtml(formatDate(event.date))}</time><h3>${escapeHtml(event.eventName)}</h3>
      ${venueName ? `<p class="kp-event-venue">${escapeHtml(venueName)}</p>` : ""}
      ${rows.map(row => `<div class="kp-performance"><p class="kp-performance-title">${row.order == null ? "" : `${escapeHtml(row.order)}. `}${escapeHtml(songMap.get(row.songId).displayName || songMap.get(row.songId).songName)}</p>
        <p class="kp-performance-meta">実歌唱者：${escapeHtml(row.actualSinger || "記載なし")}${row.performanceForm ? ` ／ ${escapeHtml(row.performanceForm)}` : ""}</p></div>`).join("")}
    </article>`;
  }).join("");

  $("kpPresence").innerHTML = songs.map(song => {
    const count = counts.get(song.songId) || 0;
    return `<div class="kp-presence-row"><span>${escapeHtml(song.displayName || song.songName)}</span><strong>${count ? `${count}件` : "歌唱記録未確認"}</strong></div>`;
  }).join("");
  $("kpStatus").hidden = true;
  $("kpContent").hidden = false;
}

async function load() {
  $("kpStatus").hidden = false;
  $("kpStatus").classList.remove("error");
  $("kpStatus").textContent = "神パラの記録を読み込んでいます…";
  $("kpContent").hidden = true;
  try {
    const response = await apiGet("kamiparaDashboard", {}, { timeoutMs: 25000, retryCount: 1 });
    const data = response.data;
    validate(data);
    const venueIds = [...new Set(data.events.map(event => event.venueId).filter(Boolean))];
    const venueResults = await Promise.allSettled(venueIds.map(id => apiGet("venue", { id }, { timeoutMs: 15000, retryCount: 0 })));
    const venues = new Map(venueResults.map((result, index) => [venueIds[index], result.status === "fulfilled" ? result.value.data?.venueName : ""]).filter(([, name]) => name));
    render(data, venues);
  } catch (error) {
    $("kpStatus").classList.add("error");
    $("kpStatus").innerHTML = `<strong>神パラの記録を表示できませんでした。</strong><p>${escapeHtml(error.message || "通信状態を確認してください。")}</p><button id="kpRetry" type="button">再試行</button>`;
    $("kpRetry").addEventListener("click", load, { once: true });
  }
}

load();
