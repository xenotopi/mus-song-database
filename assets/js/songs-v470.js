import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.6.2";

import {
  renderCommon
} from "./common.js?v=4.8.0";

renderCommon("song");

const $ = id => document.getElementById(id);

const el = {
  status: $("status"),
  heroSummary: $("heroSummary"),
  totalSongsChip: $("totalSongsChip"),
  mediaCountChip: $("mediaCountChip"),
  categoryCountChip: $("categoryCountChip"),
  pickupSection: $("pickupSection"),
  pickupGrid: $("pickupGrid"),
  allSongsSection: $("allSongsSection"),
  allSongSelect: $("allSongSelect"),
  songSearch: $("songSearch"),
  mediaFilters: $("mediaFilters"),
  categoryFilters: $("categoryFilters"),
  performanceFilters: $("performanceFilters"),
  resultText: $("resultText"),
  songSort: $("songSort"),
  songsList: $("songsList"),
  moreButton: $("moreButton")
};

let allSongs = [];
let selectedMedia = "";
let selectedCategory = "";
let selectedPerformance = "";
let visibleLimit = 24;

const params = new URLSearchParams(location.search);
const initialQuery = String(params.get("q") || "").trim();

function uniqueValues(items, key) {
  return [...new Set(
    items
      .map(item => String(item[key] || "").trim())
      .filter(Boolean)
  )].sort((a,b) => a.localeCompare(b, "ja"));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
}

function formatShortDate(value) {
  const formatted = formatDate(value);
  return formatted || "—";
}

function buildFilterButtons(container, values, kind) {
  const allLabel = "すべて";

  container.innerHTML = [
    `<button type="button" class="songs-filter-pill active" data-${kind}="">${allLabel}</button>`,
    ...values.map(value => `
      <button
        type="button"
        class="songs-filter-pill"
        data-${kind}="${escapeHtml(value)}"
      >${escapeHtml(value)}</button>
    `)
  ].join("");

  container.querySelectorAll(`[data-${kind}]`).forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset[kind] || "";

      if (kind === "media") {
        selectedMedia = value;
      } else {
        selectedCategory = value;
      }

      container.querySelectorAll(`[data-${kind}]`).forEach(item => {
        item.classList.toggle("active", item === button);
      });

      visibleLimit = 24;
      syncUrl();
      renderSongs();
    });
  });
}

function setupPerformanceFilter() {
  el.performanceFilters
    .querySelectorAll("[data-performance]")
    .forEach(button => {
      button.addEventListener("click", () => {
        selectedPerformance = button.dataset.performance || "";

        el.performanceFilters
          .querySelectorAll("[data-performance]")
          .forEach(item => {
            item.classList.toggle("active", item === button);
          });

        visibleLimit = 24;
        syncUrl();
        renderSongs();
      });
    });
}

function sortByDateDesc(a,b,key) {
  return String(b[key] || "").localeCompare(String(a[key] || ""));
}

function sortByDateAsc(a,b,key) {
  const av = String(a[key] || "9999-99-99");
  const bv = String(b[key] || "9999-99-99");
  return av.localeCompare(bv);
}

function getFilteredSongs() {
  const query = normalizeText(el.songSearch.value);

  const filtered = allSongs.filter(item => {
    const title = normalizeText(
      item.displayName || item.songName || ""
    );

    const queryOK = !query || title.includes(query);
    const mediaOK = !selectedMedia || item.media === selectedMedia;
    const categoryOK =
      !selectedCategory ||
      item.songCategory === selectedCategory;
    const performanceOK =
      selectedPerformance !== "unperformed" ||
      Number(item.performanceCount || 0) === 0;

    return queryOK && mediaOK && categoryOK && performanceOK;
  });

  const sorted = filtered.slice();

  switch (el.songSort.value) {
    case "recent":
      sorted.sort((a,b) =>
        sortByDateDesc(a,b,"lastPerformanceDate") ||
        Number(b.performanceCount || 0) - Number(a.performanceCount || 0)
      );
      break;

    case "first-old":
      sorted.sort((a,b) =>
        sortByDateAsc(a,b,"firstPerformanceDate") ||
        String(a.songName || "").localeCompare(String(b.songName || ""),"ja")
      );
      break;

    case "first-new":
      sorted.sort((a,b) =>
        sortByDateDesc(a,b,"firstPerformanceDate") ||
        String(a.songName || "").localeCompare(String(b.songName || ""),"ja")
      );
      break;

    case "gap":
      sorted.sort((a,b) =>
        Number(b.longestGapDays || 0) - Number(a.longestGapDays || 0) ||
        Number(b.performanceCount || 0) - Number(a.performanceCount || 0)
      );
      break;

    case "name":
      sorted.sort((a,b) =>
        String(a.displayName || a.songName || "")
          .localeCompare(
            String(b.displayName || b.songName || ""),
            "ja"
          )
      );
      break;

    case "performance":
    default:
      sorted.sort((a,b) =>
        Number(b.performanceCount || 0) - Number(a.performanceCount || 0) ||
        String(a.displayName || a.songName || "")
          .localeCompare(
            String(b.displayName || b.songName || ""),
            "ja"
          )
      );
  }

  return sorted;
}

function buildRecordMaps() {
  const byPerformance = allSongs
    .slice()
    .sort((a,b) =>
      Number(b.performanceCount || 0) - Number(a.performanceCount || 0)
    );

  const byGap = allSongs
    .filter(item => Number(item.longestGapDays || 0) > 0)
    .slice()
    .sort((a,b) =>
      Number(b.longestGapDays || 0) - Number(a.longestGapDays || 0)
    );

  return {
    performanceRank: new Map(
      byPerformance.map((item,index) => [item.songId, index + 1])
    ),
    gapRank: new Map(
      byGap.map((item,index) => [item.songId, index + 1])
    )
  };
}

function getRecordTag(item, maps) {
  const performanceRank = maps.performanceRank.get(item.songId);
  const gapRank = maps.gapRank.get(item.songId);

  if (performanceRank === 1) {
    return "最多歌唱曲";
  }

  if (performanceRank && performanceRank <= 10) {
    return "歌唱回数 TOP10";
  }

  if (gapRank && gapRank <= 5) {
    return "最長ブランク TOP5";
  }

  return "";
}

function populateAllSongSelect() {
  if (!el.allSongSelect) return;

  const sorted = allSongs
    .slice()
    .sort((a,b) =>
      String(a.songId || "").localeCompare(
        String(b.songId || ""),
        "ja",
        { numeric:true }
      )
    );

  el.allSongSelect.innerHTML = [
    `<option value="">曲を選択してください（全${sorted.length.toLocaleString("ja-JP")}曲）</option>`,
    ...sorted.map(item => {
      const title = item.displayName || item.songName || "曲名未設定";
      return `<option value="${escapeHtml(item.songId)}">${escapeHtml(title)}</option>`;
    })
  ].join("");
}

function renderPickup() {
  if (!allSongs.length) return;

  const mostPerformed = allSongs
    .slice()
    .sort((a,b) =>
      Number(b.performanceCount || 0) - Number(a.performanceCount || 0)
    )[0];

  const longestGap = allSongs
    .filter(item => Number(item.longestGapDays || 0) > 0)
    .slice()
    .sort((a,b) =>
      Number(b.longestGapDays || 0) - Number(a.longestGapDays || 0)
    )[0];

  const latest = allSongs
    .filter(item => item.lastPerformanceDate)
    .slice()
    .sort((a,b) =>
      sortByDateDesc(a,b,"lastPerformanceDate")
    )[0];

  const cards = [
    {
      label: "MOST PERFORMED",
      title: mostPerformed?.displayName || mostPerformed?.songName || "—",
      value: `${Number(mostPerformed?.performanceCount || 0).toLocaleString("ja-JP")}回`,
      meta: "最も多く歌唱記録がある曲",
      id: mostPerformed?.songId
    },
    {
      label: "LONGEST GAP",
      title: longestGap?.displayName || longestGap?.songName || "—",
      value: `${Number(longestGap?.longestGapDays || 0).toLocaleString("ja-JP")}日`,
      meta: "記録上の最長ブランク",
      id: longestGap?.songId
    },
    {
      label: "LATEST PERFORMANCE",
      title: latest?.displayName || latest?.songName || "—",
      value: formatShortDate(latest?.lastPerformanceDate),
      meta: "最近歌唱記録が追加された曲",
      id: latest?.songId
    }
  ].filter(card => card.id);

  el.pickupGrid.innerHTML = cards.map(card => `
    <a class="songs-pickup-card" href="song.html?id=${encodeURIComponent(card.id)}">
      <div class="songs-pickup-label">${escapeHtml(card.label)}</div>
      <div class="songs-pickup-title">${escapeHtml(card.title)}</div>
      <div class="songs-pickup-value">${escapeHtml(card.value)}</div>
      <div class="songs-pickup-meta">${escapeHtml(card.meta)}</div>
    </a>
  `).join("");

  el.pickupSection.hidden = !cards.length;
}

function renderSongs() {
  const items = getFilteredSongs();
  const visible = items.slice(0, visibleLimit);
  const maps = buildRecordMaps();

  el.resultText.textContent =
    `${visible.length.toLocaleString("ja-JP")}/${items.length.toLocaleString("ja-JP")}曲表示`;

  el.songsList.innerHTML = visible.length
    ? visible.map((item,index) => {
        const tag = getRecordTag(item, maps);
        const title =
          item.displayName ||
          item.songName ||
          "曲名未設定";

        return `
          <a class="song-list-card" href="song.html?id=${encodeURIComponent(item.songId)}">
            <span class="song-list-rank">${index + 1}</span>

            <div>
              <div class="song-list-title">${escapeHtml(title)}</div>

              <div class="song-list-meta">
                ${item.version ? `<span>${escapeHtml(item.version)}</span>` : ""}
                ${item.media ? `<span>${escapeHtml(item.media)}</span>` : ""}
                ${item.songCategory ? `<span>${escapeHtml(item.songCategory)}</span>` : ""}
              </div>

              <div class="song-list-stats">
                <div class="song-list-stat">
                  <b>${Number(item.performanceCount || 0).toLocaleString("ja-JP")}回</b>
                  <span>歌唱記録</span>
                </div>

                <div class="song-list-stat">
                  <b>${escapeHtml(formatShortDate(item.firstPerformanceDate))}</b>
                  <span>初披露</span>
                </div>

                <div class="song-list-stat">
                  <b>${escapeHtml(formatShortDate(item.lastPerformanceDate))}</b>
                  <span>最終披露</span>
                </div>
              </div>

              ${tag ? `<span class="song-record-tag">${escapeHtml(tag)}</span>` : ""}
            </div>
          </a>
        `;
      }).join("")
    : `<div class="songs-empty">条件に該当する曲はありません。</div>`;

  el.moreButton.hidden = visible.length >= items.length;
  if (!el.moreButton.hidden) {
    el.moreButton.textContent =
      `もっと見る（残り${(items.length - visible.length).toLocaleString("ja-JP")}曲）`;
  }
}

function syncUrl() {
  const next = new URL(location.href);
  const query = el.songSearch.value.trim();

  if (query) {
    next.searchParams.set("q", query);
  } else {
    next.searchParams.delete("q");
  }

  if (selectedMedia) {
    next.searchParams.set("media", selectedMedia);
  } else {
    next.searchParams.delete("media");
  }

  if (selectedCategory) {
    next.searchParams.set("category", selectedCategory);
  } else {
    next.searchParams.delete("category");
  }

  if (selectedPerformance === "unperformed") {
    next.searchParams.set("filter", selectedPerformance);
  } else {
    next.searchParams.delete("filter");
  }

  if (el.songSort.value !== "performance") {
    next.searchParams.set("sort", el.songSort.value);
  } else {
    next.searchParams.delete("sort");
  }

  history.replaceState(null,"",next);
}

function applyInitialUrlState() {
  el.songSearch.value = initialQuery;

  const requestedMedia =
    String(params.get("media") || "").trim();
  const requestedCategory =
    String(params.get("category") || "").trim();
  const requestedFilter =
    String(params.get("filter") || "").trim();
  const requestedSort =
    String(params.get("sort") || "").trim();

  if (requestedMedia) {
    const button =
      el.mediaFilters.querySelector(
        `[data-media="${CSS.escape(requestedMedia)}"]`
      );

    if (button) {
      selectedMedia = requestedMedia;
      el.mediaFilters
        .querySelectorAll("[data-media]")
        .forEach(item =>
          item.classList.toggle("active", item === button)
        );
    }
  }

  if (requestedCategory) {
    const button =
      el.categoryFilters.querySelector(
        `[data-category="${CSS.escape(requestedCategory)}"]`
      );

    if (button) {
      selectedCategory = requestedCategory;
      el.categoryFilters
        .querySelectorAll("[data-category]")
        .forEach(item =>
          item.classList.toggle("active", item === button)
        );
    }
  }

  if (requestedFilter === "unperformed") {
    const button =
      el.performanceFilters.querySelector(
        '[data-performance="unperformed"]'
      );

    if (button) {
      selectedPerformance = requestedFilter;
      el.performanceFilters
        .querySelectorAll("[data-performance]")
        .forEach(item =>
          item.classList.toggle("active", item === button)
        );
    }
  }

  if (
    requestedSort &&
    [...el.songSort.options].some(option => option.value === requestedSort)
  ) {
    el.songSort.value = requestedSort;
  }
}

async function loadSongs() {
  el.status.hidden = false;
  el.status.textContent = "曲データを読み込んでいます...";

  try {
    const response = await apiGet(
      "rankings",
      {
        limit: 1000,
        year: "",
        category: "",
        schema: "4.2.1"
      },
      {
        timeoutMs: 30000,
        retryCount: 1,
        cache: true,
        cacheTtlMs: 300000
      }
    );

    const data = response.data || {};
    allSongs = Array.isArray(data.songs) ? data.songs : [];

    if (!allSongs.length) {
      throw new Error("曲一覧を取得できませんでした。");
    }

    const mediaValues = uniqueValues(allSongs,"media");
    const categoryValues = uniqueValues(allSongs,"songCategory");

    buildFilterButtons(el.mediaFilters, mediaValues, "media");
    buildFilterButtons(el.categoryFilters, categoryValues, "category");
    setupPerformanceFilter();
    populateAllSongSelect();
    applyInitialUrlState();

    el.totalSongsChip.textContent =
      `全${allSongs.length.toLocaleString("ja-JP")}曲`;
    el.mediaCountChip.textContent =
      `${mediaValues.length.toLocaleString("ja-JP")}メディア`;
    el.categoryCountChip.textContent =
      `${categoryValues.length.toLocaleString("ja-JP")}区分`;

    renderPickup();
    renderSongs();

    el.status.hidden = true;
    el.heroSummary.hidden = false;
    el.allSongsSection.hidden = false;
  } catch (error) {
    console.error(error);
    el.status.hidden = false;
    el.status.textContent =
      error?.message || "曲データを取得できませんでした。";
  }
}

if (el.allSongSelect) {
  el.allSongSelect.addEventListener("change", () => {
    const songId = String(el.allSongSelect.value || "").trim();
    if (!songId) return;
    location.href = `song.html?id=${encodeURIComponent(songId)}`;
  });
}

el.songSearch.addEventListener("input", () => {
  visibleLimit = 24;
  syncUrl();
  renderSongs();
});

el.songSort.addEventListener("change", () => {
  visibleLimit = 24;
  syncUrl();
  renderSongs();
});

el.moreButton.addEventListener("click", () => {
  visibleLimit += 24;
  renderSongs();
});

loadSongs();
