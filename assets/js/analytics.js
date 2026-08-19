const MEASUREMENT_ID = "G-X7SBH5FYYF";
const CONSENT_KEY = "musdb_analytics_consent";
const SEARCH_SOURCE_KEY = "musdb_analytics_search_source";
const SCRIPT_ID = "musdb-ga4-script";
const STYLE_ID = "musdb-analytics-consent-style";
const PANEL_ID = "musdb-analytics-consent";

const VALID_CONSENTS = new Set(["accepted", "rejected"]);
const VALID_SEARCH_SOURCES = new Set(["header", "home", "search_page"]);
const EVENT_PARAMS = Object.freeze({
  view_detail: ["content_type", "item_id", "item_name", "content_category"],
  search_submit: ["search_source"],
  search_result: ["search_source", "result_count", "result_category", "is_zero_result"],
  trivia_draw: ["trivia_id", "rarity", "draw_type"],
  trivia_related_click: ["trivia_id", "rarity", "related_type", "related_id"],
  unperformed_click: ["navigation_source", "filter_type", "filter_value"],
  gap_check: ["song_id", "scope", "mode", "has_history", "is_top10", "is_long_gap"],
  gap_share: ["song_id", "scope", "mode", "share_method", "has_history", "is_top10", "is_long_gap"]
});

const sentOnce = new Set();
let analyticsInitialized = false;
let interfaceInitialized = false;
let panelMode = "initial";
let restoreFocusTo = null;
let memorySearchSource = null;

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_error) {
    return false;
  }
}

function getConsent() {
  const value = readStorage(CONSENT_KEY);
  return VALID_CONSENTS.has(value) ? value : "unset";
}

function addConsentStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("../css/analytics-consent.css?v=1.0.0", import.meta.url).href;
  document.head.append(link);
}

function createPanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) {
    return panel;
  }

  panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = "musdb-consent";
  panel.hidden = true;
  document.body.append(panel);
  return panel;
}

function consentStatusText(consent = getConsent()) {
  if (consent === "accepted") {
    return "アクセス解析を許可しています";
  }
  if (consent === "rejected") {
    return "アクセス解析を許可していません";
  }
  return "まだ選択されていません";
}

function updateStatusLabels() {
  document
    .querySelectorAll("[data-musdb-analytics-consent-status]")
    .forEach(element => {
      element.textContent = consentStatusText();
    });
}

function closePanel({ restoreFocus = false } = {}) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) {
    return;
  }

  panel.hidden = true;
  panel.innerHTML = "";
  document.body.classList.remove("musdb-consent-visible");

  if (restoreFocus && restoreFocusTo instanceof HTMLElement) {
    restoreFocusTo.focus();
  }
  restoreFocusTo = null;
}

function renderInitialPanel() {
  const panel = createPanel();
  panelMode = "initial";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "アクセス解析の同意");
  panel.removeAttribute("aria-modal");
  panel.innerHTML = `
    <div class="musdb-consent__inner">
      <div class="musdb-consent__copy">
        <h2>アクセス解析について</h2>
        <p>当サイトでは、サイトの利用状況を把握し、今後の改善に役立てるためGoogle Analyticsを使用しています。</p>
        <p>同意した場合のみアクセス解析を有効にします。検索欄に入力した文字列は、独自のアクセス解析イベントとして送信しません。</p>
        <a href="about.html#analytics-privacy">詳しく見る</a>
      </div>
      <div class="musdb-consent__actions">
        <button type="button" data-musdb-consent="accepted">同意する</button>
        <button type="button" data-musdb-consent="rejected">同意しない</button>
      </div>
    </div>`;
  panel.hidden = false;
  document.body.classList.add("musdb-consent-visible");
}

function renderSettingsPanel() {
  const panel = createPanel();
  const consent = getConsent();
  panelMode = "settings";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "musdbConsentSettingsTitle");

  const actions = consent === "accepted"
    ? `<button type="button" data-musdb-consent="rejected">許可しない</button>`
    : consent === "rejected"
      ? `<button type="button" data-musdb-consent="accepted">許可する</button>`
      : `
          <button type="button" data-musdb-consent="accepted">同意する</button>
          <button type="button" data-musdb-consent="rejected">同意しない</button>`;

  panel.innerHTML = `
    <div class="musdb-consent__inner musdb-consent__inner--settings">
      <div class="musdb-consent__copy">
        <h2 id="musdbConsentSettingsTitle">アクセス解析の設定</h2>
        <p>現在：<strong>${consentStatusText(consent)}</strong></p>
        <p>同意した場合のみGoogle Analyticsを読み込みます。</p>
      </div>
      <div class="musdb-consent__actions">
        ${actions}
        <button type="button" class="musdb-consent__close" data-musdb-consent-close>閉じる</button>
      </div>
    </div>`;
  panel.hidden = false;
  document.body.classList.add("musdb-consent-visible");
  panel.querySelector("button")?.focus();
}

function openConsentSettings(trigger = document.activeElement) {
  restoreFocusTo = trigger instanceof HTMLElement ? trigger : null;
  renderSettingsPanel();
}

function deleteSiteAnalyticsCookies() {
  const cookieNames = ["_ga", `_ga_${MEASUREMENT_ID.replace(/^G-/, "")}`];
  const basePath = "/mus-song-database";

  cookieNames.forEach(name => {
    document.cookie = `${name}=; Max-Age=0; Path=${basePath}; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=${basePath}/; SameSite=Lax`;
  });
}

function initializeGa4() {
  if (analyticsInitialized || getConsent() !== "accepted") {
    return false;
  }

  analyticsInitialized = true;
  window[`ga-disable-${MEASUREMENT_ID}`] = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_path: "/mus-song-database",
    send_page_view: true
  });

  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.append(script);
  }

  return true;
}

function sanitizeParams(eventName, params = {}) {
  const allowedKeys = EVENT_PARAMS[eventName];
  if (!allowedKeys) {
    return null;
  }

  return allowedKeys.reduce((safe, key) => {
    const value = params[key];
    if (value === undefined || value === null || value === "") {
      return safe;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === "boolean") {
      safe[key] = value ? 1 : 0;
    } else {
      safe[key] = String(value).slice(0, 100);
    }
    return safe;
  }, {});
}

function trackEvent(eventName, params = {}) {
  if (getConsent() !== "accepted" || !analyticsInitialized || typeof window.gtag !== "function") {
    return false;
  }

  const safeParams = sanitizeParams(eventName, params);
  if (!safeParams) {
    return false;
  }

  window.gtag("event", eventName, safeParams);
  return true;
}

function trackOnce(key, eventName, params = {}) {
  const safeKey = String(key || "");
  if (!safeKey || sentOnce.has(safeKey)) {
    return false;
  }

  if (!trackEvent(eventName, params)) {
    return false;
  }

  sentOnce.add(safeKey);
  return true;
}

function rememberSearchSource(source) {
  if (!VALID_SEARCH_SOURCES.has(source)) {
    return;
  }
  memorySearchSource = source;
  try {
    sessionStorage.setItem(SEARCH_SOURCE_KEY, source);
  } catch (_error) {
    // sessionStorageが利用できない場合はページ内メモリだけを使用する。
  }
}

function consumeSearchSource() {
  let source = memorySearchSource;
  try {
    source = sessionStorage.getItem(SEARCH_SOURCE_KEY) || source;
    sessionStorage.removeItem(SEARCH_SOURCE_KEY);
  } catch (_error) {
    // sessionStorageが利用できない場合はページ内メモリだけを使用する。
  }
  memorySearchSource = null;
  return VALID_SEARCH_SOURCES.has(source) ? source : null;
}

function applyConsent(value) {
  if (!VALID_CONSENTS.has(value)) {
    return;
  }

  writeStorage(CONSENT_KEY, value);
  updateStatusLabels();
  closePanel();

  if (value === "accepted") {
    initializeGa4();
    return;
  }

  window[`ga-disable-${MEASUREMENT_ID}`] = true;
  deleteSiteAnalyticsCookies();

  if (analyticsInitialized) {
    location.reload();
  }
}

function readDatasetEvent(target) {
  const eventName = target.dataset.musdbAnalyticsEvent;
  if (!EVENT_PARAMS[eventName]) {
    return;
  }

  const params = {};
  EVENT_PARAMS[eventName].forEach(key => {
    const datasetKey = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (target.dataset[datasetKey] !== undefined) {
      params[key] = target.dataset[datasetKey];
    }
  });
  trackEvent(eventName, params);
}

function handleDocumentClick(event) {
  const consentButton = event.target.closest("[data-musdb-consent]");
  if (consentButton) {
    applyConsent(consentButton.dataset.musdbConsent);
    return;
  }

  if (event.target.closest("[data-musdb-consent-close]")) {
    closePanel({ restoreFocus: panelMode === "settings" });
    return;
  }

  const settingsButton = event.target.closest("[data-musdb-analytics-settings]");
  if (settingsButton) {
    openConsentSettings(settingsButton);
    return;
  }

  const analyticsTarget = event.target.closest("[data-musdb-analytics-event]");
  if (analyticsTarget) {
    readDatasetEvent(analyticsTarget);
  }
}

export function initializeAnalytics() {
  if (!interfaceInitialized) {
    interfaceInitialized = true;
    addConsentStyles();
    document.addEventListener("click", handleDocumentClick);
  }

  updateStatusLabels();
  const consent = getConsent();
  if (consent === "accepted") {
    initializeGa4();
  } else if (consent === "unset" && !document.body.classList.contains("musdb-consent-visible")) {
    renderInitialPanel();
  }
}

window.MusDbAnalytics = Object.freeze({
  trackEvent,
  trackOnce,
  getConsent,
  openConsentSettings,
  rememberSearchSource,
  consumeSearchSource
});
