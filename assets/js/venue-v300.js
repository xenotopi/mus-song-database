import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.7.0";

import {
  renderCommon
} from "./common.js?v=4.9.1";


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

  venuePicker:
    document.getElementById(
      "venuePicker"
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

  venueRecordsSection:
    document.getElementById(
      "venueRecordsSection"
    ),

  venueRecordGrid:
    document.getElementById(
      "venueRecordGrid"
    ),

  venueAnalysisSection:
    document.getElementById(
      "venueAnalysisSection"
    ),

  venueYearChart:
    document.getElementById(
      "venueYearChart"
    ),

  venueSingerList:
    document.getElementById(
      "venueSingerList"
    ),

  venueInsightsSection:
    document.getElementById(
      "venueInsightsSection"
    ),

  venueHistoryEvents:
    document.getElementById(
      "venueHistoryEvents"
    ),

  venueFirstSongs:
    document.getElementById(
      "venueFirstSongs"
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

  venueEventControls:
    document.getElementById(
      "venueEventControls"
    ),

  venueYearSelect:
    document.getElementById(
      "venueYearSelect"
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
  String(
    new URLSearchParams(
      location.search
    ).get("id") ||
    ""
  ).trim();

let venueEvents = [];
let visibleEventLimit = 10;
let activeEventCategory = "all";
let activeEventYear = "all";
let currentVenueData = null;
let currentDiscoverData = {};


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

  elements.venueRecordsSection.hidden =
    true;

  elements.venueAnalysisSection.hidden =
    true;

  elements.venueInsightsSection.hidden =
    true;

  elements.venueNav.hidden =
    true;

  elements.eventsSection.hidden =
    true;

  elements.topSongsSection.hidden =
    true;
}


function setError(error) {
  const missing = !venueId;
  const notFound = /見つかりません/.test(
    String(error?.message || "")
  );
  const title = missing
    ? "会場が指定されていません"
    : notFound
      ? "該当する会場が見つかりません"
      : "会場データを表示できません";

  elements.venueName.textContent =
    title;

  elements.heroMeta.textContent =
    missing
      ? "会場一覧から見たい会場を選択してください。"
      : `Venue ID：${venueId}`;

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

    <a href="venues.html">会場一覧へ戻る</a>`;

  elements.retryButton.hidden =
    missing || notFound;
}



function getFilteredVenueEvents_() {
  return venueEvents.filter(event => {
    const categoryMatches =
      activeEventCategory === "all" ||
      String(event.category || "") ===
      activeEventCategory;

    const year =
      String(event.date || "")
        .slice(0, 4);

    const yearMatches =
      activeEventYear === "all" ||
      year === activeEventYear;

    return (
      categoryMatches &&
      yearMatches
    );
  });
}


function renderVenueEvents_() {
  const filtered =
    getFilteredVenueEvents_();

  const visible =
    filtered.slice(
      0,
      visibleEventLimit
    );

  elements.eventCount.textContent =
    `${filtered.length}/${venueEvents.length}件表示`;

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
      : `<div class="empty">条件に該当する開催イベントはありません。</div>`;

  elements.eventMoreButton.hidden =
    visible.length >= filtered.length;

  if (!elements.eventMoreButton.hidden) {
    elements.eventMoreButton.textContent =
      `もっと見る（残り${filtered.length - visible.length}件）`;
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




function buildVenueScaleLabelsV30_(
  maximum
) {
  const safeMaximum =
    Math.max(
      1,
      Number(maximum || 0)
    );

  return [0, .25, .5, .75, 1]
    .map(rate =>
      Math.round(
        safeMaximum * rate
      )
    )
    .map((value, index, values) =>
      index > 0 &&
      value === values[index - 1]
        ? ""
        : `${value}件`
    );
}


function renderVenueRecordsV30_(
  venue,
  discover
) {
  const statistics =
    venue.statistics || {};

  const topSongs =
    Array.isArray(venue.topSongs)
      ? venue.topSongs
      : [];

  const topSong =
    topSongs[0] || null;

  const records = [
    {
      label: "開催イベント数",
      value:
        `${Number(
          statistics.eventCount || 0
        ).toLocaleString("ja-JP")}件`,
      note:
        `公式 ${Number(
          statistics.officialEventCount || 0
        )}件｜ソロ ${Number(
          statistics.soloEventCount || 0
        )}件`
    },
    {
      label: "歌唱記録数",
      value:
        `${Number(
          discover.performanceCount ??
          statistics.performanceCount ??
          0
        ).toLocaleString("ja-JP")}件`,
      note: "この会場で登録された歌唱履歴"
    },
    {
      label: "歌われた曲数",
      value:
        `${Number(
          statistics.uniqueSongCount || 0
        ).toLocaleString("ja-JP")}曲`,
      note: "同じ曲の重複を除いて集計"
    },
    {
      label: "最多歌唱曲",
      value:
        topSong
          ? topSong.songName
          : "—",
      note:
        topSong
          ? `${Number(
              topSong.performanceCount || 0
            ).toLocaleString("ja-JP")}件の歌唱記録`
          : "曲情報なし"
    }
  ];

  elements.venueRecordGrid.innerHTML =
    records.map(record => `
      <article class="venue-record-card">
        <div class="venue-record-label">
          ${escapeHtml(record.label)}
        </div>

        <div class="venue-record-value">
          ${escapeHtml(record.value)}
        </div>

        <div class="venue-record-note">
          ${escapeHtml(record.note)}
        </div>
      </article>`
    ).join("");
}


function renderVenueAnalysisV30_(
  discover
) {
  const yearly =
    Array.isArray(
      discover.yearlyStats
    )
      ? discover.yearlyStats
      : [];

  const maximum =
    Math.max(
      1,
      ...yearly.map(item =>
        Number(
          item.eventCount || 0
        )
      )
    );

  const scale =
    buildVenueScaleLabelsV30_(
      maximum
    );

  elements.venueYearChart.innerHTML =
    yearly.length
      ? `
          <div class="venue-year-scale">
            <span></span>

            <span class="venue-year-scale-labels">
              ${scale.map(label =>
                `<span>${escapeHtml(label)}</span>`
              ).join("")}
            </span>

            <span></span>
          </div>

          ${yearly.map(item => {
            const count =
              Number(
                item.eventCount || 0
              );

            const width =
              Math.max(
                3,
                Math.round(
                  count /
                  maximum *
                  100
                )
              );

            return `
              <div class="venue-year-row">
                <span class="venue-year-label">
                  ${escapeHtml(item.year)}
                </span>

                <span class="venue-year-track">
                  <span
                    class="venue-year-bar"
                    style="width:${width}%"
                  ></span>
                </span>

                <span class="venue-year-value">
                  ${count}件
                </span>
              </div>`;
          }).join("")}
        `
      : `<div class="empty">年別開催データはありません。</div>`;

  const singers =
    Array.isArray(
      discover.topSingers
    )
      ? discover.topSingers
      : [];

  elements.venueSingerList.innerHTML =
    singers.length
      ? singers.map(
          (item, index) => `
            <div class="venue-singer-row" data-singer-id="${escapeHtml(item.singerId || "")}">
              <span class="venue-singer-rank">
                ${index + 1}
              </span>

              <span class="venue-singer-name">
                ${escapeHtml(
                  item.displayName ||
                  item.name ||
                  "—"
                )}
              </span>

              <span class="venue-singer-count">
                ${Number(
                  item.count || 0
                ).toLocaleString("ja-JP")}曲
              </span>
            </div>`
        ).join("")
      : `<div class="empty">歌唱名義データはありません。</div>`;
}


function setupVenueEventFiltersV30_() {
  const years =
    Array.from(
      new Set(
        venueEvents
          .map(event =>
            String(
              event.date || ""
            ).slice(0, 4)
          )
          .filter(Boolean)
      )
    ).sort().reverse();

  elements.venueYearSelect.innerHTML =
    `
      <option value="all">
        すべての年
      </option>
    ` +
    years.map(year => `
      <option value="${escapeHtml(year)}">
        ${escapeHtml(year)}年
      </option>`
    ).join("");
}


function renderVenueInsights_(
  discover
) {
  const historyItems = [
    discover.firstEvent
      ? {
          label: "初開催",
          ...discover.firstEvent
        }
      : null,

    discover.lastEvent
      ? {
          label: "最終開催",
          ...discover.lastEvent
        }
      : null
  ].filter(Boolean);

  elements.venueHistoryEvents.innerHTML =
    historyItems.length
      ? historyItems.map(item => `
          <a
            class="insight-row"
            href="event.html?id=${encodeURIComponent(
              item.eventId
            )}"
          >
            <span>
              <span class="insight-title">
                ${escapeHtml(
                  item.eventName ||
                  "イベント名未設定"
                )}
              </span>

              <span class="insight-meta">
                ${escapeHtml(
                  item.label
                )}｜
                ${escapeHtml(
                  formatDate(
                    item.date
                  )
                )}
              </span>
            </span>

            <span class="insight-value">›</span>
          </a>`
        ).join("")
      : `<div class="empty">イベントデータはありません。</div>`;

  const songs =
    discover.firstPerformedSongs || [];

  elements.venueFirstSongs.innerHTML =
    songs.length
      ? songs.map(item => `
          <a
            class="insight-row"
            href="song.html?id=${encodeURIComponent(
              item.songId
            )}"
          >
            <span>
              <span class="insight-title">
                ${escapeHtml(
                  item.songName ||
                  "曲名未設定"
                )}
              </span>

              <span class="insight-meta">
                ${escapeHtml(
                  formatDate(
                    item.date
                  )
                )}
              </span>
            </span>

            <span class="insight-value">›</span>
          </a>`
        ).join("")
      : `<div class="empty">初披露曲はありません。</div>`;
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

  currentVenueData =
    venue;

  venueEvents = events;
  visibleEventLimit = 10;
  activeEventCategory = "all";
  activeEventYear = "all";

  setupVenueEventFiltersV30_();
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

  elements.status.hidden =
    true;

  elements.detailLocalNav.hidden =
    false;

  elements.discoverySection.hidden =
    false;

  elements.venueRecordsSection.hidden =
    false;

  elements.venueAnalysisSection.hidden =
    false;

  elements.venueInsightsSection.hidden =
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
  const safeNavigation =
    navigation &&
    typeof navigation === "object"
      ? navigation
      : {};

  const previous =
    safeNavigation.previous ||
    null;

  const next =
    safeNavigation.next ||
    null;

  const rawVenues =
    safeNavigation.venues;

  let venues = [];

  if (
    Array.isArray(rawVenues)
  ) {
    venues = rawVenues;

  } else if (
    rawVenues &&
    Array.isArray(
      rawVenues.items
    )
  ) {
    venues =
      rawVenues.items;

  } else if (
    rawVenues &&
    typeof rawVenues === "object"
  ) {
    venues =
      Object.values(
        rawVenues
      ).filter(
        item =>
          item &&
          typeof item === "object"
      );
  }

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
        previous.country
      ].filter(Boolean).join("｜");

  } else {
    elements.previousVenue.classList.add(
      "disabled"
    );

    elements.previousVenue.removeAttribute(
      "href"
    );

    elements.previousVenueName.textContent =
      "前の会場はありません";

    elements.previousVenueMeta.textContent =
      "";
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
        next.country
      ].filter(Boolean).join("｜");

  } else {
    elements.nextVenue.classList.add(
      "disabled"
    );

    elements.nextVenue.removeAttribute(
      "href"
    );

    elements.nextVenueName.textContent =
      "次の会場はありません";

    elements.nextVenueMeta.textContent =
      "";
  }

  const validVenues =
    venues.filter(item =>
      item &&
      typeof item === "object" &&
      item.venueId &&
      item.venueName
    );

  elements.venuePicker.innerHTML =
    validVenues.length
      ? validVenues.map(item => `
          <option
            value="${escapeHtml(item.venueId)}"
            ${item.venueId === venueId ? "selected" : ""}
          >
            ${escapeHtml(
              [
                item.venueName,
                item.prefectureCity,
                item.country
              ]
                .filter(Boolean)
                .join("｜")
            )}
          </option>`
        ).join("")
      : `
          <option
            value="${escapeHtml(venueId)}"
            selected
          >
            現在の会場
          </option>`;
}


async function loadVenue() {
  if (!venueId) {
    setError({
      message:
        "会場一覧から見たい会場を選択してください。"
    });
    return;
  }

  setLoading();

  try {
    const [
      response,
      discoverResult
    ] =
      await Promise.all([
        apiGet(
          "venue",
          {
            id: venueId
          },
          {
            timeoutMs: 15000,
            retryCount: 1
          }
        ),

        apiGet(
          "discover",
          {
            type: "venue",
            id: venueId
          },
          {
            timeoutMs: 30000,
            retryCount: 1
          }
        ).catch(error => {
          console.warn(
            "Venue discover API warning:",
            error
          );

          return {
            data: {}
          };
        })
      ]);

    const venueData =
      response.data || {};

    const discoverData =
      discoverResult &&
      discoverResult.data &&
      typeof discoverResult.data === "object"
        ? discoverResult.data
        : {};

    const navigation =
      discoverData.navigation ||
      venueData.navigation ||
      {};

    renderVenue(
      venueData
    );

    currentDiscoverData =
      discoverData;

    renderVenueRecordsV30_(
      venueData,
      discoverData
    );

    const renderedVenueId = String(
      venueData.venueId || venueId
    );
    if (/^VE\d+$/.test(renderedVenueId)) {
      window.MusDbAnalytics?.trackOnce(
        `view_detail:venue:${renderedVenueId}`,
        "view_detail",
        {
          content_type: "venue",
          item_id: renderedVenueId,
          item_name: venueData.venueName || "",
          content_category:
            venueData.region ||
            venueData.country ||
            ""
        }
      );
    }

    renderVenueAnalysisV30_(
      discoverData
    );

    renderVenueInsights_(
      discoverData
    );

    renderVenueNavigation(
      navigation
    );

    renderVenueDiscovery_(
      venueData,
      Array.isArray(
        venueData.events
      )
        ? venueData.events
        : [],
      Array.isArray(
        venueData.topSongs
      )
        ? venueData.topSongs
        : [],
      navigation
    );

  } catch (error) {
    const isExpectedNotFound =
      /見つかりません|該当(?:する)?データ(?:が)?ありません/.test(
        String(error?.message || "")
      );

    if (!isExpectedNotFound) {
      console.error(
        "Venue JSONP API error:",
        error
      );
    }

    setError(error);
  }
}


elements.venuePicker.addEventListener(
  "change",
  () => {
    const selectedVenueId =
      elements.venuePicker.value;

    if (selectedVenueId) {
      location.href =
        `venue.html?id=${encodeURIComponent(
          selectedVenueId
        )}`;
    }
  }
);


elements.venueEventControls.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        "[data-category]"
      );

    if (!button) {
      return;
    }

    activeEventCategory =
      button.dataset.category ||
      "all";

    elements.venueEventControls
      .querySelectorAll(
        "[data-category]"
      )
      .forEach(item => {
        item.classList.toggle(
          "active",
          item.dataset.category ===
          activeEventCategory
        );
      });

    visibleEventLimit = 10;
    renderVenueEvents_();
  }
);


elements.venueYearSelect.addEventListener(
  "change",
  () => {
    activeEventYear =
      elements.venueYearSelect.value ||
      "all";

    visibleEventLimit = 10;
    renderVenueEvents_();
  }
);


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
