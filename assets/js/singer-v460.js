import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.7.14";

renderCommon("");

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
  officialCount: $("officialCount"),
  soloCount: $("soloCount"),
  analysisSection: $("analysisSection"),
  yearChart: $("yearChart"),
  typeChart: $("typeChart"),
  songsSection: $("songsSection"),
  songsCount: $("songsCount"),
  songsList: $("songsList"),
  historySection: $("historySection"),
  historyCount: $("historyCount"),
  historyList: $("historyList"),
  yearFilters: $("yearFilters"),
  typeFilters: $("typeFilters"),
  visibleHistoryCount: $("visibleHistoryCount"),
  historyMoreButton: $("historyMoreButton")
};

const params = new URLSearchParams(location.search);
const singerName = String(params.get("name") || "").trim();
const singerCategory = String(params.get("category") || "").trim();

// URL・画面表示は正式名、既存APIへの問い合わせだけ従来の詳細キーを使う。
const SOLO_DETAIL_KEYS = new Map([
  ["新田恵海", "新田"],
  ["南條愛乃", "南條"],
  ["内田彩", "内田"],
  ["三森すずこ", "三森"],
  ["飯田里穂", "飯田"],
  ["Pile", "Pile"],
  ["楠田亜衣奈", "楠田"],
  ["久保ユリカ", "久保"],
  ["徳井青空", "徳井"]
]);

function apiSingerName() {
  return singerCategory === "ソロ"
    ? (SOLO_DETAIL_KEYS.get(singerName) || singerName)
    : singerName;
}

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
let selectedYear = "all";
let selectedType = "all";
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

function getCategory(item) {
  return String(item.category || item.type || "").trim();
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

  const official = items.filter(x => getCategory(x) === "公式").length;
  const solo = items.filter(x => getCategory(x) === "ソロ").length;
  const typeMax = Math.max(1, official, solo);

  el.typeChart.innerHTML = [
    ["公式", official, "official"],
    ["ソロ", solo, "solo"]
  ].map(([label,count,cls]) => `
    <div class="singer-type-row">
      <span class="singer-type-label">${label}</span>
      <span class="singer-type-track">
        <span class="singer-type-bar ${cls}" style="width:${count ? Math.max(3, Math.round(count/typeMax*100)) : 0}%"></span>
      </span>
      <span class="singer-type-value">${Number(count).toLocaleString("ja-JP")}件</span>
    </div>`).join("");

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
              <span>公式 ${Number(item.officialCount || 0)}回</span>
              <span>ソロ ${Number(item.soloCount || 0)}回</span>
              ${item.firstDate ? `<span>初回 ${escapeHtml(formatDate(item.firstDate))}</span>` : ""}
              ${item.lastDate ? `<span>最終 ${escapeHtml(formatDate(item.lastDate))}</span>` : ""}
            </div>
          </div>
          <span class="singer-song-count">${Number(item.performanceCount || 0).toLocaleString("ja-JP")}回</span>
        </a>`).join("")
    : `<div class="singer-song-row">歌唱曲データがありません。</div>`;
}

function filteredHistory() {
  return allHistory.filter(item => {
    const yearOK =
      selectedYear === "all" ||
      String(item.date || "").slice(0,4) === selectedYear;

    const typeOK =
      selectedType === "all" ||
      getCategory(item) === selectedType;

    return yearOK && typeOK;
  });
}

function renderHistory() {
  const filtered = filteredHistory();
  const visible = filtered.slice(0, visibleLimit);

  el.historyCount.textContent =
    `${allHistory.length.toLocaleString("ja-JP")}件`;

  el.visibleHistoryCount.textContent =
    `${visible.length}/${filtered.length}件表示`;

  el.historyList.innerHTML = visible.length
    ? visible.map(item => `
        <article class="singer-history-row">
          <div class="singer-history-date">${escapeHtml(formatDate(item.date) || "日付不明")}</div>
          <div>
            <div class="singer-history-title">
              ${item.songId
                ? `<a href="song.html?id=${encodeURIComponent(item.songId)}"><strong>${escapeHtml(item.songName || "曲名未設定")}</strong></a>`
                : `<strong>${escapeHtml(item.songName || "曲名未設定")}</strong>`}
              ${getCategory(item) ? `<span class="singer-category">${escapeHtml(getCategory(item))}</span>` : ""}
            </div>
            <div class="singer-history-meta">
              ${item.eventId
                ? `<a class="singer-history-event-link" href="event.html?id=${encodeURIComponent(item.eventId)}">${escapeHtml(item.eventName || "イベント名未設定")}</a>`
                : `<span>${escapeHtml(item.eventName || "イベント名未設定")}</span>`}
              ${item.eventType ? `<span>${escapeHtml(item.eventType)}</span>` : ""}
              ${item.day ? `<span>${escapeHtml(item.day)}</span>` : ""}
              ${item.performance ? `<span>${escapeHtml(item.performance)}</span>` : ""}
            </div>
          </div>
        </article>`).join("")
    : `<div class="singer-history-row">条件に該当する歌唱履歴がありません。</div>`;

  el.historyMoreButton.hidden = visible.length >= filtered.length;
  if (!el.historyMoreButton.hidden) {
    el.historyMoreButton.textContent =
      `もっと見る（残り${filtered.length - visible.length}件）`;
  }
}

function setupFilters() {
  const years = [...new Set(
    allHistory
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

  el.typeFilters.querySelectorAll("[data-type]").forEach(button => {
    button.addEventListener("click", () => {
      selectedType = button.dataset.type || "all";
      visibleLimit = 20;
      el.typeFilters.querySelectorAll("[data-type]").forEach(x =>
        x.classList.toggle("active", x === button)
      );
      renderHistory();
    });
  });

  el.historyMoreButton.addEventListener("click", () => {
    visibleLimit += 20;
    renderHistory();
  });
}

function render(data) {
  const summary = data.summary || {};
  // 正式名URLで開いた場合は、APIが従来の名字キーを返しても正式名を優先表示する。
  const name = singerName || data.singerName || "歌唱名義未設定";

  el.singerName.textContent = name;
  renderSingerColors(name);

  document.title =
    `${name} | 歌唱名義詳細 | μ's Song Database`;

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

  const songs = Array.isArray(data.songs) ? data.songs : [];
  allHistory = Array.isArray(data.history) ? data.history : [];

  renderAnalysis(allHistory);
  renderSongs(songs);
  setupFilters();
  renderHistory();

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
      { name: apiSingerName() }
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
