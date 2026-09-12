/**
 * μ's Song Database
 * SEO / UX Metadata v3.5.1
 *
 * Static HTML owns description, OGP, and Twitter Card metadata.
 * This browser-only helper validates detail routes, adds a self-referencing
 * canonical URL after a successful render, and normalizes the tab title.
 */

(() => {
  "use strict";

  const SITE_NAME = "μ's Song Database";
  const SITE_ROOT = "https://xenotopi.github.io/mus-song-database/";
  const DETAIL_PAGES = {
    "song.html": {
      idPattern: /^S\d+$/,
      titleSelector: "#songTitle, main h1",
      initiallyIndexable: true
    },
    "release.html": {
      idPattern: /^R\d{4}$/,
      titleSelector: "#releaseName, main h1",
      initiallyIndexable: true
    },
    "event.html": {
      idPattern: /^EV\d+$/,
      titleSelector: "#eventTitle, main h1"
    },
    "venue.html": {
      idPattern: /^VE\d+$/,
      titleSelector: "#venueName, #venueTitle, main h1"
    },
    "singer.html": {
      idPattern: /^SN\d+$/,
      titleSelector: "#singerName, main h1"
    }
  };

  const pageName = location.pathname.split("/").pop() || "index.html";
  const pageConfig = DETAIL_PAGES[pageName];
  let updateTimer = null;
  let lastSignature = "";

  if (!pageConfig) {
    return;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getRenderedState() {
    const element = document.querySelector(pageConfig.titleSelector);
    const title = cleanText(element?.textContent);

    if (!title || /読み込み中/.test(title)) return { state: "loading", title: "" };
    if (/取得できません|見つかりません|エラー|未設定/.test(title)) return { state: "error", title: "" };
    if (/^(曲|イベント|会場|歌唱名義|リリース)詳細$/.test(title)) return { state: "loading", title: "" };

    return { state: "ready", title };
  }

  function removeDynamicCanonical() {
    document.head
      .querySelector('link[rel="canonical"][data-seo-dynamic="true"]')
      ?.remove();
    lastSignature = "";
  }

  function setRobots(content) {
    const robots = document.head.querySelector('meta[name="robots"]');

    if (robots && robots.content !== content) {
      robots.content = content;
    }
  }

  function setDynamicCanonical(id) {
    let canonical = document.head.querySelector('link[rel="canonical"]');

    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      canonical.dataset.seoDynamic = "true";
      document.head.appendChild(canonical);
    }

    const url = new URL(pageName, SITE_ROOT);
    url.searchParams.set("id", id);
    canonical.href = url.toString();
  }

  function updateDetailMetadata() {
    const id = cleanText(new URLSearchParams(location.search).get("id"));
    const rendered = getRenderedState();

    if (!pageConfig.idPattern.test(id) || rendered.state === "error") {
      removeDynamicCanonical();
      setRobots("noindex,follow");
      return;
    }

    if (rendered.state === "loading") {
      removeDynamicCanonical();
      if (!pageConfig.initiallyIndexable) setRobots("noindex,follow");
      return;
    }

    const renderedTitle = rendered.title;

    const signature = `${pageName}|${id}|${renderedTitle}`;

    if (signature === lastSignature) {
      return;
    }

    document.title = `${renderedTitle}｜${SITE_NAME}`;
    setDynamicCanonical(id);
    setRobots("index,follow,max-image-preview:large");
    lastSignature = signature;
  }

  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updateDetailMetadata, 40);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleUpdate, { once: true });
  } else {
    scheduleUpdate();
  }

  window.addEventListener("popstate", scheduleUpdate);

  new MutationObserver(scheduleUpdate).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
