import {
  apiGet,
  escapeHtml
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.9.0";

renderCommon("");

const SHARE_HASHTAG = "#μsSongDatabase";
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
  loading: false
};

const $ = id => document.getElementById(id);

const el = {
  songSearch: $("songSearch"),
  songSelect: $("songSelect"),
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
    .replace(/\s+/g, "");
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

function stripBuri(value) {
  return String(value || "").replace(/ぶり$/, "");
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
    !el.songSelect.value ||
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
  const songId = el.songSelect.value;
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
  return url;
}

function replaceStateUrl() {
  history.replaceState(
    null,
    "",
    currentUrl().pathname + currentUrl().search
  );
}

function renderSongOptions(query, preferredSongId) {
  const normalizedQuery = normalizeSearch(query);
  const selectedSongId = preferredSongId || el.songSelect.value;
  const filtered = state.songs.filter(song => {
    if (!normalizedQuery) {
      return true;
    }

    return normalizeSearch(song.id + song.name).includes(normalizedQuery);
  });

  el.songSelect.innerHTML =
    '<option value="">曲を選択してください</option>' +
    filtered.map(song =>
      '<option value="' + escapeHtml(song.id) + '">' +
        escapeHtml(song.id + " " + song.name) +
      "</option>"
    ).join("");

  if (selectedSongId && filtered.some(song => song.id === selectedSongId)) {
    el.songSelect.value = selectedSongId;
  }
}

function selectSong(songId) {
  const song = state.songs.find(item => item.id === songId);
  if (!song) {
    return false;
  }

  el.songSearch.value = song.name;
  renderSongOptions(song.name, song.id);
  return true;
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

function renderLatestFacts(scopeData) {
  const latest = scopeData.latestPerformanceGap || {};
  const rank = latest.historyRank || {};
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
    ? scopeData.latestPerformanceGap
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
    body += (
      '<div class="gap-main-value">' + formatNumber(gap.days) + "日ぶりでした</div>" +
      '<div class="gap-main-formatted">' + escapeHtml(gap.formatted || "") + "</div>" +
      '<div class="gap-date-grid">' +
        renderDateBlock("その前の歌唱", gap.previousDate, gap.previousEvents) +
        renderDateBlock("直近の歌唱", gap.latestDate, gap.latestEvents) +
      "</div>" +
      renderLatestFacts(scopeData)
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

function shareText(scopeData, gap) {
  const data = state.result;
  const lines = ["🎵 " + data.selectedSong.name, ""];
  const scope = scopePhrase();

  if (state.mode === "latest") {
    lines.push(
      scope + "前回の歌唱は",
      stripBuri(gap.formatted) + "（" + formatNumber(gap.days) + "日）ぶりでした",
      "",
      "今回：" + formatJapaneseDate(gap.latestDate),
      "前回：" + formatJapaneseDate(gap.previousDate)
    );
  } else {
    const prefix = data.baseDateRelation === "today"
      ? "今日"
      : formatJapaneseDate(data.baseDate) + "に";
    lines.push(
      prefix + scope + "歌われたら",
      stripBuri(gap.formatted) + "（" + formatNumber(gap.days) + "日）ぶり",
      "",
      "前回歌唱：" + formatJapaneseDate(gap.previousDate)
    );
  }

  const rare = rareShareLine(scopeData, gap);
  if (rare) {
    lines.push("", rare);
  }

  lines.push("", "μ's Song Database", SHARE_HASHTAG, currentUrl().toString());
  return lines.join("\\n");
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
    ? scopeData?.latestPerformanceGap
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
      timeoutMs: 30000,
      retryCount: 0
    }
  );

  return extractGapData(response);
}

function isExpectedError(error) {
  return EXPECTED_ERROR_PATTERN.test(String(error?.message || ""));
}

async function runCheck() {
  const songId = el.songSelect.value;
  const baseDate = el.baseDate.value;

  if (!songId || !isValidDate(baseDate) || state.loading) {
    return;
  }

  state.loading = true;
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
      error?.message || "判定中にエラーが発生しました。もう一度お試しください。",
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
  const requestedBaseDate = String(params.get("baseDate") || "").trim();

  state.scope = VALID_SCOPES.has(requestedScope)
    ? requestedScope
    : "all";
  state.mode = VALID_MODES.has(requestedMode)
    ? requestedMode
    : "current";

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
    renderSongOptions("");
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
    renderSongOptions("");
    showStatus(
      error?.message ||
      "曲データを取得できませんでした。ページを再読み込みしてもう一度お試しください。",
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
  renderSongOptions(el.songSearch.value, "");
  el.songSelect.value = "";
  showStatus("候補から曲を選択してください。");
  replaceStateUrl();
  syncButton();
});

el.songSelect.addEventListener("change", () => {
  clearResult();
  const song = state.songs.find(item => item.id === el.songSelect.value);

  if (song) {
    el.songSearch.value = song.name;
    showStatus("曲を選択しました。「判定する」を押してください。");
  } else {
    showStatus("曲を検索・選択してください。");
  }

  replaceStateUrl();
  syncButton();
});

el.baseDate.addEventListener("change", () => {
  clearResult();

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
  updateTabs();
  replaceStateUrl();

  if (state.result) {
    renderResult();
  }
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
