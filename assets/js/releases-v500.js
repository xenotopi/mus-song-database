import { apiGet, escapeHtml, formatDate } from "./api.js?v=4.9.6&cache=revision-nonblocking";
import { renderCommon } from "./common.js?v=4.9.1&cache=revision-nonblocking";

renderCommon("release");

const $ = id => document.getElementById(id);
const el = {
  status: $("status"), heroSummary: $("heroSummary"), totalReleasesChip: $("totalReleasesChip"),
  allReleasesSection: $("allReleasesSection"), releaseSearch: $("releaseSearch"),
  releaseYear: $("releaseYear"), releaseSort: $("releaseSort"),
  classificationFilters: $("classificationFilters"), releaseTypeBlock: $("releaseTypeBlock"),
  releaseTypeFilters: $("releaseTypeFilters"), resultText: $("resultText"),
  releasesList: $("releasesList"), moreButton: $("moreButton")
};

const params = new URLSearchParams(location.search);
let allReleases = [];
let selectedClassification = "";
let selectedReleaseType = "";
let visibleLimit = 24;

const CLASSIFICATION_ORDER = ["CD", "Blu-ray", "特典"];
const RELEASE_TYPE_ORDER = {
  CD: ["シングル", "Solo Live!", "ラジオCD", "サウンドトラック", "ベストアルバム", "コンプリートBOX", "企画アルバム"],
  "Blu-ray": ["アニメBlu-ray", "劇場版Blu-ray", "ライブBlu-ray", "映像集", "映像BOX"],
  特典: ["前売券特典", "全巻購入特典"]
};

function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ja");
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function releaseYear(value) {
  return validDate(value) ? String(value).slice(0, 4) : "";
}

function sourceMediaSupplement(item) {
  const classification = String(item.classification || "").trim();
  const sourceMedia = String(item.sourceMedia || "").trim();
  return sourceMedia && sourceMedia !== classification && ["特典", "その他"].includes(classification)
    ? sourceMedia
    : "";
}

function filteredReleases() {
  const query = normalizeText(el.releaseSearch.value);
  const year = String(el.releaseYear.value || "");
  const dated = [];
  const undated = [];

  allReleases.filter(item => {
    const queryOK = !query || normalizeText(item.releaseName).includes(query);
    const classificationOK = !selectedClassification || item.classification === selectedClassification;
    const releaseTypeOK = !selectedReleaseType || item.releaseType === selectedReleaseType;
    const yearOK = !year || releaseYear(item.releaseDate) === year;
    return queryOK && classificationOK && releaseTypeOK && yearOK;
  }).forEach(item => (validDate(item.releaseDate) ? dated : undated).push(item));

  const direction = el.releaseSort.value === "old" ? 1 : -1;
  dated.sort((a, b) => direction * String(a.releaseDate).localeCompare(String(b.releaseDate)) || String(a.releaseId).localeCompare(String(b.releaseId)));
  undated.sort((a, b) => String(a.releaseId).localeCompare(String(b.releaseId)));
  return [...dated, ...undated];
}

function buildClassificationFilters() {
  const available = new Set(allReleases.map(item => String(item.classification || "").trim()).filter(Boolean));
  const values = CLASSIFICATION_ORDER.filter(value => available.has(value));
  el.classificationFilters.innerHTML = ["", ...values].map(value => `
    <button type="button" class="releases-filter-pill${value ? "" : " active"}" data-classification="${escapeHtml(value)}" aria-pressed="${value ? "false" : "true"}">
      ${escapeHtml(value || "すべて")}
    </button>`).join("");
  el.classificationFilters.querySelectorAll("[data-classification]").forEach(button => {
    button.addEventListener("click", () => {
      const nextClassification = button.dataset.classification || "";
      if (nextClassification !== selectedClassification) selectedReleaseType = "";
      selectedClassification = nextClassification;
      updateClassificationSelection();
      buildReleaseTypeFilters();
      visibleLimit = 24;
      syncUrl();
      renderReleases();
    });
  });
}

function updateClassificationSelection() {
  el.classificationFilters.querySelectorAll("[data-classification]").forEach(item => {
    const active = item.dataset.classification === selectedClassification;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
}

function availableReleaseTypes(classification) {
  if (!classification) return [];
  const actual = new Set(allReleases.filter(item => item.classification === classification).map(item => String(item.releaseType || "").trim()).filter(Boolean));
  return (RELEASE_TYPE_ORDER[classification] || []).filter(value => actual.has(value));
}

function buildReleaseTypeFilters() {
  const values = availableReleaseTypes(selectedClassification);
  if (!selectedClassification) {
    selectedReleaseType = "";
    el.releaseTypeFilters.innerHTML = "";
    el.releaseTypeBlock.hidden = true;
    return;
  }
  if (!values.includes(selectedReleaseType)) selectedReleaseType = "";
  el.releaseTypeBlock.hidden = false;
  el.releaseTypeFilters.innerHTML = ["", ...values].map(value => `
    <button type="button" class="releases-filter-pill${value === selectedReleaseType ? " active" : ""}" data-release-type="${escapeHtml(value)}" aria-pressed="${value === selectedReleaseType}">
      ${escapeHtml(value || "すべて")}
    </button>`).join("");
  el.releaseTypeFilters.querySelectorAll("[data-release-type]").forEach(button => {
    button.addEventListener("click", () => {
      selectedReleaseType = button.dataset.releaseType || "";
      buildReleaseTypeFilters();
      visibleLimit = 24;
      syncUrl();
      renderReleases();
    });
  });
}

function populateYears() {
  const years = [...new Set(allReleases.map(item => releaseYear(item.releaseDate)).filter(Boolean))].sort().reverse();
  el.releaseYear.innerHTML = `<option value="">すべての年</option>${years.map(year => `<option value="${year}">${year}年</option>`).join("")}`;
}

function renderReleases() {
  const items = filteredReleases();
  const visible = items.slice(0, visibleLimit);
  el.resultText.textContent = `${visible.length.toLocaleString("ja-JP")}/${items.length.toLocaleString("ja-JP")}件表示`;
  el.releasesList.innerHTML = visible.length ? visible.map(item => {
    const supplement = sourceMediaSupplement(item);
    return `<a class="release-list-card" href="release.html?id=${encodeURIComponent(item.releaseId)}">
      <span class="release-list-date">${validDate(item.releaseDate) ? escapeHtml(formatDate(item.releaseDate)) : "発売日未登録"}</span>
      <span class="release-list-main"><span class="release-list-title">${escapeHtml(item.releaseName || "リリース名未設定")}</span>${supplement ? `<span class="release-list-meta"><span>${escapeHtml(supplement)}</span></span>` : ""}</span>
      <span class="release-list-category">${escapeHtml(item.classification || "分類未設定")}</span><span class="release-list-arrow" aria-hidden="true">›</span>
    </a>`;
  }).join("") : `<div class="releases-empty">条件に一致するリリースはありません</div>`;
  el.moreButton.hidden = visible.length >= items.length;
  if (!el.moreButton.hidden) el.moreButton.textContent = `もっと見る（残り${(items.length - visible.length).toLocaleString("ja-JP")}件）`;
}

function syncUrl() {
  const next = new URL(location.href);
  const values = { q: el.releaseSearch.value.trim(), classification: selectedClassification, type: selectedReleaseType, year: el.releaseYear.value, sort: el.releaseSort.value === "old" ? "old" : "" };
  Object.entries(values).forEach(([key, value]) => value ? next.searchParams.set(key, value) : next.searchParams.delete(key));
  history.replaceState(null, "", next);
}

function applyInitialUrlState() {
  el.releaseSearch.value = String(params.get("q") || "");
  const year = String(params.get("year") || "");
  if ([...el.releaseYear.options].some(option => option.value === year)) el.releaseYear.value = year;
  if (params.get("sort") === "old") el.releaseSort.value = "old";
  const classification = String(params.get("classification") || "");
  const button = [...el.classificationFilters.querySelectorAll("[data-classification]")].find(item => item.dataset.classification === classification);
  if (button && classification) {
    selectedClassification = classification;
    updateClassificationSelection();
  }
  const requestedType = String(params.get("type") || "");
  const validTypes = availableReleaseTypes(selectedClassification);
  selectedReleaseType = validTypes.includes(requestedType) ? requestedType : "";
  buildReleaseTypeFilters();
  if (requestedType !== selectedReleaseType) syncUrl();
}

async function loadReleases() {
  el.status.hidden = false;
  el.status.classList.remove("error");
  el.status.textContent = "リリースデータを読み込んでいます...";
  try {
    const response = await apiGet("releaseList", {}, { timeoutMs: 30000, retryCount: 1, cache: true });
    allReleases = Array.isArray(response.data) ? response.data : [];
    if (!allReleases.length) throw new Error("リリース一覧を取得できませんでした。");
    buildClassificationFilters();
    populateYears();
    applyInitialUrlState();
    el.totalReleasesChip.textContent = `全${allReleases.length.toLocaleString("ja-JP")}件`;
    renderReleases();
    el.status.hidden = true;
    el.heroSummary.hidden = false;
    el.allReleasesSection.hidden = false;
  } catch (error) {
    console.error(error);
    el.status.hidden = false;
    el.status.classList.add("error");
    el.status.innerHTML = `<strong>リリースデータを取得できませんでした。</strong><br><span>${escapeHtml(error?.message || "不明なエラー")}</span><br><button id="retryButton" type="button">再試行</button>`;
    $("retryButton")?.addEventListener("click", loadReleases, { once: true });
  }
}

el.releaseSearch.addEventListener("input", () => { visibleLimit = 24; syncUrl(); renderReleases(); });
el.releaseYear.addEventListener("change", () => { visibleLimit = 24; syncUrl(); renderReleases(); });
el.releaseSort.addEventListener("change", () => { visibleLimit = 24; syncUrl(); renderReleases(); });
el.moreButton.addEventListener("click", () => { visibleLimit += 24; renderReleases(); });

loadReleases();
