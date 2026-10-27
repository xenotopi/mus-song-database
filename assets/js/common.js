import { singerDisplayName } from "./singer-display.js?v=1.0.0";
import './icons.js?v=2';
import { randomDetailUrl } from "./static-detail.js?v=1.4.0";
import { buildSongUrl,
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.9.6&cache=revision-nonblocking&songUrls=1";

import {
  buildSingerUrl
} from "./singer-links.js?v=4.8.0";

import {
  initializeAnalytics
} from "./analytics.js?v=1.2.0";

const SITE_METADATA = Object.freeze({
  version:
    "Web v4.9.0"
});
// One boundary for header layout, drawer availability, and resize closing.
const HEADER_MOBILE_MAX = 1080;
const HEADER_NAV_GROUPS = [
  { key: "history", label: "歌唱履歴", sections: [{ label: "", links: [
    ["song", "曲", "songs.html"], ["event", "イベント", "events.html"], ["venue", "会場", "venues.html"], ["singer", "歌唱名義", "singers.html"]
  ] }] },
  { key: "data", label: "分析・資料", sections: [
    { label: "集計・分析", links: [["rankings", "ランキング", "rankings.html"], ["statistics", "統計", "statistics.html"], ["member-analytics", "メンバー別歌唱記録", "member-analytics.html"]] },
    { label: "資料", links: [["release", "リリース", "releases.html"], ["kamipara", "神パラ × μ's ダッシュボード", "kamipara.html"]] }
  ] },
  { key: "tools", label: "ツール", sections: [{ label: "", links: [
    ["gap-checker", "いつ振り歌唱チェッカー", "gap-checker.html"], ["gap-rankings", "歌唱ブランクランキング", "gap-rankings.html"]
  ] }] }
];

function headerNavigation_(active, mobile = false) {
  const scope = mobile ? "mobile" : "desktop";
  const link = ([key, label, href], panel = false) => `<a class="${active === key ? "active" : ""}" href="${href}"${active === key ? ` aria-current="${location.pathname.endsWith('/' + href) ? 'page' : 'location'}"` : ""}>${panel ? `<span class="header-nav-link-label">${label}</span><span class="site-icon-inline header-nav-link-arrow" data-site-icon="chevron-right" aria-hidden="true"></span>` : label}</a>`;
  return link(["home", "ホーム", "index.html"]) + HEADER_NAV_GROUPS.map(group => {
    const selected = group.sections.some(section => section.links.some(([key]) => key === active));
    const id = `header-${scope}-${group.key}`;
    return `<div class="header-nav-group" data-header-nav-group="${group.key}">
      <button class="header-nav-trigger${selected ? " active" : ""}" type="button" aria-expanded="false" aria-controls="${id}" id="${id}-trigger">${group.label}<span class="site-icon-inline header-nav-chevron" data-site-icon="chevron-down" aria-hidden="true"></span></button>
      <div class="header-nav-panel header-nav-panel-${group.key}" id="${id}" aria-labelledby="${id}-trigger" hidden>${group.sections.map(section => `<div class="header-nav-section">${section.label ? `<h3>${section.label}</h3>` : ""}${section.links.map(item => link(item, true)).join("")}</div>`).join("")}</div>
    </div>`;
  }).join("") + link(["about", "About", "about.html"]);
}

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
  initializeAnalytics();
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
    active ||= ({ "member-analytics.html": "member-analytics", "gap-checker.html": "gap-checker", "gap-rankings.html": "gap-rankings", "kamipara.html": "kamipara" })[location.pathname.split("/").pop()] || "";
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
              <span><span class="site-icon-inline " data-site-icon="search" aria-hidden="true"></span></span>

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
            ${headerNavigation_(active)}
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
          ${headerNavigation_(active, true)}
        </nav>
      </aside>`;
  }

  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div class="site-footer-main">
          <div class="footer-brand">
            <a class="brand-lockup" href="index.html"><span class="brand-mu">μ</span><span class="brand-copy"><b class="brand-rest">'s Song Database</b><small>μ's歌唱履歴データベース</small></span></a>
            <p>楽曲と歌唱記録から、μ'sの歩んだ足跡を巡る。</p>
          </div>
          <nav class="footer-links" aria-label="フッターの主要ページ">
            <div><h2>歌唱履歴</h2><a href="songs.html">曲一覧</a><a href="events.html">イベント一覧</a><a href="venues.html">会場一覧</a><a href="singers.html">歌唱名義</a></div>
            <div><h2>もっと探す</h2><a href="releases.html">リリース</a><a href="rankings.html">ランキング</a><a href="statistics.html">統計</a><a href="gap-checker.html">いつ振り歌唱チェッカー</a><a href="gap-rankings.html">歌唱ブランクランキング</a><a href="about.html">About</a></div>
          </nav>
        <div class="footer-feedback-area"><div><h2>情報の訂正・追加のお願い</h2><p>記録の間違いや不足に気づいたら、お知らせください。</p></div><a class="footer-feedback" href="https://docs.google.com/forms/d/e/1FAIpQLSdTfw1VIig4-xEkp7v8pq58RMPALgX6mliUXkxEkC31PHXbVA/viewform?usp=publish-editor" target="_blank" rel="noopener noreferrer external">情報提供フォーム<span class="site-icon-inline" data-site-icon="external-link" aria-hidden="true"></span></a></div>
        </div>
        <section class="footer-explore" aria-labelledby="footerExploreTitle">
          <h2 id="footerExploreTitle">もう少し、μ'sの足跡を巡る。</h2>
          <div class="footer-cards">
            <button class="footer-card" type="button" data-footer-random="song"><span class="site-icon-inline" data-site-icon="music-2" aria-hidden="true"></span><span>ランダムに1曲</span></button>
            <button class="footer-card" type="button" data-footer-random="event"><span class="site-icon-inline" data-site-icon="calendar-days" aria-hidden="true"></span><span>ランダムに<wbr><span class="footer-nowrap">1イベント</span></span></button>
            <a class="footer-card" href="index.html#topSection"><span class="site-icon-inline" data-site-icon="history" aria-hidden="true"></span><span>今日は何の日</span></a>
          </div>
          <p class="footer-status" role="status" aria-live="polite" hidden></p>
        </section>
        <div class="footer-bottom"><small>© μ's Song Database Project</small></div>
        <div class="muse-line footer-muse-line" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
      </footer>`;
    footer.querySelectorAll('[data-footer-random]').forEach(button => {
      button.addEventListener('click', async () => {
        const status = footer.querySelector('.footer-status');
        button.disabled = true;
        status.hidden = false;
        status.textContent = '記録を選んでいます…';
        try {
          const href = await randomDetailUrl(button.dataset.footerRandom);
          location.assign(new URL(href, document.baseURI).href);
        } catch {
          status.textContent = '記録を取得できませんでした。もう一度お試しください。';
        } finally {
          button.disabled = false;
        }
      });
    });
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
  setupHeaderNavigation_();
  setupBackToTop_();
  observeHeaderSearchPosition_();
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

  document.addEventListener("musdb:navigation-open", () => {
    window.clearTimeout(timer);
    requestId += 1; // A late search response must not reopen over navigation.
    closeSuggestions();
  });

  function openSuggestions() {
    document.dispatchEvent(new Event("musdb:search-open"));
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

    window.MusDbAnalytics?.trackEvent(
      "search_submit",
      {
        search_source: "header"
      }
    );
    window.MusDbAnalytics?.rememberSearchSource(
      "header"
    );

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
              singerDisplayName(item, item.displayName || item.singerName || "歌唱名義未設定"),
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
              buildSongUrl(
                item.songId
              ),
          });
        }
      );

    (results.releases || [])
      .slice(0, 1)
      .forEach(
        item => {
          items.push({
            type: "リリース",
            className: "release",
            title:
              item.releaseName ||
              "リリース名未設定",
            meta: [
              buildAliasMeta(item),
              item.releaseDate
                ? formatDate(item.releaseDate)
                : "発売日未登録",
              item.releaseType ||
                item.classification,
            ].filter(Boolean).join("｜"),
            href:
              `release/${encodeURIComponent(
                item.releaseId
              )}.html`,
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
              <span class="site-icon-inline " data-site-icon="chevron-right" aria-hidden="true"></span>
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
            timeoutMs: 15000,
            retryCount: 1,
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
  // Formal HTML may contain an older captured stylesheet. Refresh that node
  // in place rather than retaining stale layout rules or adding a second one.
  const style =
    document.getElementById("globalSearchEnhancementStyles") || document.createElement("style");

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

    .global-suggest-type.release {
      background: #eef2ff;
      color: #4338ca;
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
      font-size: 14px;font-weight:500;
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

    @media (max-width: ${HEADER_MOBILE_MAX}px) {
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
        top: var(--mus-search-suggestions-top, 134px) !important;
        right: 12px !important;
        left: 12px !important;
      }
    }

    @media (min-width: ${HEADER_MOBILE_MAX + 1}px) {
      .mus-mobile-drawer,
      .mus-mobile-menu-overlay {
        display: none !important;
      }
    }

  `;

  if (!style.isConnected) document.head.appendChild(style);
}

function observeHeaderSearchPosition_() {
  const header = document.querySelector(".site-header");
  if (header && !header.dataset.searchPositionObserved) {
    header.dataset.searchPositionObserved = "true";
    // backdrop-filter makes this header the fixed popup's containing block.
    // Use its height, not viewport bottom (which changes when the page scrolls).
    const update = () => header.style.setProperty("--mus-search-suggestions-top", `${header.getBoundingClientRect().height + 8}px`);
    if (window.ResizeObserver) new ResizeObserver(update).observe(header);
    window.addEventListener("resize", update, { passive: true });
    update();
  }
}

// Disclosure navigation, not an application menu: native links and Tab order
// remain available, with explicit buttons controlling each group.
function setupHeaderNavigation_() {
  const desktop = document.getElementById("siteNavigation");
  const drawer = document.getElementById("musMobileDrawer");
  const groups = [...document.querySelectorAll("#siteHeader .header-nav-group")];
  const button = group => group.querySelector(".header-nav-trigger");
  const set = (group, open) => {
    button(group).setAttribute("aria-expanded", String(open));
    const panel = group.querySelector(".header-nav-panel");
    panel.hidden = !open;
    if (!open) panel.style.removeProperty("left");
  };
  const close = root => groups.filter(group => root?.contains(group)).forEach(group => set(group, false));
  const open = group => {
    close(desktop?.contains(group) ? desktop : drawer);
    document.dispatchEvent(new Event("musdb:navigation-open"));
    set(group, true);
    if (desktop?.contains(group)) {
      const panel = group.querySelector(".header-nav-panel"), trigger = button(group).getBoundingClientRect();
      panel.style.left = "0px";
      const rect = panel.getBoundingClientRect(), edge = document.documentElement.clientWidth - 12;
      // Prefer the button's left edge; align its right edge near the viewport
      // edge. Adjust layout position (not transform) to avoid scroll overflow.
      let offset = rect.right > edge ? trigger.right - rect.right : 0;
      if (rect.left + offset < 12) offset = 12 - rect.left;
      panel.style.left = `${offset}px`;
    }
  };
  for (const group of groups) {
    const trigger = button(group);
    trigger.addEventListener("click", () => trigger.getAttribute("aria-expanded") === "true" ? set(group, false) : open(group));
    group.addEventListener("keydown", event => {
      if (!desktop?.contains(group)) return; // Existing drawer Escape closes it.
      if (event.key === "ArrowDown" && event.target === trigger) {
        event.preventDefault(); open(group); group.querySelector(".header-nav-panel a")?.focus();
      }
      if (event.key === "Escape" && trigger.getAttribute("aria-expanded") === "true") {
        event.preventDefault(); event.stopPropagation(); set(group, false); trigger.focus();
      }
    });
  }
  document.addEventListener("click", event => {
    if (!groups.some(group => desktop?.contains(group) && group.contains(event.target))) close(desktop);
  });
  // Native Tab/pointer focusout can briefly expose BODY before the destination
  // receives focus. Closing there hides the destination and cancels the click.
  document.addEventListener("focusin", event => {
    if (!desktop?.contains(event.target)) close(desktop);
  });
  document.getElementById("globalSearchInput")?.addEventListener("focus", () => { close(desktop); close(drawer); });
  document.addEventListener("musdb:search-open", () => { close(desktop); close(drawer); });
  drawer?.addEventListener("musdb:drawer-close", () => close(drawer));
  window.addEventListener("resize", () => { close(desktop); close(drawer); });
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
    document.dispatchEvent(new Event("musdb:navigation-open"));
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
    drawer.dispatchEvent(new Event("musdb:drawer-close"));
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

  document.getElementById("globalSearchInput")?.addEventListener("focus", () => { if (isOpen()) closeMenu(); });
  document.addEventListener("musdb:search-open", () => { if (isOpen()) closeMenu(); });

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
        window.innerWidth > HEADER_MOBILE_MAX &&
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
    <span aria-hidden="true"><span class="site-icon-inline " data-site-icon="arrow-up" aria-hidden="true"></span></span>
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
