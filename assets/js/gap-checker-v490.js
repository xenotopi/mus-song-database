import {
  apiGet,
  escapeHtml
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.9.0";

renderCommon("");

const SHARE_HASHTAG = "#μʼsSongDatabase";
const X_POST_MAX_WEIGHT = 280;
const X_SHARE_SAFE_WEIGHT = X_POST_MAX_WEIGHT - 20;
const X_TRANSFORMED_URL_WEIGHT = 23;
const SEARCH_DEBOUNCE_MS = 220;
const MAX_SUGGESTIONS = 8;
const SEARCH_QUERY_EXPANSIONS = Object.freeze({
  "ボクラ": "僕ら"
});
const VALID_SCOPES = new Set(["all", "official", "solo"]);
const VALID_MODES = new Set(["current", "latest"]);
const EXPECTED_ERROR_PATTERN =
  /指定された曲が見つかりません|基準日は2000-01-01から2100-12-31|指定曲の計算結果を生成できません/;

const SCOPE_LABELS = Object.freeze({
  all: "すべて",
  official: "公式",
  solo: "ソロ"
});

const state = {
  songs: [],
  result: null,
  scope: "all",
  mode: "current",
  gapIndex: 0,
  loading: false,
  suggestions: [],
  activeSuggestionIndex: -1,
  suggestionRequestId: 0,
  suggestionTimer: null
};

const $ = id => document.getElementById(id);

const el = {
  songSearch: $("songSearch"),
  songSelect: $("songSelect"),
  selectedSongId: $("selectedSongId"),
  songSearchWrap: $("gapSongSearchWrap"),
  songSuggestions: $("gapSongSuggestions"),
  baseDate: $("baseDate"),
  checkButton: $("checkButton"),
  status: $("status"),
  resultSection: $("resultSection"),
  resultContent: $("resultContent"),
  scopeTabs: $("scopeTabs"),
  modeTabs: $("modeTabs"),
  songDetailLink: $("songDetailLink"),
  shareActions: $("shareActions"),
  xShareLink: $("xShareLink")
};

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[’'`´]/g, "")
    .replace(/[μµ]/g, "μ")
    .replace(
      /[\u3041-\u3096]/g,
      character =>
        String.fromCharCode(
          character.charCodeAt(0) + 0x60
        )
    )
    .replace(
      /[\s　・･／/～〜\-—_:：!！?？,.，。()（）【】［］「」『』"“”♡♥♪]+/g,
      ""
    );
}

function isValidDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match || text < "2000-01-01" || text > "2100-12-31") {
    return false;
  }

  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ));

  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

function formatJapaneseDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return "日付不明";
  }

  return (
    Number(match[1]) + "年" +
    Number(match[2]) + "月" +
    Number(match[3]) + "日"
  );
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("ja-JP")
    : "—";
}

function showStatus(message, kind) {
  el.status.hidden = false;
  el.status.textContent = message;

  if (kind) {
    el.status.dataset.kind = kind;
  } else {
    delete el.status.dataset.kind;
  }
}

function hideStatus() {
  el.status.hidden = true;
  delete el.status.dataset.kind;
}

function syncButton() {
  el.checkButton.disabled = (
    state.loading ||
    !el.selectedSongId.value ||
    !isValidDate(el.baseDate.value)
  );
}

function clearResult() {
  state.result = null;
  el.resultSection.hidden = true;
  el.resultContent.innerHTML = "";
  el.shareActions.hidden = true;
}

function currentUrl() {
  const url = new URL("gap-checker.html", location.href);
  const songId = el.selectedSongId.value;
  const baseDate = el.baseDate.value;

  url.search = "";

  if (songId) {
    url.searchParams.set("song", songId);
  }

  if (isValidDate(baseDate)) {
    url.searchParams.set("baseDate", baseDate);
  }

  url.searchParams.set("scope", state.scope);
  url.searchParams.set("mode", state.mode);
  if (state.mode === "latest" && state.gapIndex > 0) {
    url.searchParams.set("gapIndex", String(state.gapIndex));
  }
  return url;
}

function replaceStateUrl() {
  history.replaceState(
    null,
    "",
    currentUrl().pathname + currentUrl().search
  );
}

function selectSong(songId) {
  const song = state.songs.find(item => item.id === songId);
  if (!song) {
    return false;
  }

  el.selectedSongId.value = song.id;
  el.songSelect.value = song.id;
  el.songSearch.value = song.name;
  state.suggestions = [];
  el.songSuggestions.innerHTML = "";
  closeSongSuggestions();
  return true;
}

function populateSongSelect() {
  el.songSelect.innerHTML =
    '<option value="">曲一覧から選択してください</option>' +
    state.songs.map(song =>
      '<option value="' + escapeHtml(song.id) + '">' +
        escapeHtml(song.id + " " + song.name) +
      "</option>"
    ).join("");
}

function localSuggestionScore(song, normalizedQuery) {
  const normalizedId = normalizeSearch(song.id);
  const normalizedName = normalizeSearch(song.name);

  if (normalizedId === normalizedQuery) return 1200;
  if (normalizedName === normalizedQuery) return 1100;
  if (normalizedId.startsWith(normalizedQuery)) return 950;
  if (normalizedName.startsWith(normalizedQuery)) return 900;

  const nameIndex = normalizedName.indexOf(normalizedQuery);
  if (nameIndex >= 0) return 700 - Math.min(nameIndex, 100);

  return 0;
}

function findLocalSongCandidates(query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) {
    return [];
  }

  return state.songs
    .map(song => ({
      id: song.id,
      name: song.name,
      score: localSuggestionScore(song, normalizedQuery),
      matchAlias: ""
    }))
    .filter(song => song.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.id.localeCompare(b.id, "ja")
    )
    .slice(0, MAX_SUGGESTIONS);
}

function mapApiSongCandidates(data, query) {
  const knownIds = new Set(state.songs.map(song => song.id));
  const normalizedQuery = normalizeSearch(query);

  return (data?.results?.songs || [])
    .filter(item => {
      const id = String(item.songId || "");
      const name = String(item.displayName || item.songName || "");
      const alias = String(item.matchAlias || "");

      return (
        knownIds.has(id) &&
        (
          normalizeSearch(name).includes(normalizedQuery) ||
          normalizeSearch(alias).includes(normalizedQuery)
        )
      );
    })
    .map(item => ({
      id: String(item.songId || ""),
      name: String(item.displayName || item.songName || "曲名未設定"),
      score: Number(item.score || 0),
      matchAlias: String(item.matchAlias || "")
    }))
    .slice(0, MAX_SUGGESTIONS);
}

function apiSuggestionQuery(query) {
  return SEARCH_QUERY_EXPANSIONS[normalizeSearch(query)] || query;
}

function closeSongSuggestions() {
  el.songSuggestions.hidden = true;
  el.songSearch.setAttribute("aria-expanded", "false");
  state.activeSuggestionIndex = -1;
}

function openSongSuggestions() {
  el.songSuggestions.hidden = false;
  el.songSearch.setAttribute("aria-expanded", "true");
}

function renderSuggestionState(message) {
  state.suggestions = [];
  state.activeSuggestionIndex = -1;
  el.songSuggestions.innerHTML =
    '<div class="gap-song-suggest-state" role="status">' +
      escapeHtml(message) +
    "</div>";
  openSongSuggestions();
}

function updateActiveSuggestion() {
  const buttons = Array.from(
    el.songSuggestions.querySelectorAll("[data-song-id]")
  );

  buttons.forEach((button, index) => {
    const active = index === state.activeSuggestionIndex;
    button.setAttribute("aria-selected", String(active));
    if (active) {
      button.scrollIntoView({ block: "nearest" });
    }
  });
}

function renderSongSuggestions(candidates) {
  state.suggestions = candidates.slice(0, MAX_SUGGESTIONS);
  state.activeSuggestionIndex = -1;

  if (!state.suggestions.length) {
    renderSuggestionState("一致する曲はありません。別の文字でお試しください。");
    return;
  }

  el.songSuggestions.innerHTML =
    '<div class="gap-song-suggest-list">' +
    state.suggestions.map(song => {
      const meta = song.matchAlias
        ? '別名「' + song.matchAlias + '」に一致'
        : "候補を選択して曲を確定";

      return (
        '<button class="gap-song-suggest-item" type="button" role="option" ' +
        'aria-selected="false" data-song-id="' + escapeHtml(song.id) + '">' +
          '<span class="gap-song-suggest-name">' + escapeHtml(song.name) + "</span>" +
          '<span class="gap-song-suggest-id">' + escapeHtml(song.id) + "</span>" +
          '<span class="gap-song-suggest-meta">' + escapeHtml(meta) + "</span>" +
        "</button>"
      );
    }).join("") +
    "</div>";

  openSongSuggestions();
}

function confirmSongSelection(songId) {
  if (!selectSong(songId)) {
    return;
  }

  clearResult();
  showStatus("曲を選択しました。「判定する」を押してください。");
  replaceStateUrl();
  syncButton();
}

async function requestAliasSuggestions(query, requestId) {
  renderSuggestionState("検索別名を確認しています...");

  try {
    const searchQuery = apiSuggestionQuery(query);
    const response = await apiGet(
      "search",
      { q: searchQuery },
      {
        timeoutMs: 20000,
        retryCount: 1
      }
    );

    if (
      requestId !== state.suggestionRequestId ||
      query !== el.songSearch.value.trim()
    ) {
      return;
    }

    renderSongSuggestions(
      mapApiSongCandidates(response.data || {}, searchQuery)
    );
  } catch (error) {
    if (requestId !== state.suggestionRequestId) {
      return;
    }

    console.warn("Gap checker song suggestion failed:", error);
    renderSuggestionState(
      "候補を取得できませんでした。下の曲一覧からも選択できます。"
    );
  }
}

function scheduleSongSuggestions() {
  window.clearTimeout(state.suggestionTimer);
  state.suggestionRequestId += 1;

  const query = el.songSearch.value.trim();
  const localCandidates = findLocalSongCandidates(query);

  if (!query) {
    state.suggestions = [];
    el.songSuggestions.innerHTML = "";
    closeSongSuggestions();
    return;
  }

  if (localCandidates.length) {
    renderSongSuggestions(localCandidates);
    return;
  }

  if (query.length < 2) {
    renderSuggestionState("2文字以上入力すると検索別名も探せます。");
    return;
  }

  const requestId = state.suggestionRequestId;
  renderSuggestionState("候補を探しています...");
  state.suggestionTimer = window.setTimeout(
    () => requestAliasSuggestions(query, requestId),
    SEARCH_DEBOUNCE_MS
  );
}

function updateTabs() {
  el.scopeTabs.querySelectorAll("[data-scope]").forEach(button => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.scope === state.scope)
    );
  });

  el.modeTabs.querySelectorAll("[data-mode]").forEach(button => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === state.mode)
    );
  });
}

function eventMeta(event) {
  return [
    event.category,
    event.eventType,
    event.day,
    event.performance,
    event.venueName
  ].filter(Boolean);
}

function renderEvents(events) {
  const list = Array.isArray(events) ? events : [];

  if (!list.length) {
    return '<div class="gap-no-event">イベント情報はありません。</div>';
  }

  return (
    '<ul class="gap-event-list">' +
    list.map(event => {
      const name = escapeHtml(event.eventName || "イベント名未設定");
      const nameHtml = event.eventId
        ? (
            '<a href="event.html?id=' +
            encodeURIComponent(event.eventId) +
            '">' + name + " →</a>"
          )
        : name;
      const meta = eventMeta(event);

      return (
        '<li class="gap-event">' +
          '<div class="gap-event-name">' + nameHtml + "</div>" +
          (
            meta.length
              ? (
                  '<div class="gap-event-meta">' +
                  meta.map(item => "<span>" + escapeHtml(item) + "</span>").join("") +
                  "</div>"
                )
              : ""
          ) +
        "</li>"
      );
    }).join("") +
    "</ul>"
  );
}

function renderDateBlock(label, date, events) {
  return (
    '<section class="gap-date-block">' +
      '<div class="gap-date-label">' + escapeHtml(label) + "</div>" +
      '<div class="gap-date-value">' + escapeHtml(formatJapaneseDate(date)) + "</div>" +
      renderEvents(events) +
    "</section>"
  );
}

function renderCurrentFacts(scopeData) {
  const ranking = scopeData.ranking || {};
  const longest = scopeData.longestGap;
  const populationLabel = state.scope === "all"
    ? "全体"
    : SCOPE_LABELS[state.scope];
  const rankingValue = ranking.rank !== null &&
    ranking.rank !== undefined &&
    Number.isFinite(Number(ranking.rank))
    ? (
        populationLabel + "歌唱歴あり" + formatNumber(ranking.population) +
        "曲中 " + formatNumber(ranking.rank) + "位"
      )
    : "順位対象外";
  const rankingSub = Number(ranking.tieCount) > 1
    ? "同順位 " + formatNumber(ranking.tieCount) + "曲"
    : "基準日・同区分の全曲内順位";

  return (
    '<div class="gap-facts">' +
      '<section class="gap-fact">' +
        '<div class="gap-fact-label">現在の空白期間ランキング</div>' +
        '<div class="gap-fact-value">' + escapeHtml(rankingValue) + "</div>" +
        '<div class="gap-fact-sub">' + escapeHtml(rankingSub) + "</div>" +
      "</section>" +
      renderLongestFact(longest) +
    "</div>"
  );
}

function renderLatestFacts(scopeData, gap) {
  const rank = gap?.historyRank || {};
  let rankingValue = rank.rank !== null &&
    rank.rank !== undefined &&
    Number.isFinite(Number(rank.rank))
    ? (
        "歴代" + formatNumber(rank.population) +
        "区間中 " + formatNumber(rank.rank) + "位"
      )
    : "順位対象外";
  const labels = [];

  if (rank.isLongest) {
    rankingValue = "歴代最長のブランク";
  } else if (rank.isTop3) {
    rankingValue = "歴代" + formatNumber(rank.rank) + "位のブランク";
  }

  if (Number(rank.tieCount) > 1) {
    labels.push("同記録 " + formatNumber(rank.tieCount) + "回");
  }

  return (
    '<div class="gap-facts">' +
      '<section class="gap-fact">' +
        '<div class="gap-fact-label">この曲の歌唱間隔ランキング</div>' +
        '<div class="gap-fact-value">' + escapeHtml(rankingValue) + "</div>" +
        '<div class="gap-fact-sub">' +
          escapeHtml(labels.join("・") || "基準日時点の歌唱間隔内順位") +
        "</div>" +
      "</section>" +
      renderLongestFact(scopeData.longestGap) +
    "</div>"
  );
}

function normalizeRecentGap(gap) {
  if (!gap) {
    return null;
  }

  return {
    ...gap,
    previousDate: gap.fromDate,
    latestDate: gap.toDate,
    previousEvents: gap.fromEvents || [],
    latestEvents: gap.toEvents || []
  };
}

function latestGaps(scopeData) {
  const recent = Array.isArray(scopeData.recentGaps)
    ? scopeData.recentGaps.map(normalizeRecentGap).filter(Boolean)
    : [];

  if (recent.length) {
    return recent;
  }

  return scopeData.latestPerformanceGap
    ? [scopeData.latestPerformanceGap]
    : [];
}

function activeLatestGap(scopeData) {
  const gaps = latestGaps(scopeData);
  if (state.gapIndex >= gaps.length) {
    state.gapIndex = 0;
  }
  return gaps[state.gapIndex] || null;
}

function latestDateLabels() {
  const infix = state.scope === "official"
    ? "公式"
    : state.scope === "solo"
      ? "ソロ"
      : "";

  return {
    latest: "今回の" + infix + "歌唱",
    previous: "その前の" + infix + "歌唱"
  };
}

function renderRecentGapToggle(scopeData, gap) {
  const gaps = latestGaps(scopeData);
  const canShowPrevious =
    state.gapIndex === 0 &&
    Number(gap?.days) === 1 &&
    gaps.length > 1;

  if (!canShowPrevious && state.gapIndex === 0) {
    return "";
  }

  const targetIndex = canShowPrevious ? 1 : 0;
  const label = canShowPrevious
    ? "その前のブランクを見る"
    : "最新のブランクへ戻る";

  return (
    '<div class="gap-history-toggle-wrap">' +
      '<button class="gap-history-toggle" type="button" data-gap-index="' +
        targetIndex + '">' + escapeHtml(label) + "</button>" +
    "</div>"
  );
}

function renderLongestFact(longest) {
  if (!longest) {
    return (
      '<section class="gap-fact">' +
        '<div class="gap-fact-label">過去最大ブランク</div>' +
        '<div class="gap-fact-value">比較できる記録なし</div>' +
        '<div class="gap-fact-sub">2回以上の歌唱日がある場合に表示します。</div>' +
      "</section>"
    );
  }

  return (
    '<section class="gap-fact">' +
      '<div class="gap-fact-label">過去最大ブランク</div>' +
      '<div class="gap-fact-value">' +
        escapeHtml(longest.formatted || (formatNumber(longest.days) + "日ぶり")) +
        "（" + formatNumber(longest.days) + "日）" +
      "</div>" +
      '<div class="gap-fact-sub">' +
        escapeHtml(
          formatJapaneseDate(longest.from) +
          " → " +
          formatJapaneseDate(longest.to)
        ) +
      "</div>" +
    "</section>"
  );
}

function historyMessage(scopeData, mode) {
  const history = scopeData.historyState || {};
  const scopePrefix = state.scope === "all"
    ? ""
    : SCOPE_LABELS[state.scope] + "区分では";

  if (history.state === "never_performed") {
    return scopePrefix + "まだ歌唱記録がありません";
  }

  if (history.state === "not_yet_performed") {
    return scopePrefix + "この日時点では、まだ歌唱記録がありません";
  }

  if (history.state === "first_on_base_date") {
    return scopePrefix + "この日が初歌唱です";
  }

  if (history.state === "invalid_history") {
    return scopePrefix + "歌唱履歴を正しく計算できませんでした";
  }

  if (mode === "latest" && !scopeData.latestPerformanceGap) {
    return scopePrefix + "比較できる過去の歌唱間隔がありません";
  }

  return scopePrefix + "判定に必要な歌唱履歴がありません";
}

function historyNote(scopeData) {
  const history = scopeData.historyState || {};

  if (
    history.state === "not_yet_performed" &&
    history.firstPerformanceDate
  ) {
    return "初歌唱：" + formatJapaneseDate(history.firstPerformanceDate);
  }

  return "区分や判定モードを切り替えると、別の記録を確認できます。";
}

function resultContext(data, mode) {
  if (mode === "latest") {
    return (
      "前回は何日ぶり？（" +
      formatJapaneseDate(data.baseDate) +
      "時点）"
    );
  }

  if (data.baseDateRelation === "today") {
    return "今日歌われたら";
  }

  if (data.baseDateRelation === "future") {
    return formatJapaneseDate(data.baseDate) + "に歌われるとしたら";
  }

  return formatJapaneseDate(data.baseDate) + "に歌われていたら";
}

function renderCardHeader(data) {
  return (
    '<div class="gap-card-top">' +
      "<div>" +
        "<p class=\"gap-card-kicker\">μ's SONG DATABASE</p>" +
        '<h3 class="gap-card-title">' +
          escapeHtml(data.selectedSong.id + " " + data.selectedSong.name) +
        "</h3>" +
      "</div>" +
      '<span class="gap-scope-badge">' +
        escapeHtml(SCOPE_LABELS[state.scope]) +
      "</span>" +
    "</div>"
  );
}

function renderResult() {
  const data = state.result;
  if (!data || !data.scopes || !data.scopes[state.scope]) {
    clearResult();
    return;
  }

  const scopeData = data.scopes[state.scope];
  const gap = state.mode === "latest"
    ? activeLatestGap(scopeData)
    : scopeData.currentGap;
  let body = renderCardHeader(data);

  body += (
    '<p class="gap-context">' +
      escapeHtml(resultContext(data, state.mode)) +
    "</p>"
  );

  if (!gap) {
    body += (
      '<div class="gap-empty">' +
        escapeHtml(historyMessage(scopeData, state.mode)) +
        "<small>" + escapeHtml(historyNote(scopeData)) + "</small>" +
      "</div>"
    );
    el.shareActions.hidden = true;
  } else if (state.mode === "current") {
    body += (
      '<div class="gap-main-value">' + formatNumber(gap.days) + "日ぶり</div>" +
      '<div class="gap-main-formatted">' + escapeHtml(gap.formatted || "") + "</div>" +
      '<div class="gap-date-grid">' +
        renderDateBlock("前回歌唱", gap.previousDate, gap.previousEvents) +
        renderDateBlock("基準日", data.baseDate, []) +
      "</div>" +
      renderCurrentFacts(scopeData)
    );
    el.shareActions.hidden = false;
  } else {
    const labels = latestDateLabels();
    const consecutive = Number(gap.days) === 1
      ? '<div class="gap-consecutive-badge">連日歌唱</div>'
      : "";

    body += (
      '<div class="gap-main-value">' + formatNumber(gap.days) + "日ぶりでした</div>" +
      consecutive +
      '<div class="gap-main-formatted">' + escapeHtml(gap.formatted || "") + "</div>" +
      '<div class="gap-date-grid">' +
        renderDateBlock(labels.latest, gap.latestDate, gap.latestEvents) +
        renderDateBlock(labels.previous, gap.previousDate, gap.previousEvents) +
      "</div>" +
      renderLatestFacts(scopeData, gap) +
      renderRecentGapToggle(scopeData, gap)
    );
    el.shareActions.hidden = false;
  }

  el.resultContent.innerHTML = body;
  el.songDetailLink.href =
    "song.html?id=" + encodeURIComponent(data.selectedSong.id);
  el.resultSection.hidden = false;
  updateTabs();
  updateShareLink(scopeData, gap);
}

function scopePhrase() {
  if (state.scope === "official") {
    return "公式で";
  }
  if (state.scope === "solo") {
    return "ソロで";
  }
  return "";
}

function shortenShareText(value, maxLength) {
  const text = String(value || "").trim();
  const characters = Array.from(text);
  if (characters.length <= maxLength) {
    return text;
  }
  return characters
    .slice(0, Math.max(1, maxLength - 1))
    .join("")
    .trimEnd() + "…";
}

function isXSingleWeightCodePoint(codePoint) {
  return (
    codePoint <= 4351 ||
    (codePoint >= 8192 && codePoint <= 8205) ||
    (codePoint >= 8208 && codePoint <= 8223) ||
    (codePoint >= 8242 && codePoint <= 8247)
  );
}

function estimateXTextWeight(value) {
  return Array.from(String(value || "").normalize("NFC"))
    .reduce((total, character) =>
      total + (
        isXSingleWeightCodePoint(character.codePointAt(0))
          ? 1
          : 2
      ), 0);
}

function estimateXWeightedLength(value) {
  const text = String(value || "").normalize("NFC");
  const urlPattern = /https?:\/\/[^\s]+/gu;
  let total = 0;
  let cursor = 0;

  for (const match of text.matchAll(urlPattern)) {
    total += estimateXTextWeight(text.slice(cursor, match.index));
    total += X_TRANSFORMED_URL_WEIGHT;
    cursor = match.index + match[0].length;
  }

  return total + estimateXTextWeight(text.slice(cursor));
}

function isShareTextSafe(value) {
  return estimateXWeightedLength(value) <= X_SHARE_SAFE_WEIGHT;
}

function truncateShareTextByWeight(value, maxWeight) {
  const text = String(value || "").trim().normalize("NFC");
  if (estimateXTextWeight(text) <= maxWeight) {
    return text;
  }

  const ellipsis = "…";
  const ellipsisWeight = estimateXTextWeight(ellipsis);
  const targetWeight = Math.max(0, maxWeight - ellipsisWeight);
  let used = 0;
  let result = "";

  for (const character of Array.from(text)) {
    const weight = estimateXTextWeight(character);
    if (used + weight > targetWeight) {
      break;
    }
    result += character;
    used += weight;
  }

  return result.trimEnd()
    ? result.trimEnd() + ellipsis
    : ellipsis;
}

function shareEventName(events, mode = "full") {
  if (mode === "none") {
    return "";
  }

  const names = Array.from(new Set(
    (Array.isArray(events) ? events : [])
      .map(event => String(event?.eventName || "").trim())
      .filter(Boolean)
  ));

  if (!names.length) {
    return "";
  }

  const first = mode === "short"
    ? shortenShareText(names[0], 28)
    : names[0];
  return names.length > 1
    ? first + "（ほか" + (names.length - 1) + "件）"
    : first;
}

function formatShareShortDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match
    ? match[1] + "/" + match[2] + "/" + match[3]
    : "日付不明";
}

function appendSharePerformance(
  lines,
  label,
  date,
  events,
  eventMode,
  dateFormatter
) {
  lines.push(label + "：", dateFormatter(date));
  const eventName = shareEventName(events, eventMode);
  if (eventName) {
    lines.push(eventName);
  }
}

function rareShareLine(scopeData, gap) {
  if (!gap) {
    return "";
  }

  if (state.mode === "latest") {
    const rank = gap.historyRank || {};
    if (rank.isLongest) {
      return "この曲の歴代最長記録です。";
    }
    if (rank.isTop3) {
      return "この曲の歴代" + formatNumber(rank.rank) + "位の長さです。";
    }
  } else {
    const rank = scopeData.ranking || {};
    if (Number(rank.rank) >= 1 && Number(rank.rank) <= 10) {
      const label = state.scope === "all" ? "全体" : SCOPE_LABELS[state.scope];
      return (
        "現在の" + label + "ブランクは歌唱歴あり" +
        formatNumber(rank.population) + "曲中" +
        formatNumber(rank.rank) + "位です。"
      );
    }
  }

  if (Number(gap.days) >= 1826) {
    return "5年以上の歌唱間隔です。";
  }
  if (Number(gap.days) >= 1000) {
    return "1000日を超える歌唱間隔です。";
  }
  return "";
}

function latestShareContext() {
  const scope = scopePhrase();
  if (state.gapIndex > 0) {
    return state.scope === "all"
      ? "その前の歌唱は"
      : "その前の" + SCOPE_LABELS[state.scope] + "歌唱は";
  }

  return scope
    ? scope + "前回歌われたときは"
    : "前回の歌唱は";
}

function currentShareContext(data, dateFormatter) {
  const scope = scopePhrase();
  return data.baseDateRelation === "today"
    ? scope + "今日歌われたら"
    : scope + dateFormatter(data.baseDate) + "に歌われていたら";
}

function shareGapResult(gap, includeConsecutive) {
  const suffix = (
    includeConsecutive &&
    Number(gap.days) === 1
  )
    ? "（連日歌唱）"
    : "";

  return (
    (gap.formatted || (formatNumber(gap.days) + "日ぶり")) +
    "（" + formatNumber(gap.days) + "日）" +
    (state.mode === "latest" ? "でした" : "") +
    suffix
  );
}

function buildShareTextVersion(scopeData, gap, options) {
  const data = state.result;
  const lines = ["🎵 " + options.title, ""];
  const dateFormatter = options.shortDates
    ? formatShareShortDate
    : formatJapaneseDate;

  if (state.mode === "latest") {
    lines.push(
      latestShareContext(),
      shareGapResult(gap, options.includeConsecutive),
      ""
    );

    if (options.compactDates) {
      lines.push(
        "今回：" + dateFormatter(gap.latestDate),
        "その前：" + dateFormatter(gap.previousDate)
      );
    } else {
      const labels = latestDateLabels();
      appendSharePerformance(
        lines,
        labels.latest,
        gap.latestDate,
        gap.latestEvents,
        options.eventMode,
        dateFormatter
      );
      lines.push("");
      appendSharePerformance(
        lines,
        labels.previous,
        gap.previousDate,
        gap.previousEvents,
        options.eventMode,
        dateFormatter
      );
    }
  } else {
    lines.push(
      currentShareContext(data, dateFormatter),
      shareGapResult(gap, options.includeConsecutive),
      ""
    );

    if (options.compactDates) {
      lines.push(
        (options.shortDateLabel ? "前回：" : "前回歌唱：") +
        dateFormatter(gap.previousDate)
      );
    } else {
      appendSharePerformance(
        lines,
        "前回歌唱",
        gap.previousDate,
        gap.previousEvents,
        options.eventMode,
        dateFormatter
      );
    }
  }

  const rare = options.includeRare
    ? rareShareLine(scopeData, gap)
    : "";
  if (rare) {
    lines.push("", rare);
  }

  lines.push("", SHARE_HASHTAG, currentUrl().toString());
  return lines.join("\n");
}

function buildShareTextCandidates(scopeData, gap) {
  const title = state.result.selectedSong.name;
  const common = {
    title: title,
    shortDates: false,
    compactDates: false,
    shortDateLabel: false,
    includeRare: true,
    includeConsecutive: true
  };

  return [
    {
      level: "LEVEL_1_FULL",
      text: buildShareTextVersion(scopeData, gap, {
        ...common,
        eventMode: "full"
      })
    },
    {
      level: "LEVEL_1_SHORT_EVENT",
      text: buildShareTextVersion(scopeData, gap, {
        ...common,
        eventMode: "short"
      })
    },
    {
      level: "LEVEL_2_COMPACT",
      text: buildShareTextVersion(scopeData, gap, {
        ...common,
        eventMode: "none",
        compactDates: true
      })
    },
    {
      level: "LEVEL_3_MINIMAL",
      text: buildShareTextVersion(scopeData, gap, {
        ...common,
        eventMode: "none",
        compactDates: true,
        shortDateLabel: true,
        includeRare: false
      })
    },
    {
      level: "LEVEL_4_SHORT_DATE",
      text: buildShareTextVersion(scopeData, gap, {
        ...common,
        eventMode: "none",
        compactDates: true,
        shortDateLabel: true,
        shortDates: true,
        includeRare: false
      })
    },
    {
      level: "LEVEL_4_NO_CONSECUTIVE",
      text: buildShareTextVersion(scopeData, gap, {
        ...common,
        eventMode: "none",
        compactDates: true,
        shortDateLabel: true,
        shortDates: true,
        includeRare: false,
        includeConsecutive: false
      })
    }
  ];
}

function buildUltraShortShareText(gap) {
  const url = currentUrl().toString();
  const scopeLabel = state.scope === "all"
    ? ""
    : SCOPE_LABELS[state.scope] + "：";
  const preferredResult = scopeLabel + shareGapResult(gap, false);
  const fallbackResult = scopeLabel + formatNumber(gap.days) + "日ぶり";

  const createText = (title, result) => [
    "🎵 " + title,
    "",
    result,
    "",
    SHARE_HASHTAG,
    url
  ].join("\n");

  let result = preferredResult;
  let emptyTitleText = createText("", result);
  if (!isShareTextSafe(emptyTitleText)) {
    result = fallbackResult;
    emptyTitleText = createText("", result);
  }

  const titleBudget = Math.max(
    2,
    X_SHARE_SAFE_WEIGHT - estimateXWeightedLength(emptyTitleText)
  );
  const title = truncateShareTextByWeight(
    state.result.selectedSong.name,
    titleBudget
  );
  const text = createText(title, result);

  if (isShareTextSafe(text)) {
    return text;
  }

  return createText("…", fallbackResult);
}

function selectShareTextCandidate(scopeData, gap) {
  const candidates = buildShareTextCandidates(scopeData, gap);
  const selected = candidates.find(candidate =>
    isShareTextSafe(candidate.text)
  );

  return selected || {
    level: "FINAL_DEFENSE",
    text: buildUltraShortShareText(gap)
  };
}

function shareText(scopeData, gap) {
  return selectShareTextCandidate(scopeData, gap).text;
}

function updateShareLink(scopeData, gap) {
  if (!gap) {
    el.xShareLink.href = "#";
    return;
  }

  el.xShareLink.href =
    "https://twitter.com/intent/tweet?text=" +
    encodeURIComponent(shareText(scopeData, gap));
}

function activeMetrics() {
  const scopeData = state.result?.scopes?.[state.scope];
  const gap = state.mode === "latest"
    ? activeLatestGap(scopeData || {})
    : scopeData?.currentGap;
  const rank = state.mode === "latest"
    ? gap?.historyRank?.rank
    : scopeData?.ranking?.rank;

  return {
    song_id: state.result?.selectedSong?.id || "",
    scope: state.scope,
    mode: state.mode,
    share_method: "x",
    has_history: Boolean(gap),
    is_top10: Number(rank) >= 1 && Number(rank) <= 10,
    is_long_gap: Number(gap?.days) >= 1000
  };
}

function track(eventName) {
  window.MusDbAnalytics?.trackEvent(eventName, activeMetrics());
}

function extractGapData(response) {
  const data = response?.data || response;

  if (
    data?.contractVersion !== "gap-v2" ||
    !Array.isArray(data.songs)
  ) {
    throw new Error("gapV2の応答形式が正しくありません。");
  }

  return data;
}

async function requestGapV2(params) {
  const response = await apiGet(
    "gapV2",
    params,
    {
      cache: false,
      forceRefresh: true,
      staleWhileRevalidate: false,
      timeoutMs: 45000,
      retryCount: 1
    }
  );

  return extractGapData(response);
}

function isExpectedError(error) {
  return EXPECTED_ERROR_PATTERN.test(String(error?.message || ""));
}

async function runCheck() {
  const songId = el.selectedSongId.value;
  const baseDate = el.baseDate.value;

  if (!songId || !isValidDate(baseDate) || state.loading) {
    return;
  }

  state.loading = true;
  state.gapIndex = 0;
  clearResult();
  el.checkButton.textContent = "判定中…";
  syncButton();
  showStatus("歌唱間隔を計算しています...");
  replaceStateUrl();

  try {
    const data = await requestGapV2({
      songId: songId,
      baseDate: baseDate
    });

    if (!data.selectedSong || !data.scopes) {
      throw new Error("判定結果を取得できませんでした。");
    }

    state.songs = data.songs;
    state.result = data;
    el.baseDate.value = data.baseDate;
    selectSong(data.selectedSong.id);
    hideStatus();
    renderResult();
    replaceStateUrl();
    track("gap_check");
  } catch (error) {
    if (!isExpectedError(error)) {
      console.error(error);
    }

    showStatus(
      isExpectedError(error)
        ? error.message
        : "判定データを取得できませんでした。時間をおいて「判定する」をもう一度押してください。",
      "error"
    );
  } finally {
    state.loading = false;
    el.checkButton.textContent = "判定する";
    syncButton();
  }
}

function readInitialParams() {
  const params = new URLSearchParams(location.search);
  const requestedScope = params.get("scope");
  const requestedMode = params.get("mode");
  const requestedGapIndex = Number(params.get("gapIndex") || 0);
  const requestedBaseDate = String(params.get("baseDate") || "").trim();

  state.scope = VALID_SCOPES.has(requestedScope)
    ? requestedScope
    : "all";
  state.mode = VALID_MODES.has(requestedMode)
    ? requestedMode
    : "current";
  state.gapIndex = (
    state.mode === "latest" &&
    Number.isInteger(requestedGapIndex) &&
    requestedGapIndex >= 0 &&
    requestedGapIndex < 5
  )
    ? requestedGapIndex
    : 0;

  return {
    songId: String(params.get("song") || "").trim(),
    baseDate: isValidDate(requestedBaseDate) ? requestedBaseDate : "",
    invalidBaseDate: Boolean(requestedBaseDate && !isValidDate(requestedBaseDate))
  };
}

async function initializePage() {
  const initial = readInitialParams();
  const canAutoCheck = Boolean(initial.songId && initial.baseDate);
  const requestParams = {};

  updateTabs();
  el.songSearch.disabled = true;
  el.songSelect.disabled = true;
  el.baseDate.disabled = true;
  showStatus("曲データを読み込んでいます...");

  if (initial.baseDate) {
    requestParams.baseDate = initial.baseDate;
  }
  if (canAutoCheck) {
    requestParams.songId = initial.songId;
  }

  try {
    let data;

    try {
      data = await requestGapV2(requestParams);
    } catch (error) {
      if (!isExpectedError(error)) {
        throw error;
      }

      data = await requestGapV2(
        initial.baseDate
          ? { baseDate: initial.baseDate }
          : {}
      );
      showStatus(error.message, "notice");
    }

    state.songs = data.songs;
    populateSongSelect();
    el.baseDate.value = data.baseDate || data.todayJst || "";

    const restored = initial.songId
      ? selectSong(initial.songId)
      : false;

    if (data.selectedSong && data.scopes) {
      state.result = data;
      selectSong(data.selectedSong.id);
      hideStatus();
      renderResult();
      track("gap_check");
    } else if (initial.invalidBaseDate) {
      showStatus(
        "URLの基準日が無効だったため、今日の日付へ戻しました。",
        "notice"
      );
    } else if (initial.songId && !restored) {
      showStatus(
        "URLで指定された曲が見つかりません。曲を選び直してください。",
        "notice"
      );
    } else if (restored) {
      showStatus("曲を選択済みです。「判定する」を押してください。");
    } else {
      showStatus("曲を検索・選択して「判定する」を押してください。");
    }

    replaceStateUrl();
  } catch (error) {
    console.error(error);
    showStatus(
      "判定データを取得できませんでした。ページを再読み込みしてもう一度お試しください。",
      "error"
    );
  } finally {
    el.songSearch.disabled = false;
    el.songSelect.disabled = false;
    el.baseDate.disabled = false;
    syncButton();
  }
}

el.songSearch.addEventListener("input", () => {
  clearResult();
  state.gapIndex = 0;
  el.selectedSongId.value = "";
  el.songSelect.value = "";
  showStatus("候補から曲を選択してください。");
  replaceStateUrl();
  syncButton();
  scheduleSongSuggestions();
});

el.songSelect.addEventListener("change", () => {
  clearResult();
  state.gapIndex = 0;

  if (el.songSelect.value && selectSong(el.songSelect.value)) {
    showStatus("曲を選択しました。「判定する」を押してください。");
  } else {
    el.selectedSongId.value = "";
    el.songSearch.value = "";
    showStatus("曲を検索するか、曲一覧から選択してください。");
  }

  replaceStateUrl();
  syncButton();
});

el.songSearch.addEventListener("focus", () => {
  if (state.suggestions.length && el.songSearch.value.trim()) {
    openSongSuggestions();
  }
});

el.songSearch.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeSongSuggestions();
    return;
  }

  if (!state.suggestions.length) {
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openSongSuggestions();

    if (event.key === "ArrowDown") {
      state.activeSuggestionIndex =
        state.activeSuggestionIndex < state.suggestions.length - 1
          ? state.activeSuggestionIndex + 1
          : 0;
    } else {
      state.activeSuggestionIndex =
        state.activeSuggestionIndex > 0
          ? state.activeSuggestionIndex - 1
          : state.suggestions.length - 1;
    }

    updateActiveSuggestion();
    return;
  }

  if (event.key !== "Enter") {
    return;
  }

  const active = state.suggestions[state.activeSuggestionIndex];
  const normalizedQuery = normalizeSearch(el.songSearch.value);
  const exact = state.suggestions.find(song =>
    normalizeSearch(song.id) === normalizedQuery ||
    normalizeSearch(song.name) === normalizedQuery ||
    normalizeSearch(song.matchAlias) === normalizedQuery
  );
  const target = active || exact;

  if (target) {
    event.preventDefault();
    confirmSongSelection(target.id);
  }
});

el.songSuggestions.addEventListener("click", event => {
  const button = event.target.closest("[data-song-id]");
  if (!button) {
    return;
  }

  confirmSongSelection(button.dataset.songId);
});

document.addEventListener("click", event => {
  if (!el.songSearchWrap.contains(event.target)) {
    closeSongSuggestions();
  }
});

el.baseDate.addEventListener("change", () => {
  clearResult();
  state.gapIndex = 0;

  if (el.baseDate.value && !isValidDate(el.baseDate.value)) {
    showStatus(
      "基準日は2000-01-01から2100-12-31までの日付を選択してください。",
      "notice"
    );
  } else {
    showStatus("基準日を変更しました。「判定する」を押してください。");
  }

  replaceStateUrl();
  syncButton();
});

el.scopeTabs.addEventListener("click", event => {
  const button = event.target.closest("[data-scope]");
  if (!button || !VALID_SCOPES.has(button.dataset.scope)) {
    return;
  }

  state.scope = button.dataset.scope;
  state.gapIndex = 0;
  updateTabs();
  replaceStateUrl();

  if (state.result) {
    renderResult();
  }
});

el.modeTabs.addEventListener("click", event => {
  const button = event.target.closest("[data-mode]");
  if (!button || !VALID_MODES.has(button.dataset.mode)) {
    return;
  }

  state.mode = button.dataset.mode;
  state.gapIndex = 0;
  updateTabs();
  replaceStateUrl();

  if (state.result) {
    renderResult();
  }
});

el.resultContent.addEventListener("click", event => {
  const button = event.target.closest("[data-gap-index]");
  if (!button || !state.result || state.mode !== "latest") {
    return;
  }

  const nextIndex = Number(button.dataset.gapIndex);
  if (!Number.isInteger(nextIndex) || nextIndex < 0) {
    return;
  }

  state.gapIndex = nextIndex;
  renderResult();
  replaceStateUrl();
});

el.checkButton.addEventListener("click", runCheck);

el.xShareLink.addEventListener("click", event => {
  if (!state.result || el.xShareLink.getAttribute("href") === "#") {
    event.preventDefault();
    return;
  }

  track("gap_share");
});

initializePage();
