import { apiGet, escapeHtml, formatDate } from "./api.js?v=4.9.6&cache=revision-nonblocking";
import { renderCommon } from "./common.js?v=4.9.1&cache=revision-nonblocking";

renderCommon("release");

const $ = id => document.getElementById(id);
const el = {
  status: $("status"), heroSummary: $("heroSummary"), totalReleasesChip: $("totalReleasesChip"),
  allReleasesSection: $("allReleasesSection"), releaseSearch: $("releaseSearch"),
  releaseYear: $("releaseYear"), releaseSort: $("releaseSort"),
  classificationFilters: $("classificationFilters"), resultText: $("resultText"),
  releasesList: $("releasesList"), moreButton: $("moreButton")
};

const params = new URLSearchParams(location.search);
let allReleases = [];
let selectedClassification = "";
let visibleLimit = 24;

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
    const yearOK = !year || releaseYear(item.releaseDate) === year;
    return queryOK && classificationOK && yearOK;
  }).forEach(item => (validDate(item.releaseDate) ? dated : undated).push(item));

  const direction = el.releaseSort.value === "old" ? 1 : -1;
  dated.sort((a, b) => direction * String(a.releaseDate).localeCompare(String(b.releaseDate)) || String(a.releaseId).localeCompare(String(b.releaseId)));
  undated.sort((a, b) => String(a.releaseId).localeCompare(String(b.releaseId)));
  return [...dated, ...undated];
}

function buildClassificationFilters() {
  const values = [...new Set(allReleases.map(item => String(item.classification || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja"));
  el.classificationFilters.innerHTML = ["", ...values].map(value => `
    <button type="button" class="releases-filter-pill${value ? "" : " active"}" data-classification="${escapeHtml(value)}">
      ${escapeHtml(value || "すべて")}
    </button>`).join("");
  el.classificationFilters.querySelectorAll("[data-classification]").forEach(button => {
    button.addEventListener("click", () => {
      selectedClassification = button.dataset.classification || "";
      el.classificationFilters.querySelectorAll("[data-classification]").forEach(item => item.classList.toggle("active", item === button));
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
  const values = { q: el.releaseSearch.value.trim(), classification: selectedClassification, year: el.releaseYear.value, sort: el.releaseSort.value === "old" ? "old" : "" };
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
    el.classificationFilters.querySelectorAll("[data-classification]").forEach(item => item.classList.toggle("active", item === button));
  }
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
