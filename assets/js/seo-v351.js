/**
 * μ's Song Database
 * SEO / UX Metadata v3.5.1
 *
 * GitHub Pages上の実URL（*.html?id=...）を正規URLとして使用します。
 * 詳細データ表示後に、title・description・OGP・Twitter Cardを更新します。
 */

(() => {
  "use strict";

  const SITE_NAME = "μ's Song Database";
  const SITE_ROOT =
    "https://xenotopi.github.io/mus-song-database/";
  const DEFAULT_OG_IMAGE =
    SITE_ROOT + "assets/images/og-default.png";

  const pageName =
    location.pathname.split("/").pop() ||
    "index.html";

  const params =
    new URLSearchParams(location.search);

  let lastSignature = "";
  let updateTimer = null;


  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }


  function truncate(value, maxLength = 150) {
    const text = cleanText(value);

    return text.length > maxLength
      ? text.slice(0, maxLength - 1) + "…"
      : text;
  }


  function getOrCreateMeta(attribute, name) {
    let element =
      document.head.querySelector(
        `meta[${attribute}="${CSS.escape(name)}"]`
      );

    if (!element) {
      element =
        document.createElement("meta");

      element.setAttribute(
        attribute,
        name
      );

      document.head.appendChild(
        element
      );
    }

    return element;
  }


  function setMetaName(name, content) {
    const element =
      getOrCreateMeta(
        "name",
        name
      );

    element.setAttribute(
      "content",
      content
    );
  }


  function setMetaProperty(property, content) {
    const element =
      getOrCreateMeta(
        "property",
        property
      );

    element.setAttribute(
      "content",
      content
    );
  }


  function getOrCreateCanonical() {
    let element =
      document.head.querySelector(
        'link[rel="canonical"]'
      );

    if (!element) {
      element =
        document.createElement("link");

      element.rel =
        "canonical";

      document.head.appendChild(
        element
      );
    }

    return element;
  }


  function buildCanonicalUrl() {
    const url =
      new URL(
        location.href
      );

    url.hash = "";

    [
      "build",
      "_t",
      "callback"
    ].forEach(key =>
      url.searchParams.delete(key)
    );

    if (pageName === "index.html") {
      url.pathname =
        "/mus-song-database/";

      url.search = "";
    }

    return url.toString();
  }


  function findHeroTitle() {
    const selectors = [
      ".hero h1",
      "[data-page-title]",
      "main h1"
    ];

    for (const selector of selectors) {
      const element =
        document.querySelector(
          selector
        );

      const text =
        cleanText(
          element?.textContent
        );

      if (
        text &&
        ![
          "読み込み中…",
          "会場データを表示できません",
          "イベントデータを表示できません",
          "曲データを表示できません"
        ].includes(text)
      ) {
        return text;
      }
    }

    return "";
  }


  function getSearchQuery() {
    const input =
      document.querySelector(
        '#searchInput, input[type="search"]'
      );

    return cleanText(
      params.get("q") ||
      input?.value ||
      ""
    );
  }


  function buildMetadata() {
    const entityName =
      findHeroTitle();

    const canonical =
      buildCanonicalUrl();

    switch (pageName) {
      case "song.html":
        if (!entityName) {
          return null;
        }

        return {
          title:
            `${entityName} | ${SITE_NAME}`,

          description:
            truncate(
              `「${entityName}」の歌唱回数、初披露日、最終披露日、歌唱イベント、会場、ランキングなどを掲載しています。`
            ),

          type:
            "article",

          canonical
        };

      case "event.html":
        if (!entityName) {
          return null;
        }

        return {
          title:
            `${entityName} | ${SITE_NAME}`,

          description:
            truncate(
              `「${entityName}」で披露された楽曲、出演名義、会場、歌唱統計を掲載しています。`
            ),

          type:
            "article",

          canonical
        };

      case "venue.html":
        if (!entityName) {
          return null;
        }

        return {
          title:
            `${entityName} | ${SITE_NAME}`,

          description:
            truncate(
              `「${entityName}」で開催されたμ's関連イベント、披露曲、利用統計を掲載しています。`
            ),

          type:
            "article",

          canonical
        };

      case "search.html": {
        const query =
          getSearchQuery();

        return {
          title:
            query
              ? `「${query}」の検索結果 | ${SITE_NAME}`
              : `検索結果 | ${SITE_NAME}`,

          description:
            query
              ? truncate(
                  `「${query}」に一致するμ'sの曲・イベント・会場・歌唱名義を横断して表示します。`
                )
              : "μ'sの曲・イベント・会場・歌唱名義を横断して検索できます。",

          type:
            "website",

          canonical
        };
      }

      case "rankings.html":
        return {
          title:
            `ランキング | ${SITE_NAME}`,

          description:
            "曲・イベント・会場・歌唱名義を、さまざまな条件でランキング表示できます。",

          type:
            "website",

          canonical
        };

      case "statistics.html":
        return {
          title:
            `統計 | ${SITE_NAME}`,

          description:
            "μ'sの歌唱履歴を年別・公式・ソロ別など、さまざまな視点から分析できます。",

          type:
            "website",

          canonical
        };

      case "about.html":
        return {
          title:
            `About | ${SITE_NAME}`,

          description:
            "μ's Song Databaseの概要、データの集計方針、サイトについて紹介しています。",

          type:
            "website",

          canonical
        };

      case "404.html":
        return {
          title:
            `ページが見つかりません | ${SITE_NAME}`,

          description:
            "お探しのページは見つかりませんでした。μ's Song Databaseから歴史を検索できます。",

          type:
            "website",

          canonical
        };

      default:
        return {
          title:
            SITE_NAME,

          description:
            "μ'sの楽曲・イベント・会場を横断し、歌唱履歴を検索・分析できるデータベースです。",

          type:
            "website",

          canonical
        };
    }
  }


  function applyMetadata() {
    const metadata =
      buildMetadata();

    if (!metadata) {
      return;
    }

    const signature =
      JSON.stringify(
        metadata
      );

    if (
      signature ===
      lastSignature
    ) {
      return;
    }

    lastSignature =
      signature;

    document.title =
      metadata.title;

    setMetaName(
      "description",
      metadata.description
    );

    setMetaName(
      "robots",
      pageName === "404.html"
        ? "noindex,follow"
        : "index,follow,max-image-preview:large"
    );

    setMetaProperty(
      "og:site_name",
      SITE_NAME
    );

    setMetaProperty(
      "og:title",
      metadata.title
    );

    setMetaProperty(
      "og:description",
      metadata.description
    );

    setMetaProperty(
      "og:type",
      metadata.type
    );

    setMetaProperty(
      "og:url",
      metadata.canonical
    );

    setMetaProperty(
      "og:image",
      DEFAULT_OG_IMAGE
    );

    setMetaName(
      "twitter:card",
      "summary_large_image"
    );

    setMetaName(
      "twitter:title",
      metadata.title
    );

    setMetaName(
      "twitter:description",
      metadata.description
    );

    setMetaName(
      "twitter:image",
      DEFAULT_OG_IMAGE
    );

    getOrCreateCanonical().href =
      metadata.canonical;
  }


  function updateFooter() {
    const footer =
      document.querySelector(
        "#siteFooter .site-footer"
      );

    if (!footer) {
      return;
    }

    const current =
      cleanText(
        footer.textContent
      );

    if (
      current.includes(
        ""
      )
    ) {
      return;
    }

    footer.innerHTML = `
      <div>
        <b>μ's Song Database</b><br>
        <span>μ's歌唱履歴データベース</span>
      </div>

      <div>
  <span>© μ's Song Database Project</span>
</div>
    `;
  }


  function scheduleUpdate() {
    clearTimeout(
      updateTimer
    );

    updateTimer =
      window.setTimeout(
        () => {
          applyMetadata();
          updateFooter();
        },
        80
      );
  }


  document.addEventListener(
    "DOMContentLoaded",
    scheduleUpdate
  );

  window.addEventListener(
    "popstate",
    scheduleUpdate
  );

  const observer =
    new MutationObserver(
      scheduleUpdate
    );

  observer.observe(
    document.documentElement,
    {
      childList:
        true,

      subtree:
        true,

      characterData:
        true
    }
  );

  scheduleUpdate();
})();
