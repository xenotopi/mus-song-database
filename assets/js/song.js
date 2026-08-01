import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.5.0";


renderCommon("song");


const elements = {
  songName: document.getElementById("songName"),
  heroMeta: document.getElementById("heroMeta"),
  status: document.getElementById("status"),
  retryButton: document.getElementById("retryButton"),
  detailLocalNav: document.getElementById("detailLocalNav"),
  mainContent: document.getElementById("mainContent"),
  songInfo: document.getElementById("songInfo"),
  songStats: document.getElementById("songStats"),
  songDates: document.getElementById("songDates"),
  discoverySection: document.getElementById("discoverySection"),
  songDiscovery: document.getElementById("songDiscovery"),
  historySection: document.getElementById("historySection"),
  historyCount: document.getElementById("historyCount"),
  visibleHistoryCount: document.getElementById("visibleHistoryCount"),
  historyList: document.getElementById("historyList"),
  historyFilters: document.getElementById("historyFilters"),
  historyMoreButton: document.getElementById("historyMoreButton")
};


const songId =
  new URLSearchParams(location.search).get("id") ||
  "S003";

let performances = [];
let historyFilter = "all";
let visibleHistoryLimit = 20;


function setLoading() {
  elements.songName.textContent = "読み込み中…";
  elements.heroMeta.textContent = "JSONPでAPIへ接続しています。";
  elements.status.hidden = false;
  elements.status.classList.remove("error");
  elements.status.innerHTML = `
    <span class="loading-text">
      曲データを読み込んでいます
      <span class="loading-dots"><i></i><i></i><i></i></span>
    </span>`;

  elements.retryButton.hidden = true;
  elements.detailLocalNav.hidden = true;
  elements.mainContent.hidden = true;
  elements.discoverySection.hidden = true;
  elements.historySection.hidden = true;
}


function setError(error) {
  elements.songName.textContent = "曲データを表示できません";
  elements.heroMeta.textContent = "データ取得時にエラーが発生しました。";
  elements.status.hidden = false;
  elements.status.classList.add("error");
  elements.status.innerHTML = `
    <strong>曲データを取得できませんでした。</strong>
    <span>${escapeHtml(error?.message || "不明なエラー")}</span>`;

  elements.retryButton.hidden = false;
}


function getPerformanceType_(performance) {
  return String(
    performance.type ||
    performance.category ||
    ""
  ).trim();
}


function renderHistory_() {
  const filtered =
    historyFilter === "all"
      ? performances
      : performances.filter(
          item =>
            getPerformanceType_(item) ===
            historyFilter
        );

  const visible =
    filtered.slice(0, visibleHistoryLimit);

  elements.visibleHistoryCount.textContent =
    `${visible.length}/${filtered.length}件表示`;

  elements.historyList.innerHTML =
    visible.length
      ? visible.map(
          performance => `
            <a
              class="song-row"
              href="event.html?id=${encodeURIComponent(
                performance.eventId
              )}"
            >
              <span>
                <span class="song-title">
                  ${escapeHtml(
                    performance.eventName ||
                    "イベント名未設定"
                  )}
                </span>

                <span class="song-meta">
                  <span>
                    ${escapeHtml(
                      formatDate(performance.date)
                    )}
                  </span>

                  <span class="type-badge">
                    ${escapeHtml(
                      getPerformanceType_(performance) ||
                      "未分類"
                    )}
                  </span>

                  <span>
                    歌唱者：
                    ${escapeHtml(
                      performance.singer || "—"
                    )}
                  </span>
                </span>
              </span>

              <span class="arrow">›</span>
            </a>`
        ).join("")
      : `<div class="empty">該当する歌唱履歴はありません。</div>`;

  elements.historyMoreButton.hidden =
    visible.length >= filtered.length;

  if (!elements.historyMoreButton.hidden) {
    elements.historyMoreButton.textContent =
      `もっと見る（残り${filtered.length - visible.length}件）`;
  }
}


function buildSongDiscovery_(song) {
  const singerCounts = new Map();

  performances.forEach(item => {
    const singer = String(item.singer || "").trim();
    if (!singer) return;

    singerCounts.set(
      singer,
      Number(singerCounts.get(singer) || 0) + 1
    );
  });

  const topSinger =
    Array.from(singerCounts.entries())
      .sort((a, b) => b[1] - a[1])[0] || null;

  const firstPerformance = performances[0] || null;
  const latestPerformance =
    performances.length
      ? performances[performances.length - 1]
      : null;

  const cards = [];

  if (firstPerformance) {
    cards.push({
      label: "FIRST PERFORMANCE",
      title: firstPerformance.eventName,
      meta: `初披露｜${formatDate(firstPerformance.date)}`,
      href: `event.html?id=${encodeURIComponent(firstPerformance.eventId)}`
    });
  }

  if (latestPerformance) {
    cards.push({
      label: "LATEST PERFORMANCE",
      title: latestPerformance.eventName,
      meta: `最新歌唱｜${formatDate(latestPerformance.date)}`,
      href: `event.html?id=${encodeURIComponent(latestPerformance.eventId)}`
    });
  }

  if (topSinger) {
    cards.push({
      label: "TOP SINGER",
      title: topSinger[0],
      meta: `${topSinger[1]}件の歌唱記録`,
      href: `search.html?q=${encodeURIComponent(topSinger[0])}&source=singer`
    });
  }

  elements.songDiscovery.innerHTML =
    cards.map(card => `
      <a class="discovery-card" href="${card.href}">
        <span class="discovery-label">${escapeHtml(card.label)}</span>
        <span class="discovery-title">${escapeHtml(card.title || "—")}</span>
        <span class="discovery-meta">${escapeHtml(card.meta || "")}</span>
      </a>`
    ).join("");
}


function renderSong(song) {
  const statistics = song.statistics || {};

  performances =
    Array.isArray(song.performances)
      ? song.performances
      : [];

  historyFilter = "all";
  visibleHistoryLimit = 20;

  const displayName =
    song.displayName ||
    song.songName ||
    "曲名未設定";

  document.title =
    `${displayName}｜μ's Song Database`;

  elements.songName.textContent = displayName;

  elements.heroMeta.textContent = [
    song.media,
    song.category,
    formatDate(song.releaseDate)
  ].filter(Boolean).join("｜");

  elements.songInfo.innerHTML = [
    ["表示名", song.displayName || song.songName],
    ["バージョン", song.version || "—"],
    ["収録CD", song.recordingCd || "—"],
    ["発売日", formatDate(song.releaseDate)],
    ["メディア", song.media || "—"],
    ["区分", song.category || "—"]
  ].map(([label, value]) => `
    <dt>${escapeHtml(label)}</dt>
    <dd>${escapeHtml(value || "—")}</dd>`
  ).join("");

  elements.songStats.innerHTML = [
    ["歌唱イベント数", statistics.eventCount],
    ["公式イベント", statistics.officialEventCount],
    ["ソロイベント", statistics.soloEventCount],
    ["歌唱記録数", statistics.performanceCount]
  ].map(([label, value]) => `
    <div class="stat">
      <div class="value">${Number(value ?? 0).toLocaleString("ja-JP")}</div>
      <div class="label">${escapeHtml(label)}</div>
    </div>`
  ).join("");

  elements.songDates.innerHTML = [
    ["初披露日", formatDate(statistics.firstPerformanceDate)],
    ["最終披露日", formatDate(statistics.lastPerformanceDate)]
  ].map(([label, value]) => `
    <dt>${escapeHtml(label)}</dt>
    <dd>${escapeHtml(value || "—")}</dd>`
  ).join("");

  elements.historyCount.textContent =
    `${performances.length}件`;

  buildSongDiscovery_(song);
  renderHistory_();

  elements.status.hidden = true;
  elements.detailLocalNav.hidden = false;
  elements.mainContent.hidden = false;
  elements.discoverySection.hidden = false;
  elements.historySection.hidden = false;
}


async function loadSong() {
  setLoading();

  try {
    const response = await apiGet(
      "song",
      { id: songId },
      {
        timeoutMs: 20000,
        retryCount: 1
      }
    );

    renderSong(response.data);

  } catch (error) {
    console.error("Song API error:", error);
    setError(error);
  }
}


elements.historyFilters.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest("[data-filter]");

    if (!button) return;

    elements.historyFilters
      .querySelectorAll(".filter-pill")
      .forEach(item =>
        item.classList.remove("active")
      );

    button.classList.add("active");
    historyFilter = button.dataset.filter;
    visibleHistoryLimit = 20;
    renderHistory_();
  }
);


elements.historyMoreButton.addEventListener(
  "click",
  () => {
    visibleHistoryLimit += 20;
    renderHistory_();
  }
);


elements.retryButton.addEventListener(
  "click",
  loadSong
);


loadSong();
