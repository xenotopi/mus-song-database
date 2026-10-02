import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.9.6&cache=revision-nonblocking";

import {
  renderCommon
} from "./common.js?v=4.9.1&cache=revision-nonblocking";

renderCommon("singer");

const $ = id => document.getElementById(id);

const el = {
  singerName: $("singerName"),
  singerColorLine: $("singerColorLine"),
  status: $("status"),
  retryButton: $("retryButton"),
  summary: $("summary"),
  performanceCount: $("performanceCount"),
  songCount: $("songCount"),
  eventCount: $("eventCount"),
  analysisSection: $("analysisSection"),
  yearChart: $("yearChart"),
  songsSection: $("songsSection"),
  songsCount: $("songsCount"),
  songsList: $("songsList"),
  historySection: $("historySection"),
  historyCount: $("historyCount"),
  historyList: $("historyList"),
  yearFilters: $("yearFilters"),
  visibleHistoryCount: $("visibleHistoryCount"),
  historyMoreButton: $("historyMoreButton")
};

const params = new URLSearchParams(location.search);
const singerId = String(params.get("id") || "").trim();
const singerName = String(params.get("name") || "").trim();
const singerCategory = String(params.get("category") || "").trim();

const MEMBER_COLORS = [
  { color:"#f39a3d", keys:["高坂穂乃果","穂乃果","新田恵海","新田"] },
  { color:"#5bc0de", keys:["絢瀬絵里","絵里","南條愛乃","南條"] },
  { color:"#b8b8c8", keys:["南ことり","ことり","内田彩","内田"] },
  { color:"#3b74c5", keys:["園田海未","海未","三森すずこ","三森"] },
  { color:"#f2c94c", keys:["星空凛","凛","飯田里穂","飯田"] },
  { color:"#ef5b6c", keys:["西木野真姫","真姫","Pile"] },
  { color:"#7f57c2", keys:["東條希","希","楠田亜衣奈","楠田"] },
  { color:"#52c46a", keys:["小泉花陽","花陽","久保ユリカ","久保"] },
  { color:"#ef71b8", keys:["矢澤にこ","にこ","徳井青空","徳井"] }
];
const ALL_COLORS = MEMBER_COLORS.map(x => x.color);

let allHistory = [];
let eventHistory = [];
const expandedEventIds = new Set();
let selectedYear = "all";
let visibleLimit = 20;

function colorsForSinger(text) {
  const value = String(text || "").normalize("NFKC");
  if (!value) return [];
  if (value.includes("μ's") || value.includes("μ’s")) return ALL_COLORS.slice();

  const result = [];
  MEMBER_COLORS.forEach(member => {
    if (member.keys.some(key => value.includes(key))) result.push(member.color);
  });
  return [...new Set(result)];
}

function renderSingerColors(name) {
  const colors = colorsForSinger(name);
  el.singerColorLine.innerHTML =
    (colors.length ? colors : ALL_COLORS)
      .map(color => `<span style="background:${color}"></span>`)
      .join("");
}

function buildYearly(items) {
  const map = new Map();
  items.forEach(item => {
    const year = String(item.date || "").slice(0,4);
    if (!year) return;
    map.set(year, Number(map.get(year) || 0) + 1);
  });
  return [...map.entries()]
    .map(([year,count]) => ({year,count}))
    .sort((a,b) => String(a.year).localeCompare(String(b.year)));
}

function renderAnalysis(items) {
  const yearly = buildYearly(items);
  const max = Math.max(1, ...yearly.map(x => x.count));

  el.yearChart.innerHTML = yearly.length
    ? yearly.map(item => `
        <div class="singer-year-row">
          <span class="singer-year-label">${escapeHtml(item.year)}</span>
          <span class="singer-year-track">
            <span class="singer-year-bar" style="width:${Math.max(3, Math.round(item.count / max * 100))}%"></span>
          </span>
          <span class="singer-year-value">${item.count}件</span>
        </div>`).join("")
    : `<div class="empty">年別データはありません。</div>`;

  el.analysisSection.hidden = false;
}

function renderSongs(items) {
  el.songsCount.textContent = `${items.length.toLocaleString("ja-JP")}曲`;

  el.songsList.innerHTML = items.length
    ? items.map((item,index) => `
        <a class="singer-song-row" href="song.html?id=${encodeURIComponent(item.songId)}">
          <span class="singer-song-rank">${index + 1}</span>
          <div>
            <strong>${escapeHtml(item.songName || "曲名未設定")}</strong>
            <div class="singer-song-meta">
              ${item.firstDate ? `<span>初回 ${escapeHtml(formatDate(item.firstDate))}</span>` : ""}
              ${item.lastDate ? `<span>最終 ${escapeHtml(formatDate(item.lastDate))}</span>` : ""}
            </div>
          </div>
          <span class="singer-song-count">${Number(item.performanceCount || 0).toLocaleString("ja-JP")}回</span>
        </a>`).join("")
    : `<div class="singer-song-row">歌唱曲データがありません。</div>`;
}

function groupHistoryByEvent(items) {
  const groups = new Map();
  items.forEach((item, index) => {
    const eventId = String(item.eventId || "").trim();
    const key = eventId || `missing-${index}`;
    if (!groups.has(key)) {
      groups.set(key, {
        eventId,
        eventName: item.eventName,
        date: item.date,
        eventType: item.eventType,
        day: item.day,
        performance: item.performance,
        songs: []
      });
    }
    groups.get(key).songs.push(item);
  });
  return [...groups.values()];
}

function filteredHistory() {
  return eventHistory.filter(item => {
    const yearOK =
      selectedYear === "all" ||
      String(item.date || "").slice(0,4) === selectedYear;

    return yearOK;
  });
}

function renderHistory() {
  const filtered = filteredHistory();
  const visible = filtered.slice(0, visibleLimit);

  el.historyCount.textContent =
    `${eventHistory.length.toLocaleString("ja-JP")}イベント`;

  el.visibleHistoryCount.textContent =
    `${visible.length}/${filtered.length}イベント表示`;

  el.historyList.innerHTML = visible.length
    ? visible.map((item, index) => {
        const key = item.eventId || `missing-${index}`;
        const expanded = expandedEventIds.has(key);
        const bodyId = `singer-event-songs-${index}`;
        return `
        <article class="singer-event-card">
          <div class="singer-event-head">
            <div>
              <div class="singer-event-date">${escapeHtml(formatDate(item.date) || "日付不明")}</div>
              <div class="singer-event-title">${item.eventId
                ? `<a href="event.html?id=${encodeURIComponent(item.eventId)}">${escapeHtml(item.eventName || "イベント名未設定")}</a>`
                : escapeHtml(item.eventName || "イベント名未設定")}</div>
              <div class="singer-event-meta">
                ${item.eventType ? `<span>${escapeHtml(item.eventType)}</span>` : ""}
                ${item.day ? `<span>${escapeHtml(item.day)}</span>` : ""}
                ${item.performance ? `<span>${escapeHtml(item.performance)}</span>` : ""}
                <span>歌唱記録 ${item.songs.length}件</span>
              </div>
            </div>
            <button type="button" class="singer-event-toggle" data-event-id="${escapeHtml(key)}" aria-expanded="${expanded}" aria-controls="${bodyId}">
              <span class="singer-event-toggle-label">${expanded ? "閉じる" : "曲を見る"}</span>
              <span class="singer-event-chevron" aria-hidden="true">⌄</span>
            </button>
          </div>
          <div class="singer-event-songs" id="${bodyId}" ${expanded ? "" : "hidden"}>
            ${item.songs.map(song => `<div class="singer-event-song-row">${song.songId
              ? `<a href="song.html?id=${encodeURIComponent(song.songId)}">${escapeHtml(song.songName || "曲名未設定")}</a>`
              : escapeHtml(song.songName || "曲名未設定")}</div>`).join("")}
          </div>
        </article>`;
      }).join("")
    : `<div class="singer-history-empty">条件に該当するイベントはありません。</div>`;

  el.historyMoreButton.hidden = visible.length >= filtered.length;
  if (!el.historyMoreButton.hidden) {
    el.historyMoreButton.textContent =
      `もっと見る（残り${filtered.length - visible.length}イベント）`;
  }
}

function setupFilters() {
  const years = [...new Set(
    eventHistory
      .map(item => String(item.date || "").slice(0,4))
      .filter(Boolean)
  )].sort();

  el.yearFilters.innerHTML =
    `<button type="button" class="singer-year-pill active" data-year="all">全期間</button>` +
    years.map(year =>
      `<button type="button" class="singer-year-pill" data-year="${escapeHtml(year)}">${escapeHtml(year)}</button>`
    ).join("");

  el.yearFilters.querySelectorAll("[data-year]").forEach(button => {
    button.addEventListener("click", () => {
      selectedYear = button.dataset.year || "all";
      visibleLimit = 20;
      el.yearFilters.querySelectorAll("[data-year]").forEach(x =>
        x.classList.toggle("active", x === button)
      );
      renderHistory();
    });
  });

  el.historyMoreButton.addEventListener("click", () => {
    visibleLimit += 20;
    renderHistory();
  });

  el.historyList.addEventListener("click", event => {
    const button = event.target.closest(".singer-event-toggle");
    if (!button) return;
    const key = button.dataset.eventId;
    const body = document.getElementById(button.getAttribute("aria-controls"));
    if (!body) return;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    button.querySelector(".singer-event-toggle-label").textContent = expanded ? "閉じる" : "曲を見る";
    body.hidden = !expanded;
    if (expanded) expandedEventIds.add(key);
    else expandedEventIds.delete(key);
  });
}

function render(data) {
  const summary = data.summary || {};
  const name =
    data.displayName ||
    data.singerName ||
    "歌唱名義未設定";

  el.singerName.textContent = name;
  renderSingerColors(name);

  document.title =
    `${name} | 歌唱名義詳細 | μ's Song Database`;

  if (
    data.singerId &&
    singerId !== data.singerId
  ) {
    history.replaceState(
      null,
      "",
      `singer.html?id=${encodeURIComponent(data.singerId)}`
    );
  }

  el.performanceCount.textContent =
    Number(summary.performanceCount || 0).toLocaleString("ja-JP");
  el.songCount.textContent =
    Number(summary.uniqueSongCount || 0).toLocaleString("ja-JP");
  el.eventCount.textContent =
    Number(summary.eventCount || 0).toLocaleString("ja-JP");
  const songs = Array.isArray(data.songs) ? data.songs : [];
  allHistory = Array.isArray(data.history)
    ? data.history.slice().sort((a, b) =>
        String(a.date || "").slice(0, 10).localeCompare(String(b.date || "").slice(0, 10))
      )
    : [];
  eventHistory = groupHistoryByEvent(allHistory);
  expandedEventIds.clear();

  renderAnalysis(allHistory);
  renderSongs(songs);
  setupFilters();
  renderHistory();

  el.status.hidden = true;
  el.summary.hidden = false;
  el.songsSection.hidden = false;
  el.historySection.hidden = false;
}

function showSingerError(title, message, canRetry = false) {
  el.singerName.textContent = title;
  document.title = `${title} | μ's Song Database`;
  el.status.hidden = false;
  el.status.innerHTML = `
    <p>${escapeHtml(message)}</p>
    <p><a href="singers.html">歌唱名義一覧へ戻る</a></p>
  `;
  el.retryButton.hidden = !canRetry;
  el.summary.hidden = true;
  el.analysisSection.hidden = true;
  el.songsSection.hidden = true;
  el.historySection.hidden = true;
}

async function loadSinger() {
  if (!singerId && !singerName) {
    showSingerError(
      "歌唱名義が指定されていません",
      "歌唱名義一覧から見たい名義を選択してください。"
    );
    return;
  }

  el.status.hidden = false;
  el.status.textContent = "歌唱名義データを読み込んでいます...";
  el.retryButton.hidden = true;

  try {
    const response = await apiGet(
      "singer",
      {
        id: singerId,
        name: singerName,
        category: singerCategory
      }
    );
    const singerData = response.data || response;
    render(singerData);

    const renderedSingerId = String(
      singerData.singerId || singerId
    );
    if (/^SN\d+$/.test(renderedSingerId)) {
      window.MusDbAnalytics?.trackOnce(
        `view_detail:singer:${renderedSingerId}`,
        "view_detail",
        {
          content_type: "singer",
          item_id: renderedSingerId,
          item_name:
            singerData.displayName ||
            singerData.singerName ||
            "",
          content_category:
            singerData.category ||
            singerCategory ||
            ""
        }
      );
    }
  } catch (error) {
    const isExpectedNotFound =
      /見つかりません|該当(?:する)?データ(?:が)?ありません/.test(
        String(error?.message || "")
      );

    if (!isExpectedNotFound) {
      console.error(error);
    }

    showSingerError(
      "歌唱名義が見つかりません",
      error?.message ||
        "指定された歌唱名義を取得できませんでした。",
      true
    );
  }
}

el.retryButton.addEventListener("click", loadSinger);
loadSinger();
