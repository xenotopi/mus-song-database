import {
  apiGet,
  escapeHtml
} from "./api.js?v=2.0.2";


/**
 * 共通ヘッダー・フッターと、
 * 全ページ共通の検索候補を描画する。
 *
 * @param {string} active
 */
export function renderCommon(active = "") {
  injectCommonSearchStyles_();

  const header =
    document.getElementById(
      "siteHeader"
    );

  const footer =
    document.getElementById(
      "siteFooter"
    );

  if (header) {
    header.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a
            class="brand"
            href="index.html"
          >
            <b>μ's Song Database</b>

            <small>
              μ's歌唱履歴データベース
            </small>
          </a>

          <div
            class="global-search-wrap"
            id="globalSearchWrap"
          >
            <div class="global-search">
              <span>⌕</span>

              <input
                id="globalSearchInput"
                type="search"
                placeholder="μ'sの歴史を検索"
                autocomplete="off"
                aria-label="曲・イベント・会場を検索"
                aria-expanded="false"
                aria-controls="globalSearchSuggestions"
              >
            </div>

            <div
              class="global-search-suggestions"
              id="globalSearchSuggestions"
              role="listbox"
              hidden
            ></div>
          </div>

          <nav class="nav">
            <a
              class="${active === "home" ? "active" : ""}"
              href="index.html"
            >
              ホーム
            </a>

            <a
              class="${active === "song" ? "active" : ""}"
              href="song.html?id=S003"
            >
              曲
            </a>

            <a
              class="${active === "event" ? "active" : ""}"
              href="event.html?id=EV0002"
            >
              イベント
            </a>

            <a
              class="${active === "venue" ? "active" : ""}"
              href="venue.html?id=VE0002"
            >
              会場
            </a>

            <a
              class="${active === "rankings" ? "active" : ""}"
              href="rankings.html"
            >
              ランキング
            </a>
          </nav>
        </div>
      </header>`;
  }

  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div>
          <b>μ's Song Database</b><br>
          μ's歌唱履歴データベース
        </div>

        <div>
          Web Prototype v2.1
        </div>
      </footer>`;
  }

  setupGlobalSearch_();
}


/**
 * 全ページ共通検索を初期化する。
 */
function setupGlobalSearch_() {
  const wrap =
    document.getElementById(
      "globalSearchWrap"
    );

  const input =
    document.getElementById(
      "globalSearchInput"
    );

  const suggestions =
    document.getElementById(
      "globalSearchSuggestions"
    );

  if (
    !wrap ||
    !input ||
    !suggestions
  ) {
    return;
  }

  let timer = null;
  let requestId = 0;
  let activeIndex = -1;
  let currentLinks = [];

  const pageQuery =
    new URLSearchParams(
      location.search
    ).get("q");

  if (
    location.pathname.endsWith(
      "/search.html"
    ) &&
    pageQuery
  ) {
    input.value = pageQuery;
  }

  function closeSuggestions() {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    input.setAttribute(
      "aria-expanded",
      "false"
    );

    activeIndex = -1;
    currentLinks = [];
  }

  function openSuggestions() {
    suggestions.hidden = false;
    input.setAttribute(
      "aria-expanded",
      "true"
    );
  }

  function updateActiveItem() {
    currentLinks.forEach(
      (link, index) => {
        link.classList.toggle(
          "active",
          index === activeIndex
        );

        link.setAttribute(
          "aria-selected",
          index === activeIndex
            ? "true"
            : "false"
        );
      }
    );

    if (
      activeIndex >= 0 &&
      currentLinks[activeIndex]
    ) {
      currentLinks[
        activeIndex
      ].scrollIntoView({
        block: "nearest",
      });
    }
  }

  function moveToSearchPage() {
    const query =
      input.value.trim();

    if (!query) {
      return;
    }

    location.href =
      `search.html?q=${encodeURIComponent(
        query
      )}`;
  }

  function renderLoading() {
    suggestions.innerHTML = `
      <div class="global-suggest-state">
        検索候補を探しています
        <span class="global-suggest-dots">
          <i></i><i></i><i></i>
        </span>
      </div>`;

    openSuggestions();
  }

  function renderEmpty(query) {
    suggestions.innerHTML = `
      <div class="global-suggest-state">
        「${escapeHtml(query)}」の候補はありません。
      </div>

      <button
        class="global-suggest-all"
        type="button"
      >
        検索結果ページで探す
      </button>`;

    suggestions
      .querySelector(
        ".global-suggest-all"
      )
      ?.addEventListener(
        "click",
        moveToSearchPage
      );

    openSuggestions();
  }

  function renderError() {
    suggestions.innerHTML = `
      <div class="global-suggest-state">
        候補を取得できませんでした。
      </div>

      <button
        class="global-suggest-all"
        type="button"
      >
        検索結果ページへ進む
      </button>`;

    suggestions
      .querySelector(
        ".global-suggest-all"
      )
      ?.addEventListener(
        "click",
        moveToSearchPage
      );

    openSuggestions();
  }

  function createSuggestionItems(
    data,
    query
  ) {
    const results =
      data.results || {};

    const items = [];

    (results.singers || [])
      .slice(0, 2)
      .forEach(
        item => {
          items.push({
            type: "歌唱者",
            className: "singer",
            title:
              item.singerName ||
              "歌唱者名未設定",
            meta: [
              `曲 ${Number(item.songCount || 0)}曲`,
              `イベント ${Number(item.eventCount || 0)}件`,
            ].join("｜"),
            href:
              `search.html?q=${encodeURIComponent(
                item.singerName
              )}&source=singer`,
          });
        }
      );

    (results.songs || [])
      .slice(0, 2)
      .forEach(
        item => {
          items.push({
            type: "曲",
            className: "song",
            title:
              item.displayName ||
              item.songName ||
              "曲名未設定",
            meta: [
              item.version,
              item.recordingCd,
            ].filter(Boolean).join("｜"),
            href:
              `song.html?id=${encodeURIComponent(
                item.songId
              )}`,
          });
        }
      );

    (results.events || [])
      .slice(0, 2)
      .forEach(
        item => {
          items.push({
            type: "イベント",
            className: "event",
            title:
              item.eventName ||
              "イベント名未設定",
            meta: [
              item.date,
              item.category,
              item.eventType,
            ].filter(Boolean).join("｜"),
            href:
              `event.html?id=${encodeURIComponent(
                item.eventId
              )}`,
          });
        }
      );

    (results.venues || [])
      .slice(0, 1)
      .forEach(
        item => {
          items.push({
            type: "会場",
            className: "venue",
            title:
              item.venueName ||
              "会場名未設定",
            meta: [
              item.prefectureCity,
              item.country,
            ].filter(Boolean).join("｜"),
            href:
              `venue.html?id=${encodeURIComponent(
                item.venueId
              )}`,
          });
        }
      );

    return items
      .slice(0, 6)
      .map(
        item => `
          <a
            class="global-suggest-item"
            href="${item.href}"
            role="option"
            aria-selected="false"
          >
            <span
              class="global-suggest-type ${item.className}"
            >
              ${item.type}
            </span>

            <span class="global-suggest-copy">
              <strong>
                ${highlightText_(
                  item.title,
                  query
                )}
              </strong>

              <small>
                ${escapeHtml(
                  item.meta
                )}
              </small>
            </span>

            <span class="global-suggest-arrow">
              ›
            </span>
          </a>`
      )
      .join("");
  }

  function renderResults(
    data,
    query
  ) {
    const itemsHtml =
      createSuggestionItems(
        data,
        query
      );

    if (!itemsHtml) {
      renderEmpty(query);
      return;
    }

    suggestions.innerHTML = `
      <div class="global-suggest-list">
        ${itemsHtml}
      </div>

      <button
        class="global-suggest-all"
        type="button"
      >
        「${escapeHtml(query)}」の検索結果をすべて見る
      </button>`;

    suggestions
      .querySelector(
        ".global-suggest-all"
      )
      ?.addEventListener(
        "click",
        moveToSearchPage
      );

    currentLinks =
      Array.from(
        suggestions.querySelectorAll(
          ".global-suggest-item"
        )
      );

    activeIndex = -1;
    openSuggestions();
  }

  async function requestSuggestions() {
    const query =
      input.value.trim();

    requestId += 1;
    const currentRequestId =
      requestId;

    if (query.length < 2) {
      closeSuggestions();
      return;
    }

    renderLoading();

    try {
      const response =
        await apiGet(
          "search",
          {
            q: query,
          },
          {
            timeoutMs: 12000,
            retryCount: 0,
          }
        );

      if (
        currentRequestId !==
        requestId
      ) {
        return;
      }

      renderResults(
        response.data || {},
        query
      );

    } catch (error) {
      if (
        currentRequestId !==
        requestId
      ) {
        return;
      }

      console.error(
        "Global search suggestion error:",
        error
      );

      renderError();
    }
  }

  input.addEventListener(
    "input",
    () => {
      window.clearTimeout(timer);

      const query =
        input.value.trim();

      if (query.length < 2) {
        closeSuggestions();
        return;
      }

      timer =
        window.setTimeout(
          requestSuggestions,
          260
        );
    }
  );

  input.addEventListener(
    "focus",
    () => {
      if (
        input.value.trim().length >= 2 &&
        suggestions.innerHTML
      ) {
        openSuggestions();
      }
    }
  );

  input.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        if (
          activeIndex >= 0 &&
          currentLinks[activeIndex]
        ) {
          location.href =
            currentLinks[
              activeIndex
            ].href;
          return;
        }

        moveToSearchPage();
        return;
      }

      if (
        event.key === "Escape"
      ) {
        closeSuggestions();
        input.blur();
        return;
      }

      if (
        suggestions.hidden ||
        !currentLinks.length
      ) {
        return;
      }

      if (
        event.key === "ArrowDown"
      ) {
        event.preventDefault();

        activeIndex =
          activeIndex <
          currentLinks.length - 1
            ? activeIndex + 1
            : 0;

        updateActiveItem();
      }

      if (
        event.key === "ArrowUp"
      ) {
        event.preventDefault();

        activeIndex =
          activeIndex > 0
            ? activeIndex - 1
            : currentLinks.length - 1;

        updateActiveItem();
      }
    }
  );

  document.addEventListener(
    "click",
    event => {
      if (
        !wrap.contains(
          event.target
        )
      ) {
        closeSuggestions();
      }
    }
  );
}


/**
 * 検索語を強調表示する。
 *
 * @param {*} value
 * @param {string} query
 * @return {string}
 */
function highlightText_(
  value,
  query
) {
  const text =
    String(value || "");

  const normalizedText =
    normalizeSearchText_(text);

  const normalizedQuery =
    normalizeSearchText_(query);

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
    '<mark>',
    escapeHtml(
      text.slice(
        index,
        index +
        normalizedQuery.length
      )
    ),
    '</mark>',
    escapeHtml(
      text.slice(
        index +
        normalizedQuery.length
      )
    ),
  ].join("");
}


function normalizeSearchText_(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}


/**
 * 共通検索候補用CSSを一度だけ挿入する。
 */
function injectCommonSearchStyles_() {
  if (
    document.getElementById(
      "globalSearchEnhancementStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "globalSearchEnhancementStyles";

  style.textContent = `
    .global-search-wrap {
      position: relative;
      min-width: 0;
    }

    .global-search-suggestions {
      position: absolute;
      z-index: 1000;
      top: calc(100% + 8px);
      left: 0;
      right: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fff;
      box-shadow:
        0 18px 44px
        rgba(23, 32, 51, .18);
    }

    .global-suggest-list {
      max-height: 420px;
      overflow-y: auto;
    }

    .global-suggest-item {
      display: grid;
      grid-template-columns:
        66px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      color: var(--navy);
      text-decoration: none;
    }

    .global-suggest-item:hover,
    .global-suggest-item.active {
      background: #f8f7ff;
    }

    .global-suggest-type {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 25px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 900;
    }

    .global-suggest-type.singer {
      background: #dcfce7;
      color: #15803d;
    }

    .global-suggest-type.song {
      background: #ede9fe;
      color: #5b21b6;
    }

    .global-suggest-type.event {
      background: #fce7f3;
      color: #be185d;
    }

    .global-suggest-type.venue {
      background: #e0f2fe;
      color: #0369a1;
    }

    .global-suggest-copy {
      min-width: 0;
    }

    .global-suggest-copy strong,
    .global-suggest-copy small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .global-suggest-copy strong {
      font-size: 13px;
    }

    .global-suggest-copy small {
      margin-top: 2px;
      color: var(--muted);
      font-size: 10px;
    }

    .global-suggest-copy mark {
      border-radius: 3px;
      background: #fff0a8;
      color: inherit;
    }

    .global-suggest-arrow {
      color: var(--indigo);
      font-size: 20px;
      font-weight: 900;
    }

    .global-suggest-state {
      padding: 18px 14px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }

    .global-suggest-all {
      width: 100%;
      min-height: 42px;
      border: 0;
      border-top: 1px solid var(--line);
      background: #fff;
      color: var(--indigo);
      font-weight: 900;
      cursor: pointer;
    }

    .global-suggest-all:hover {
      background: #f8f7ff;
    }

    .global-suggest-dots {
      display: inline-flex;
      gap: 4px;
      margin-left: 5px;
    }

    .global-suggest-dots i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--indigo);
      animation:
        globalSuggestDot
        .8s infinite alternate;
    }

    .global-suggest-dots i:nth-child(2) {
      animation-delay: .12s;
    }

    .global-suggest-dots i:nth-child(3) {
      animation-delay: .24s;
    }

    @keyframes globalSuggestDot {
      to {
        opacity: .25;
        transform: translateY(-2px);
      }
    }

    @media (max-width: 760px) {
      .global-search-suggestions {
        position: fixed;
        top: 72px;
        right: 12px;
        left: 12px;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}
