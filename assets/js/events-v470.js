import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.6.2";

import {
  renderCommon
} from "./common.js?v=4.6.2";

renderCommon("event");

const $ = id =>
  document.getElementById(id);

const el = {
  status: $("status"),
  heroSummary: $("heroSummary"),
  totalEventsChip: $("totalEventsChip"),
  yearsChip: $("yearsChip"),
  rangeChip: $("rangeChip"),
  pickupSection: $("pickupSection"),
  pickupGrid: $("pickupGrid"),
  timelineSection: $("timelineSection"),
  categoryFilters: $("categoryFilters"),
  eventTypeSelect: $("eventTypeSelect"),
  resultText: $("resultText"),
  yearNav: $("yearNav"),
  yearsContainer: $("yearsContainer")
};

let allEvents = [];
let allYears = [];
let selectedCategory = "";
let selectedEventType = "";

const params =
  new URLSearchParams(
    location.search
  );

function shortDate(value) {
  return formatDate(value) || "—";
}

function dateParts(value) {
  const text =
    String(value || "");

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return {
      main: "—",
      weekday: ""
    };
  }

  const date =
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

  const weekdays =
    ["日","月","火","水","木","金","土"];

  return {
    main:
      `${match[2]}.${match[3]}`,

    weekday:
      `(${weekdays[date.getDay()]})`
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
}

function getRecordTag(item) {
  if (
    Number(
      item.firstPerformanceCount || 0
    ) > 0
  ) {
    return (
      `${Number(
        item.firstPerformanceCount
      ).toLocaleString("ja-JP")}曲が初披露`
    );
  }

  if (
    Number(
      item.onlyHereCount || 0
    ) > 0
  ) {
    return (
      `このイベントだけの曲 ${Number(
        item.onlyHereCount
      ).toLocaleString("ja-JP")}曲`
    );
  }

  return "";
}

function renderPickupItem(
  label,
  item,
  value,
  meta
) {
  if (!item?.eventId) {
    return "";
  }

  return `
    <a
      class="history-pickup-card"
      href="event.html?id=${encodeURIComponent(item.eventId)}"
    >
      <div class="history-pickup-label">
        ${escapeHtml(label)}
      </div>

      <div class="history-pickup-title">
        ${escapeHtml(item.eventName || "イベント名未設定")}
      </div>

      <div class="history-pickup-value">
        ${escapeHtml(value)}
      </div>

      <div class="history-pickup-meta">
        ${escapeHtml(meta)}
      </div>
    </a>
  `;
}

function renderPickup(data) {
  const pickup =
    data.pickup || {};

  const cards = [
    renderPickupItem(
      "FIRST EVENT",
      pickup.firstEvent,
      shortDate(
        pickup.firstEvent?.date
      ),
      "記録上、最初のイベント"
    ),

    renderPickupItem(
      "MOST SONGS",
      pickup.mostSongsEvent,
      `${Number(
        pickup.mostSongsEvent?.uniqueSongCount || 0
      ).toLocaleString("ja-JP")}曲`,
      "最も多くの曲が披露されたイベント"
    ),

    renderPickupItem(
      "LATEST EVENT",
      pickup.latestEvent,
      shortDate(
        pickup.latestEvent?.date
      ),
      "最新のイベント記録"
    )
  ].filter(Boolean);

  el.pickupGrid.innerHTML =
    cards.join("");

  el.pickupSection.hidden =
    !cards.length;
}

function renderTypeOptions(
  eventTypes
) {
  el.eventTypeSelect.innerHTML =
    [
      `<option value="">すべての種別</option>`,
      ...(eventTypes || []).map(
        value =>
          `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
    ].join("");

  const requestedType =
    String(
      params.get("type") || ""
    ).trim();

  if (
    requestedType &&
    [...el.eventTypeSelect.options]
      .some(option =>
        option.value ===
        requestedType
      )
  ) {
    selectedEventType =
      requestedType;

    el.eventTypeSelect.value =
      requestedType;
  }
}

function applyInitialCategory() {
  const requested =
    String(
      params.get("category") || ""
    ).trim();

  if (
    ![
      "公式",
      "ソロ"
    ].includes(requested)
  ) {
    return;
  }

  selectedCategory =
    requested;

  el.categoryFilters
    .querySelectorAll(
      "[data-category]"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.category ===
        requested
      );
    });
}

function filteredEvents() {
  return allEvents.filter(item => {
    const categoryOK =
      !selectedCategory ||
      item.category ===
      selectedCategory;

    const typeOK =
      !selectedEventType ||
      item.eventType ===
      selectedEventType;

    return (
      categoryOK &&
      typeOK
    );
  });
}

function buildVisibleYears(items) {
  const map =
    new Map();

  items.forEach(item => {
    const year =
      item.year ||
      "日付不明";

    if (!map.has(year)) {
      map.set(year, []);
    }

    map.get(year).push(item);
  });

  return Array.from(
    map.entries()
  ).sort((a,b) => {
    if (
      a[0] === "日付不明"
    ) {
      return 1;
    }

    if (
      b[0] === "日付不明"
    ) {
      return -1;
    }

    return String(a[0])
      .localeCompare(
        String(b[0])
      );
  });
}

function renderYearNav(groups) {
  el.yearNav.innerHTML =
    groups.map(
      ([year]) => `
        <button
          type="button"
          class="history-year-button"
          data-year="${escapeHtml(year)}"
        >${escapeHtml(year)}</button>
      `
    ).join("");

  el.yearNav
    .querySelectorAll(
      "[data-year]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const target =
            document.getElementById(
              `history-year-${button.dataset.year}`
            );

          target?.scrollIntoView({
            behavior:
              "smooth",

            block:
              "start"
          });
        }
      );
    });
}

function renderEventCard(item) {
  const date =
    dateParts(
      item.date
    );

  const tag =
    getRecordTag(item);

  const dayPerformance =
    [
      date.weekday,
      item.day,
      item.performance
    ]
      .filter(Boolean)
      .join(" ");

  return `
    <div class="history-event-row">
      <div class="history-date">
        <span class="history-date-main">
          ${escapeHtml(date.main)}
        </span>
        <span class="history-date-sub">
          ${escapeHtml(dayPerformance)}
        </span>
      </div>

      <a
        class="history-event-card"
        href="event.html?id=${encodeURIComponent(item.eventId)}"
      >
        <div class="history-event-badges">
          ${
            item.category
              ? `<span class="history-event-badge ${item.category === "ソロ" ? "solo" : "official"}">${escapeHtml(item.category)}</span>`
              : ""
          }

          ${
            item.eventType
              ? `<span class="history-event-badge type">${escapeHtml(item.eventType)}</span>`
              : ""
          }
        </div>

        <div class="history-event-title">
          ${escapeHtml(item.eventName || "イベント名未設定")}
        </div>

        <div class="history-event-meta">
          ${
            item.venueName
              ? `<span><strong>会場</strong> ${escapeHtml(item.venueName)}</span>`
              : ""
          }

          <span>
            <strong>披露曲</strong>
            ${Number(item.uniqueSongCount || 0).toLocaleString("ja-JP")}曲
          </span>

          ${
            item.performanceCount !== item.uniqueSongCount
              ? `<span><strong>登録</strong> ${Number(item.performanceCount || 0).toLocaleString("ja-JP")}件</span>`
              : ""
          }
        </div>

        ${
          tag
            ? `<span class="history-record-tag">${escapeHtml(tag)}</span>`
            : ""
        }
      </a>
    </div>
  `;
}

function renderTimeline() {
  const items =
    filteredEvents();

  const groups =
    buildVisibleYears(
      items
    );

  el.resultText.textContent =
    `${items.length.toLocaleString("ja-JP")}イベントを表示`;

  renderYearNav(
    groups
  );

  el.yearsContainer.innerHTML =
    groups.length
      ? groups.map(
          ([year, yearItems]) => {
            const official =
              yearItems.filter(
                item =>
                  item.category === "公式"
              ).length;

            const solo =
              yearItems.filter(
                item =>
                  item.category === "ソロ"
              ).length;

            return `
              <section
                class="history-year-section"
                id="history-year-${escapeHtml(year)}"
              >
                <div class="history-year-head">
                  <h3 class="history-year-title">
                    ${escapeHtml(year)}
                  </h3>

                  <div class="history-year-stats">
                    ${yearItems.length.toLocaleString("ja-JP")}イベント
                    ｜公式${official.toLocaleString("ja-JP")}
                    ｜ソロ${solo.toLocaleString("ja-JP")}
                  </div>
                </div>

                <div class="history-timeline">
                  ${yearItems.map(renderEventCard).join("")}
                </div>
              </section>
            `;
          }
        ).join("")
      : `
        <div class="history-empty">
          条件に該当するイベントはありません。
        </div>
      `;
}

function syncUrl() {
  const url =
    new URL(
      location.href
    );

  if (selectedCategory) {
    url.searchParams.set(
      "category",
      selectedCategory
    );
  } else {
    url.searchParams.delete(
      "category"
    );
  }

  if (selectedEventType) {
    url.searchParams.set(
      "type",
      selectedEventType
    );
  } else {
    url.searchParams.delete(
      "type"
    );
  }

  history.replaceState(
    null,
    "",
    url
  );
}

function setupControls() {
  el.categoryFilters
    .querySelectorAll(
      "[data-category]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          selectedCategory =
            button.dataset.category ||
            "";

          el.categoryFilters
            .querySelectorAll(
              "[data-category]"
            )
            .forEach(item => {
              item.classList.toggle(
                "active",
                item === button
              );
            });

          syncUrl();
          renderTimeline();
        }
      );
    });

  el.eventTypeSelect
    .addEventListener(
      "change",
      () => {
        selectedEventType =
          el.eventTypeSelect.value;

        syncUrl();
        renderTimeline();
      }
    );
}

async function loadHistory() {
  try {
    const response =
      await apiGet(
        "eventHistory",
        {},
        {
          timeoutMs:
            30000,

          retryCount:
            1,

          cache:
            true,

          cacheTtlMs:
            300000
        }
      );

    const data =
      response.data || {};

    allEvents =
      Array.isArray(
        data.events
      )
        ? data.events
        : [];

    allYears =
      Array.isArray(
        data.years
      )
        ? data.years
        : [];

    if (!allEvents.length) {
      throw new Error(
        "イベント史データを取得できませんでした。"
      );
    }

    const summary =
      data.summary || {};

    el.totalEventsChip.textContent =
      `全${Number(summary.totalEvents || 0).toLocaleString("ja-JP")}イベント`;

    el.yearsChip.textContent =
      `${Number(summary.yearCount || 0).toLocaleString("ja-JP")}年間`;

    el.rangeChip.textContent =
      summary.firstYear &&
      summary.lastYear
        ? `${summary.firstYear} — ${summary.lastYear}`
        : "開催年データ";

    renderPickup(
      data
    );

    renderTypeOptions(
      data.eventTypes || []
    );

    applyInitialCategory();
    setupControls();
    renderTimeline();

    el.status.hidden =
      true;

    el.heroSummary.hidden =
      false;

    el.timelineSection.hidden =
      false;

  } catch (error) {
    console.error(error);

    el.status.hidden =
      false;

    el.status.textContent =
      error?.message ||
      "イベント史を取得できませんでした。";
  }
}

loadHistory();
