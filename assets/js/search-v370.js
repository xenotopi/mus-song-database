import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=2.7.0";


renderCommon("search");


const $ =
  id =>
    document.getElementById(id);


const elements = {
  searchInput:
    $("searchInput"),

  searchButton:
    $("searchButton"),

  clearButton:
    $("clearButton"),

  summaryText:
    $("summaryText"),

  summaryCount:
    $("summaryCount"),

  status:
    $("status"),

  resultsArea:
    $("resultsArea"),

  allTabCount:
    $("allTabCount"),

  singerTabCount:
    $("singerTabCount"),

  songTabCount:
    $("songTabCount"),

  eventTabCount:
    $("eventTabCount"),

  venueTabCount:
    $("venueTabCount"),

  searchHistoryWrap:
    $("searchHistoryWrap"),

  searchHistory:
    $("searchHistory"),

  searchHistoryClear:
    $("searchHistoryClear")
};


const parameters =
  new URLSearchParams(
    location.search
  );

const initialQuery =
  parameters.get("q") || "";

const HISTORY_KEY =
  "mus-db-search-history-v370";

const HISTORY_LIMIT =
  8;


let activeTab =
  parameters.get("type") || "all";

let latestData = null;
let debounceTimer = null;
let requestSequence = 0;
let keyboardIndex = -1;


elements.searchInput.value =
  initialQuery;

updateClearButton_();
activateInitialTab_();
renderSearchHistory_();


function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[\s　・･／/～〜\-—_:：!！?？,.，。()（）【】［］「」『』"“”♡♥♪]+/g, "");
}


function compareText(a, b) {
  return String(a || "")
    .localeCompare(
      String(b || ""),
      "ja"
    );
}


function calculateMatchScore(
  item,
  query,
  type
) {
  const normalizedQuery =
    normalize(query);

  const title =
    type === "songs"
      ? item.displayName || item.songName
      : type === "events"
        ? item.eventName
        : type === "venues"
          ? item.venueName
          : item.singerName;

  const normalizedTitle =
    normalize(title);

  if (
    normalizedTitle ===
    normalizedQuery
  ) {
    return 400;
  }

  if (
    normalizedTitle.startsWith(
      normalizedQuery
    )
  ) {
    return 300;
  }

  if (
    normalizedTitle.includes(
      normalizedQuery
    )
  ) {
    return 200;
  }

  const reason =
    normalize(
      item.matchReason
    );

  if (
    reason.includes(
      normalizedQuery
    )
  ) {
    return 120;
  }

  return 50;
}


function sortGroup(
  items,
  query,
  type
) {
  return (items || [])
    .map(item => ({
      ...item,
      __score:
        calculateMatchScore(
          item,
          query,
          type
        )
    }))
    .sort((a, b) =>
      b.__score -
      a.__score ||
      compareText(
        type === "songs"
          ? a.displayName || a.songName
          : type === "events"
            ? a.eventName
            : type === "venues"
              ? a.venueName
              : a.singerName,

        type === "songs"
          ? b.displayName || b.songName
          : type === "events"
            ? b.eventName
            : type === "venues"
              ? b.venueName
              : b.singerName
      )
    );
}


function matchLabel(score) {
  if (score >= 400) {
    return "完全一致";
  }

  if (score >= 300) {
    return "前方一致";
  }

  return "";
}


function highlight(
  value,
  query
) {
  const text =
    String(value || "");

  const normalizedQuery =
    normalize(query);

  if (!normalizedQuery) {
    return escapeHtml(text);
  }

  const characters =
    Array.from(text);

  for (
    let start = 0;
    start < characters.length;
    start += 1
  ) {
    for (
      let end = start + 1;
      end <= characters.length;
      end += 1
    ) {
      const part =
        characters
          .slice(start, end)
          .join("");

      if (
        normalize(part) ===
        normalizedQuery
      ) {
        return (
          escapeHtml(
            characters
              .slice(0, start)
              .join("")
          ) +
          '<span class="highlight">' +
          escapeHtml(part) +
          "</span>" +
          escapeHtml(
            characters
              .slice(end)
              .join("")
          )
        );
      }
    }
  }

  return escapeHtml(text);
}


function getSearchHistory_() {
  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          HISTORY_KEY
        ) || "[]"
      );

    return Array.isArray(parsed)
      ? parsed
          .map(value =>
            String(value || "").trim()
          )
          .filter(Boolean)
          .slice(0, HISTORY_LIMIT)
      : [];

  } catch {
    return [];
  }
}


function saveSearchHistory_(
  query
) {
  const value =
    String(query || "").trim();

  if (
    value.length < 2
  ) {
    return;
  }

  const next =
    [
      value,
      ...getSearchHistory_()
        .filter(item =>
          normalize(item) !==
          normalize(value)
        )
    ].slice(
      0,
      HISTORY_LIMIT
    );

  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(next)
    );

  } catch {
    // 保存できなくても検索自体は継続
  }

  renderSearchHistory_();
}


function renderSearchHistory_() {
  const history =
    getSearchHistory_();

  elements.searchHistoryWrap.hidden =
    history.length === 0;

  elements.searchHistory.innerHTML =
    history
      .map(query => `
        <button
          type="button"
          data-history-query="${escapeHtml(query)}"
        >
          ${escapeHtml(query)}
        </button>
      `)
      .join("");

  elements.searchHistory
    .querySelectorAll(
      "[data-history-query]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          elements.searchInput.value =
            button.dataset.historyQuery || "";

          updateClearButton_();
          runSearch_();
        }
      );
    });
}


function updateClearButton_() {
  elements.clearButton.hidden =
    !elements.searchInput.value;
}


function updateTabCounts_(
  counts = {},
  total = 0
) {
  elements.allTabCount.textContent =
    Number(total || 0);

  elements.singerTabCount.textContent =
    Number(counts.singers || 0);

  elements.songTabCount.textContent =
    Number(counts.songs || 0);

  elements.eventTabCount.textContent =
    Number(counts.events || 0);

  elements.venueTabCount.textContent =
    Number(counts.venues || 0);
}


function setLoading_(
  message
) {
  elements.status.hidden =
    false;

  elements.status.classList.remove(
    "error"
  );

  elements.status.textContent =
    message;

  elements.resultsArea.innerHTML = `
    <div class="search-loading-card" aria-hidden="true">
      <div class="search-loading-line"></div>
      <div class="search-loading-line"></div>
      <div class="search-loading-line"></div>
    </div>
  `;
}


function clearStatus_() {
  elements.status.hidden =
    true;

  elements.status.classList.remove(
    "error"
  );

  elements.status.textContent =
    "";
}


function setError_(
  message
) {
  elements.status.hidden =
    false;

  elements.status.classList.add(
    "error"
  );

  elements.status.textContent =
    message;

  elements.resultsArea.innerHTML = `
    <section class="search-state">
      <div class="search-state-icon">!</div>
      <h2>検索結果を取得できませんでした</h2>
      <p>
        一時的にAPIへ接続できない可能性があります。
        少し時間を置くか、再検索してください。
      </p>
      <div class="search-state-actions">
        <button type="button" id="searchRetryButton">再検索する</button>
      </div>
    </section>
  `;

  $("searchRetryButton")
    ?.addEventListener(
      "click",
      runSearch_
    );
}


function reasonHtml(
  reason
) {
  return reason
    ? `<span class="match-reason">${escapeHtml(reason)}</span>`
    : "";
}


function priorityHtml(
  score
) {
  const label =
    matchLabel(score);

  return label
    ? `<span class="result-priority">${label}</span>`
    : "";
}


function singerRow(
  item,
  query
) {
  return `
    <a
      class="result-row"
      href="search.html?q=${encodeURIComponent(item.singerName)}&source=singer"
    >
      <span class="result-type singer">歌唱名義</span>

      <span>
        <span class="result-title">
          ${highlight(item.singerName || "歌唱名義未設定", query)}
          ${priorityHtml(item.__score)}
        </span>

        <span class="result-meta">
          <span>歌唱記録 ${Number(item.performanceCount || 0).toLocaleString("ja-JP")}件</span>
          <span>曲 ${Number(item.songCount || 0).toLocaleString("ja-JP")}曲</span>
          <span>イベント ${Number(item.eventCount || 0).toLocaleString("ja-JP")}件</span>
        </span>
      </span>

      <span class="result-arrow">›</span>
    </a>
  `;
}


function songRow(
  item,
  query
) {
  const title =
    item.displayName ||
    item.songName ||
    "曲名未設定";

  const meta = [
    item.version,
    item.recordingCd
      ? `収録CD：${item.recordingCd}`
      : "",
    item.releaseDate
      ? `発売日：${formatDate(item.releaseDate)}`
      : ""
  ].filter(Boolean);

  return `
    <a class="result-row" href="song.html?id=${encodeURIComponent(item.songId)}">
      <span class="result-type song">曲</span>

      <span>
        <span class="result-title">
          ${highlight(title, query)}
          ${priorityHtml(item.__score)}
        </span>

        <span class="result-meta">
          ${meta.map(value => `<span>${highlight(value, query)}</span>`).join("")}
          ${reasonHtml(item.matchReason)}
        </span>
      </span>

      <span class="result-arrow">›</span>
    </a>
  `;
}


function eventRow(
  item,
  query
) {
  const meta = [
    item.date
      ? formatDate(item.date)
      : "",
    item.category,
    item.eventType,
    item.day,
    item.performance,
    item.venueName
  ].filter(Boolean);

  return `
    <a class="result-row" href="event.html?id=${encodeURIComponent(item.eventId)}">
      <span class="result-type event">イベント</span>

      <span>
        <span class="result-title">
          ${highlight(item.eventName || "イベント名未設定", query)}
          ${priorityHtml(item.__score)}
        </span>

        <span class="result-meta">
          ${meta.map(value => `<span>${highlight(value, query)}</span>`).join("")}
          ${reasonHtml(item.matchReason)}
        </span>
      </span>

      <span class="result-arrow">›</span>
    </a>
  `;
}


function venueRow(
  item,
  query
) {
  const meta = [
    item.prefectureCity,
    item.region,
    item.country,
    item.capacity
      ? `キャパ ${Number(item.capacity).toLocaleString("ja-JP")}人`
      : ""
  ].filter(Boolean);

  return `
    <a class="result-row" href="venue.html?id=${encodeURIComponent(item.venueId)}">
      <span class="result-type venue">会場</span>

      <span>
        <span class="result-title">
          ${highlight(item.venueName || "会場名未設定", query)}
          ${priorityHtml(item.__score)}
        </span>

        <span class="result-meta">
          ${meta.map(value => `<span>${highlight(value, query)}</span>`).join("")}
          ${reasonHtml(item.matchReason)}
        </span>
      </span>

      <span class="result-arrow">›</span>
    </a>
  `;
}


function section(
  key,
  title,
  kicker,
  count,
  rows
) {
  if (!rows) {
    return "";
  }

  const hidden =
    activeTab !== "all" &&
    activeTab !== key;

  return `
    <section class="result-section" data-result-section="${key}" ${hidden ? "hidden" : ""}>
      <div class="result-head">
        <div>
          <p class="kicker">${kicker}</p>
          <h2>${title}</h2>
        </div>

        <div class="result-count">${Number(count || 0)}件</div>
      </div>

      <div class="result-card">${rows}</div>
    </section>
  `;
}


function renderEmptyState_(
  query
) {
  elements.resultsArea.innerHTML = `
    <section class="search-state">
      <div class="search-state-icon">⌕</div>
      <h2>「${escapeHtml(query)}」に一致する記録はありません</h2>
      <p>
        表記を短くする、名前の一部だけにする、
        会場の地域名や歌唱名義で検索すると見つかる場合があります。
      </p>

      <div class="search-state-actions">
        <button type="button" data-query="Snow">Snow</button>
        <button type="button" data-query="μ's">μ's</button>
        <button type="button" data-query="東京">東京</button>
      </div>
    </section>
  `;

  elements.resultsArea
    .querySelectorAll(
      "[data-query]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          elements.searchInput.value =
            button.dataset.query || "";

          updateClearButton_();
          runSearch_();
        }
      );
    });
}


function renderResults_() {
  keyboardIndex =
    -1;

  if (!latestData) {
    elements.resultsArea.innerHTML =
      "";

    return;
  }

  const query =
    latestData.query ||
    elements.searchInput.value.trim();

  const groups =
    latestData.results || {};

  const counts =
    latestData.counts || {};

  const sortedGroups = {
    singers:
      sortGroup(
        groups.singers,
        query,
        "singers"
      ),

    songs:
      sortGroup(
        groups.songs,
        query,
        "songs"
      ),

    events:
      sortGroup(
        groups.events,
        query,
        "events"
      ),

    venues:
      sortGroup(
        groups.venues,
        query,
        "venues"
      )
  };

  const html =
    [
      section(
        "singers",
        "歌唱名義",
        "SINGER NAMES",
        counts.singers || 0,
        sortedGroups.singers
          .map(item =>
            singerRow(item, query)
          )
          .join("")
      ),

      section(
        "songs",
        "曲",
        "SONGS",
        counts.songs || 0,
        sortedGroups.songs
          .map(item =>
            songRow(item, query)
          )
          .join("")
      ),

      section(
        "events",
        "イベント",
        "EVENTS",
        counts.events || 0,
        sortedGroups.events
          .map(item =>
            eventRow(item, query)
          )
          .join("")
      ),

      section(
        "venues",
        "会場",
        "VENUES",
        counts.venues || 0,
        sortedGroups.venues
          .map(item =>
            venueRow(item, query)
          )
          .join("")
      )
    ].join("");

  if (!html) {
    renderEmptyState_(
      query
    );

    return;
  }

  elements.resultsArea.innerHTML =
    html;

  updateSectionVisibility_();
}


function updateSectionVisibility_() {
  elements.resultsArea
    .querySelectorAll(
      "[data-result-section]"
    )
    .forEach(sectionElement => {
      sectionElement.hidden =
        activeTab !== "all" &&
        sectionElement.dataset.resultSection !==
          activeTab;
    });
}


function updateUrl_(
  query
) {
  const url =
    new URL(
      location.href
    );

  if (query) {
    url.searchParams.set(
      "q",
      query
    );

  } else {
    url.searchParams.delete(
      "q"
    );
  }

  if (
    activeTab !== "all"
  ) {
    url.searchParams.set(
      "type",
      activeTab
    );

  } else {
    url.searchParams.delete(
      "type"
    );
  }

  history.replaceState(
    null,
    "",
    url
  );
}


async function runSearch_() {
  const query =
    elements.searchInput.value.trim();

  requestSequence += 1;

  const currentRequest =
    requestSequence;

  updateClearButton_();
  updateUrl_(query);

  if (!query) {
    latestData =
      null;

    elements.summaryText.textContent =
      "検索語を入力してください。";

    elements.summaryCount.textContent =
      "";

    elements.resultsArea.innerHTML =
      "";

    updateTabCounts_();
    clearStatus_();

    return;
  }

  if (
    query.length < 2
  ) {
    latestData =
      null;

    elements.summaryText.textContent =
      "2文字以上入力してください。";

    elements.summaryCount.textContent =
      "";

    elements.resultsArea.innerHTML =
      "";

    updateTabCounts_();
    clearStatus_();

    return;
  }

  setLoading_(
    "横断検索しています…"
  );

  try {
    const response =
      await apiGet(
        "search",
        {
          q:
            query
        },
        {
          timeoutMs:
            20000,

          retryCount:
            0,

          cache:
            true,

          cacheTtlMs:
            300000
        }
      );

    if (
      currentRequest !==
      requestSequence
    ) {
      return;
    }

    latestData =
      response.data || {};

    const total =
      Number(
        latestData.totalCount || 0
      );

    elements.summaryText.innerHTML = `
      「<strong>${escapeHtml(query)}</strong>」の検索結果
    `;

    elements.summaryCount.textContent =
      `${total}件`;

    updateTabCounts_(
      latestData.counts || {},
      total
    );

    clearStatus_();

    if (
      total === 0
    ) {
      renderEmptyState_(
        query
      );

    } else {
      renderResults_();
      saveSearchHistory_(
        query
      );
    }

  } catch (error) {
    if (
      currentRequest !==
      requestSequence
    ) {
      return;
    }

    console.error(
      "Search API error:",
      error
    );

    latestData =
      null;

    elements.summaryText.textContent =
      "検索結果を取得できませんでした。";

    elements.summaryCount.textContent =
      "";

    updateTabCounts_();

    setError_(
      error?.message ||
      "検索中にエラーが発生しました。"
    );
  }
}


function scheduleSearch_() {
  window.clearTimeout(
    debounceTimer
  );

  const query =
    elements.searchInput.value.trim();

  updateClearButton_();

  if (!query) {
    runSearch_();
    return;
  }

  debounceTimer =
    window.setTimeout(
      runSearch_,
      300
    );
}


function getVisibleRows_() {
  return Array.from(
    elements.resultsArea
      .querySelectorAll(
        ".result-section:not([hidden]) .result-row"
      )
  );
}


function clearKeyboardSelection_() {
  getVisibleRows_()
    .forEach(row =>
      row.classList.remove(
        "keyboard-active"
      )
    );

  keyboardIndex =
    -1;
}


function updateKeyboardSelection_(
  direction
) {
  const rows =
    getVisibleRows_();

  if (!rows.length) {
    return;
  }

  rows.forEach(row =>
    row.classList.remove(
      "keyboard-active"
    )
  );

  keyboardIndex +=
    direction;

  if (
    keyboardIndex >=
    rows.length
  ) {
    keyboardIndex =
      0;
  }

  if (
    keyboardIndex < 0
  ) {
    keyboardIndex =
      rows.length - 1;
  }

  rows[
    keyboardIndex
  ].classList.add(
    "keyboard-active"
  );

  rows[
    keyboardIndex
  ].scrollIntoView({
    block:
      "nearest",

    behavior:
      "smooth"
  });
}


function activateInitialTab_() {
  if (
    ![
      "all",
      "singers",
      "songs",
      "events",
      "venues"
    ].includes(
      activeTab
    )
  ) {
    activeTab =
      "all";
  }

  document
    .querySelectorAll(
      ".search-tab"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab ===
          activeTab
      );
    });
}


document
  .querySelectorAll(
    ".search-tab"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        activeTab =
          button.dataset.tab;

        activateInitialTab_();
        clearKeyboardSelection_();
        updateUrl_(
          elements.searchInput.value.trim()
        );
        updateSectionVisibility_();
      }
    );
  });


elements.searchButton.addEventListener(
  "click",
  runSearch_
);


elements.clearButton.addEventListener(
  "click",
  () => {
    elements.searchInput.value =
      "";

    updateClearButton_();
    runSearch_();
    elements.searchInput.focus();
  }
);


elements.searchHistoryClear.addEventListener(
  "click",
  () => {
    try {
      localStorage.removeItem(
        HISTORY_KEY
      );

    } catch {
      // 無視
    }

    renderSearchHistory_();
  }
);


elements.searchInput.addEventListener(
  "input",
  () => {
    clearKeyboardSelection_();
    scheduleSearch_();
  }
);


elements.searchInput.addEventListener(
  "keydown",
  event => {
    if (
      event.key ===
      "Enter"
    ) {
      event.preventDefault();

      const activeRow =
        elements.resultsArea
          .querySelector(
            ".result-row.keyboard-active"
          );

      if (activeRow) {
        location.href =
          activeRow.href;

        return;
      }

      runSearch_();
    }

    if (
      event.key ===
      "ArrowDown"
    ) {
      event.preventDefault();
      updateKeyboardSelection_(
        1
      );
    }

    if (
      event.key ===
      "ArrowUp"
    ) {
      event.preventDefault();
      updateKeyboardSelection_(
        -1
      );
    }

    if (
      event.key ===
      "Escape"
    ) {
      clearKeyboardSelection_();
      elements.searchInput.blur();
    }
  }
);


window.addEventListener(
  "popstate",
  () => {
    const nextParameters =
      new URLSearchParams(
        location.search
      );

    elements.searchInput.value =
      nextParameters.get("q") || "";

    activeTab =
      nextParameters.get("type") || "all";

    activateInitialTab_();
    updateClearButton_();
    runSearch_();
  }
);


if (initialQuery) {
  runSearch_();

} else {
  elements.searchInput.focus();
}
