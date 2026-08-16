import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.7.0";

import {
  renderCommon
} from "./common.js?v=4.8.0";


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

  eventRecordsSection:
    document.getElementById(
      "eventRecordsSection"
    ),

  eventRecordGrid:
    document.getElementById(
      "eventRecordGrid"
    ),

  eventPerformersSection:
    document.getElementById(
      "eventPerformersSection"
    ),

  performerList:
    document.getElementById(
      "performerList"
    ),

  eventInsightsSection:
    document.getElementById(
      "eventInsightsSection"
    ),

  uniqueEventSongs:
    document.getElementById(
      "uniqueEventSongs"
    ),

  firstEventSongs:
    document.getElementById(
      "firstEventSongs"
    ),

  lastEventSongs:
    document.getElementById(
      "lastEventSongs"
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
    ),

  eventSongControls:
    document.getElementById(
      "eventSongControls"
    ),

  eventSongVisibleCount:
    document.getElementById(
      "eventSongVisibleCount"
    )
};


const eventId =
  String(
    new URLSearchParams(
      location.search
    ).get("id") ||
    ""
  ).trim();


let currentEvent = null;
let currentSongs = [];
let currentDiscover = {};
let activeSongFilter = "all";


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
  const missing = !eventId;
  const notFound = /見つかりません/.test(
    String(error?.message || "")
  );
  const title = missing
    ? "イベントが指定されていません"
    : notFound
      ? "該当するイベントが見つかりません"
      : "イベントデータを表示できません";

  elements.eventName.textContent =
    title;

  elements.heroMeta.textContent =
    missing
      ? "イベント一覧から見たいイベントを選択してください。"
      : "指定されたイベントを表示できませんでした。";

  document.title =
    `${title}｜μ's Song Database`;

  elements.status.hidden =
    false;

  elements.status.classList.add(
    "error"
  );

  elements.status.innerHTML = `
    <strong>
      ${escapeHtml(title)}
    </strong>

    <span>
      ${escapeHtml(
        error?.message ||
        "不明なエラー"
      )}
    </span>

    <a href="events.html">イベント一覧へ戻る</a>`;

  elements.retryButton.hidden =
    missing || notFound;

  elements.diagnostic.hidden =
    missing || notFound;

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
      label: "開催会場",
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
      label: "披露曲",
      title:
        songs.length === 1
          ? songs[0].songName
          : `${songs[0].songName} ほか${songs.length - 1}曲`,
      meta: "披露曲一覧を見る",
      href: "#songsSection"
    });
  }

  if (event.eventType) {
    cards.push({
      label: "同じ種別のイベント",
      title: event.eventType,
      meta: "同じイベント種別を検索",
      href:
        `search.html?q=${encodeURIComponent(
          event.eventType
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




function createSongIdSet_(
  items
) {
  return new Set(
    (
      Array.isArray(items)
        ? items
        : []
    )
      .map(item =>
        String(
          item.songId || ""
        ).trim()
      )
      .filter(Boolean)
  );
}


function renderEventRecords_(
  event,
  discover
) {
  const statistics =
    event.statistics || {};

  const uniqueSongs =
    Array.isArray(
      discover.uniqueSongs
    )
      ? discover.uniqueSongs
      : [];

  const firstSongs =
    Array.isArray(
      discover.firstPerformedSongs
    )
      ? discover.firstPerformedSongs
      : [];

  const lastSongs =
    Array.isArray(
      discover.lastPerformedSongs
    )
      ? discover.lastPerformedSongs
      : [];

  const records = [
    {
      label: "登録曲数",
      value:
        Number(
          statistics.songCount || 0
        ).toLocaleString("ja-JP"),
      note: "重複を含む登録行数"
    },
    {
      label: "初披露曲",
      value:
        `${firstSongs.length}曲`,
      note:
        firstSongs.length
          ? "この開催日が初歌唱"
          : "該当なし"
    },
    {
      label: "現時点で最終披露の曲",
      value:
        `${lastSongs.length}曲`,
      note:
        lastSongs.length
          ? "この開催日が最新歌唱"
          : "該当なし"
    },
    {
      label: "このイベントだけの曲",
      value:
        `${uniqueSongs.length}曲`,
      note:
        uniqueSongs.length
          ? "他イベントでの記録なし"
          : "該当なし"
    }
  ];

  elements.eventRecordGrid.innerHTML =
    records.map(record => `
      <article class="event-record-card">
        <div class="event-record-label">
          ${escapeHtml(record.label)}
        </div>

        <div class="event-record-value">
          ${escapeHtml(record.value)}
        </div>

        <div class="event-record-note">
          ${escapeHtml(record.note)}
        </div>
      </article>`
    ).join("");
}


function renderPerformerSummary_(
  songs
) {
  const countMap =
    new Map();

  songs.forEach(song => {
    const singer =
      String(
        song.singerDisplayName ||
        song.singer ||
        "—"
      ).trim() || "—";

    const key = String(
      song.singerId ||
      `${song.singerCategory || ""}｜${song.singer || singer}`
    ).trim();

    const current = countMap.get(key) || {
      singerId: song.singerId || "",
      name: singer,
      count: 0
    };

    current.count += 1;
    countMap.set(key, current);
  });

  const rows =
    Array.from(
      countMap.values()
    )
      .sort((a, b) =>
        b.count - a.count ||
        String(a.name).localeCompare(
          String(b.name),
          "ja"
        )
      );

  elements.performerList.innerHTML =
    rows.length
      ? rows.map(
          (item, index) => `
            <div class="performer-row" data-singer-id="${escapeHtml(item.singerId || "")}">
              <span class="performer-rank">
                ${index + 1}
              </span>

              <span class="performer-name">
                ${escapeHtml(item.name)}
              </span>

              <span class="performer-count">
                ${item.count}曲
              </span>
            </div>`
        ).join("")
      : `<div class="empty">歌唱名義情報はありません。</div>`;
}


function getSongFlags_(
  songId
) {
  const firstIds =
    createSongIdSet_(
      currentDiscover.firstPerformedSongs
    );

  const lastIds =
    createSongIdSet_(
      currentDiscover.lastPerformedSongs
    );

  const uniqueIds =
    createSongIdSet_(
      currentDiscover.uniqueSongs
    );

  return {
    first:
      firstIds.has(songId),

    last:
      lastIds.has(songId),

    unique:
      uniqueIds.has(songId)
  };
}


function matchesSongFilter_(
  song,
  filter
) {
  if (filter === "all") {
    return true;
  }

  const flags =
    getSongFlags_(
      String(song.songId || "")
    );

  return Boolean(
    flags[filter]
  );
}


function renderEventSongs_() {
  const filtered =
    currentSongs.filter(song =>
      matchesSongFilter_(
        song,
        activeSongFilter
      )
    );

  elements.eventSongVisibleCount.textContent =
    `${filtered.length}/${currentSongs.length}曲表示`;

  elements.songList.innerHTML =
    filtered.length
      ? filtered.map(
          (song, index) => {
            const songId =
              String(
                song.songId || ""
              );

            const originalIndex =
              currentSongs.indexOf(song);

            const flags =
              getSongFlags_(
                songId
              );

            const badges = [
              flags.first
                ? `<span class="event-song-badge first">初披露</span>`
                : "",

              flags.last
                ? `<span class="event-song-badge last">最終披露</span>`
                : "",

              flags.unique
                ? `<span class="event-song-badge unique">このイベントのみ</span>`
                : ""
            ]
              .filter(Boolean)
              .join("");

            return `
              <a
                class="event-song-row"
                href="song.html?id=${encodeURIComponent(
                  songId
                )}"
              >
                <span class="event-song-order">
                  ${originalIndex + 1}
                </span>

                <span class="event-song-body">
                  <span class="event-song-title">
                    ${escapeHtml(
                      song.songName ||
                      "曲名未設定"
                    )}
                  </span>

                  <span class="event-song-meta">
                    <span class="type-badge">
                      ${escapeHtml(
                        song.type ||
                        "未分類"
                      )}
                    </span>

                    <span>
                      歌唱名義：
                      ${escapeHtml(
                        song.singer ||
                        "—"
                      )}
                    </span>

                    ${
                      song.note
                        ? `<span>${escapeHtml(song.note)}</span>`
                        : ""
                    }
                  </span>

                  ${
                    badges
                      ? `<span class="event-song-badges">${badges}</span>`
                      : ""
                  }
                </span>

                <span class="event-song-arrow">
                  ›
                </span>
              </a>`;
          }
        ).join("")
      : `
        <div class="empty">
          この条件に該当する曲はありません。
        </div>`;
}


function updateSongFilterButtons_() {
  elements.eventSongControls
    .querySelectorAll(
      "[data-filter]"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.filter ===
        activeSongFilter
      );
    });
}


function renderEventInsights_(
  discover
) {
  const renderSongs =
    items =>
      items.length
        ? items.map(item => `
            <a
              class="insight-row"
              href="song.html?id=${encodeURIComponent(
                item.songId
              )}"
            >
              <span class="insight-title">
                ${escapeHtml(
                  item.songName ||
                  "曲名未設定"
                )}
              </span>

              <span class="insight-value">
                ›
              </span>
            </a>`
          ).join("")
        : `<div class="empty">該当する曲はありません。</div>`;

  elements.uniqueEventSongs.innerHTML =
    renderSongs(
      discover.uniqueSongs || []
    );

  elements.firstEventSongs.innerHTML =
    renderSongs(
      discover.firstPerformedSongs || []
    );

  elements.lastEventSongs.innerHTML =
    renderSongs(
      discover.lastPerformedSongs || []
    );
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

  currentEvent =
    event;

  currentSongs =
    songs;

  elements.songCount.textContent =
    `${songs.length}曲`;

  const orderIsSetList =
    event.songOrderIsSetList === true;

  elements.songOrderNote.textContent =
    orderIsSetList
      ? (
          event.songOrderNote ||
          "実際の歌唱順で掲載しています。"
        )
      : (
          event.songOrderNote ||
          "掲載順は実際の歌唱順とは限りません。番号はデータベース上の登録順です。"
        );

  renderPerformerSummary_(
    songs
  );

  renderEventSongs_();

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

  elements.eventRecordsSection.hidden =
    false;

  elements.eventPerformersSection.hidden =
    false;

  elements.eventInsightsSection.hidden =
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

  const navigationEvents =
    Array.isArray(
      navigation.events
    )
      ? navigation.events
      : [];

  const pickerItems =
    navigationEvents.length
      ? navigationEvents
      : [
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
        ].filter(Boolean);

  elements.eventPicker.innerHTML =
    pickerItems
      .filter(item =>
        item &&
        item.eventId
      )
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
              [
                formatDate(
                  item.date
                ),
                item.eventName,
                item.day,
                item.performance
              ]
                .filter(Boolean)
                .join("｜")
            )}
          </option>`
      )
      .join("");
}


async function loadEvent() {
  if (!eventId) {
    setError({
      message:
        "イベント一覧から見たいイベントを選択してください。"
    });
    return;
  }

  setLoading();

  elements.mainContent.hidden =
    true;

  elements.detailLocalNav.hidden =
    true;

  elements.quickNav.hidden =
    true;

  elements.discoverySection.hidden =
    true;

  elements.eventRecordsSection.hidden =
    true;

  elements.eventPerformersSection.hidden =
    true;

  elements.eventInsightsSection.hidden =
    true;

  elements.venueSection.hidden =
    true;

  elements.songsSection.hidden =
    true;

  try {
    const [
      response,
      discoverResult
    ] =
      await Promise.all([
        apiGet(
          "event",
          {
            id: eventId
          },
          {
            timeoutMs: 25000,
            retryCount: 1
          }
        ),

        apiGet(
          "discover",
          {
            type: "event",
            id: eventId
          },
          {
            timeoutMs: 30000,
            retryCount: 1
          }
        ).catch(error => {
          console.warn(
            "Event discover API warning:",
            error
          );

          return {
            data: {}
          };
        })
      ]);

    currentDiscover =
      discoverResult &&
      discoverResult.data &&
      typeof discoverResult.data === "object"
        ? discoverResult.data
        : {};

    renderEvent(
      response.data
    );

    renderEventRecords_(
      response.data || {},
      currentDiscover
    );

    renderEventInsights_(
      currentDiscover
    );

    renderEventSongs_();

  } catch (error) {
    console.error(
      "Event API error:",
      error
    );

    setError(error);
  }
}


elements.eventSongControls.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        "[data-filter]"
      );

    if (!button) {
      return;
    }

    activeSongFilter =
      button.dataset.filter ||
      "all";

    updateSongFilterButtons_();
    renderEventSongs_();
  }
);


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
