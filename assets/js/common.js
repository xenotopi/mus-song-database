import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.7.0";

import {
  buildSingerUrl
} from "./singer-links.js?v=4.8.0";

const SITE_METADATA = Object.freeze({
  version:
    "Web v4.8.0"
});

/**
 * v4.7 STEP13-B
 * Global Search Alias UX
 */


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
            <span class="brand-lockup">
              <span class="brand-mu">μ</span>
              <span class="brand-copy">
                <b class="brand-rest">'s Song Database</b>
                <small>μ's歌唱履歴データベース</small>
              </span>
            </span>
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
                aria-label="曲・イベント・会場・歌唱名義を検索"
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

          <button
            class="mus-mobile-menu-button"
            id="musMobileMenuButton"
            type="button"
            aria-label="メニューを開く"
            aria-expanded="false"
            aria-controls="musMobileDrawer"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <nav
            class="nav mus-desktop-navigation"
            id="siteNavigation"
          >
            <a
              class="${active === "home" ? "active" : ""}"
              href="index.html"
            >
              ホーム
            </a>

            <a
              class="${active === "song" ? "active" : ""}"
              href="songs.html"
            >
              曲
            </a>

            <a
              class="${active === "event" ? "active" : ""}"
              href="events.html"
            >
              イベント
            </a>

            <a
              class="${active === "venue" ? "active" : ""}"
              href="venues.html"
            >
              会場
            </a>

            <a
              class="${active === "rankings" ? "active" : ""}"
              href="rankings.html"
            >
              ランキング
            </a>

            <a
              class="${active === "statistics" ? "active" : ""}"
              href="statistics.html"
            >
              統計
            </a>

            <a
              class="${active === "about" ? "active" : ""}"
              href="about.html"
            >
              About
            </a>
          </nav>
        </div>
      </header>

      <div
        class="mus-mobile-menu-overlay"
        id="musMobileMenuOverlay"
        hidden
      ></div>

      <aside
        class="mus-mobile-drawer"
        id="musMobileDrawer"
        aria-hidden="true"
        aria-label="スマホメニュー"
      >
        <div class="mus-mobile-drawer-head">
          <div>
            <b>Menu</b>
            <small>μ's Song Database</small>
          </div>

          <button
            class="mus-mobile-menu-close"
            id="musMobileMenuClose"
            type="button"
            aria-label="メニューを閉じる"
          >
            ×
          </button>
        </div>

        <nav class="mus-mobile-drawer-nav">
          <a class="${active === "home" ? "active" : ""}" href="index.html">
            <span>ホーム</span>
          </a>

          <a class="${active === "song" ? "active" : ""}" href="songs.html">
            <span>曲</span>
          </a>

          <a class="${active === "event" ? "active" : ""}" href="events.html">
            <span>イベント</span>
          </a>

          <a class="${active === "venue" ? "active" : ""}" href="venues.html">
            <span>会場</span>
          </a>

          <a class="${active === "rankings" ? "active" : ""}" href="rankings.html">
            <span>ランキング</span>
          </a>

          <a class="${active === "statistics" ? "active" : ""}" href="statistics.html">
            <span>統計</span>
          </a>

          <a class="${active === "about" ? "active" : ""}" href="about.html">
            <span>About</span>
          </a>
        </nav>
      </aside>`;
  }

  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div>
          <b>μ's Song Database</b><br>
          μ's歌唱履歴データベース
        </div>

        <div>
          © μ's Song Database Project
        </div>
      </footer>`;
  }

  document
    .querySelectorAll(
      "[data-site-version]"
    )
    .forEach(element => {
      element.textContent =
        SITE_METADATA.version;
    });

  setupGlobalSearch_();
  setupMobileNavigation_();
  setupBackToTop_();
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

    const buildAliasMeta =
      item =>
        item.matchAlias
          ? `別名「${item.matchAlias}」に一致`
          : "";

    (results.singers || [])
      .slice(0, 2)
      .forEach(
        item => {
          items.push({
            type: "歌唱名義",
            className: "singer",
            title:
              item.displayName ||
              item.singerName ||
              "歌唱名義未設定",
            meta: [
              buildAliasMeta(item),
              `曲 ${Number(item.songCount || 0)}曲`,
              `イベント ${Number(item.eventCount || 0)}件`,
            ].filter(Boolean).join("｜"),
            href:
              buildSingerUrl(item),
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
              buildAliasMeta(item),
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
              buildAliasMeta(item),
              item.date
                ? formatDate(item.date)
                : "",
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
              buildAliasMeta(item),
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
    .replace(/[’'`´]/g, "")
    .replace(/[μµ]/g, "μ")
    .replace(
      /[\u3041-\u3096]/g,
      character =>
        String.fromCharCode(
          character.charCodeAt(0) +
          0x60
        )
    )
    .replace(
      /[\s　・･／/～〜\-—_:：!！?？,.，。()（）【】［］「」『』"“”♡♥♪]+/g,
      ""
    );
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
        76px minmax(0, 1fr) auto;
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


    .mobile-nav-toggle {
      display: none;
      width: 42px;
      height: 42px;
      padding: 9px;
      flex: 0 0 auto;
      border: 1px solid #e1e4ec;
      border-radius: 12px;
      background: #fff;
      cursor: pointer;
    }

    .mobile-nav-toggle span {
      display: block;
      height: 2px;
      margin: 5px 0;
      border-radius: 999px;
      background: var(--navy);
      transition:
        transform .18s ease,
        opacity .18s ease;
    }

    .mobile-nav-toggle.active span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }

    .mobile-nav-toggle.active span:nth-child(2) {
      opacity: 0;
    }

    .mobile-nav-toggle.active span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    .back-to-top {
      position: fixed;
      z-index: 900;
      right: 22px;
      bottom: 22px;
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.4);
      border-radius: 50%;
      background: rgba(79,70,229,.94);
      color: #fff;
      box-shadow: 0 12px 30px rgba(35,31,95,.24);
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      transition: opacity .18s ease, transform .18s ease;
    }

    .back-to-top.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .back-to-top span {
      display: block;
      font-size: 20px;
      font-weight: 900;
      line-height: 1;
    }

    .back-to-top small {
      display: block;
      margin-top: -8px;
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .08em;
    }

    @media (max-width: 760px) {
      .global-search-suggestions {
        position: fixed;
        top: 72px;
        right: 12px;
        left: 12px;
      }

  
    .mobile-nav-toggle {
      display: none;
      width: 42px;
      height: 42px;
      padding: 9px;
      flex: 0 0 auto;
      border: 1px solid #e1e4ec;
      border-radius: 12px;
      background: #fff;
      cursor: pointer;
    }

    .mobile-nav-toggle span {
      display: block;
      height: 2px;
      margin: 5px 0;
      border-radius: 999px;
      background: var(--navy);
      transition:
        transform .18s ease,
        opacity .18s ease;
    }

    .mobile-nav-toggle.active span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }

    .mobile-nav-toggle.active span:nth-child(2) {
      opacity: 0;
    }

    .mobile-nav-toggle.active span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    .back-to-top {
        right: 14px;
        bottom: 14px;
        width: 48px;
        height: 48px;
      }
    }

    /* v2.6.3 スマホナビ完全修正版 */
    .mus-mobile-menu-button,
    .mus-mobile-drawer,
    .mus-mobile-menu-overlay {
      box-sizing: border-box;
    }

    .mus-mobile-menu-button {
      display: none;
      width: 46px;
      height: 46px;
      padding: 10px;
      flex: 0 0 auto;
      border: 1px solid #dfe3ec;
      border-radius: 13px;
      background: #fff;
      box-shadow: 0 6px 18px rgba(23,32,51,.08);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .mus-mobile-menu-button span {
      display: block;
      width: 100%;
      height: 2px;
      margin: 5px 0;
      border-radius: 999px;
      background: #172033;
      transition:
        transform .2s ease,
        opacity .2s ease;
    }

    .mus-mobile-menu-button.is-open span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }

    .mus-mobile-menu-button.is-open span:nth-child(2) {
      opacity: 0;
    }

    .mus-mobile-menu-button.is-open span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    .mus-mobile-menu-overlay {
      position: fixed;
      z-index: 1998;
      inset: 0;
      background: rgba(15,23,42,.42);
      opacity: 0;
      transition: opacity .2s ease;
    }

    .mus-mobile-menu-overlay.is-open {
      opacity: 1;
    }

    .mus-mobile-drawer {
      position: fixed;
      z-index: 1999;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(84vw, 320px);
      padding: max(18px, env(safe-area-inset-top)) 16px
        max(18px, env(safe-area-inset-bottom));
      overflow-y: auto;
      background: #fff;
      box-shadow: -16px 0 44px rgba(15,23,42,.2);
      transform: translateX(105%);
      transition: transform .22s ease;
      visibility: hidden;
    }

    .mus-mobile-drawer.is-open {
      transform: translateX(0);
      visibility: visible;
    }

    .mus-mobile-drawer-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 3px 2px 16px;
      border-bottom: 1px solid #e7e9ef;
    }

    .mus-mobile-drawer-head b,
    .mus-mobile-drawer-head small {
      display: block;
    }

    .mus-mobile-drawer-head b {
      color: #172033;
      font-size: 20px;
    }

    .mus-mobile-drawer-head small {
      margin-top: 3px;
      color: #7b8498;
      font-size: 11px;
    }

    .mus-mobile-menu-close {
      width: 42px;
      height: 42px;
      border: 0;
      border-radius: 50%;
      background: #f2f3f7;
      color: #172033;
      font-size: 25px;
      line-height: 1;
      cursor: pointer;
    }

    .mus-mobile-drawer-nav {
      margin-top: 16px;
      display: grid;
      gap: 8px;
    }

    .mus-mobile-drawer-nav a {
      min-height: 50px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      border: 1px solid #e7e9ef;
      border-radius: 14px;
      background: #fff;
      color: #172033;
      font-size: 14px;
      font-weight: 900;
      text-decoration: none;
    }

    .mus-mobile-drawer-nav a.active {
      border-color: #c8c4fb;
      background: #f2f0ff;
      color: #4f46e5;
    }

    html.mus-menu-lock,
    html.mus-menu-lock body {
      overflow: hidden !important;
      overscroll-behavior: none;
    }

    @media (max-width: 820px) {
      .site-header {
        overflow: visible !important;
      }

      .site-header .header-inner {
        position: relative !important;
        display: grid !important;
        grid-template-columns:
          minmax(0, 1fr) 46px !important;
        gap: 10px 12px !important;
        align-items: center !important;
      }

      .site-header .brand {
        grid-column: 1 !important;
        grid-row: 1 !important;
        min-width: 0 !important;
      }

      .site-header .mus-mobile-menu-button {
        display: block !important;
        grid-column: 2 !important;
        grid-row: 1 !important;
        align-self: center !important;
        justify-self: end !important;
      }

      .site-header .global-search-wrap {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
        width: 100% !important;
        min-width: 0 !important;
      }

      .site-header .mus-desktop-navigation {
        display: none !important;
      }

      .global-search-suggestions {
        position: fixed !important;
        z-index: 2001 !important;
        top: 134px !important;
        right: 12px !important;
        left: 12px !important;
      }
    }

    @media (min-width: 821px) {
      .mus-mobile-drawer,
      .mus-mobile-menu-overlay {
        display: none !important;
      }
    }

  `;

  document.head.appendChild(
    style
  );
}



/**
 * スマホ用のハンバーガーメニュー。
 */
function setupMobileNavigation_() {
  const button =
    document.getElementById(
      "musMobileMenuButton"
    );

  const closeButton =
    document.getElementById(
      "musMobileMenuClose"
    );

  const drawer =
    document.getElementById(
      "musMobileDrawer"
    );

  const overlay =
    document.getElementById(
      "musMobileMenuOverlay"
    );

  if (
    !button ||
    !closeButton ||
    !drawer ||
    !overlay
  ) {
    return;
  }

  const isOpen = () =>
    drawer.classList.contains(
      "is-open"
    );

  const openMenu = () => {
    overlay.hidden = false;

    window.requestAnimationFrame(
      () => {
        overlay.classList.add(
          "is-open"
        );

        drawer.classList.add(
          "is-open"
        );
      }
    );

    drawer.setAttribute(
      "aria-hidden",
      "false"
    );

    button.setAttribute(
      "aria-expanded",
      "true"
    );

    button.setAttribute(
      "aria-label",
      "メニューを閉じる"
    );

    button.classList.add(
      "is-open"
    );

    document.documentElement
      .classList.add(
        "mus-menu-lock"
      );

    closeButton.focus();
  };

  const closeMenu = (
    restoreFocus = false
  ) => {
    overlay.classList.remove(
      "is-open"
    );

    drawer.classList.remove(
      "is-open"
    );

    drawer.setAttribute(
      "aria-hidden",
      "true"
    );

    button.setAttribute(
      "aria-expanded",
      "false"
    );

    button.setAttribute(
      "aria-label",
      "メニューを開く"
    );

    button.classList.remove(
      "is-open"
    );

    document.documentElement
      .classList.remove(
        "mus-menu-lock"
      );

    window.setTimeout(
      () => {
        if (!isOpen()) {
          overlay.hidden = true;
        }
      },
      220
    );

    if (restoreFocus) {
      button.focus();
    }
  };

  button.addEventListener(
    "click",
    () => {
      if (isOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  );

  closeButton.addEventListener(
    "click",
    () => closeMenu(true)
  );

  overlay.addEventListener(
    "click",
    () => closeMenu(true)
  );

  drawer
    .querySelectorAll("a")
    .forEach(link => {
      link.addEventListener(
        "click",
        () => closeMenu()
      );
    });

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        isOpen()
      ) {
        closeMenu(true);
      }
    }
  );

  window.addEventListener(
    "resize",
    () => {
      if (
        window.innerWidth > 820 &&
        isOpen()
      ) {
        closeMenu();
      }
    }
  );
}


/**
 * 長い詳細ページ向けの「ページ上部へ」ボタン。
 */
function setupBackToTop_() {
  if (document.getElementById("backToTopButton")) {
    return;
  }

  const button = document.createElement("button");

  button.id = "backToTopButton";
  button.className = "back-to-top";
  button.type = "button";
  button.setAttribute("aria-label", "ページ上部へ戻る");
  button.innerHTML = `
    <span aria-hidden="true">↑</span>
    <small>TOP</small>`;

  document.body.appendChild(button);

  const updateVisibility = () => {
    button.classList.toggle(
      "visible",
      window.scrollY > 520
    );
  };

  button.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  window.addEventListener(
    "scroll",
    updateVisibility,
    { passive: true }
  );

  updateVisibility();
}
