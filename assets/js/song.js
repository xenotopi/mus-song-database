import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.0.2";


renderCommon("song");


const elements = {
  songName:
    document.getElementById(
      "songName"
    ),

  heroMeta:
    document.getElementById(
      "heroMeta"
    ),

  status:
    document.getElementById(
      "status"
    ),

  retryButton:
    document.getElementById(
      "retryButton"
    ),

  mainContent:
    document.getElementById(
      "mainContent"
    ),

  songInfo:
    document.getElementById(
      "songInfo"
    ),

  songStats:
    document.getElementById(
      "songStats"
    ),

  songDates:
    document.getElementById(
      "songDates"
    ),

  historySection:
    document.getElementById(
      "historySection"
    ),

  historyCount:
    document.getElementById(
      "historyCount"
    ),

  historyList:
    document.getElementById(
      "historyList"
    ),
};


const songId =
  new URLSearchParams(
    location.search
  ).get("id") ||
  "S003";


function setLoading() {
  elements.songName.textContent =
    "読み込み中…";

  elements.heroMeta.textContent =
    "JSONPでAPIへ接続しています。";

  elements.status.hidden = false;
  elements.status.classList.remove(
    "error"
  );

  elements.status.innerHTML = `
    <span class="loading-text">
      曲データを読み込んでいます
      <span class="loading-dots">
        <i></i><i></i><i></i>
      </span>
    </span>`;

  elements.retryButton.hidden = true;
  elements.mainContent.hidden = true;
  elements.historySection.hidden = true;
}


function setError(error) {
  elements.songName.textContent =
    "曲データを表示できません";

  elements.heroMeta.textContent =
    `Song ID：${songId}`;

  elements.status.hidden = false;
  elements.status.classList.add(
    "error"
  );

  elements.status.innerHTML = `
    <strong>
      曲データを取得できませんでした。
    </strong>
    <span>
      ${escapeHtml(
        error?.message ||
        "不明なエラー"
      )}
    </span>`;

  elements.retryButton.hidden = false;
}


function renderSong(song) {
  const statistics =
    song.statistics || {};

  const performances =
    Array.isArray(song.performances)
      ? song.performances
      : [];

  const displayName =
    song.displayName ||
    song.songName ||
    "曲名未設定";

  document.title =
    `${displayName}｜μ's Song Database`;

  elements.songName.textContent =
    displayName;

  elements.heroMeta.textContent = [
    song.media,
    song.category,
    formatDate(song.releaseDate),
  ].filter(Boolean).join("｜");

  elements.songInfo.innerHTML = [
    [
      "曲ID",
      song.songId,
    ],
    [
      "表示名",
      song.displayName ||
      song.songName,
    ],
    [
      "バージョン",
      song.version || "—",
    ],
    [
      "収録CD",
      song.recordingCd || "—",
    ],
    [
      "発売日",
      formatDate(song.releaseDate),
    ],
    [
      "メディア",
      song.media || "—",
    ],
    [
      "区分",
      song.category || "—",
    ],
  ].map(
    ([label, value]) => `
      <dt>
        ${escapeHtml(label)}
      </dt>

      <dd>
        ${escapeHtml(
          value || "—"
        )}
      </dd>`
  ).join("");

  elements.songStats.innerHTML = [
    [
      "歌唱イベント数",
      statistics.eventCount,
    ],
    [
      "公式イベント",
      statistics.officialEventCount,
    ],
    [
      "ソロイベント",
      statistics.soloEventCount,
    ],
    [
      "歌唱記録数",
      statistics.performanceCount,
    ],
  ].map(
    ([label, value]) => `
      <div class="stat">
        <div class="value">
          ${Number(
            value ?? 0
          ).toLocaleString("ja-JP")}
        </div>

        <div class="label">
          ${escapeHtml(label)}
        </div>
      </div>`
  ).join("");

  elements.songDates.innerHTML = [
    [
      "初披露日",
      formatDate(
        statistics.firstPerformanceDate
      ),
    ],
    [
      "最終披露日",
      formatDate(
        statistics.lastPerformanceDate
      ),
    ],
  ].map(
    ([label, value]) => `
      <dt>
        ${escapeHtml(label)}
      </dt>

      <dd>
        ${escapeHtml(value)}
      </dd>`
  ).join("");

  elements.historyCount.textContent =
    `${performances.length}件`;

  elements.historyList.innerHTML =
    performances.length
      ? performances.map(
          performance => `
            <a
              class="song-row"
              href="event.html?id=${encodeURIComponent(
                performance.eventId
              )}"
            >
              <span>
                <span class="song-title">
                  ${escapeHtml(
                    performance.eventName ||
                    "イベント名未設定"
                  )}
                </span>

                <span class="song-meta">
                  <span>
                    ${escapeHtml(
                      formatDate(
                        performance.date
                      )
                    )}
                  </span>

                  <span class="type-badge">
                    ${escapeHtml(
                      performance.type ||
                      "未分類"
                    )}
                  </span>

                  <span>
                    歌唱者：
                    ${escapeHtml(
                      performance.singer ||
                      "—"
                    )}
                  </span>

                  <span>
                    ${escapeHtml(
                      performance.eventId ||
                      ""
                    )}
                  </span>
                </span>
              </span>

              <span class="arrow">
                ›
              </span>
            </a>`
        ).join("")
      : `
        <div class="empty">
          歌唱履歴はありません。
        </div>`;

  elements.status.hidden = true;
  elements.mainContent.hidden = false;
  elements.historySection.hidden = false;
}


async function loadSong() {
  setLoading();

  try {
    const response =
      await apiGet(
        "song",
        {
          id: songId,
        },
        {
          timeoutMs: 15000,
          retryCount: 1,
        }
      );

    renderSong(
      response.data
    );

  } catch (error) {
    console.error(
      "Song JSONP API error:",
      error
    );

    setError(error);
  }
}


elements.retryButton.addEventListener(
  "click",
  loadSong
);


loadSong();
