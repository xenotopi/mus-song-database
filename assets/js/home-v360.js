import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=2.7.0";


renderCommon("home");


const $ =
  id =>
    document.getElementById(id);


const elements = {
  status:
    $("status"),

  retryButton:
    $("retryButton"),

  summary:
    $("summary"),

  songCount:
    $("songCount"),

  eventCount:
    $("eventCount"),

  venueCount:
    $("venueCount"),

  performanceCount:
    $("performanceCount"),

  featuredSection:
    $("featuredSection"),

  featuredSong:
    $("featuredSong"),

  featuredVenue:
    $("featuredVenue"),

  featuredEvent:
    $("featuredEvent"),

  topSection:
    $("topSection"),

  middleSection:
    $("middleSection"),

  todayDate:
    $("todayDate"),

  todayContent:
    $("todayContent"),

  topSongs:
    $("topSongs"),

  topVenues:
    $("topVenues"),

  latestEventsSection:
    $("latestEventsSection"),

  latestEventsList:
    $("latestEventsList"),

  recentSection:
    $("recentSection"),

  recentList:
    $("recentList"),

  recentMoreButton:
    $("recentMoreButton"),

  homeSearchForm:
    $("homeSearchForm"),

  homeSearchInput:
    $("homeSearchInput"),

  homeUpdate:
    $("homeUpdate")
};


const loadingSections = [
  elements.summary,
  elements.featuredSection,
  elements.topSection,
  elements.middleSection,
  elements.latestEventsSection,
  elements.recentSection
];


let recentItems = [];
let recentVisibleCount = 5;


function setLoading() {
  elements.status.hidden =
    false;

  elements.status.classList.remove(
    "error"
  );

  elements.status.textContent =
    "最新データを確認しています…";

  elements.retryButton.hidden =
    true;

  loadingSections.forEach(
    section =>
      section?.classList.add(
        "home-section-loading"
      )
  );
}


function clearLoading() {
  loadingSections.forEach(
    section =>
      section?.classList.remove(
        "home-section-loading"
      )
  );
}


function setError(error) {
  clearLoading();

  elements.status.hidden =
    false;

  elements.status.classList.add(
    "error"
  );

  elements.status.innerHTML = `
    <strong>ホームデータを取得できませんでした。</strong>
    <span>${escapeHtml(error?.message || "不明なエラー")}</span>
  `;

  elements.retryButton.hidden =
    false;

  elements.homeUpdate.textContent =
    "データを更新できませんでした";
}


function renderSummary(summary) {
  elements.songCount.textContent =
    Number(
      summary.songCount || 0
    ).toLocaleString("ja-JP");

  elements.eventCount.textContent =
    Number(
      summary.eventCount || 0
    ).toLocaleString("ja-JP");

  elements.venueCount.textContent =
    Number(
      summary.venueCount || 0
    ).toLocaleString("ja-JP");

  elements.performanceCount.textContent =
    Number(
      summary.performanceCount || 0
    ).toLocaleString("ja-JP");
}


function renderFeatured(featured) {
  const song =
    featured.topSong || {};

  const venue =
    featured.topVenue || {};

  const event =
    featured.latestEvent || {};

  elements.featuredSong.href =
    song.songId
      ? `song.html?id=${encodeURIComponent(song.songId)}`
      : "#";

  elements.featuredSong.innerHTML = `
    <span class="home-featured-label">MOST PERFORMED SONG</span>
    <span class="home-featured-title">${escapeHtml(song.songName || "データなし")}</span>
    <span class="home-featured-meta">${Number(song.performanceCount || 0).toLocaleString("ja-JP")}回歌唱</span>
  `;

  elements.featuredVenue.href =
    venue.venueId
      ? `venue.html?id=${encodeURIComponent(venue.venueId)}`
      : "#";

  elements.featuredVenue.innerHTML = `
    <span class="home-featured-label">MOST USED VENUE</span>
    <span class="home-featured-title">${escapeHtml(venue.venueName || "データなし")}</span>
    <span class="home-featured-meta">${Number(venue.eventCount || 0).toLocaleString("ja-JP")}イベント</span>
  `;

  elements.featuredEvent.href =
    event.eventId
      ? `event.html?id=${encodeURIComponent(event.eventId)}`
      : "#";

  elements.featuredEvent.innerHTML = `
    <span class="home-featured-label">LATEST EVENT</span>
    <span class="home-featured-title">${escapeHtml(event.eventName || "データなし")}</span>
    <span class="home-featured-meta">${escapeHtml(formatDate(event.date))}</span>
  `;
}


function renderToday(today) {
  elements.todayDate.textContent =
    today.label || "";

  const groups = [
    {
      title:
        "この日に開催されたイベント",

      items:
        today.events || [],

      render:
        item => `
          <a class="today-item" href="event.html?id=${encodeURIComponent(item.eventId)}">
            <b>${escapeHtml(item.date ? item.date.slice(0,4) + "年 " : "")}${escapeHtml(item.eventName || "イベント名未設定")}</b>
            <div class="home-ranking-meta">${escapeHtml([item.category,item.eventType].filter(Boolean).join("｜"))}</div>
          </a>
        `
    },
    {
      title:
        "この日に初披露された曲",

      items:
        today.firstPerformedSongs || [],

      render:
        item => `
          <a class="today-item" href="song.html?id=${encodeURIComponent(item.songId)}">
            <b>${escapeHtml(item.songName || "曲名未設定")}</b>
            <div class="home-ranking-meta">${escapeHtml(item.date ? item.date.slice(0,4) + "年" : "")}</div>
          </a>
        `
    },
    {
      title:
        "この日に最後に歌われた曲",

      items:
        today.lastPerformedSongs || [],

      render:
        item => `
          <a class="today-item" href="song.html?id=${encodeURIComponent(item.songId)}">
            <b>${escapeHtml(item.songName || "曲名未設定")}</b>
            <div class="home-ranking-meta">${escapeHtml(item.date ? item.date.slice(0,4) + "年" : "")}</div>
          </a>
        `
    }
  ];

  if (
    !groups.some(
      group =>
        group.items.length
    )
  ) {
    elements.todayContent.innerHTML = `
      <section class="today-group">
        <div class="today-empty">今日は登録されている記録がありません。</div>
      </section>
    `;

    return;
  }

  elements.todayContent.innerHTML =
    groups
      .map(group => `
        <section class="today-group">
          <h3>${escapeHtml(group.title)}</h3>
          ${
            group.items.length
              ? group.items
                  .slice(0,6)
                  .map(group.render)
                  .join("")
              : '<div class="today-empty">該当する記録はありません。</div>'
          }
        </section>
      `)
      .join("");
}


function renderTopSongs(items) {
  elements.topSongs.innerHTML =
    items.length
      ? items.map(item => `
          <a class="home-ranking-row" href="song.html?id=${encodeURIComponent(item.songId)}">
            <span class="home-rank">${escapeHtml(item.rank)}</span>
            <span>
              <span class="home-ranking-name">${escapeHtml(item.songName || "曲名未設定")}</span>
              <span class="home-ranking-meta">イベント ${Number(item.eventCount || 0).toLocaleString("ja-JP")}件</span>
            </span>
            <span class="home-ranking-count">${Number(item.performanceCount || 0).toLocaleString("ja-JP")}回</span>
          </a>
        `).join("")
      : '<div class="empty">ランキングデータはありません。</div>';
}


function renderTopVenues(items) {
  elements.topVenues.innerHTML =
    items.length
      ? items.map(item => `
          <a class="home-ranking-row" href="venue.html?id=${encodeURIComponent(item.venueId)}">
            <span class="home-rank">${escapeHtml(item.rank)}</span>
            <span>
              <span class="home-ranking-name">${escapeHtml(item.venueName || "会場名未設定")}</span>
              <span class="home-ranking-meta">${escapeHtml([item.prefectureCity,item.country].filter(Boolean).join("｜"))}</span>
            </span>
            <span class="home-ranking-count">${Number(item.eventCount || 0).toLocaleString("ja-JP")}件</span>
          </a>
        `).join("")
      : '<div class="empty">会場データはありません。</div>';
}


function renderLatestEvents(items) {
  elements.latestEventsList.innerHTML =
    items.length
      ? items.map(item => {
          const meta =
            [
              item.category,
              item.eventType,
              item.day,
              item.performance,
              item.venueName
            ]
              .filter(Boolean)
              .join("｜");

          return `
            <a class="latest-event-row" href="event.html?id=${encodeURIComponent(item.eventId)}">
              <span class="latest-event-date">${escapeHtml(formatDate(item.date))}</span>
              <span>
                <span class="latest-event-name">${escapeHtml(item.eventName || "イベント名未設定")}</span>
                <span class="latest-event-meta">${escapeHtml(meta)}</span>
              </span>
              <span class="latest-event-arrow">›</span>
            </a>
          `;
        }).join("")
      : '<div class="empty">新着イベントはありません。</div>';
}


function renderRecent() {
  const visible =
    recentItems.slice(
      0,
      recentVisibleCount
    );

  elements.recentList.innerHTML =
    visible.length
      ? visible.map(item => {
          const performance =
            [
              item.day,
              item.performance
            ]
              .filter(Boolean)
              .join(" ");

          const songs =
            Array.isArray(item.songs)
              ? item.songs
              : [];

          return `
            <article class="recent-card">
              <div class="recent-card-head">
                <div class="recent-date">${escapeHtml(formatDate(item.date))}</div>
                <a class="recent-event" href="event.html?id=${encodeURIComponent(item.eventId)}">${escapeHtml(item.eventName || "イベント名未設定")}</a>

                <div class="recent-tags">
                  <span class="type-badge">${escapeHtml(item.category || "未分類")}</span>
                  ${item.eventType ? `<span class="recent-meta-link">${escapeHtml(item.eventType)}</span>` : ""}
                  ${performance ? `<span class="recent-meta-link">${escapeHtml(performance)}</span>` : ""}
                  ${item.venueName ? `<a class="recent-meta-link" href="venue.html?id=${encodeURIComponent(item.venueId)}">${escapeHtml(item.venueName)}</a>` : ""}
                </div>
              </div>

              <div class="recent-song-list">
                ${
                  songs.length
                    ? songs.map(song => `
                        <a class="recent-song" href="song.html?id=${encodeURIComponent(song.songId)}">
                          <span class="recent-song-name">${escapeHtml(song.songName || "曲名未設定")}</span>
                          ${song.singer ? `<span class="recent-song-singer">${escapeHtml(song.singer)}</span>` : ""}
                        </a>
                      `).join("")
                    : '<div class="empty">歌唱曲情報はありません。</div>'
                }
              </div>
            </article>
          `;
        }).join("")
      : '<div class="empty">最近の歌唱記録はありません。</div>';

  elements.recentMoreButton.hidden =
    recentVisibleCount >=
    recentItems.length;

  if (
    !elements.recentMoreButton.hidden
  ) {
    elements.recentMoreButton.textContent =
      `もっと見る（残り${recentItems.length - recentVisibleCount}件）`;
  }
}


function formatGeneratedAt(value) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit",

      hour:
        "2-digit",

      minute:
        "2-digit"
    }
  ).format(date);
}


function renderHome(response) {
  const data =
    response.data || {};

  recentItems =
    Array.isArray(data.recentPerformances)
      ? data.recentPerformances
      : [];

  recentVisibleCount =
    5;

  renderSummary(
    data.summary || {}
  );

  renderFeatured(
    data.featured || {}
  );

  renderToday(
    data.today || {}
  );

  renderTopSongs(
    data.topSongs || []
  );

  renderTopVenues(
    data.topVenues || []
  );

  renderLatestEvents(
    data.latestEvents || []
  );

  renderRecent();
  clearLoading();

  elements.status.hidden =
    true;

  const generatedAt =
    formatGeneratedAt(
      response.generatedAt
    );

  const cacheText =
    response.cache?.source &&
    response.cache.source !== "network"
      ? "・保存済みデータを表示"
      : "";

  elements.homeUpdate.textContent =
    generatedAt
      ? `データ確認：${generatedAt}${cacheText}`
      : `最新データを表示しています${cacheText}`;
}


async function loadHome() {
  setLoading();

  try {
    const response =
      await apiGet(
        "home",
        {
          recentLimit:
            20
        },
        {
          timeoutMs:
            30000,

          retryCount:
            1,

          cache:
            true,

          cacheTtlMs:
            600000,

          staleWhileRevalidate:
            true
        }
      );

    renderHome(
      response
    );

  } catch (error) {
    console.error(error);
    setError(error);
  }
}


elements.homeSearchForm.addEventListener(
  "submit",
  event => {
    event.preventDefault();

    const query =
      elements.homeSearchInput.value.trim();

    if (!query) {
      elements.homeSearchInput.focus();
      return;
    }

    location.href =
      `search.html?q=${encodeURIComponent(query)}`;
  }
);


elements.recentMoreButton.addEventListener(
  "click",
  () => {
    recentVisibleCount =
      Math.min(
        recentVisibleCount + 5,
        recentItems.length
      );

    renderRecent();
  }
);


elements.retryButton.addEventListener(
  "click",
  loadHome
);


loadHome();
