import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=3.4.0";

import {
  renderCommon
} from "./common.js?v=4.4.1";


renderCommon("song");


const elements = {
  songName: document.getElementById("songName"),
  heroMeta: document.getElementById("heroMeta"),
  status: document.getElementById("status"),
  retryButton: document.getElementById("retryButton"),
  songSwitcher: document.getElementById("songSwitcher"),
  previousSongButton: document.getElementById("previousSongButton"),
  previousSongTitle: document.getElementById("previousSongTitle"),
  nextSongButton: document.getElementById("nextSongButton"),
  nextSongTitle: document.getElementById("nextSongTitle"),
  songPicker: document.getElementById("songPicker"),
  detailLocalNav: document.getElementById("detailLocalNav"),
  mainContent: document.getElementById("mainContent"),
  songInfo: document.getElementById("songInfo"),
  songStats: document.getElementById("songStats"),
  songShareActions: document.getElementById("songShareActions"),
  shareButton: document.getElementById("shareButton"),
  copyUrlButton: document.getElementById("copyUrlButton"),
  xShareButton: document.getElementById("xShareButton"),
  shareMessage: document.getElementById("shareMessage"),
  releaseSection: document.getElementById("releaseSection"),
  releaseTitle: document.getElementById("releaseTitle"),
  releaseMeta: document.getElementById("releaseMeta"),
  releaseAction: document.getElementById("releaseAction"),
  discoverySection: document.getElementById("discoverySection"),
  songDiscovery: document.getElementById("songDiscovery"),
  songGapCheckerLink: document.getElementById("songGapCheckerLink"),
  songRecordsSection: document.getElementById("songRecordsSection"),
  songRecordGrid: document.getElementById("songRecordGrid"),
  songAnalysisSection: document.getElementById("songAnalysisSection"),
  songYearChart: document.getElementById("songYearChart"),
  officialSoloChart: document.getElementById("officialSoloChart"),
  gapChart: document.getElementById("gapChart"),
  yearTimeline: document.getElementById("yearTimeline"),
  historyYearReset: document.getElementById("historyYearReset"),
  singerRanking: document.getElementById("singerRanking"),
  relatedMasterSongs: document.getElementById("relatedMasterSongs"),
  songInsightsSection: document.getElementById("songInsightsSection"),
  coPerformedSongs: document.getElementById("coPerformedSongs"),
  songTopVenues: document.getElementById("songTopVenues"),
  historySection: document.getElementById("historySection"),
  historyCount: document.getElementById("historyCount"),
  visibleHistoryCount: document.getElementById("visibleHistoryCount"),
  historyList: document.getElementById("historyList"),
  historyFilters: document.getElementById("historyFilters"),
  historyMoreButton: document.getElementById("historyMoreButton")
};


const songId =
  new URLSearchParams(location.search).get("id") ||
  "S003";

let performances = [];
let historyFilter = "all";
let visibleHistoryLimit = 20;
let selectedYear = "all";
let currentSong = null;


function setLoading() {
  elements.songName.textContent = "読み込み中…";
  elements.heroMeta.textContent = "JSONPでAPIへ接続しています。";
  elements.status.hidden = false;
  elements.status.classList.remove("error");
  elements.status.innerHTML = `
    <span class="loading-text">
      曲データを読み込んでいます
      <span class="loading-dots"><i></i><i></i><i></i></span>
    </span>`;

  elements.retryButton.hidden = true;
  elements.songSwitcher.hidden = true;
  elements.detailLocalNav.hidden = true;
  elements.mainContent.hidden = true;
  elements.releaseSection.hidden = true;
  elements.songShareActions.hidden = true;
  elements.discoverySection.hidden = true;
  elements.songRecordsSection.hidden = true;
  elements.songAnalysisSection.hidden = true;
  elements.songInsightsSection.hidden = true;
  elements.historySection.hidden = true;
}


function setError(error) {
  elements.songName.textContent = "曲データを表示できません";
  elements.heroMeta.textContent = "データ取得時にエラーが発生しました。";
  elements.status.hidden = false;
  elements.status.classList.add("error");
  elements.status.innerHTML = `
    <strong>曲データを取得できませんでした。</strong>
    <span>${escapeHtml(error?.message || "不明なエラー")}</span>`;

  elements.retryButton.hidden = false;
}


function getPerformanceType_(performance) {
  return String(
    performance.type ||
    performance.category ||
    ""
  ).trim();
}


function renderHistory_() {
  const filteredByType =
    historyFilter === "all"
      ? performances
      : performances.filter(
          item =>
            getPerformanceType_(item) ===
            historyFilter
        );

  const filtered =
    selectedYear === "all"
      ? filteredByType
      : filteredByType.filter(item =>
          String(item.date || "").slice(0, 4) === selectedYear
        );

  const visible =
    filtered.slice(0, visibleHistoryLimit);

  elements.visibleHistoryCount.textContent =
    `${visible.length}/${filtered.length}件表示`;

  elements.historyList.innerHTML =
    visible.length
      ? visible.map(
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
                      formatDate(performance.date)
                    )}
                  </span>

                  <span class="type-badge">
                    ${escapeHtml(
                      getPerformanceType_(performance) ||
                      "未分類"
                    )}
                  </span>

                  <span>
                    歌唱者：
                    ${escapeHtml(
                      performance.singer || "—"
                    )}
                  </span>
                </span>
              </span>

              <span class="arrow">›</span>
            </a>`
        ).join("")
      : `<div class="empty">該当する歌唱履歴はありません。</div>`;

  elements.historyMoreButton.hidden =
    visible.length >= filtered.length;

  if (!elements.historyMoreButton.hidden) {
    elements.historyMoreButton.textContent =
      `もっと見る（残り${filtered.length - visible.length}件）`;
  }
}


function buildSongDiscovery_(song) {
  const singerCounts = new Map();

  performances.forEach(item => {
    const singer = String(item.singer || "").trim();
    if (!singer) return;

    singerCounts.set(
      singer,
      Number(singerCounts.get(singer) || 0) + 1
    );
  });

  const topSinger =
    Array.from(singerCounts.entries())
      .sort((a, b) => b[1] - a[1])[0] || null;

  const firstPerformance = performances[0] || null;
  const latestPerformance =
    performances.length
      ? performances[performances.length - 1]
      : null;

  const cards = [];

  if (firstPerformance) {
    cards.push({
      label: "FIRST PERFORMANCE",
      title: firstPerformance.eventName,
      meta: `初披露｜${formatDate(firstPerformance.date)}`,
      href: `event.html?id=${encodeURIComponent(firstPerformance.eventId)}`
    });
  }

  if (latestPerformance) {
    cards.push({
      label: "LAST PERFORMANCE",
      title: latestPerformance.eventName,
      meta: `最終披露｜${formatDate(latestPerformance.date)}`,
      href: `event.html?id=${encodeURIComponent(latestPerformance.eventId)}`
    });
  }

  const topSingerName =
    topSinger
      ? String(topSinger[0] || "").trim()
      : "";

  if (topSingerName) {
    cards.push({
      label: "主な歌唱名義",
      title: topSingerName,
      meta: "この名義の歌唱履歴を見る",
      href:
        `singer.html?name=${encodeURIComponent(
          topSingerName
        )}`
    });
  }

  elements.songDiscovery.innerHTML =
    cards.map((card, index) => `
      <a
        class="discovery-card ${index < 2 ? "discovery-card-performance" : ""}"
        href="${card.href}"
      >
        <span class="discovery-label">${escapeHtml(card.label)}</span>
        <span class="discovery-title">${escapeHtml(card.title || "—")}</span>
        <span class="discovery-meta">${escapeHtml(card.meta || "")}</span>
      </a>`
    ).join("");
}




function renderSongNavigation_(
  navigation
) {
  const previous =
    navigation.previous || null;

  const next =
    navigation.next || null;

  const songs =
    Array.isArray(
      navigation.songs
    )
      ? navigation.songs
      : [];

  if (previous) {
    elements.previousSongButton.classList.remove(
      "disabled"
    );

    elements.previousSongButton.href =
      `song.html?id=${encodeURIComponent(
        previous.songId
      )}`;

    elements.previousSongTitle.textContent =
      previous.songName;
  } else {
    elements.previousSongButton.classList.add(
      "disabled"
    );

    elements.previousSongButton.removeAttribute(
      "href"
    );

    elements.previousSongTitle.textContent =
      "前の曲はありません";
  }

  if (next) {
    elements.nextSongButton.classList.remove(
      "disabled"
    );

    elements.nextSongButton.href =
      `song.html?id=${encodeURIComponent(
        next.songId
      )}`;

    elements.nextSongTitle.textContent =
      next.songName;
  } else {
    elements.nextSongButton.classList.add(
      "disabled"
    );

    elements.nextSongButton.removeAttribute(
      "href"
    );

    elements.nextSongTitle.textContent =
      "次の曲はありません";
  }

  elements.songPicker.innerHTML =
    songs.map(item => `
      <option
        value="${escapeHtml(item.songId)}"
        ${item.songId === songId ? "selected" : ""}
      >
        ${escapeHtml(item.songName)}
      </option>`
    ).join("");

  elements.songSwitcher.hidden = false;
}



function parseDateValue_(value) {
  const normalized =
    String(value || "")
      .replaceAll("/", "-")
      .trim();

  const timestamp =
    Date.parse(normalized);

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}


function buildSongMetrics_() {
  const yearCounts =
    new Map();

  const uniqueDates =
    Array.from(
      new Set(
        performances
          .map(item =>
            String(item.date || "")
              .slice(0, 10)
          )
          .filter(Boolean)
      )
    )
      .map(date => ({
        date: date,
        timestamp:
          parseDateValue_(date)
      }))
      .filter(item =>
        item.timestamp !== null
      )
      .sort((a, b) =>
        a.timestamp - b.timestamp
      );

  performances.forEach(item => {
    const year =
      String(item.date || "")
        .slice(0, 4);

    if (!year) {
      return;
    }

    yearCounts.set(
      year,
      Number(
        yearCounts.get(year) || 0
      ) + 1
    );
  });

  const yearly =
    Array.from(
      yearCounts.entries()
    )
      .map(([year, count]) => ({
        year: year,
        count: count
      }))
      .sort((a, b) =>
        String(a.year).localeCompare(
          String(b.year)
        )
      );

  const peakYear =
    yearly
      .slice()
      .sort((a, b) =>
        b.count - a.count ||
        String(a.year).localeCompare(
          String(b.year)
        )
      )[0] || null;

  let longestGap = null;

  for (
    let index = 1;
    index < uniqueDates.length;
    index += 1
  ) {
    const previous =
      uniqueDates[index - 1];

    const current =
      uniqueDates[index];

    const days =
      Math.floor(
        (
          current.timestamp -
          previous.timestamp
        ) /
        86400000
      );

    if (
      !longestGap ||
      days > longestGap.days
    ) {
      longestGap = {
        days: days,
        from: previous.date,
        to: current.date
      };
    }
  }

  const officialCount =
    performances.filter(item =>
      getPerformanceType_(item) ===
      "公式"
    ).length;

  const soloCount =
    performances.filter(item =>
      getPerformanceType_(item) ===
      "ソロ"
    ).length;

  const total =
    performances.length || 1;

  return {
    yearly: yearly,
    peakYear: peakYear,
    longestGap: longestGap,
    officialCount: officialCount,
    soloCount: soloCount,
    officialRate:
      Math.round(
        officialCount / total * 100
      ),
    soloRate:
      Math.round(
        soloCount / total * 100
      )
  };
}



function buildGraphScaleLabels_(
  maximum,
  suffix
) {
  const safeMaximum =
    Math.max(
      1,
      Number(maximum || 0)
    );

  const values =
    [0, .25, .5, .75, 1]
      .map(rate =>
        Math.round(
          safeMaximum * rate
        )
      );

  return values.map(
    (value, index) => {
      if (
        index > 0 &&
        value === values[index - 1]
      ) {
        return "";
      }

      return (
        value.toLocaleString(
          "ja-JP"
        ) +
        suffix
      );
    }
  );
}


function renderSongRecords_() {
  const metrics =
    buildSongMetrics_();

  const completeCount =
    Number(currentSong?.statistics?.completePerformanceCount ?? 0);

  const completeRate =
    Number(
      currentSong?.statistics?.completeRate ??
      (performances.length ? completeCount / performances.length * 100 : 0)
    );

  const records = [
    {
      label: "最多歌唱年",
      value:
        metrics.peakYear
          ? `${metrics.peakYear.year}年`
          : "—",
      note:
        metrics.peakYear
          ? `${metrics.peakYear.count}件の歌唱記録`
          : "歌唱記録なし"
    },
    {
      label: "最長ブランク",
      value:
        metrics.longestGap
          ? `${metrics.longestGap.days.toLocaleString(
              "ja-JP"
            )}日`
          : "—",
      note:
        metrics.longestGap
          ? `${formatDate(
              metrics.longestGap.from
            )}〜${formatDate(
              metrics.longestGap.to
            )}`
          : "比較できる履歴がありません"
    },
    {
      label: "公式イベント比率",
      value:
        `${metrics.officialRate}%`,
      note:
        `公式 ${metrics.officialCount}件`
    },
    {
      label: "ソロイベント比率",
      value:
        `${metrics.soloRate}%`,
      note:
        `ソロ ${metrics.soloCount}件`
    },
    {
      label: "完全体率",
      help: "この曲の本来の歌唱メンバーが全員揃って歌った記録の割合です。",
      value: `${completeRate.toFixed(1)}%`,
      note: `完全体 ${completeCount}件／全${performances.length}件`
    }
  ];

  elements.songRecordGrid.innerHTML =
    records.map(record => `
      <article class="song-record-card">
        <div class="song-record-label">
          <span>${escapeHtml(record.label)}</span>
          ${record.help
            ? `<button
                class="metric-help"
                type="button"
                aria-label="${escapeHtml(record.label)}の説明"
                data-tooltip="${escapeHtml(record.help)}"
              >i</button>`
            : ""
          }
        </div>

        <div class="song-record-value">
          ${escapeHtml(record.value)}
        </div>

        <div class="song-record-note">
          ${escapeHtml(record.note)}
        </div>
      </article>`
    ).join("");

  const maxCount =
    Math.max(
      1,
      ...metrics.yearly.map(item =>
        item.count
      )
    );

  const scaleLabels =
    buildGraphScaleLabels_(
      maxCount,
      "件"
    );

  elements.songYearChart.innerHTML =
    metrics.yearly.length
      ? `
          <div class="song-year-scale">
            <span></span>

            <span class="song-year-scale-labels">
              ${scaleLabels.map(label =>
                `<span>${escapeHtml(label)}</span>`
              ).join("")}
            </span>

            <span></span>
          </div>

          ${metrics.yearly.map(item => {
            const width =
              Math.max(
                3,
                Math.round(
                  item.count /
                  maxCount *
                  100
                )
              );

            return `
              <div class="song-year-row">
                <span class="song-year-label">
                  ${escapeHtml(item.year)}
                </span>

                <span class="song-year-track">
                  <span
                    class="song-year-bar"
                    style="width:${width}%"
                  ></span>
                </span>

                <span class="song-year-value">
                  ${item.count}件
                </span>
              </div>`;
          }).join("")}
        `
      : `<div class="empty">年別データはありません。</div>`;
}


function renderSingerRanking_(
  discover
) {
  const singers =
    Array.isArray(
      discover.topSingers
    )
      ? discover.topSingers
      : [];

  elements.singerRanking.innerHTML =
    singers.length
      ? singers.map(
          (item, index) => `
            <a
              class="singer-rank-row"
              href="singer.html?name=${encodeURIComponent(
                item.name || ""
              )}"
              aria-label="${escapeHtml(
                item.name || "歌唱名義"
              )}の歌唱名義詳細を見る"
            >
              <span class="singer-rank-number">
                ${index + 1}
              </span>

              <span class="singer-rank-name">
                ${escapeHtml(
                  item.name || "—"
                )}
              </span>

              <span class="singer-rank-count">
                ${Number(
                  item.count || 0
                ).toLocaleString(
                  "ja-JP"
                )}件
              </span>
            </a>`
        ).join("")
      : `<div class="empty">歌唱名義データはありません。</div>`;

  const relatedSongs =
    Array.isArray(
      discover.relatedSongs
    )
      ? discover.relatedSongs
      : [];

  elements.relatedMasterSongs.innerHTML =
    relatedSongs.length
      ? relatedSongs.map(item => `
          <a
            class="related-master-row"
            href="song.html?id=${encodeURIComponent(
              item.songId
            )}"
          >
            <span>
              <span class="related-master-title">
                ${escapeHtml(
                  item.songName ||
                  "曲名未設定"
                )}
              </span>

              <span class="related-master-meta">
                ${escapeHtml(
                  [
                    item.version,
                    item.recordingCd,
                    item.media,
                    item.category
                  ]
                    .filter(Boolean)
                    .join("｜")
                )}
              </span>
            </span>

            <span class="related-master-reason">
              ${escapeHtml(
                item.reason || "関連曲"
              )}
            </span>
          </a>`
        ).join("")
      : `<div class="empty">同じ収録CD・メディア・区分の関連曲はありません。</div>`;
}


function renderSongInsights_(
  discover
) {
  const coSongs =
    discover.coPerformedSongs || [];

  const venues =
    discover.topVenues || [];

  elements.coPerformedSongs.innerHTML =
    coSongs.length
      ? coSongs.map(item => `
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
                同じイベントで歌唱
              </span>
            </span>

            <span class="insight-value">
              ${Number(
                item.eventCount || 0
              ).toLocaleString(
                "ja-JP"
              )}件
            </span>
          </a>`
        ).join("")
      : `<div class="empty">関連曲データはありません。</div>`;

  elements.songTopVenues.innerHTML =
    venues.length
      ? venues.map(item => `
          <a
            class="insight-row"
            href="venue.html?id=${encodeURIComponent(
              item.venueId
            )}"
          >
            <span>
              <span class="insight-title">
                ${escapeHtml(
                  item.venueName ||
                  "会場名未設定"
                )}
              </span>
            </span>

            <span class="insight-value">
              ${Number(
                item.count || 0
              ).toLocaleString(
                "ja-JP"
              )}回
            </span>
          </a>`
        ).join("")
      : `<div class="empty">会場データはありません。</div>`;
}


function renderOfficialRelease_(song) {
  elements.releaseTitle.textContent =
    song.recordingCd || song.displayName || song.songName || "作品名未設定";

  const items = [
    ["発売日", formatDate(song.releaseDate)],
    ["メディア", song.media || "—"],
    ["区分", song.category || "—"]
  ];

  elements.releaseMeta.innerHTML =
    items.map(([label, value]) => `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value || "—")}</dd>
      </div>
    `).join("");

  const url = String(song.officialReleaseUrl || "").trim();

  elements.releaseAction.innerHTML =
    url
      ? `
        <a class="official-release-link"
           href="${escapeHtml(url)}"
           target="_blank"
           rel="noopener noreferrer">
          公式作品ページを見る ↗
        </a>
        <div class="official-release-note">新しいタブで開きます</div>
      `
      : `<div class="official-release-note">公式作品ページは未登録です</div>`;

  elements.releaseSection.hidden = false;
}


function renderOfficialSoloChart_() {
  const metrics = buildSongMetrics_();
  const max = Math.max(1, metrics.officialCount, metrics.soloCount);

  const rows = [
    {
      label: "公式",
      count: metrics.officialCount,
      className: "official"
    },
    {
      label: "ソロ",
      count: metrics.soloCount,
      className: "solo"
    }
  ];

  elements.officialSoloChart.innerHTML =
    rows.map(item => `
      <div class="comparison-row">
        <span class="comparison-label">${item.label}</span>
        <span class="comparison-track">
          <span class="comparison-bar ${item.className}"
                style="display:block;width:${Math.max(3, Math.round(item.count / max * 100))}%"></span>
        </span>
        <span class="comparison-value">${item.count}件</span>
      </div>
    `).join("");
}


function buildGapData_() {
  const records = performances
    .map(item => ({
      date: String(item.date || "").slice(0, 10),
      timestamp: parseDateValue_(item.date)
    }))
    .filter(item => item.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  const unique = [];
  records.forEach(item => {
    if (!unique.length || unique[unique.length - 1].date !== item.date) {
      unique.push(item);
    }
  });

  const gaps = [];
  for (let i = 1; i < unique.length; i += 1) {
    gaps.push({
      from: unique[i - 1].date,
      to: unique[i].date,
      days: Math.max(0, Math.floor((unique[i].timestamp - unique[i - 1].timestamp) / 86400000))
    });
  }
  return gaps.slice(-8);
}


function renderGapChart_() {
  const gaps = buildGapData_();
  if (!gaps.length) {
    elements.gapChart.innerHTML = `<div class="empty">比較できる歌唱間隔がありません。</div>`;
    return;
  }

  const max = Math.max(1, ...gaps.map(item => item.days));
  elements.gapChart.innerHTML = gaps.map(item => `
    <div class="gap-row">
      <span class="gap-label">${escapeHtml(String(item.to).slice(0, 4))}</span>
      <span class="gap-track">
        <span class="gap-bar"
              style="display:block;width:${Math.max(3, Math.round(item.days / max * 100))}%"></span>
      </span>
      <span class="gap-value">${item.days.toLocaleString("ja-JP")}日</span>
    </div>
  `).join("");
}


function renderYearTimeline_() {
  const counts = new Map();
  performances.forEach(item => {
    const year = String(item.date || "").slice(0, 4);
    if (year) counts.set(year, Number(counts.get(year) || 0) + 1);
  });

  const years = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  elements.historyYearReset.hidden = selectedYear === "all";

  elements.yearTimeline.innerHTML = `
    <button class="year-timeline-button ${selectedYear === "all" ? "active" : ""}"
            type="button" data-year="all">
      全期間
      <span>${performances.length}件</span>
    </button>
    ${years.map(([year, count]) => `
      <button class="year-timeline-button ${selectedYear === year ? "active" : ""}"
              type="button" data-year="${escapeHtml(year)}">
        ${escapeHtml(year)}
        <span>${count}件</span>
      </button>
    `).join("")}
  `;
}


function showShareMessage_(message) {
  elements.shareMessage.textContent = message;
  window.clearTimeout(showShareMessage_.timer);
  showShareMessage_.timer = window.setTimeout(() => {
    elements.shareMessage.textContent = "";
  }, 2200);
}


async function shareCurrentSong_() {
  if (!currentSong) return;
  const title = `${currentSong.displayName || currentSong.songName} | μ's Song Database`;
  const text = `${currentSong.displayName || currentSong.songName}の歌唱履歴をチェック`;
  const url = location.href;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      showShareMessage_("共有しました");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyCurrentUrl_();
}


async function copyCurrentUrl_() {
  try {
    await navigator.clipboard.writeText(location.href);
    showShareMessage_("URLをコピーしました");
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = location.href;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
    showShareMessage_("URLをコピーしました");
  }
}

function renderSong(song) {
  currentSong = song;
  const statistics = song.statistics || {};

  performances =
    Array.isArray(song.performances)
      ? song.performances
      : [];

  historyFilter = "all";
  visibleHistoryLimit = 20;

  const displayName =
    song.displayName ||
    song.songName ||
    "曲名未設定";

  document.title =
    `${displayName}｜μ's Song Database`;

  elements.songName.textContent = displayName;

  if (elements.songGapCheckerLink) {
    elements.songGapCheckerLink.href =
      `gap-checker.html?song=${encodeURIComponent(song.songId || songId)}`;
  }

  elements.heroMeta.textContent = [
    song.media,
    song.category,
    formatDate(song.releaseDate)
  ].filter(Boolean).join("｜");

  elements.songInfo.innerHTML = [
    ["表示名", song.displayName || song.songName],
    ["バージョン", song.version || "—"],
    ["収録CD", song.recordingCd || "—"],
    ["発売日", formatDate(song.releaseDate)],
    ["メディア", song.media || "—"],
    ["区分", song.category || "—"]
  ].map(([label, value]) => `
    <dt>${escapeHtml(label)}</dt>
    <dd>${escapeHtml(value || "—")}</dd>`
  ).join("");

  const statItems = [
    {
      label: "歌唱イベント数",
      value: statistics.eventCount,
      help: "この曲が歌われたイベント・公演の数です。"
    },
    {
      label: "公式イベント",
      value: statistics.officialEventCount
    },
    {
      label: "ソロイベント",
      value: statistics.soloEventCount
    },
    {
      label: "歌唱記録数",
      value: statistics.performanceCount,
      help: "歌唱RAWに登録された歌唱データ数です。同一公演内で複数回歌われた場合は別記録として数えます。"
    }
  ];

  elements.songStats.innerHTML =
    statItems.map(item => `
      <div class="stat">
        <div class="value">${Number(item.value ?? 0).toLocaleString("ja-JP")}</div>
        <div class="label">
          <span>${escapeHtml(item.label)}</span>
          ${item.help
            ? `<button
                class="metric-help"
                type="button"
                aria-label="${escapeHtml(item.label)}の説明"
                data-tooltip="${escapeHtml(item.help)}"
              >i</button>`
            : ""
          }
        </div>
      </div>`
    ).join("");

  renderOfficialRelease_(song);


  elements.historyCount.textContent =
    `${performances.length}件`;

  buildSongDiscovery_(song);
  renderSongRecords_();
  renderOfficialSoloChart_();
  renderGapChart_();
  renderYearTimeline_();
  renderHistory_();

  elements.songShareActions.hidden = false;
  const shareText = encodeURIComponent(
    `${displayName} | μ's Song Database`
  );
  const shareUrl = encodeURIComponent(location.href);
  elements.xShareButton.href =
    `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;

  elements.status.hidden = true;
  elements.detailLocalNav.hidden = false;
  elements.mainContent.hidden = false;
  elements.releaseSection.hidden = false;
  elements.discoverySection.hidden = false;
  elements.songRecordsSection.hidden = false;
  elements.songAnalysisSection.hidden = false;
  elements.songInsightsSection.hidden = false;
  elements.historySection.hidden = false;
}



function setupMetricHelp_() {
  document.addEventListener("click", event => {
    const button = event.target.closest(".metric-help");

    document.querySelectorAll(".metric-help.open").forEach(item => {
      if (item !== button) {
        item.classList.remove("open");
      }
    });

    if (button) {
      button.classList.toggle("open");
      event.stopPropagation();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      document.querySelectorAll(".metric-help.open").forEach(item => {
        item.classList.remove("open");
      });
    }
  });
}

setupMetricHelp_();

async function loadSong() {
  setLoading();

  try {
    const [
      response,
      discoverResponse
    ] = await Promise.all([
      apiGet(
        "song",
        { id: songId },
        {
          timeoutMs: 20000,
          retryCount: 1
        }
      ),

      apiGet(
        "discover",
        {
          type: "song",
          id: songId
        },
        {
          timeoutMs: 30000,
          retryCount: 1
        }
      )
    ]);

    renderSong(response.data);
    const discoverData =
      discoverResponse.data || {};

    renderSongInsights_(
      discoverData
    );

    renderSingerRanking_(
      discoverData
    );

    renderSongNavigation_(
      discoverData.navigation || {}
    );

  } catch (error) {
    console.error("Song API error:", error);
    setError(error);
  }
}


elements.historyFilters.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest("[data-filter]");

    if (!button) return;

    elements.historyFilters
      .querySelectorAll(".filter-pill")
      .forEach(item =>
        item.classList.remove("active")
      );

    button.classList.add("active");
    historyFilter = button.dataset.filter;
    visibleHistoryLimit = 20;
    renderHistory_();
  }
);


elements.historyMoreButton.addEventListener(
  "click",
  () => {
    visibleHistoryLimit += 20;
    renderHistory_();
  }
);



elements.songPicker.addEventListener(
  "change",
  () => {
    const selectedSongId =
      elements.songPicker.value;

    if (selectedSongId) {
      location.href =
        `song.html?id=${encodeURIComponent(
          selectedSongId
        )}`;
    }
  }
);


elements.retryButton.addEventListener(
  "click",
  loadSong
);



elements.yearTimeline.addEventListener(
  "click",
  event => {
    const button = event.target.closest("[data-year]");
    if (!button) return;

    selectedYear = button.dataset.year || "all";
    visibleHistoryLimit = 20;
    renderYearTimeline_();
    renderHistory_();
  }
);

elements.historyYearReset.addEventListener(
  "click",
  () => {
    selectedYear = "all";
    visibleHistoryLimit = 20;
    renderYearTimeline_();
    renderHistory_();
  }
);

elements.shareButton.addEventListener("click", shareCurrentSong_);
elements.copyUrlButton.addEventListener("click", copyCurrentUrl_);

loadSong();
