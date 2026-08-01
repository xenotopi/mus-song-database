import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.1.0";


renderCommon("search");


const elements = {
  searchInput:
    document.getElementById(
      "searchInput"
    ),

  searchButton:
    document.getElementById(
      "searchButton"
    ),

  clearButton:
    document.getElementById(
      "clearButton"
    ),

  summaryText:
    document.getElementById(
      "summaryText"
    ),

  summaryCount:
    document.getElementById(
      "summaryCount"
    ),

  status:
    document.getElementById(
      "status"
    ),

  resultsArea:
    document.getElementById(
      "resultsArea"
    ),

  allTabCount:
    document.getElementById(
      "allTabCount"
    ),

  songTabCount:
    document.getElementById(
      "songTabCount"
    ),

  eventTabCount:
    document.getElementById(
      "eventTabCount"
    ),

  venueTabCount:
    document.getElementById(
      "venueTabCount"
    ),
};


const parameters =
  new URLSearchParams(
    location.search
  );

const initialQuery =
  parameters.get("q") || "";


let activeTab = "all";
let latestData = null;
let debounceTimer = null;
let requestSequence = 0;
let keyboardIndex = -1;


elements.searchInput.value =
  initialQuery;

updateClearButton_();


function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}


function highlight(
  value,
  query
) {
  const text =
    String(value || "");

  const normalizedText =
    normalize(text);

  const normalizedQuery =
    normalize(query);

  if (!normalizedQuery) {
    return escapeHtml(text);
  }

  const index =
    normalizedText.indexOf(
      normalizedQuery
    );

  if (index < 0) {
    return escapeHtml(text);
  }

  return [
    escapeHtml(
      text.slice(0, index)
    ),
    '<span class="highlight">',
    escapeHtml(
      text.slice(
        index,
        index +
        normalizedQuery.length
      )
    ),
    '</span>',
    escapeHtml(
      text.slice(
        index +
        normalizedQuery.length
      )
    ),
  ].join("");
}


function setLoading(message) {
  elements.status.hidden = false;
  elements.status.classList.remove(
    "error"
  );

  elements.status.innerHTML = `
    ${escapeHtml(message)}

    <span class="loading">
      <i></i><i></i><i></i>
    </span>`;
}


function setError(message) {
  elements.status.hidden = false;
  elements.status.classList.add(
    "error"
  );

  elements.status.textContent =
    message;
}


function clearStatus() {
  elements.status.hidden = true;
  elements.status.classList.remove(
    "error"
  );

  elements.status.textContent = "";
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

  elements.songTabCount.textContent =
    Number(counts.songs || 0);

  elements.eventTabCount.textContent =
    Number(counts.events || 0);

  elements.venueTabCount.textContent =
    Number(counts.venues || 0);
}


function songRow(item, query) {
  const title =
    item.displayName ||
    item.songName ||
    "曲名未設定";

  const meta = [
    item.songId,
    item.version,
    item.recordingCd
      ? `収録CD：${item.recordingCd}`
      : "",
    item.releaseDate
      ? `発売日：${formatDate(
          item.releaseDate
        )}`
      : "",
  ].filter(Boolean);

  return `
    <a
      class="result-row"
      href="song.html?id=${encodeURIComponent(
        item.songId
      )}"
    >
      <span class="result-type song">
        曲
      </span>

      <span>
        <span class="result-title">
          ${highlight(
            title,
            query
          )}
        </span>

        <span class="result-meta">
          ${meta.map(
            value => `
              <span>
                ${highlight(
                  value,
                  query
                )}
              </span>`
          ).join("")}
        </span>
      </span>

      <span class="result-arrow">
        ›
      </span>
    </a>`;
}


function eventRow(item, query) {
  const meta = [
    item.eventId,
    item.date
      ? formatDate(
          item.date
        )
      : "",
    item.category,
    item.eventType,
    item.day,
    item.performance,
  ].filter(Boolean);

  return `
    <a
      class="result-row"
      href="event.html?id=${encodeURIComponent(
        item.eventId
      )}"
    >
      <span class="result-type event">
        イベント
      </span>

      <span>
        <span class="result-title">
          ${highlight(
            item.eventName ||
            "イベント名未設定",
            query
          )}
        </span>

        <span class="result-meta">
          ${meta.map(
            value => `
              <span>
                ${highlight(
                  value,
                  query
                )}
              </span>`
          ).join("")}
        </span>
      </span>

      <span class="result-arrow">
        ›
      </span>
    </a>`;
}


function venueRow(item, query) {
  const meta = [
    item.venueId,
    item.prefectureCity,
    item.region,
    item.country,
    item.capacity
      ? `キャパ ${Number(
          item.capacity
        ).toLocaleString(
          "ja-JP"
        )}人`
      : "",
  ].filter(Boolean);

  return `
    <a
      class="result-row"
      href="venue.html?id=${encodeURIComponent(
        item.venueId
      )}"
    >
      <span class="result-type venue">
        会場
      </span>

      <span>
        <span class="result-title">
          ${highlight(
            item.venueName ||
            "会場名未設定",
            query
          )}
        </span>

        <span class="result-meta">
          ${meta.map(
            value => `
              <span>
                ${highlight(
                  value,
                  query
                )}
              </span>`
          ).join("")}
        </span>
      </span>

      <span class="result-arrow">
        ›
      </span>
    </a>`;
}


function section(
  title,
  kicker,
  count,
  rows
) {
  if (!rows) {
    return "";
  }

  return `
    <section class="result-section">
      <div class="result-head">
        <div>
          <p class="kicker">
            ${kicker}
          </p>

          <h2>
            ${title}
          </h2>
        </div>

        <div class="result-count">
          ${Number(
            count || 0
          )}件
        </div>
      </div>

      <div class="result-card">
        ${rows}
      </div>
    </section>`;
}


function renderResults() {
  keyboardIndex = -1;

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

  const songRows =
    (groups.songs || [])
      .map(
        item =>
          songRow(
            item,
            query
          )
      )
      .join("");

  const eventRows =
    (groups.events || [])
      .map(
        item =>
          eventRow(
            item,
            query
          )
      )
      .join("");

  const venueRows =
    (groups.venues || [])
      .map(
        item =>
          venueRow(
            item,
            query
          )
      )
      .join("");

  let html = "";

  if (
    activeTab === "all" ||
    activeTab === "songs"
  ) {
    html += section(
      "曲",
      "SONGS",
      counts.songs || 0,
      songRows
    );
  }

  if (
    activeTab === "all" ||
    activeTab === "events"
  ) {
    html += section(
      "イベント",
      "EVENTS",
      counts.events || 0,
      eventRows
    );
  }

  if (
    activeTab === "all" ||
    activeTab === "venues"
  ) {
    html += section(
      "会場",
      "VENUES",
      counts.venues || 0,
      venueRows
    );
  }

  if (!html) {
    html = `
      <section class="result-section">
        <div class="empty-state">
          <strong>
            候補が見つかりませんでした
          </strong>

          <p>
            別の言葉や、
            より短い語句でお試しください。
          </p>

          <div class="suggestions">
            <button
              type="button"
              data-query="Snow"
            >
              Snow
            </button>

            <button
              type="button"
              data-query="Final"
            >
              Final
            </button>

            <button
              type="button"
              data-query="東京"
            >
              東京
            </button>
          </div>
        </div>
      </section>`;
  }

  elements.resultsArea.innerHTML =
    html;

  document
    .querySelectorAll(
      "[data-query]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            elements.searchInput.value =
              button.dataset.query;

            updateClearButton_();
            runSearch();
          }
        );
      }
    );
}


async function runSearch() {
  const query =
    elements.searchInput.value.trim();

  requestSequence += 1;

  const currentRequest =
    requestSequence;

  updateClearButton_();

  if (!query) {
    latestData = null;

    elements.summaryText.textContent =
      "検索語を入力してください。";

    elements.summaryCount.textContent =
      "";

    elements.resultsArea.innerHTML =
      "";

    updateTabCounts_();
    clearStatus();

    const url =
      new URL(
        location.href
      );

    url.searchParams.delete("q");

    history.replaceState(
      null,
      "",
      url
    );

    return;
  }

  if (query.length < 2) {
    latestData = null;

    elements.summaryText.textContent =
      "2文字以上入力してください。";

    elements.summaryCount.textContent =
      "";

    elements.resultsArea.innerHTML =
      "";

    updateTabCounts_();
    clearStatus();
    return;
  }

  const url =
    new URL(
      location.href
    );

  url.searchParams.set(
    "q",
    query
  );

  history.replaceState(
    null,
    "",
    url
  );

  setLoading(
    "検索しています"
  );

  try {
    const response =
      await apiGet(
        "search",
        {
          q: query,
        },
        {
          timeoutMs: 15000,
          retryCount: 0,
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
        latestData.totalCount ||
        0
      );

    elements.summaryText.innerHTML = `
      「<strong>${escapeHtml(
        query
      )}</strong>」の検索結果`;

    elements.summaryCount.textContent =
      `${total}件`;

    updateTabCounts_(
      latestData.counts || {},
      total
    );

    clearStatus();
    renderResults();

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

    latestData = null;

    elements.resultsArea.innerHTML =
      "";

    elements.summaryText.textContent =
      "検索結果を取得できませんでした。";

    elements.summaryCount.textContent =
      "";

    updateTabCounts_();

    setError(
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
    runSearch();
    return;
  }

  debounceTimer =
    window.setTimeout(
      runSearch,
      320
    );
}


function updateKeyboardSelection_(
  direction
) {
  const rows =
    Array.from(
      elements.resultsArea
        .querySelectorAll(
          ".result-row"
        )
    );

  if (!rows.length) {
    return;
  }

  rows.forEach(
    row =>
      row.classList.remove(
        "keyboard-active"
      )
  );

  keyboardIndex += direction;

  if (
    keyboardIndex >=
    rows.length
  ) {
    keyboardIndex = 0;
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
    block: "nearest",
  });
}


document
  .querySelectorAll(
    ".search-tab"
  )
  .forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(
              ".search-tab"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          activeTab =
            button.dataset.tab;

          renderResults();
        }
      );
    }
  );


elements.searchButton.addEventListener(
  "click",
  runSearch
);


elements.clearButton.addEventListener(
  "click",
  () => {
    elements.searchInput.value =
      "";

    updateClearButton_();
    runSearch();

    elements.searchInput.focus();
  }
);


elements.searchInput.addEventListener(
  "input",
  scheduleSearch_
);


elements.searchInput.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter"
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

      runSearch();
    }

    if (
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      updateKeyboardSelection_(1);
    }

    if (
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      updateKeyboardSelection_(-1);
    }

    if (
      event.key === "Escape"
    ) {
      elements.searchInput.value =
        "";

      updateClearButton_();
      runSearch();
    }
  }
);


if (initialQuery) {
  runSearch();
}
