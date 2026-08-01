import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.5.0";


renderCommon("event");


const elements = {
  eventName:
    document.getElementById(
      "eventName"
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

  diagnostic:
    document.getElementById(
      "diagnostic"
    ),

  detailLocalNav:
    document.getElementById(
      "detailLocalNav"
    ),

  quickNav:
    document.getElementById(
      "quickNav"
    ),

  previousButton:
    document.getElementById(
      "previousButton"
    ),

  previousTitle:
    document.getElementById(
      "previousTitle"
    ),

  previousDate:
    document.getElementById(
      "previousDate"
    ),

  nextButton:
    document.getElementById(
      "nextButton"
    ),

  nextTitle:
    document.getElementById(
      "nextTitle"
    ),

  nextDate:
    document.getElementById(
      "nextDate"
    ),

  eventPicker:
    document.getElementById(
      "eventPicker"
    ),

  discoverySection:
    document.getElementById(
      "discoverySection"
    ),

  eventDiscovery:
    document.getElementById(
      "eventDiscovery"
    ),

  mainContent:
    document.getElementById(
      "mainContent"
    ),

  eventInfo:
    document.getElementById(
      "eventInfo"
    ),

  eventStats:
    document.getElementById(
      "eventStats"
    ),

  venueSection:
    document.getElementById(
      "venueSection"
    ),

  venueLink:
    document.getElementById(
      "venueLink"
    ),

  venueName:
    document.getElementById(
      "venueName"
    ),

  venueMeta:
    document.getElementById(
      "venueMeta"
    ),

  venueNote:
    document.getElementById(
      "venueNote"
    ),

  songsSection:
    document.getElementById(
      "songsSection"
    ),

  songCount:
    document.getElementById(
      "songCount"
    ),

  songList:
    document.getElementById(
      "songList"
    ),

  songOrderNote:
    document.getElementById(
      "songOrderNote"
    )
};


const eventId =
  new URLSearchParams(
    location.search
  ).get("id") ||
  "EV0002";


function setLoading() {
  elements.eventName.textContent =
    "読み込み中…";

  elements.heroMeta.textContent =
    "JSONPでAPIへ接続しています。";

  elements.status.hidden =
    false;

  elements.status.classList.remove(
    "error"
  );

  elements.status.innerHTML = `
    <span class="loading-text">
      イベントデータを読み込んでいます
      <span class="loading-dots">
        <i></i><i></i><i></i>
      </span>
    </span>`;

  elements.retryButton.hidden =
    true;

  elements.diagnostic.hidden =
    true;
}


function setError(error) {
  elements.eventName.textContent =
    "イベントデータを表示できません";

  elements.heroMeta.textContent =
    "データ取得時にエラーが発生しました。";

  elements.status.hidden =
    false;

  elements.status.classList.add(
    "error"
  );

  elements.status.innerHTML = `
    <strong>
      イベントデータを取得できませんでした。
    </strong>

    <span>
      ${escapeHtml(
        error?.message ||
        "不明なエラー"
      )}
    </span>`;

  elements.retryButton.hidden =
    false;

  elements.diagnostic.hidden =
    false;

  elements.diagnostic.innerHTML = `
    <b>確認用情報</b><br>
    ページを再読み込みするか、
    下の「再試行」を押してください。`;
}



function renderEventDiscovery_(
  event,
  venue,
  songs,
  navigation
) {
  const cards = [];

  if (venue && venue.venueId) {
    cards.push({
      label: "VENUE",
      title: venue.venueName || "会場詳細",
      meta: [
        venue.prefectureCity,
        venue.country
      ].filter(Boolean).join("｜"),
      href:
        `venue.html?id=${encodeURIComponent(
          venue.venueId
        )}`
    });
  }

  if (songs.length && songs[0].songId) {
    cards.push({
      label: "FIRST SONG",
      title: songs[0].songName || "披露曲",
      meta: "披露曲一覧の先頭",
      href:
        `song.html?id=${encodeURIComponent(
          songs[0].songId
        )}`
    });
  }

  const next =
    navigation.next || null;

  const previous =
    navigation.previous || null;

  const nearby = next || previous;

  if (nearby) {
    cards.push({
      label: next
        ? "NEXT EVENT"
        : "PREVIOUS EVENT",
      title: nearby.eventName || "関連イベント",
      meta: formatDate(nearby.date),
      href:
        `event.html?id=${encodeURIComponent(
          nearby.eventId
        )}`
    });
  }

  elements.eventDiscovery.innerHTML =
    cards.map(card => `
      <a class="discovery-card" href="${card.href}">
        <span class="discovery-label">
          ${escapeHtml(card.label)}
        </span>

        <span class="discovery-title">
          ${escapeHtml(card.title || "—")}
        </span>

        <span class="discovery-meta">
          ${escapeHtml(card.meta || "")}
        </span>
      </a>`
    ).join("");
}


function renderEvent(event) {
  const statistics =
    event.statistics || {};

  const venue =
    event.venue || null;

  const songs =
    Array.isArray(
      event.songs
    )
      ? event.songs
      : [];

  const navigation =
    event.navigation || {};

  document.title =
    `${event.eventName || "イベント詳細"}｜μ's Song Database`;

  elements.eventName.textContent =
    event.eventName ||
    "イベント名未設定";

  elements.heroMeta.textContent =
    [
      formatDate(
        event.date
      ),
      event.category,
      event.eventType
    ]
      .filter(Boolean)
      .join("｜");

  elements.eventInfo.innerHTML =
    [
      [
        "開催日",
        formatDate(
          event.date
        )
      ],
      [
        "区分",
        event.category
      ],
      [
        "イベント種別",
        event.eventType
      ],
      [
        "Day",
        event.day || "—"
      ],
      [
        "公演",
        event.performance || "—"
      ],
      [
        "備考",
        event.note || "—"
      ]
    ]
      .map(
        ([label, value]) => `
          <dt>
            ${escapeHtml(label)}
          </dt>

          <dd>
            ${escapeHtml(
              value || "—"
            )}
          </dd>`
      )
      .join("");

  elements.eventStats.innerHTML =
    [
      [
        "登録曲数",
        statistics.songCount
      ],
      [
        "重複除外曲数",
        statistics.uniqueSongCount
      ],
      [
        "延べ歌唱人数",
        statistics.totalSingerCount
      ],
      [
        "平均歌唱人数",
        statistics.averageSingerCount
      ]
    ]
      .map(
        ([label, value]) => `
          <div class="stat">
            <div class="value">
              ${Number(
                value ?? 0
              ).toLocaleString(
                "ja-JP"
              )}
            </div>

            <div class="label">
              ${escapeHtml(label)}
            </div>
          </div>`
      )
      .join("");

  if (venue) {
    elements.venueName.textContent =
      venue.venueName ||
      "会場名未設定";

    elements.venueMeta.textContent =
      [
        venue.prefectureCity,
        venue.region,
        venue.country,
        venue.capacity
          ? `キャパ ${Number(
              venue.capacity
            ).toLocaleString(
              "ja-JP"
            )}人`
          : ""
      ]
        .filter(Boolean)
        .join("｜");

    elements.venueNote.textContent =
      venue.note || "";

    if (venue.venueId) {
      elements.venueLink.href =
        `venue.html?id=${encodeURIComponent(
          venue.venueId
        )}`;
    }

    elements.venueSection.hidden =
      false;
  }

  elements.songCount.textContent =
    `${songs.length}曲`;

  elements.songOrderNote.textContent =
    event.songOrderNote || "";

  elements.songList.innerHTML =
    songs.length
      ? songs
          .map(
            song => `
              <a
                class="song-row"
                href="song.html?id=${encodeURIComponent(
                  song.songId
                )}"
              >
                <span>
                  <span class="song-title">
                    ${escapeHtml(
                      song.songName ||
                      "曲名未設定"
                    )}
                  </span>

                  <span class="song-meta">
                    <span class="type-badge">
                      ${escapeHtml(
                        song.type ||
                        "未分類"
                      )}
                    </span>

                    <span>
                      歌唱者：
                      ${escapeHtml(
                        song.singer ||
                        "—"
                      )}
                    </span>
                  </span>
                </span>

                <span class="arrow">
                  ›
                </span>
              </a>`
          )
          .join("")
      : `
        <div class="empty">
          披露曲情報はありません。
        </div>`;

  renderNavigation(
    event,
    navigation
  );

  renderEventDiscovery_(
    event,
    venue,
    songs,
    navigation
  );

  elements.status.hidden =
    true;

  elements.detailLocalNav.hidden =
    false;

  elements.quickNav.hidden =
    false;

  elements.discoverySection.hidden =
    false;

  elements.mainContent.hidden =
    false;

  elements.songsSection.hidden =
    false;
}


function renderNavigation(
  event,
  navigation
) {
  const previous =
    navigation.previous || null;

  const next =
    navigation.next || null;

  if (previous) {
    elements.previousButton
      .classList.remove(
        "disabled"
      );

    elements.previousButton.href =
      `event.html?id=${encodeURIComponent(
        previous.eventId
      )}`;

    elements.previousTitle.textContent =
      previous.eventName;

    elements.previousDate.textContent =
      formatDate(
        previous.date
      );

  } else {
    elements.previousButton
      .classList.add(
        "disabled"
      );

    elements.previousButton
      .removeAttribute(
        "href"
      );

    elements.previousTitle.textContent =
      "前のイベントはありません";

    elements.previousDate.textContent =
      "";
  }

  if (next) {
    elements.nextButton
      .classList.remove(
        "disabled"
      );

    elements.nextButton.href =
      `event.html?id=${encodeURIComponent(
        next.eventId
      )}`;

    elements.nextTitle.textContent =
      next.eventName;

    elements.nextDate.textContent =
      formatDate(
        next.date
      );

  } else {
    elements.nextButton
      .classList.add(
        "disabled"
      );

    elements.nextButton
      .removeAttribute(
        "href"
      );

    elements.nextTitle.textContent =
      "次のイベントはありません";

    elements.nextDate.textContent =
      "";
  }

  const pickerItems =
    [
      previous,
      {
        eventId:
          event.eventId,

        eventName:
          event.eventName,

        date:
          event.date
      },
      next
    ]
      .filter(Boolean);

  elements.eventPicker.innerHTML =
    pickerItems
      .map(
        item => `
          <option
            value="${escapeHtml(
              item.eventId
            )}"
            ${
              item.eventId ===
              event.eventId
                ? "selected"
                : ""
            }
          >
            ${escapeHtml(
              formatDate(
                item.date
              )
            )}
            ｜
            ${escapeHtml(
              item.eventName
            )}
          </option>`
      )
      .join("");
}


async function loadEvent() {
  setLoading();

  elements.mainContent.hidden =
    true;

  elements.detailLocalNav.hidden =
    true;

  elements.quickNav.hidden =
    true;

  elements.discoverySection.hidden =
    true;

  elements.venueSection.hidden =
    true;

  elements.songsSection.hidden =
    true;

  try {
    const response =
      await apiGet(
        "event",
        {
          id: eventId
        },
        {
          timeoutMs: 25000,
          retryCount: 1
        }
      );

    renderEvent(
      response.data
    );

  } catch (error) {
    console.error(
      "Event API error:",
      error
    );

    setError(error);
  }
}


elements.retryButton.addEventListener(
  "click",
  loadEvent
);


elements.eventPicker.addEventListener(
  "change",
  () => {
    const selectedId =
      elements.eventPicker.value;

    if (selectedId) {
      location.href =
        `event.html?id=${encodeURIComponent(
          selectedId
        )}`;
    }
  }
);


loadEvent();
