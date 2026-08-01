import { apiGet, escapeHtml, formatDate } from "./api.js?v=2.0.2";
import { renderCommon } from "./common.js?v=2.1.0";

renderCommon("home");

const e = {
  status: document.getElementById("status"),
  retryButton: document.getElementById("retryButton"),
  summary: document.getElementById("summary"),
  songCount: document.getElementById("songCount"),
  eventCount: document.getElementById("eventCount"),
  venueCount: document.getElementById("venueCount"),
  performanceCount: document.getElementById("performanceCount"),
  topSection: document.getElementById("topSection"),
  middleSection: document.getElementById("middleSection"),
  todayDate: document.getElementById("todayDate"),
  todayContent: document.getElementById("todayContent"),
  topSongs: document.getElementById("topSongs"),
  topVenues: document.getElementById("topVenues"),
  recentSection: document.getElementById("recentSection"),
  recentList: document.getElementById("recentList"),
  homeSearchInput: document.getElementById("homeSearchInput")
};

function setLoading() {
  e.status.hidden = false;
  e.status.classList.remove("error");
  e.status.textContent = "ホームデータを読み込んでいます…";
  e.retryButton.hidden = true;
  e.summary.hidden = true;
  e.topSection.hidden = true;
  e.middleSection.hidden = true;
  e.recentSection.hidden = true;
}

function setError(error) {
  e.status.hidden = false;
  e.status.classList.add("error");
  e.status.innerHTML = `<strong>ホームデータを取得できませんでした。</strong><span>${escapeHtml(error?.message || "不明なエラー")}</span>`;
  e.retryButton.hidden = false;
}

function renderSummary(s) {
  e.songCount.textContent = Number(s.songCount || 0).toLocaleString("ja-JP");
  e.eventCount.textContent = Number(s.eventCount || 0).toLocaleString("ja-JP");
  e.venueCount.textContent = Number(s.venueCount || 0).toLocaleString("ja-JP");
  e.performanceCount.textContent = Number(s.performanceCount || 0).toLocaleString("ja-JP");
}

function renderToday(today) {
  e.todayDate.textContent = today.label || "";
  const groups = [
    ["この日に開催されたイベント", today.events || [], item => `
      <a class="today-item" href="event.html?id=${encodeURIComponent(item.eventId)}">
        <b>${escapeHtml(item.date ? item.date.slice(0,4) + "年 " : "")}${escapeHtml(item.eventName || "イベント名未設定")}</b>
        <div class="home-ranking-meta">${escapeHtml([item.category,item.eventType].filter(Boolean).join("｜"))}</div>
      </a>`],
    ["この日に初披露された曲", today.firstPerformedSongs || [], item => `
      <a class="today-item" href="song.html?id=${encodeURIComponent(item.songId)}">
        <b>${escapeHtml(item.songName || "曲名未設定")}</b>
        <div class="home-ranking-meta">${escapeHtml(item.date ? item.date.slice(0,4) + "年" : "")}</div>
      </a>`],
    ["この日に最後に歌われた曲", today.lastPerformedSongs || [], item => `
      <a class="today-item" href="song.html?id=${encodeURIComponent(item.songId)}">
        <b>${escapeHtml(item.songName || "曲名未設定")}</b>
        <div class="home-ranking-meta">${escapeHtml(item.date ? item.date.slice(0,4) + "年" : "")}</div>
      </a>`]
  ];

  const hasAny = groups.some(([,items]) => items.length);

  e.todayContent.innerHTML = hasAny
    ? groups.map(([title, items, renderer]) => `
      <section class="today-group">
        <h3>${escapeHtml(title)}</h3>
        ${items.length ? items.slice(0,6).map(renderer).join("") : `<div class="today-empty">該当する記録はありません。</div>`}
      </section>`).join("")
    : `<section class="today-group"><div class="today-empty">今日は登録されている記録がありません。そんな日も、歴史の一ページです。</div></section>`;
}

function renderTopSongs(items) {
  e.topSongs.innerHTML = items.map(item => `
    <a class="home-ranking-row" href="song.html?id=${encodeURIComponent(item.songId)}">
      <span class="home-rank">${item.rank}</span>
      <span><span class="home-ranking-name">${escapeHtml(item.songName || "曲名未設定")}</span><span class="home-ranking-meta">イベント ${Number(item.eventCount || 0)}件</span></span>
      <span class="home-ranking-count">${Number(item.performanceCount || 0)}回</span>
    </a>`).join("") || `<div class="empty">ランキングデータはありません。</div>`;
}

function renderTopVenues(items) {
  e.topVenues.innerHTML = items.map(item => `
    <a class="home-ranking-row" href="venue.html?id=${encodeURIComponent(item.venueId)}">
      <span class="home-rank">${item.rank}</span>
      <span><span class="home-ranking-name">${escapeHtml(item.venueName || "会場名未設定")}</span><span class="home-ranking-meta">${escapeHtml([item.prefectureCity,item.country].filter(Boolean).join("｜"))}</span></span>
      <span class="home-ranking-count">${Number(item.eventCount || 0)}件</span>
    </a>`).join("") || `<div class="empty">会場ランキングはありません。</div>`;
}

function renderRecent(items) {
  e.recentList.innerHTML = items.map(item => {
    const performanceLabel = [
      item.day,
      item.performance
    ].filter(Boolean).join(" ");

    return `
      <article class="recent-card">
        <div class="recent-card-head">
          <div class="recent-date">
            ${escapeHtml(formatDate(item.date))}
          </div>

          <a
            class="recent-event"
            href="event.html?id=${encodeURIComponent(item.eventId)}"
          >
            ${escapeHtml(item.eventName || "イベント名未設定")}
          </a>

          <div class="recent-tags">
            <span class="type-badge">
              ${escapeHtml(item.category || "未分類")}
            </span>

            ${item.eventType ? `
              <span class="recent-meta-link">
                ${escapeHtml(item.eventType)}
              </span>` : ""}

            ${performanceLabel ? `
              <span class="recent-meta-link">
                ${escapeHtml(performanceLabel)}
              </span>` : ""}

            ${item.venueName ? `
              <a
                class="recent-meta-link"
                href="venue.html?id=${encodeURIComponent(item.venueId)}"
              >
                ${escapeHtml(item.venueName)}
              </a>` : ""}
          </div>
        </div>

        <div class="recent-song-list">
          ${(item.songs || []).map(song => `
            <a
              class="recent-song"
              href="song.html?id=${encodeURIComponent(song.songId)}"
            >
              <span class="recent-song-name">
                ${escapeHtml(song.songName || "曲名未設定")}
              </span>

              ${song.singer ? `
                <span class="recent-song-singer">
                  ${escapeHtml(song.singer)}
                </span>` : `
                <span class="recent-empty-singer">
                  歌唱者情報なし
                </span>`}
            </a>`).join("")}
        </div>
      </article>`;
  }).join("") || `<div class="empty">最近の歌唱記録はありません。</div>`;
}

function renderHome(data) {
  renderSummary(data.summary || {});
  renderToday(data.today || {});
  renderTopSongs(data.topSongs || []);
  renderTopVenues(data.topVenues || []);
  renderRecent(data.recentPerformances || []);
  e.status.hidden = true;
  e.summary.hidden = false;
  e.topSection.hidden = false;
  e.middleSection.hidden = false;
  e.recentSection.hidden = false;
}

async function loadHome() {
  setLoading();
  try {
    const response = await apiGet("home", { recentLimit: 5 }, {
      timeoutMs: 25000,
      retryCount: 1
    });
    renderHome(response.data);
  } catch (error) {
    console.error(error);
    setError(error);
  }
}

e.homeSearchInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && e.homeSearchInput.value.trim()) {
    location.href = `search.html?q=${encodeURIComponent(e.homeSearchInput.value.trim())}`;
  }
});

e.retryButton.addEventListener("click", loadHome);
loadHome();
