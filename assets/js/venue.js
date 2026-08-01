import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.5.0";


renderCommon("venue");


const elements = {
  venueName:
    document.getElementById(
      "venueName"
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

  detailLocalNav:
    document.getElementById(
      "detailLocalNav"
    ),

  mainContent:
    document.getElementById(
      "mainContent"
    ),

  discoverySection:
    document.getElementById(
      "discoverySection"
    ),

  venueDiscovery:
    document.getElementById(
      "venueDiscovery"
    ),

  venueInfo:
    document.getElementById(
      "venueInfo"
    ),

  venueStats:
    document.getElementById(
      "venueStats"
    ),

  venueDates:
    document.getElementById(
      "venueDates"
    ),

  venueNav:
    document.getElementById(
      "venueNav"
    ),

  previousVenue:
    document.getElementById(
      "previousVenue"
    ),

  previousVenueName:
    document.getElementById(
      "previousVenueName"
    ),

  previousVenueMeta:
    document.getElementById(
      "previousVenueMeta"
    ),

  nextVenue:
    document.getElementById(
      "nextVenue"
    ),

  nextVenueName:
    document.getElementById(
      "nextVenueName"
    ),

  nextVenueMeta:
    document.getElementById(
      "nextVenueMeta"
    ),

  eventsSection:
    document.getElementById(
      "eventsSection"
    ),

  eventCount:
    document.getElementById(
      "eventCount"
    ),

  eventList:
    document.getElementById(
      "eventList"
    ),

  eventMoreButton:
    document.getElementById(
      "eventMoreButton"
    ),

  topSongsSection:
    document.getElementById(
      "topSongsSection"
    ),

  topSongList:
    document.getElementById(
      "topSongList"
    ),
};


const venueId =
  new URLSearchParams(
    location.search
  ).get("id") ||
  "VE0002";

let venueEvents = [];
let visibleEventLimit = 10;


function setLoading() {
  elements.venueName.textContent =
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
      会場データを読み込んでいます
      <span class="loading-dots">
        <i></i><i></i><i></i>
      </span>
    </span>`;

  elements.retryButton.hidden =
    true;

  elements.detailLocalNav.hidden =
    true;

  elements.mainContent.hidden =
    true;

  elements.discoverySection.hidden =
    true;

  elements.venueNav.hidden =
    true;

  elements.eventsSection.hidden =
    true;

  elements.topSongsSection.hidden =
    true;
}


function setError(error) {
  elements.venueName.textContent =
    "会場データを表示できません";

  elements.heroMeta.textContent =
    `Venue ID：${venueId}`;

  elements.status.hidden =
    false;

  elements.status.classList.add(
    "error"
  );

  elements.status.innerHTML = `
    <strong>
      会場データを取得できませんでした。
    </strong>

    <span>
      ${escapeHtml(
        error?.message ||
        "不明なエラー"
      )}
    </span>`;

  elements.retryButton.hidden =
    false;
}



function renderVenueEvents_() {
  const visible =
    venueEvents.slice(
      0,
      visibleEventLimit
    );

  elements.eventList.innerHTML =
    visible.length
      ? visible.map(
          event => `
            <a
              class="venue-event-row"
              href="event.html?id=${encodeURIComponent(
                event.eventId
              )}"
            >
              <span>
                <span class="venue-row-title">
                  ${escapeHtml(
                    event.eventName ||
                    "イベント名未設定"
                  )}
                </span>

                <span class="venue-row-meta">
                  <span>
                    ${escapeHtml(
                      formatDate(
                        event.date
                      )
                    )}
                  </span>

                  <span class="type-badge">
                    ${escapeHtml(
                      event.category ||
                      "未分類"
                    )}
                  </span>

                  <span>
                    ${escapeHtml(
                      [
                        event.eventType,
                        event.day,
                        event.performance
                      ]
                        .filter(Boolean)
                        .join("｜")
                    )}
                  </span>
                </span>
              </span>

              <span class="arrow">›</span>
            </a>`
        ).join("")
      : `<div class="empty">開催イベントはありません。</div>`;

  elements.eventMoreButton.hidden =
    visible.length >= venueEvents.length;

  if (!elements.eventMoreButton.hidden) {
    elements.eventMoreButton.textContent =
      `もっと見る（残り${venueEvents.length - visible.length}件）`;
  }
}


function renderVenueDiscovery_(
  venue,
  events,
  topSongs,
  navigation
) {
  const latestEvent =
    events.length
      ? events[events.length - 1]
      : null;

  const topSong =
    topSongs.length
      ? topSongs[0]
      : null;

  const nearby =
    navigation.next ||
    navigation.previous ||
    null;

  const cards = [];

  if (latestEvent) {
    cards.push({
      label: "LATEST EVENT",
      title: latestEvent.eventName,
      meta: formatDate(latestEvent.date),
      href:
        `event.html?id=${encodeURIComponent(
          latestEvent.eventId
        )}`
    });
  }

  if (topSong) {
    cards.push({
      label: "TOP SONG",
      title: topSong.songName,
      meta:
        `${Number(
          topSong.performanceCount || 0
        ).toLocaleString("ja-JP")}回歌唱`,
      href:
        `song.html?id=${encodeURIComponent(
          topSong.songId
        )}`
    });
  }

  if (nearby) {
    cards.push({
      label:
        navigation.next
          ? "NEXT VENUE"
          : "PREVIOUS VENUE",
      title: nearby.venueName,
      meta: [
        nearby.prefectureCity,
        nearby.country
      ].filter(Boolean).join("｜"),
      href:
        `venue.html?id=${encodeURIComponent(
          nearby.venueId
        )}`
    });
  }

  elements.venueDiscovery.innerHTML =
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


function renderVenue(venue) {
  const statistics =
    venue.statistics || {};

  const events =
    Array.isArray(
      venue.events
    )
      ? venue.events
      : [];

  const topSongs =
    Array.isArray(
      venue.topSongs
    )
      ? venue.topSongs
      : [];

  const navigation =
    venue.navigation || {};

  document.title =
    `${venue.venueName || "会場詳細"}｜μ's Song Database`;

  elements.venueName.textContent =
    venue.venueName ||
    "会場名未設定";

  elements.heroMeta.textContent = [
    venue.prefectureCity,
    venue.region,
    venue.country,
  ].filter(Boolean).join("｜");

  elements.venueInfo.innerHTML = [
    [
      "会場名",
      venue.venueName,
    ],
    [
      "都道府県・都市",
      venue.prefectureCity ||
      "—",
    ],
    [
      "地域",
      venue.region ||
      "—",
    ],
    [
      "国",
      venue.country ||
      "—",
    ],
    [
      "キャパ",
      venue.capacity
        ? `${Number(
            venue.capacity
          ).toLocaleString("ja-JP")}人`
        : "—",
    ],
    [
      "備考",
      venue.note ||
      "—",
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

  elements.venueStats.innerHTML = [
    [
      "イベント数",
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

  elements.venueDates.innerHTML = [
    [
      "初回開催日",
      formatDate(
        statistics.firstEventDate
      ),
    ],
    [
      "最終開催日",
      formatDate(
        statistics.lastEventDate
      ),
    ],
    [
      "披露曲数",
      `${Number(
        statistics.uniqueSongCount ?? 0
      ).toLocaleString("ja-JP")}曲`,
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

  venueEvents = events;
  visibleEventLimit = 10;

  elements.eventCount.textContent =
    `${events.length}件`;

  renderVenueEvents_();

  elements.topSongList.innerHTML =
    topSongs.length
      ? topSongs.map(
          (song, index) => `
            <a
              class="venue-song-row"
              href="song.html?id=${encodeURIComponent(
                song.songId
              )}"
            >
              <span>
                <span class="venue-row-title">
                  <span class="venue-rank">
                    ${index + 1}
                  </span>

                  ${escapeHtml(
                    song.songName ||
                    "曲名未設定"
                  )}
                </span>

                <span class="venue-row-meta">
                  <span>
                    歌唱記録
                    ${Number(
                      song.performanceCount ?? 0
                    ).toLocaleString("ja-JP")}件
                  </span>

                  <span>
                    イベント
                    ${Number(
                      song.eventCount ?? 0
                    ).toLocaleString("ja-JP")}件
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
          曲情報はありません。
        </div>`;

  renderVenueNavigation(
    navigation
  );

  elements.status.hidden =
    true;

  elements.detailLocalNav.hidden =
    false;

  elements.discoverySection.hidden =
    false;

  elements.mainContent.hidden =
    false;

  elements.venueNav.hidden =
    false;

  elements.eventsSection.hidden =
    false;

  elements.topSongsSection.hidden =
    false;
}


function renderVenueNavigation(
  navigation
) {
  const previous =
    navigation.previous ||
    null;

  const next =
    navigation.next ||
    null;

  if (previous) {
    elements.previousVenue.classList.remove(
      "disabled"
    );

    elements.previousVenue.href =
      `venue.html?id=${encodeURIComponent(
        previous.venueId
      )}`;

    elements.previousVenueName.textContent =
      previous.venueName;

    elements.previousVenueMeta.textContent =
      [
        previous.prefectureCity,
        previous.country,
      ].filter(Boolean).join("｜");

  } else {
    elements.previousVenue.classList.add(
      "disabled"
    );

    elements.previousVenue.removeAttribute(
      "href"
    );
  }

  if (next) {
    elements.nextVenue.classList.remove(
      "disabled"
    );

    elements.nextVenue.href =
      `venue.html?id=${encodeURIComponent(
        next.venueId
      )}`;

    elements.nextVenueName.textContent =
      next.venueName;

    elements.nextVenueMeta.textContent =
      [
        next.prefectureCity,
        next.country,
      ].filter(Boolean).join("｜");

  } else {
    elements.nextVenue.classList.add(
      "disabled"
    );

    elements.nextVenue.removeAttribute(
      "href"
    );
  }
}


async function loadVenue() {
  setLoading();

  try {
    const response =
      await apiGet(
        "venue",
        {
          id: venueId,
        },
        {
          timeoutMs: 15000,
          retryCount: 1,
        }
      );

    renderVenue(
      response.data
    );

  } catch (error) {
    console.error(
      "Venue JSONP API error:",
      error
    );

    setError(error);
  }
}


elements.retryButton.addEventListener(
  "click",
  loadVenue
);


loadVenue();



elements.eventMoreButton.addEventListener(
  "click",
  () => {
    visibleEventLimit += 10;
    renderVenueEvents_();
  }
);
