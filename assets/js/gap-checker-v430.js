import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.3.0";

renderCommon("");

const $ = id =>
  document.getElementById(id);

const el = {
  songSelect:
    $("songSelect"),

  performanceSelect:
    $("performanceSelect"),

  checkButton:
    $("checkButton"),

  status:
    $("status"),

  currentCard:
    $("currentCard"),

  currentTitle:
    $("currentTitle"),

  currentMeta:
    $("currentMeta"),

  resultSection:
    $("resultSection"),

  resultGrid:
    $("resultGrid")
};

let currentSong = null;
let performances = [];


function formationClass(formation) {
  if (!formation) {
    return "unregistered";
  }

  if (formation.isComplete) {
    return "complete";
  }

  if (formation.isIrregular) {
    return "irregular";
  }

  return "unregistered";
}


function formationText(formation) {
  if (!formation) {
    return "判定情報なし";
  }

  if (formation.status === "未登録") {
    return "完全体判定データ未登録";
  }

  if (
    formation.reason
  ) {
    return `${formation.status}（${formation.reason}）`;
  }

  return formation.status || "判定情報なし";
}


function performanceOptionLabel(item) {
  const parts = [
    formatDate(item.date) || "日付不明",
    item.eventName || "イベント名未設定",
    item.category,
    item.day,
    item.performance,
    item.sequence
      ? `曲順 ${item.sequence}`
      : "",
    item.singers
  ]
    .filter(Boolean);

  return parts.join("｜");
}


function renderPerformanceOptions(items) {
  performances = items;

  el.performanceSelect.innerHTML = `
    <option value="">
      今回の歌唱を選択してください
    </option>
    ${items.map(item => `
      <option value="${escapeHtml(item.performanceKey)}">
        ${escapeHtml(performanceOptionLabel(item))}
      </option>
    `).join("")}
  `;

  el.performanceSelect.disabled =
    !items.length;

  el.checkButton.disabled = true;
}


function currentMetaParts(item) {
  return [
    item.category &&
      `<span class="gap-chip">${escapeHtml(item.category)}</span>`,

    item.eventType &&
      `<span>${escapeHtml(item.eventType)}</span>`,

    item.day &&
      `<span>${escapeHtml(item.day)}</span>`,

    item.performance &&
      `<span>${escapeHtml(item.performance)}</span>`,

    item.sequence &&
      `<span>曲順 ${escapeHtml(item.sequence)}</span>`,

    item.singers &&
      `<span>歌唱者 ${escapeHtml(item.singers)}</span>`,

    item.formation &&
      `<span class="gap-chip ${formationClass(item.formation)}">
        ${escapeHtml(formationText(item.formation))}
      </span>`
  ]
    .filter(Boolean)
    .join("");
}


function renderCurrent(item) {
  el.currentTitle.textContent =
    `${formatDate(item.date) || "日付不明"}｜${item.eventName || "イベント名未設定"}`;

  el.currentMeta.innerHTML =
    currentMetaParts(item);

  el.currentCard.hidden = false;
}


function renderPrevious(previous) {
  if (!previous) {
    return "";
  }

  return `
    <div class="gap-previous">
      <div class="gap-previous-label">PREVIOUS PERFORMANCE</div>
      <div class="gap-previous-date">
        ${escapeHtml(formatDate(previous.date) || "日付不明")}
      </div>
      <div class="gap-previous-event">
        ${escapeHtml(previous.eventName || "イベント名未設定")}
      </div>
      <div class="gap-previous-meta">
        ${previous.category ? `<span>${escapeHtml(previous.category)}</span>` : ""}
        ${previous.eventType ? `<span>${escapeHtml(previous.eventType)}</span>` : ""}
        ${previous.day ? `<span>${escapeHtml(previous.day)}</span>` : ""}
        ${previous.performance ? `<span>${escapeHtml(previous.performance)}</span>` : ""}
        ${previous.sequence ? `<span>曲順 ${escapeHtml(previous.sequence)}</span>` : ""}
        ${previous.singers ? `<span>歌唱者 ${escapeHtml(previous.singers)}</span>` : ""}
        ${previous.formation
          ? `<span class="gap-chip ${formationClass(previous.formation)}">
              ${escapeHtml(formationText(previous.formation))}
            </span>`
          : ""
        }
      </div>
      ${previous.eventId
        ? `<a class="gap-link" href="event.html?id=${encodeURIComponent(previous.eventId)}">
            前回イベントを見る →
          </a>`
        : ""
      }
    </div>
  `;
}


function renderResultCard(item) {
  return `
    <article
      class="gap-result-card"
      data-mode="${escapeHtml(item.mode)}"
    >
      <div class="gap-result-mode">
        ${escapeHtml(item.label)}
      </div>

      <div class="gap-result-value">
        ${escapeHtml(item.headline || "—")}
      </div>

      <div class="gap-result-description">
        ${escapeHtml(item.description || "")}
      </div>

      ${renderPrevious(item.previous)}
    </article>
  `;
}


function renderResults(result) {
  renderCurrent(
    result.current
  );

  el.resultGrid.innerHTML = [
    result.all,
    result.official,
    result.solo
  ]
    .map(renderResultCard)
    .join("");

  el.resultSection.hidden = false;
}


async function loadSongs() {
  el.status.hidden = false;
  el.status.textContent =
    "曲データを読み込んでいます...";

  try {
    const response =
      await apiGet(
        "gap",
        {}
      );

    const data =
      response.data || response;

    const songs =
      Array.isArray(data.songs)
        ? data.songs
        : [];

    el.songSelect.innerHTML = `
      <option value="">
        曲を選択してください
      </option>
      ${songs.map(item => `
        <option value="${escapeHtml(item.songId)}">
          ${escapeHtml(item.songName)}
        </option>
      `).join("")}
    `;

    el.status.textContent =
      "曲を選択してください。";

  } catch (error) {
    console.error(error);

    el.status.textContent =
      error?.message ||
      "曲データを取得できませんでした。";
  }
}


async function loadPerformances(songId) {
  currentSong = null;
  performances = [];

  el.currentCard.hidden = true;
  el.resultSection.hidden = true;
  el.performanceSelect.disabled = true;
  el.checkButton.disabled = true;

  if (!songId) {
    el.performanceSelect.innerHTML = `
      <option value="">
        先に曲を選択してください
      </option>
    `;

    el.status.textContent =
      "曲を選択してください。";

    return;
  }

  el.status.hidden = false;
  el.status.textContent =
    "歌唱履歴を読み込んでいます...";

  try {
    const response =
      await apiGet(
        "gap",
        {
          songId:
            songId
        }
      );

    const data =
      response.data || response;

    currentSong =
      data.selectedSong || null;

    renderPerformanceOptions(
      Array.isArray(data.performances)
        ? data.performances
        : []
    );

    el.status.textContent =
      performances.length
        ? `歌唱履歴 ${performances.length.toLocaleString("ja-JP")}件。今回の歌唱を選択してください。`
        : "この曲には歌唱履歴がありません。";

  } catch (error) {
    console.error(error);

    el.status.textContent =
      error?.message ||
      "歌唱履歴を取得できませんでした。";
  }
}


async function checkGap() {
  const songId =
    el.songSelect.value;

  const performanceKey =
    el.performanceSelect.value;

  if (
    !songId ||
    !performanceKey
  ) {
    return;
  }

  el.checkButton.disabled = true;
  el.checkButton.textContent =
    "判定中…";

  el.status.hidden = false;
  el.status.textContent =
    "前回歌唱を判定しています...";

  try {
    const response =
      await apiGet(
        "gap",
        {
          songId:
            songId,

          performanceKey:
            performanceKey
        }
      );

    const data =
      response.data || response;

    if (!data.result) {
      throw new Error(
        "判定結果を取得できませんでした。"
      );
    }

    renderResults(
      data.result
    );

    el.status.hidden = true;

  } catch (error) {
    console.error(error);

    el.status.textContent =
      error?.message ||
      "判定中にエラーが発生しました。";

  } finally {
    el.checkButton.disabled = false;
    el.checkButton.textContent =
      "判定する";
  }
}


el.songSelect.addEventListener(
  "change",
  () =>
    loadPerformances(
      el.songSelect.value
    )
);


el.performanceSelect.addEventListener(
  "change",
  () => {
    el.currentCard.hidden = true;
    el.resultSection.hidden = true;

    el.checkButton.disabled =
      !el.performanceSelect.value;
  }
);


el.checkButton.addEventListener(
  "click",
  checkGap
);


loadSongs();
