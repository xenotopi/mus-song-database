import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.2.1";

renderCommon("");

const $ = id => document.getElementById(id);

const el = {
  singerName: $("singerName"),
  status: $("status"),
  retryButton: $("retryButton"),
  summary: $("summary"),
  performanceCount: $("performanceCount"),
  songCount: $("songCount"),
  eventCount: $("eventCount"),
  officialCount: $("officialCount"),
  soloCount: $("soloCount"),
  songsSection: $("songsSection"),
  songsCount: $("songsCount"),
  songsList: $("songsList"),
  historySection: $("historySection"),
  historyCount: $("historyCount"),
  historyList: $("historyList")
};

const params = new URLSearchParams(location.search);
const singerName = String(params.get("name") || "").trim();

function renderSongs(items) {
  el.songsCount.textContent =
    `${items.length.toLocaleString("ja-JP")}曲`;

  el.songsList.innerHTML = items.length
    ? items.map(item => `
        <a class="singer-song-row" href="song.html?id=${encodeURIComponent(item.songId)}">
          <div>
            <strong>${escapeHtml(item.songName || "曲名未設定")}</strong>
            <div class="singer-song-meta">
              <span>公式 ${Number(item.officialCount || 0)}回</span>
              <span>ソロ ${Number(item.soloCount || 0)}回</span>
              ${item.firstDate ? `<span>初回 ${escapeHtml(formatDate(item.firstDate))}</span>` : ""}
              ${item.lastDate ? `<span>最終 ${escapeHtml(formatDate(item.lastDate))}</span>` : ""}
            </div>
          </div>
          <span class="singer-song-count">${Number(item.performanceCount || 0).toLocaleString("ja-JP")}回</span>
        </a>
      `).join("")
    : `<div class="singer-song-row">歌唱曲データがありません。</div>`;
}

function renderHistory(items) {
  el.historyCount.textContent =
    `${items.length.toLocaleString("ja-JP")}件`;

  el.historyList.innerHTML = items.length
    ? items.map(item => `
        <article class="singer-history-row">
          <div class="singer-history-date">${escapeHtml(formatDate(item.date) || "日付不明")}</div>
          <div>
            <div class="singer-history-title">
              <strong>${escapeHtml(item.songName || "曲名未設定")}</strong>
              ${item.category ? `<span class="singer-category">${escapeHtml(item.category)}</span>` : ""}
            </div>

            <div class="singer-history-meta">
              <span>${escapeHtml(item.eventName || "イベント名未設定")}</span>
              ${item.eventType ? `<span>${escapeHtml(item.eventType)}</span>` : ""}
              ${item.day ? `<span>${escapeHtml(item.day)}</span>` : ""}
              ${item.performance ? `<span>${escapeHtml(item.performance)}</span>` : ""}
            </div>

            <div class="singer-history-links">
              ${item.songId ? `<a href="song.html?id=${encodeURIComponent(item.songId)}">曲詳細を見る</a>` : ""}
              ${item.eventId ? `<a href="event.html?id=${encodeURIComponent(item.eventId)}">イベント詳細を見る</a>` : ""}
            </div>
          </div>
        </article>
      `).join("")
    : `<div class="singer-history-row">歌唱履歴がありません。</div>`;
}

function render(data) {
  const summary = data.summary || {};

  el.singerName.textContent =
    data.singerName || singerName;

  document.title =
    `${data.singerName || singerName} | 歌唱名義詳細 | μ's Song Database`;

  el.performanceCount.textContent =
    Number(summary.performanceCount || 0).toLocaleString("ja-JP");

  el.songCount.textContent =
    Number(summary.uniqueSongCount || 0).toLocaleString("ja-JP");

  el.eventCount.textContent =
    Number(summary.eventCount || 0).toLocaleString("ja-JP");

  el.officialCount.textContent =
    Number(summary.officialEventCount || 0).toLocaleString("ja-JP");

  el.soloCount.textContent =
    Number(summary.soloEventCount || 0).toLocaleString("ja-JP");

  renderSongs(Array.isArray(data.songs) ? data.songs : []);
  renderHistory(Array.isArray(data.history) ? data.history : []);

  el.status.hidden = true;
  el.summary.hidden = false;
  el.songsSection.hidden = false;
  el.historySection.hidden = false;
}

async function loadSinger() {
  if (!singerName) {
    el.singerName.textContent = "歌唱名義が指定されていません";
    el.status.textContent = "ランキングの歌唱名義から開き直してください。";
    return;
  }

  el.status.hidden = false;
  el.status.textContent = "歌唱名義データを読み込んでいます...";
  el.retryButton.hidden = true;

  try {
    const response = await apiGet(
      "singer",
      { name: singerName }
    );

    render(response.data || response);
  } catch (error) {
    console.error(error);
    el.status.textContent =
      error?.message || "歌唱名義データを取得できませんでした。";
    el.retryButton.hidden = false;
  }
}

el.retryButton.addEventListener("click", loadSinger);
loadSinger();
