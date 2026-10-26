import { singerDisplayName } from "./singer-display.js?v=1.0.0";
import { buildSongUrl,
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.9.6&cache=revision-nonblocking&songUrls=1";

import {
  renderCommon
} from "./common.js?v=4.11.0&cache=release-ux&songUrls=1";

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
  yearMetrics: $("yearMetrics"),
  yearChartNote: $("yearChartNote"),
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
let selectedYearlyMetric = "events";
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

function buildYearly(items, metric = "performances") {
  if (!["events", "performances"].includes(metric)) throw new Error("Unknown yearly metric");
  const history = Array.isArray(items) ? items : [];
  const map = new Map();
  const yearOf = item => {
    const year = String(item?.date || "").slice(0, 4);
    return /^\d{4}$/.test(year) ? year : "";
  };
  const add = year => map.set(year, (map.get(year) || 0) + 1);
  if (metric === "events") {
    // Same non-empty, trimmed Event ID set as API summary.eventCount. Distinct
    // performances have distinct IDs; Song/title/Day must not be dedupe keys.
    const events = new Map();
    for (const item of history) {
      const id = String(item?.eventId || "").trim();
      if (!id) continue;
      if (!events.has(id)) events.set(id, new Set());
      const year = yearOf(item);
      if (year) events.get(id).add(year);
    }
    // Conflicting years are not guessed or counted twice: retain the Event
    // once in the unknown-year bucket so the total still matches summary.
    for (const years of events.values()) add(years.size === 1 ? [...years][0] : "");
  } else {
    history.forEach(item => add(yearOf(item)));
  }
  return [...map.entries()]
    .map(([year,count]) => ({year,count}))
    .sort((a,b) => a.year && b.year ? a.year.localeCompare(b.year) : a.year ? -1 : b.year ? 1 : 0);
}

// Match Song Detail's scale divisions and bar denominator.
function buildGraphScale_(maximum) {
  const max = Math.max(1, Number(maximum || 0));
  const divisions = max <= 4 ? max : max % 3 === 0 ? 3 : 4;
  return {
    max,
    ticks: Array.from({ length: divisions + 1 }, (_, index) => {
      const value = Math.round(max * index / divisions);
      return { value, position: value / max * 100 };
    })
  };
}

function renderAnalysis(items) {
  const yearly = buildYearly(items, selectedYearlyMetric);
  const metricLabel = selectedYearlyMetric === "events" ? "出演イベント数" : "歌唱記録数";
  const scale = buildGraphScale_(Math.max(1, ...yearly.map(x => x.count)));
  el.yearMetrics.querySelectorAll("[data-yearly-metric]").forEach(button => {
    const active = button.dataset.yearlyMetric === selectedYearlyMetric;
    button.setAttribute("aria-pressed", String(active));
  });
  el.yearChart.setAttribute("aria-label", `${metricLabel}の年別集計`);
  el.yearChart.setAttribute("role", yearly.length ? "list" : "status");

  el.yearChart.innerHTML = yearly.length
    ? `<div class="singer-year-scale" aria-hidden="true">
        <span></span>
        <span class="singer-chart-scale-labels">${scale.ticks.map(tick => `<span style="left:${tick.position}%">${tick.value.toLocaleString("ja-JP")}件</span>`).join("")}</span>
        <span></span>
      </div>` + yearly.map(item => `
        <div class="singer-year-row" role="listitem">
          <span class="singer-year-label">${escapeHtml(item.year || "年不明")}</span>
          <span class="singer-year-track" aria-hidden="true">
            <span class="singer-year-bar${item.count === 0 ? " is-zero" : ""}" style="width:${item.count / scale.max * 100}%"></span>
            ${scale.ticks.slice(1, -1).map(tick => `<span class="singer-chart-gridline" style="left:${tick.position}%"></span>`).join("")}
          </span>
          <span class="singer-year-value">${item.count}件</span>
        </div>`).join("")
    : `<div class="empty">年別データはありません。</div>`;

  el.yearChartNote.textContent = selectedYearlyMetric === "events"
    ? "同じイベントの複数曲は1件として集計します。イベントIDがない記録は含みません。年を確定できないイベントは「年不明」にまとめます。"
    : "歌唱履歴の1行を1件として集計します。年を読み取れない記録は「年不明」にまとめます。";

  el.analysisSection.hidden = false;
}

function titleWithChevron_(text) {
  const chars = Array.from(String(text));
  return `${escapeHtml(chars.slice(0, -2).join(""))}<span class="mus-title-tail">${escapeHtml(chars.slice(-2).join(""))}<span class="site-icon-inline mus-link-chevron" data-site-icon="chevron-right" aria-hidden="true"></span></span>`;
}

function renderSongs(items) {
  el.songsCount.textContent = `${items.length.toLocaleString("ja-JP")}曲`;

  el.songsList.innerHTML = items.length
    ? items.map((item,index) => `
        <a class="singer-song-row mus-card-link mus-chip-link" href="${buildSongUrl(item.songId)}">
          <span class="singer-song-rank">${index + 1}</span>
          <div>
            <strong class="mus-card-title mus-title-chip">${titleWithChevron_(item.songName || "曲名未設定")}</strong>
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
                ? `<a class="mus-link-primary mus-chip-link" href="event.html?id=${encodeURIComponent(item.eventId)}"><span class="mus-title-chip">${titleWithChevron_(item.eventName || "イベント名未設定")}</span></a>`
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
              <span class="singer-event-chevron" aria-hidden="true"><span class="site-icon-inline " data-site-icon="chevron-down" aria-hidden="true"></span></span>
            </button>
          </div>
          <div class="singer-event-songs" id="${bodyId}" ${expanded ? "" : "hidden"}>
            ${item.songs.map(song => `<div class="singer-event-song-row">${song.songId
              ? `<a class="mus-link-primary mus-chip-link" href="${buildSongUrl(song.songId)}"><span class="mus-title-chip">${titleWithChevron_(song.songName || "曲名未設定")}</span></a>`
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
  const originalName = data.displayName || data.singerName || "歌唱名義未設定";
  const name = singerDisplayName(data, originalName);

  el.singerName.textContent = name;
  renderSingerColors(originalName);

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
el.yearMetrics.addEventListener("click", event => {
  const button = event.target.closest("[data-yearly-metric]");
  if (!button || button.dataset.yearlyMetric === selectedYearlyMetric) return;
  selectedYearlyMetric = button.dataset.yearlyMetric;
  renderAnalysis(allHistory);
});
loadSinger();
