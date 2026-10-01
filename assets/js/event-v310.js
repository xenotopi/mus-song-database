import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.9.6&cache=revision-nonblocking";

import {
  renderCommon
} from "./common.js?v=4.9.1&cache=revision-nonblocking";
import { staticEventDetail } from "./static-detail.js?v=1.2.0";


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

  shareActions: document.getElementById("eventShareActions"),
  shareButton: document.getElementById("eventShareButton"),
  copyUrlButton: document.getElementById("eventCopyUrlButton"),
  xShareButton: document.getElementById("eventXShareButton"),
  shareMessage: document.getElementById("eventShareMessage"),

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

  firstEventCount: document.getElementById("firstEventCount"),
  lastEventCount: document.getElementById("lastEventCount"),
  uniqueEventCount: document.getElementById("uniqueEventCount"),

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
let loadGeneration = 0;


function setLoading() {
  elements.shareActions.hidden = true;
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
  elements.shareActions.hidden = true;
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


function getEventPerformerRows_(
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

  return Array.from(
      countMap.values()
    )
      .sort((a, b) =>
        b.count - a.count ||
        String(a.name).localeCompare(
          String(b.name),
          "ja"
        )
      );
}

function renderPerformerSummary_(rows) {

  elements.performerList.innerHTML =
    rows.length
      ? rows.map(
          (item, index) => `
            <a class="performer-row" href="${item.singerId ? `singer.html?id=${encodeURIComponent(item.singerId)}` : `singer.html?name=${encodeURIComponent(item.name)}`}" aria-label="${escapeHtml(item.name)}の歌唱名義詳細を見る">
              <span class="performer-rank">
                ${index + 1}
              </span>

              <span class="performer-name">
                ${escapeHtml(item.name)}
              </span>

              <span class="performer-count">
                ${item.count}曲
              </span>
            </a>`
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
              <div class="event-song-row">
                <span class="event-song-order">
                  ${originalIndex + 1}
                </span>

                <span class="event-song-body">
                  <a class="event-song-title" href="song.html?id=${encodeURIComponent(songId)}">
                    ${escapeHtml(
                      song.songName ||
                      "曲名未設定"
                    )}
                    <span class="event-song-arrow" aria-hidden="true">›</span>
                  </a>

                  <span class="event-song-meta">
                    <span class="type-badge">
                      ${escapeHtml(
                        song.type ||
                        "未分類"
                      )}
                    </span>

                    <span>歌唱名義：${song.singerId
                      ? `<a class="event-song-singer-link" href="singer.html?id=${encodeURIComponent(song.singerId)}">${escapeHtml(song.singer || "—")}</a>`
                      : escapeHtml(song.singer || "—")}</span>

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

              </div>`;
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
  const firstSongs = Array.isArray(discover.firstPerformedSongs) ? discover.firstPerformedSongs : [];
  const lastSongs = Array.isArray(discover.lastPerformedSongs) ? discover.lastPerformedSongs : [];
  const uniqueSongs = Array.isArray(discover.uniqueSongs) ? discover.uniqueSongs : [];
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
    renderSongs(uniqueSongs);

  elements.firstEventSongs.innerHTML =
    renderSongs(firstSongs);

  elements.lastEventSongs.innerHTML =
    renderSongs(lastSongs);
  elements.firstEventCount.textContent = `${firstSongs.length}曲`;
  elements.lastEventCount.textContent = `${lastSongs.length}曲`;
  elements.uniqueEventCount.textContent = `${uniqueSongs.length}曲`;
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
  const performerRows = getEventPerformerRows_(songs);
  const infoRow = (label, value) => `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`;
  const plainRow = (label, value) => infoRow(label, escapeHtml(value || "—"));
  const relatedReleases = Array.isArray(event.relatedReleases)
    ? event.relatedReleases.filter(release => /^R\d{4}$/.test(String(release?.releaseId || "").trim()))
    : [];

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

  elements.shareActions.hidden = false;
  elements.xShareButton.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${event.eventName || "イベント詳細"} | μ's Song Database`)}&url=${encodeURIComponent(currentEventShareUrl_())}`;

  const infoRows = [
    plainRow("開催日", formatDate(event.date)),
    plainRow("区分", event.category),
    plainRow("イベント種別", event.eventType),
    plainRow("Day", event.day),
    plainRow("公演", event.performance)
  ];
  if (venue?.venueName) {
    const venueName = escapeHtml(venue.venueName);
    const venueLink = /^VE\d{4}$/.test(String(venue.venueId || ""))
      ? `<a href="venue.html?id=${encodeURIComponent(venue.venueId)}">${venueName}</a>`
      : venueName;
    const location = [venue.prefectureCity, venue.region, venue.country]
      .filter(Boolean).map(escapeHtml).join("｜");
    infoRows.push(infoRow("会場", `${venueLink}${location ? `<span class="event-info-sub">${location}</span>` : ""}`));
  }
  if (relatedReleases.length) {
    infoRows.push(infoRow("関連リリース", `<span class="event-info-links">${relatedReleases.map(release =>
      `<a href="release.html?id=${encodeURIComponent(release.releaseId)}">${escapeHtml(release.releaseName || "リリース名未設定")}</a>`
    ).join("")}</span>`));
  }
  const namedPerformers = performerRows.filter(item => item.name !== "—");
  if (namedPerformers.length) {
    infoRows.push(infoRow("歌唱者", `<span class="event-info-singers">${namedPerformers.map(item => {
      const href = item.singerId
        ? `singer.html?id=${encodeURIComponent(item.singerId)}`
        : `singer.html?name=${encodeURIComponent(item.name)}`;
      return `<a href="${href}">${escapeHtml(item.name)}</a>`;
    }).join("")}</span>`));
  }
  infoRows.push(plainRow("備考", event.note));
  elements.eventInfo.innerHTML = infoRows.join("");

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

  renderPerformerSummary_(performerRows);

  renderEventSongs_();

  renderNavigation(
    event,
    navigation
  );

  elements.status.hidden =
    true;

  elements.detailLocalNav.hidden =
    false;

  elements.quickNav.hidden =
    false;

  elements.eventPerformersSection.hidden =
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


function renderEventPair_(eventData, discoverData) {
  currentDiscover = discoverData || {};
  renderEvent(eventData);
  if (discoverData) renderEventInsights_(discoverData);
  elements.eventInsightsSection.hidden = !discoverData;
  const renderedEventId = String(eventData.eventId || eventId);
  if (/^EV\d+$/.test(renderedEventId)) {
    window.MusDbAnalytics?.trackOnce(
      `view_detail:event:${renderedEventId}`,
      "view_detail",
      {
        content_type: "event",
        item_id: renderedEventId,
        item_name: eventData.eventName || "",
        content_category: eventData.category || eventData.eventType || ""
      }
    );
  }
}

function currentEventShareUrl_() {
  return new URL(`share/event/${encodeURIComponent(eventId)}.html`, location.href).href;
}

function showEventShareMessage_(message) {
  elements.shareMessage.textContent = message;
  clearTimeout(showEventShareMessage_.timer);
  showEventShareMessage_.timer = setTimeout(() => { elements.shareMessage.textContent = ""; }, 2200);
}

async function copyCurrentEventUrl_() {
  const url = currentEventShareUrl_();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
  showEventShareMessage_("URLをコピーしました");
}

async function shareCurrentEvent_() {
  if (!currentEvent) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${currentEvent.eventName || "イベント詳細"} | μ's Song Database`,
        text: `${currentEvent.eventName || "イベント詳細"}の歌唱記録をチェック`,
        url: currentEventShareUrl_()
      });
      showEventShareMessage_("共有しました");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyCurrentEventUrl_();
}

function requestEventApi_(options = {}) {
  return apiGet("event", { id: eventId }, { timeoutMs: 25000, retryCount: 1, ...options });
}

function requestDiscoverApi_(options = {}) {
  return apiGet("discover", { type: "event", id: eventId }, { timeoutMs: 30000, retryCount: 1, ...options });
}

async function checkEventRevision_(snapshot, generation) {
  try {
    const revisionResponse = await apiGet("revision", {}, { timeoutMs: 15000, retryCount: 0 });
    const revision = revisionResponse?.data?.dataRevision;
    if (generation !== loadGeneration || !revision || revision === snapshot.revision) return;
    const [eventResponse, discoverResponse] = await Promise.all([
      requestEventApi_({ forceRefresh: true }),
      requestDiscoverApi_({ forceRefresh: true })
    ]);
    if (generation !== loadGeneration || eventResponse?.data?.eventId !== eventId ||
        discoverResponse?.data?.eventId !== eventId ||
        eventResponse.data._cache?.revision !== revision ||
        discoverResponse.data._cache?.revision !== revision) return;
    renderEventPair_(eventResponse.data, discoverResponse.data);
  } catch {
    // A valid Static Event remains visible when background JSONP is blocked.
  }
}


async function loadEvent() {
  const generation = ++loadGeneration;
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

  elements.eventPerformersSection.hidden =
    true;

  elements.eventInsightsSection.hidden =
    true;

  elements.songsSection.hidden =
    true;

  try {
    let snapshot = null;
    try {
      snapshot = await staticEventDetail(eventId);
    } catch {
      // The current Event API remains the fallback for missing snapshots.
    }
    if (generation !== loadGeneration) return;
    if (snapshot) {
      renderEventPair_(snapshot.data.event, snapshot.data.discover);
      requestAnimationFrame(() => {
        if (generation === loadGeneration) void checkEventRevision_(snapshot, generation);
      });
      return;
    }

    const discoverRequest = requestDiscoverApi_().then(result => result?.data || null).catch(() => null);
    const eventResponse = await requestEventApi_();
    if (generation !== loadGeneration) return;
    renderEventPair_(eventResponse.data || {}, null);
    void discoverRequest.then(discoverData => {
      if (generation !== loadGeneration || !discoverData) return;
      currentDiscover = discoverData;
      renderEventInsights_(discoverData);
      renderEventSongs_();
      elements.eventInsightsSection.hidden = false;
    });
  } catch (error) {
    if (generation !== loadGeneration) return;
    const isExpectedNotFound =
      /見つかりません|該当(?:する)?データ(?:が)?ありません/.test(
        String(error?.message || "")
      );

    if (!isExpectedNotFound) {
      console.error(
        "Event API error:",
        error
      );
    }

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

elements.shareButton.addEventListener("click", shareCurrentEvent_);
elements.copyUrlButton.addEventListener("click", copyCurrentEventUrl_);


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
