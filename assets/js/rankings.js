import { apiGet, escapeHtml, formatDate } from "./api.js?v=2.0.2";
import { renderCommon } from "./common.js?v=2.0.2";

renderCommon("rankings");

const e = {
  status: document.getElementById("status"),
  retryButton: document.getElementById("retryButton"),
  summary: document.getElementById("summary"),
  songCount: document.getElementById("songCount"),
  eventCount: document.getElementById("eventCount"),
  venueCount: document.getElementById("venueCount"),
  performanceCount: document.getElementById("performanceCount"),
  tabs: document.getElementById("tabs"),
  songsPanel: document.getElementById("songsPanel"),
  eventsPanel: document.getElementById("eventsPanel"),
  venuesPanel: document.getElementById("venuesPanel"),
  songsList: document.getElementById("songsList"),
  eventsList: document.getElementById("eventsList"),
  venuesList: document.getElementById("venuesList")
};

let activeTab = "songs";

function setLoading() {
  e.status.hidden = false;
  e.status.classList.remove("error");
  e.status.textContent = "ランキングデータを読み込んでいます…";
  e.retryButton.hidden = true;
  e.summary.hidden = true;
  e.tabs.hidden = true;
  e.songsPanel.hidden = true;
  e.eventsPanel.hidden = true;
  e.venuesPanel.hidden = true;
}

function setError(error) {
  e.status.hidden = false;
  e.status.classList.add("error");
  e.status.innerHTML = `<strong>ランキングデータを取得できませんでした。</strong><span>${escapeHtml(error?.message || "不明なエラー")}</span>`;
  e.retryButton.hidden = false;
}

function render(data) {
  const s = data.summary || {};
  e.songCount.textContent = Number(s.songCount || 0).toLocaleString("ja-JP");
  e.eventCount.textContent = Number(s.eventCount || 0).toLocaleString("ja-JP");
  e.venueCount.textContent = Number(s.venueCount || 0).toLocaleString("ja-JP");
  e.performanceCount.textContent = Number(s.performanceCount || 0).toLocaleString("ja-JP");

  e.songsList.innerHTML = (data.songs || []).map(item => `
    <a class="ranking-row" href="song.html?id=${encodeURIComponent(item.songId)}">
      <span class="ranking-position">${item.rank}</span>
      <span><span class="ranking-title">${escapeHtml(item.songName || "曲名未設定")}</span>
      <span class="ranking-meta"><span>${escapeHtml(item.version || "")}</span><span>イベント ${Number(item.eventCount || 0)}件</span><span>公式 ${Number(item.officialEventCount || 0)}件</span><span>ソロ ${Number(item.soloEventCount || 0)}件</span></span></span>
      <span class="ranking-count">${Number(item.performanceCount || 0)}回<small>歌唱記録</small></span>
    </a>`).join("") || `<div class="empty">曲ランキングはありません。</div>`;

  e.eventsList.innerHTML = (data.events || []).map(item => `
    <a class="ranking-row" href="event.html?id=${encodeURIComponent(item.eventId)}">
      <span class="ranking-position">${item.rank}</span>
      <span><span class="ranking-title">${escapeHtml(item.eventName || "イベント名未設定")}</span>
      <span class="ranking-meta"><span>${escapeHtml(formatDate(item.date))}</span><span class="type-badge">${escapeHtml(item.category || "未分類")}</span><span>${escapeHtml(item.eventType || "")}</span><span>歌唱記録 ${Number(item.performanceCount || 0)}件</span></span></span>
      <span class="ranking-count">${Number(item.uniqueSongCount || 0)}曲<small>重複除外</small></span>
    </a>`).join("") || `<div class="empty">イベントランキングはありません。</div>`;

  e.venuesList.innerHTML = (data.venues || []).map(item => `
    <a class="ranking-row" href="venue.html?id=${encodeURIComponent(item.venueId)}">
      <span class="ranking-position">${item.rank}</span>
      <span><span class="ranking-title">${escapeHtml(item.venueName || "会場名未設定")}</span>
      <span class="ranking-meta"><span>${escapeHtml(item.prefectureCity || "")}</span><span>${escapeHtml(item.region || "")}</span><span>${escapeHtml(item.country || "")}</span><span>披露曲 ${Number(item.uniqueSongCount || 0)}曲</span><span>歌唱記録 ${Number(item.performanceCount || 0)}件</span></span></span>
      <span class="ranking-count">${Number(item.eventCount || 0)}件<small>利用イベント</small></span>
    </a>`).join("") || `<div class="empty">会場ランキングはありません。</div>`;

  e.status.hidden = true;
  e.summary.hidden = false;
  e.tabs.hidden = false;
  showTab(activeTab);
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".ranking-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  e.songsPanel.hidden = tab !== "songs";
  e.eventsPanel.hidden = tab !== "events";
  e.venuesPanel.hidden = tab !== "venues";
}

async function load() {
  setLoading();
  try {
    const response = await apiGet("rankings", { limit: 20 }, {
      timeoutMs: 20000,
      retryCount: 1
    });
    render(response.data);
  } catch (error) {
    console.error(error);
    setError(error);
  }
}

document.querySelectorAll(".ranking-tab").forEach(button => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

e.retryButton.addEventListener("click", load);
load();
