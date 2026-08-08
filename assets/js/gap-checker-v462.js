import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.6.2";

renderCommon("");

const $ = id => document.getElementById(id);

const initialSongId =
  String(
    new URLSearchParams(location.search).get("song") || ""
  ).trim();

const el = {
  songSelect: $("songSelect"),
  baseDate: $("baseDate"),
  checkButton: $("checkButton"),
  status: $("status"),
  selectedCard: $("selectedCard"),
  selectedTitle: $("selectedTitle"),
  selectedMeta: $("selectedMeta"),
  resultSection: $("resultSection"),
  resultGrid: $("resultGrid")
};

function syncButton() {
  el.checkButton.disabled =
    !el.songSelect.value ||
    !el.baseDate.value;
}

function renderPrevious(previous) {
  if (!previous) return "";

  return `
    <div class="gap-previous">
      <div class="gap-previous-label">前回歌唱</div>
      <div class="gap-previous-date">${escapeHtml(formatDate(previous.date) || "日付不明")}</div>
      <div class="gap-previous-event">${escapeHtml(previous.eventName || "イベント名未設定")}</div>
      <div class="gap-previous-meta">
        ${previous.category ? `<span>${escapeHtml(previous.category)}</span>` : ""}
        ${previous.eventType ? `<span>${escapeHtml(previous.eventType)}</span>` : ""}
        ${previous.day ? `<span>${escapeHtml(previous.day)}</span>` : ""}
        ${previous.performance ? `<span>${escapeHtml(previous.performance)}</span>` : ""}
        ${previous.sequence ? `<span>曲順 ${escapeHtml(previous.sequence)}</span>` : ""}
        ${previous.singers ? `<span>歌唱者 ${escapeHtml(previous.singers)}</span>` : ""}
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

function englishLabel(mode) {
  if (mode === "official") return "OFFICIAL";
  if (mode === "solo") return "SOLO";
  return "ALL";
}

function renderResultCard(item) {
  return `
    <article class="gap-result-card" data-mode="${escapeHtml(item.mode)}">
      <h3 class="gap-result-title">${escapeHtml(item.title || "")}</h3>
      <div class="gap-result-sub">${escapeHtml(englishLabel(item.mode))}</div>

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

function renderResult(data) {
  const song = data.selectedSong || {};
  const result = data.result || {};

  el.selectedTitle.textContent =
    `${song.songId || ""} ${song.songName || ""}`.trim();

  el.selectedMeta.textContent =
    `基準日：${formatDate(data.baseDate) || data.baseDate || "—"}`;

  el.selectedCard.hidden = false;

  el.resultGrid.innerHTML = [
    result.all,
    result.official,
    result.solo
  ]
    .filter(Boolean)
    .map(renderResultCard)
    .join("");

  el.resultSection.hidden = false;
  el.status.hidden = true;
}

async function fetchSongsForChecker_() {
  const attempts = [
    {
      cache: false,
      forceRefresh: true,
      staleWhileRevalidate: false,
      timeoutMs: 20000,
      retryCount: 1
    },
    {
      cache: false,
      forceRefresh: true,
      staleWhileRevalidate: false,
      timeoutMs: 25000,
      retryCount: 1
    },
    {
      cache: false,
      forceRefresh: true,
      staleWhileRevalidate: false,
      timeoutMs: 30000,
      retryCount: 1
    }
  ];

  let lastError = null;

  for (
    let index = 0;
    index < attempts.length;
    index += 1
  ) {
    try {
      const response =
        await apiGet(
          "gap",
          {},
          attempts[index]
        );

      const data =
        response.data || response;

      const songs =
        Array.isArray(data.songs)
          ? data.songs
          : [];

      if (songs.length) {
        return songs;
      }

      lastError =
        new Error(
          "曲一覧が空の状態で返されました。"
        );

    } catch (error) {
      lastError = error;
    }

    if (
      index <
      attempts.length - 1
    ) {
      el.status.textContent =
        "曲一覧を再取得しています...";

      await new Promise(resolve =>
        window.setTimeout(
          resolve,
          650 * (index + 1)
        )
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "曲一覧を取得できませんでした。"
    )
  );
}


async function loadSongs() {
  el.status.hidden = false;
  el.status.textContent =
    "曲データを読み込んでいます...";

  el.songSelect.disabled = true;

  try {
    const songs =
      await fetchSongsForChecker_();

    el.songSelect.innerHTML = `
      <option value="">曲を選択してください</option>
      ${songs.map(item => `
        <option value="${escapeHtml(item.songId)}">
          ${escapeHtml(`${item.songId} ${item.songName}`)}
        </option>
      `).join("")}
    `;

    if (
      initialSongId &&
      songs.some(
        item =>
          item.songId ===
          initialSongId
      )
    ) {
      el.songSelect.value =
        initialSongId;

      el.status.textContent =
        "曲を選択済みです。基準日を選択してください。";

    } else {
      el.status.textContent =
        "曲と基準日を選択してください。";
    }

  } catch (error) {
    console.error(error);

    el.songSelect.innerHTML = `
      <option value="">
        曲一覧を取得できませんでした
      </option>
    `;

    el.status.textContent =
      (
        error?.message ||
        "曲データを取得できませんでした。"
      ) +
      " ページを再読み込みしてもう一度お試しください。";

  } finally {
    el.songSelect.disabled = false;
    syncButton();
  }
}

async function checkGap() {
  const songId = el.songSelect.value;
  const baseDate = el.baseDate.value;

  if (!songId || !baseDate) return;

  el.checkButton.disabled = true;
  el.checkButton.textContent = "判定中…";
  el.status.hidden = false;
  el.status.textContent = "前回歌唱を確認しています...";
  el.selectedCard.hidden = true;
  el.resultSection.hidden = true;

  try {
    const response = await apiGet(
      "gap",
      {
        songId,
        baseDate
      }
    );

    const data = response.data || response;

    if (!data.result) {
      throw new Error("判定結果を取得できませんでした。");
    }

    renderResult(data);
  } catch (error) {
    console.error(error);
    el.status.textContent =
      error?.message || "判定中にエラーが発生しました。";
  } finally {
    el.checkButton.textContent = "判定する";
    syncButton();
  }
}

el.songSelect.addEventListener("change", () => {
  el.selectedCard.hidden = true;
  el.resultSection.hidden = true;
  syncButton();
});

el.baseDate.addEventListener("change", () => {
  el.selectedCard.hidden = true;
  el.resultSection.hidden = true;
  syncButton();
});

el.checkButton.addEventListener("click", checkGap);

loadSongs();
