import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.6.3";


renderCommon("song");


const elements = {
  songName: document.getElementById("songName"),
  heroMeta: document.getElementById("heroMeta"),
  status: document.getElementById("status"),
  retryButton: document.getElementById("retryButton"),
  songSwitcher: document.getElementById("songSwitcher"),
  previousSongButton: document.getElementById("previousSongButton"),
  previousSongTitle: document.getElementById("previousSongTitle"),
  nextSongButton: document.getElementById("nextSongButton"),
  nextSongTitle: document.getElementById("nextSongTitle"),
  songPicker: document.getElementById("songPicker"),
  detailLocalNav: document.getElementById("detailLocalNav"),
  mainContent: document.getElementById("mainContent"),
  songInfo: document.getElementById("songInfo"),
  songStats: document.getElementById("songStats"),
  songDates: document.getElementById("songDates"),
  discoverySection: document.getElementById("discoverySection"),
  songDiscovery: document.getElementById("songDiscovery"),
  songInsightsSection: document.getElementById("songInsightsSection"),
  coPerformedSongs: document.getElementById("coPerformedSongs"),
  songTopVenues: document.getElementById("songTopVenues"),
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
  elements.songSwitcher.hidden = true;
  elements.detailLocalNav.hidden = true;
  elements.mainContent.hidden = true;
  elements.discoverySection.hidden = true;
  elements.songInsightsSection.hidden = true;
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

  const topSingerName =
    topSinger
      ? String(topSinger[0] || "").trim()
      : "";

  if (topSingerName) {
    cards.push({
      label: "主な歌唱名義",
      title: topSingerName,
      meta: "この名義の関連曲・イベントを見る",
      href:
        `search.html?q=${encodeURIComponent(
          topSingerName
        )}&source=singer`
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




function renderSongNavigation_(
  navigation
) {
  const previous =
    navigation.previous || null;

  const next =
    navigation.next || null;

  const songs =
    Array.isArray(
      navigation.songs
    )
      ? navigation.songs
      : [];

  if (previous) {
    elements.previousSongButton.classList.remove(
      "disabled"
    );

    elements.previousSongButton.href =
      `song.html?id=${encodeURIComponent(
        previous.songId
      )}`;

    elements.previousSongTitle.textContent =
      previous.songName;
  } else {
    elements.previousSongButton.classList.add(
      "disabled"
    );

    elements.previousSongButton.removeAttribute(
      "href"
    );

    elements.previousSongTitle.textContent =
      "前の曲はありません";
  }

  if (next) {
    elements.nextSongButton.classList.remove(
      "disabled"
    );

    elements.nextSongButton.href =
      `song.html?id=${encodeURIComponent(
        next.songId
      )}`;

    elements.nextSongTitle.textContent =
      next.songName;
  } else {
    elements.nextSongButton.classList.add(
      "disabled"
    );

    elements.nextSongButton.removeAttribute(
      "href"
    );

    elements.nextSongTitle.textContent =
      "次の曲はありません";
  }

  elements.songPicker.innerHTML =
    songs.map(item => `
      <option
        value="${escapeHtml(item.songId)}"
        ${item.songId === songId ? "selected" : ""}
      >
        ${escapeHtml(item.songName)}
      </option>`
    ).join("");

  elements.songSwitcher.hidden = false;
}


function renderSongInsights_(
  discover
) {
  const coSongs =
    discover.coPerformedSongs || [];

  const venues =
    discover.topVenues || [];

  elements.coPerformedSongs.innerHTML =
    coSongs.length
      ? coSongs.map(item => `
          <a
            class="insight-row"
            href="song.html?id=${encodeURIComponent(
              item.songId
            )}"
          >
            <span>
              <span class="insight-title">
                ${escapeHtml(
                  item.songName ||
                  "曲名未設定"
                )}
              </span>

              <span class="insight-meta">
                同じイベントで歌唱
              </span>
            </span>

            <span class="insight-value">
              ${Number(
                item.eventCount || 0
              ).toLocaleString(
                "ja-JP"
              )}件
            </span>
          </a>`
        ).join("")
      : `<div class="empty">関連曲データはありません。</div>`;

  elements.songTopVenues.innerHTML =
    venues.length
      ? venues.map(item => `
          <a
            class="insight-row"
            href="venue.html?id=${encodeURIComponent(
              item.venueId
            )}"
          >
            <span>
              <span class="insight-title">
                ${escapeHtml(
                  item.venueName ||
                  "会場名未設定"
                )}
              </span>
            </span>

            <span class="insight-value">
              ${Number(
                item.count || 0
              ).toLocaleString(
                "ja-JP"
              )}回
            </span>
          </a>`
        ).join("")
      : `<div class="empty">会場データはありません。</div>`;
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
  elements.songInsightsSection.hidden = false;
  elements.historySection.hidden = false;
}


async function loadSong() {
  setLoading();

  try {
    const [
      response,
      discoverResponse
    ] = await Promise.all([
      apiGet(
        "song",
        { id: songId },
        {
          timeoutMs: 20000,
          retryCount: 1
        }
      ),

      apiGet(
        "discover",
        {
          type: "song",
          id: songId
        },
        {
          timeoutMs: 30000,
          retryCount: 1
        }
      )
    ]);

    renderSong(response.data);
    const discoverData =
      discoverResponse.data || {};

    renderSongInsights_(
      discoverData
    );

    renderSongNavigation_(
      discoverData.navigation || {}
    );

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



elements.songPicker.addEventListener(
  "change",
  () => {
    const selectedSongId =
      elements.songPicker.value;

    if (selectedSongId) {
      location.href =
        `song.html?id=${encodeURIComponent(
          selectedSongId
        )}`;
    }
  }
);


elements.retryButton.addEventListener(
  "click",
  loadSong
);


loadSong();
