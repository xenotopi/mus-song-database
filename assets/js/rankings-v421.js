import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.8.0";

import {
  buildSingerUrl
} from "./singer-links.js?v=4.8.0";

renderCommon("rankings");

const $ = id => document.getElementById(id);

const el = {
  status: $("status"),
  retryButton: $("retryButton"),
  summary: $("summary"),
  songCount: $("songCount"),
  eventCount: $("eventCount"),
  venueCount: $("venueCount"),
  performanceCount: $("performanceCount"),
  singerCount: $("singerCount"),
  completeCount: $("completeCount"),
  quickViews: $("quickViews"),
  podium: $("podium"),
  podiumList: $("podiumList"),
  tabs: $("tabs"),
  toolbar: $("toolbar"),
  rankingYear: $("rankingYear"),
  rankingCategory: $("rankingCategory"),
  rankingSort: $("rankingSort"),
  resultHead: $("resultHead"),
  rankingCondition: $("rankingCondition"),
  rankingResultCount: $("rankingResultCount"),
  songsPanel: $("songsPanel"),
  eventsPanel: $("eventsPanel"),
  venuesPanel: $("venuesPanel"),
  singersPanel: $("singersPanel"),
  songsList: $("songsList"),
  eventsList: $("eventsList"),
  venuesList: $("venuesList"),
  singersList: $("singersList"),
  moreWrap: $("moreWrap"),
  moreButton: $("moreButton")
};

const sortOptions = {
  songs: [
    ["performance-desc", "歌唱回数が多い順"],
    ["complete-desc", "完全体歌唱回数が多い順"],
    ["complete-rate-desc", "完全体率が高い順"],
    ["gap-desc", "最長ブランクが長い順"],
    ["first-asc", "初披露が古い順"],
    ["last-desc", "最終披露が新しい順"]
  ],

  events: [
    ["performance-desc", "歌唱記録数が多い順"],
    ["complete-desc", "完全体歌唱回数が多い順"],
    ["complete-rate-desc", "完全体率が高い順"],
    ["date-desc", "開催日が新しい順"],
    ["date-asc", "開催日が古い順"]
  ],

  venues: [
    ["event-desc", "開催イベント数が多い順"],
    ["song-desc", "歌唱曲数が多い順"],
    ["performance-desc", "歌唱記録数が多い順"]
  ],

  singers: [
    ["performance-desc", "歌唱記録数が多い順"],
    ["song-desc", "歌唱曲数が多い順"],
    ["event-desc", "出演イベント数が多い順"]
  ]
};

let data = {
  summary: {},
  filters: {},
  songs: [],
  events: [],
  venues: [],
  singers: []
};

let activeTab = "songs";
let visibleLimit = 50;

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ja");
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  const type = params.get("type");

  if (["songs", "events", "venues", "singers"].includes(type)) {
    activeTab = type;
  }

  el.rankingYear.value = params.get("year") || "";
  el.rankingCategory.value = params.get("category") || "";
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set("type", activeTab);

  if (el.rankingYear.value) params.set("year", el.rankingYear.value);
  if (el.rankingCategory.value) params.set("category", el.rankingCategory.value);
  if (el.rankingSort.value) params.set("sort", el.rankingSort.value);

  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

function setLoading() {
  el.status.hidden = false;
  el.status.classList.remove("error");
  el.status.textContent = "ランキングデータを読み込んでいます…";
  el.retryButton.hidden = true;
  el.summary.hidden = true;
  el.tabs.hidden = true;
  el.quickViews.hidden = true;
  el.podium.hidden = true;
  el.toolbar.hidden = true;
  el.resultHead.hidden = true;
  hidePanels();
  el.moreWrap.hidden = true;
}

function setError(error) {
  el.status.hidden = false;
  el.status.classList.add("error");
  el.status.innerHTML = `
    <strong>ランキングデータを取得できませんでした。</strong>
    <span>${escapeHtml(error?.message || "不明なエラー")}</span>
  `;
  el.retryButton.hidden = false;
}

function hidePanels() {
  el.songsPanel.hidden = true;
  el.eventsPanel.hidden = true;
  el.venuesPanel.hidden = true;
  el.singersPanel.hidden = true;
}

function renderSummary() {
  const s = data.summary || {};
  el.songCount.textContent = Number(s.songCount || 0).toLocaleString("ja-JP");
  el.eventCount.textContent = Number(s.eventCount || 0).toLocaleString("ja-JP");
  el.venueCount.textContent = Number(s.venueCount || 0).toLocaleString("ja-JP");
  el.performanceCount.textContent = Number(s.performanceCount || 0).toLocaleString("ja-JP");
  el.singerCount.textContent = Number(s.singerCount || 0).toLocaleString("ja-JP");
  el.completeCount.textContent = Number(s.completePerformanceCount || 0).toLocaleString("ja-JP");
}

function renderYears() {
  const current = el.rankingYear.value;
  const years = Array.isArray(data.filters?.availableYears)
    ? data.filters.availableYears
    : [];

  el.rankingYear.innerHTML =
    `<option value="">全期間</option>` +
    years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}年</option>`).join("");

  el.rankingYear.value = current;
}

function updateSortOptions() {
  const options = sortOptions[activeTab] || [];
  const currentValue = el.rankingSort.value;
  const currentFromUrl = new URLSearchParams(location.search).get("sort");

  el.rankingSort.innerHTML = options
    .map(([value, label]) =>
      `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
    )
    .join("");

  const nextValue = options.some(([value]) => value === currentValue)
    ? currentValue
    : options.some(([value]) => value === currentFromUrl)
      ? currentFromUrl
      : options[0]?.[0] || "";

  el.rankingSort.value = nextValue;
}

function getSearchText(item) {
  if (activeTab === "songs") {
    return [item.songName, item.version, item.media, item.songCategory].join(" ");
  }

  if (activeTab === "events") {
    return [item.eventName, item.category, item.eventType, item.day, item.performance].join(" ");
  }

  if (activeTab === "venues") {
    return [item.venueName, item.prefectureCity, item.region, item.country].join(" ");
  }

  return item.singerName || "";
}

function sortItems(items) {
  const sort = el.rankingSort.value;

  return items.sort((a, b) => {
    if (sort === "event-desc") {
      return Number(b.eventCount || 0) - Number(a.eventCount || 0)
        || compareText(a.songName || a.venueName || a.singerName, b.songName || b.venueName || b.singerName);
    }

    if (sort === "song-desc") {
      return Number(b.uniqueSongCount || 0) - Number(a.uniqueSongCount || 0)
        || compareText(a.eventName || a.venueName || a.singerName, b.eventName || b.venueName || b.singerName);
    }


    if (sort === "complete-desc") {
      return Number(b.completePerformanceCount || 0) - Number(a.completePerformanceCount || 0)
        || Number(b.performanceCount || 0) - Number(a.performanceCount || 0)
        || compareText(a.songName || a.eventName, b.songName || b.eventName);
    }

    if (sort === "complete-rate-desc") {
      return Number(b.completeRate || 0) - Number(a.completeRate || 0)
        || Number(b.completePerformanceCount || 0) - Number(a.completePerformanceCount || 0)
        || Number(b.performanceCount || 0) - Number(a.performanceCount || 0);
    }

    if (sort === "gap-desc") {
      return Number(b.longestGapDays || 0) - Number(a.longestGapDays || 0)
        || Number(b.performanceCount || 0) - Number(a.performanceCount || 0)
        || compareText(a.songName, b.songName);
    }

    if (sort === "date-desc") return compareText(b.date, a.date);
    if (sort === "date-asc") return compareText(a.date, b.date);
    if (sort === "first-asc") return compareText(a.firstPerformanceDate || "9999-12-31", b.firstPerformanceDate || "9999-12-31");
    if (sort === "last-desc") return compareText(b.lastPerformanceDate, a.lastPerformanceDate);

    if (sort === "name-asc") {
      return compareText(
        a.songName || a.venueName || a.singerName,
        b.songName || b.venueName || b.singerName
      );
    }

    return Number(b.performanceCount || 0) - Number(a.performanceCount || 0)
      || compareText(
        a.songName || a.eventName || a.venueName || a.singerName,
        b.songName || b.eventName || b.venueName || b.singerName
      );
  });
}

function hasRankingRecord(item) {
  if (activeTab === "songs") {
    return Number(item.performanceCount || 0) > 0;
  }

  if (activeTab === "events") {
    return Number(item.performanceCount || 0) > 0;
  }

  if (activeTab === "venues") {
    return Number(item.eventCount || 0) > 0;
  }

  if (activeTab === "singers") {
    return Number(item.performanceCount || 0) > 0;
  }

  return false;
}


function getItems() {
  const source = Array.isArray(data[activeTab])
    ? data[activeTab]
        .filter(hasRankingRecord)
        .slice()
    : [];

  return sortItems(source);
}

function getActiveMetric(item) {
  const sort = el.rankingSort.value;

  if (activeTab === "songs") {
    if (sort === "complete-desc") {
      return {
        count: `${Number(item.completePerformanceCount || 0).toLocaleString("ja-JP")}回`,
        label: "完全体歌唱"
      };
    }

    if (sort === "complete-rate-desc") {
      return {
        count: `${Number(item.completeRate || 0).toFixed(1)}%`,
        label: "完全体率"
      };
    }

    if (sort === "gap-desc") {
      return {
        count: `${Number(item.longestGapDays || 0).toLocaleString("ja-JP")}日`,
        label: "最長ブランク"
      };
    }

    if (sort === "first-asc") {
      return {
        count: item.firstPerformanceDate ? formatDate(item.firstPerformanceDate) : "—",
        label: "初披露"
      };
    }

    if (sort === "last-desc") {
      return {
        count: item.lastPerformanceDate ? formatDate(item.lastPerformanceDate) : "—",
        label: "最終披露"
      };
    }


    return {
      count: `${Number(item.performanceCount || 0).toLocaleString("ja-JP")}回`,
      label: "歌唱記録"
    };
  }

  if (activeTab === "events") {
    if (sort === "complete-desc") {
      return {
        count: `${Number(item.completePerformanceCount || 0).toLocaleString("ja-JP")}曲`,
        label: "完全体歌唱"
      };
    }

    if (sort === "complete-rate-desc") {
      return {
        count: `${Number(item.completeRate || 0).toFixed(1)}%`,
        label: "完全体率"
      };
    }

    if (sort === "date-desc" || sort === "date-asc") {
      return {
        count: item.date ? formatDate(item.date) : "—",
        label: "開催日"
      };
    }

    return {
      count: `${Number(item.performanceCount || 0).toLocaleString("ja-JP")}件`,
      label: "歌唱記録"
    };
  }

  if (activeTab === "venues") {
    if (sort === "song-desc") {
      return {
        count: `${Number(item.uniqueSongCount || 0).toLocaleString("ja-JP")}曲`,
        label: "歌唱曲数"
      };
    }


    return {
      count: `${Number(item.eventCount || 0).toLocaleString("ja-JP")}件`,
      label: "開催イベント"
    };
  }

  if (activeTab === "singers") {
    if (sort === "song-desc") {
      return {
        count: `${Number(item.uniqueSongCount || 0).toLocaleString("ja-JP")}曲`,
        label: "歌唱曲数"
      };
    }

    if (sort === "event-desc") {
      return {
        count: `${Number(item.eventCount || 0).toLocaleString("ja-JP")}件`,
        label: "出演イベント"
      };
    }


    return {
      count: `${Number(item.performanceCount || 0).toLocaleString("ja-JP")}件`,
      label: "歌唱記録"
    };
  }

  return {
    count: "—",
    label: ""
  };
}


function rankRow({href, rank, title, meta, count, countLabel}) {
  return `
    <a class="ranking-row" href="${href}">
      <span class="ranking-position">${rank}</span>
      <span>
        <span class="ranking-title">${escapeHtml(title)}</span>
        <span class="ranking-meta">${meta}</span>
      </span>
      <span class="ranking-count">
        ${escapeHtml(count)}
        <small>${escapeHtml(countLabel)}</small>
      </span>
    </a>
  `;
}

function renderSongs(items) {
  el.songsList.innerHTML = items.length
    ? items.map((item, index) => rankRow({
        href: `song.html?id=${encodeURIComponent(item.songId)}`,
        rank: index + 1,
        title: item.songName || "曲名未設定",
        meta: [
          item.version && `<span>${escapeHtml(item.version)}</span>`,
          item.media && `<span>${escapeHtml(item.media)}</span>`,
          item.songCategory && `<span>${escapeHtml(item.songCategory)}</span>`,
          `<span>イベント ${Number(item.eventCount || 0)}件</span>`,
          `<span>公式 ${Number(item.officialEventCount || 0)}件</span>`,
          `<span>ソロ ${Number(item.soloEventCount || 0)}件</span>`,
          `<span>完全体 ${Number(item.completePerformanceCount || 0)}回（${Number(item.completeRate || 0).toFixed(1)}%）</span>`,
          Number(item.longestGapDays || 0) > 0 && `<span>最長ブランク ${Number(item.longestGapDays).toLocaleString("ja-JP")}日</span>`,
          item.firstPerformanceDate && `<span>初披露 ${escapeHtml(formatDate(item.firstPerformanceDate))}</span>`,
          item.lastPerformanceDate && `<span>最終披露 ${escapeHtml(formatDate(item.lastPerformanceDate))}</span>`
        ].filter(Boolean).join(""),
        count: getActiveMetric(item).count,
        countLabel: getActiveMetric(item).label
      })).join("")
    : `<div class="empty">条件に該当する曲はありません。</div>`;
}

function renderEvents(items) {
  el.eventsList.innerHTML = items.length
    ? items.map((item, index) => rankRow({
        href: `event.html?id=${encodeURIComponent(item.eventId)}`,
        rank: index + 1,
        title: item.eventName || "イベント名未設定",
        meta: [
          `<span>${escapeHtml(formatDate(item.date))}</span>`,
          `<span class="type-badge">${escapeHtml(item.category || "未分類")}</span>`,
          `<span>${escapeHtml([item.eventType, item.day, item.performance].filter(Boolean).join("｜"))}</span>`,
          `<span>歌唱記録 ${Number(item.performanceCount || 0)}件</span>`,
          `<span>完全体 ${Number(item.completePerformanceCount || 0)}曲（${Number(item.completeRate || 0).toFixed(1)}%）</span>`
        ].join(""),
        count: getActiveMetric(item).count,
        countLabel: getActiveMetric(item).label
      })).join("")
    : `<div class="empty">条件に該当するイベントはありません。</div>`;
}

function renderVenues(items) {
  el.venuesList.innerHTML = items.length
    ? items.map((item, index) => rankRow({
        href: `venue.html?id=${encodeURIComponent(item.venueId)}`,
        rank: index + 1,
        title: item.venueName || "会場名未設定",
        meta: [
          item.prefectureCity && `<span>${escapeHtml(item.prefectureCity)}</span>`,
          item.region && `<span>${escapeHtml(item.region)}</span>`,
          item.country && `<span>${escapeHtml(item.country)}</span>`,
          `<span>公式 ${Number(item.officialEventCount || 0)}件</span>`,
          `<span>ソロ ${Number(item.soloEventCount || 0)}件</span>`,
          `<span>歌唱曲 ${Number(item.uniqueSongCount || 0)}曲</span>`,
          `<span>歌唱記録 ${Number(item.performanceCount || 0)}件</span>`
        ].filter(Boolean).join(""),
        count: getActiveMetric(item).count,
        countLabel: getActiveMetric(item).label
      })).join("")
    : `<div class="empty">条件に該当する会場はありません。</div>`;
}

function renderSingers(items) {
  el.singersList.innerHTML = items.length
    ? items.map((item, index) => rankRow({
        href: buildSingerUrl(item),
        rank: index + 1,
        title: item.singerName || "歌唱名義未設定",
        meta: [
          `<span>歌唱曲 ${Number(item.uniqueSongCount || 0)}曲</span>`,
          `<span>出演イベント ${Number(item.eventCount || 0)}件</span>`,
          `<span>公式 ${Number(item.officialEventCount || 0)}件</span>`,
          `<span>ソロ ${Number(item.soloEventCount || 0)}件</span>`
        ].join(""),
        count: getActiveMetric(item).count,
        countLabel: getActiveMetric(item).label
      })).join("")
    : `<div class="empty">条件に該当する歌唱名義はありません。</div>`;
}


function renderPodium(items) {
  const top =
    items.slice(0, 3);

  if (!top.length) {
    el.podium.hidden = true;
    el.podiumList.innerHTML = "";
    return;
  }

  const labels = ["1st", "2nd", "3rd"];

  el.podium.hidden = false;
  el.podiumList.innerHTML =
    top.map((item, index) => {
      const metric =
        getActiveMetric(item);

      const title =
        item.songName ||
        item.eventName ||
        item.venueName ||
        item.singerName ||
        "名称未設定";

      const href =
        activeTab === "songs"
          ? `song.html?id=${encodeURIComponent(item.songId)}`
          : activeTab === "events"
            ? `event.html?id=${encodeURIComponent(item.eventId)}`
            : activeTab === "venues"
              ? `venue.html?id=${encodeURIComponent(item.venueId)}`
              : buildSingerUrl(item);

      return `
        <a class="ranking-podium-card ranking-podium-${index + 1}" href="${href}">
          <span class="ranking-podium-rank">${labels[index]}</span>
          <strong>${escapeHtml(title)}</strong>
          <span class="ranking-podium-value">${escapeHtml(metric.count)}</span>
          <small>${escapeHtml(metric.label)}</small>
        </a>
      `;
    }).join("");
}


function syncQuickViews() {
  document.querySelectorAll("[data-ranking-view]").forEach(button => {
    const tab =
      button.dataset.tab || "songs";

    const sort =
      button.dataset.sort || "";

    button.classList.toggle(
      "active",
      tab === activeTab &&
      sort === el.rankingSort.value
    );
  });
}


function applyQuickView(button) {
  const tab =
    button.dataset.tab || "songs";

  const sort =
    button.dataset.sort || "";

  activeTab = tab;
  visibleLimit = 50;

  document.querySelectorAll(".ranking-tab").forEach(tabButton => {
    tabButton.classList.toggle(
      "active",
      tabButton.dataset.tab === tab
    );
  });

  updateSortOptions();

  if (
    Array.from(el.rankingSort.options)
      .some(option => option.value === sort)
  ) {
    el.rankingSort.value = sort;
  }

  renderActive();

  document.getElementById(
    `${activeTab}Panel`
  )?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function renderActive() {
  const all = getItems();
  const visible = all.slice(0, visibleLimit);

  renderPodium(all);
  syncQuickViews();
  hidePanels();

  if (activeTab === "songs") {
    el.songsPanel.hidden = false;
    renderSongs(visible);
  } else if (activeTab === "events") {
    el.eventsPanel.hidden = false;
    renderEvents(visible);
  } else if (activeTab === "venues") {
    el.venuesPanel.hidden = false;
    renderVenues(visible);
  } else {
    el.singersPanel.hidden = false;
    renderSingers(visible);
  }

  el.rankingResultCount.textContent = `${visible.length}/${all.length}件表示`;
  el.rankingCondition.textContent =
    `${el.rankingYear.value ? `${el.rankingYear.value}年` : "全期間"}｜${el.rankingCategory.value || "公式・ソロ"}`;

  el.moreWrap.hidden = visible.length >= all.length;

  if (!el.moreWrap.hidden) {
    el.moreButton.textContent = `もっと見る（残り${all.length - visible.length}件）`;
  }

  updateUrl();
}

function activateTab(tab) {
  activeTab = tab;
  visibleLimit = 50;

  document.querySelectorAll(".ranking-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  updateSortOptions();
  renderActive();
}

function render(responseData) {
  data = {
    summary: responseData.summary || {},
    filters: responseData.filters || {},
    songs: Array.isArray(responseData.songs) ? responseData.songs : [],
    events: Array.isArray(responseData.events) ? responseData.events : [],
    venues: Array.isArray(responseData.venues) ? responseData.venues : [],
    singers: Array.isArray(responseData.singers) ? responseData.singers : []
  };

  renderSummary();
  renderYears();
  updateSortOptions();

  el.status.hidden = true;
  el.summary.hidden = false;
  el.tabs.hidden = false;
  el.quickViews.hidden = false;
  el.toolbar.hidden = false;
  el.resultHead.hidden = false;

  activateTab(activeTab);
}

async function load() {
  setLoading();

  try {
    const response = await apiGet(
      "rankings",
      {
        limit: 1000,
        year: el.rankingYear.value,
        category: el.rankingCategory.value,
        schema: "4.2.1"
      },
      {
        timeoutMs: 30000,
        retryCount: 1
      }
    );

    render(response.data || {});
  } catch (error) {
    console.error(error);
    setError(error);
  }
}

document.querySelectorAll(".ranking-tab").forEach(button => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
});

document.querySelectorAll("[data-ranking-view]").forEach(button => {
  button.addEventListener(
    "click",
    () => applyQuickView(button)
  );
});

el.rankingSort.addEventListener("change", () => {
  visibleLimit = 50;
  renderActive();
});

el.rankingYear.addEventListener("change", () => {
  visibleLimit = 50;
  load();
});

el.rankingCategory.addEventListener("change", () => {
  visibleLimit = 50;
  load();
});

el.moreButton.addEventListener("click", () => {
  visibleLimit += 50;
  renderActive();
});

el.retryButton.addEventListener("click", load);

initializeFromUrl();
load();
