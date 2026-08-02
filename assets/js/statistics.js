import {
  apiGet,
  escapeHtml
} from "./api.js?v=2.7.0";

import {
  renderCommon
} from "./common.js?v=2.7.0";


renderCommon("statistics");


const elements = {
  status:
    document.getElementById(
      "status"
    ),

  content:
    document.getElementById(
      "statisticsContent"
    ),

  summary:
    document.getElementById(
      "statSummary"
    ),

  chart:
    document.getElementById(
      "statisticsChart"
    ),

  chartKicker:
    document.getElementById(
      "chartKicker"
    ),

  chartTitle:
    document.getElementById(
      "chartTitle"
    )
};


let years = [];
let metric =
  "performanceCount";


const metricSettings = {
  performanceCount: {
    kicker: "PERFORMANCE RECORDS",
    title: "年別歌唱記録数",
    suffix: "件"
  },

  eventCount: {
    kicker: "EVENTS",
    title: "年別イベント数",
    suffix: "件"
  },

  uniqueSongCount: {
    kicker: "UNIQUE SONGS",
    title: "年別歌唱曲数",
    suffix: "曲"
  },

  venueCount: {
    kicker: "VENUES",
    title: "年別利用会場数",
    suffix: "会場"
  }
};


function renderSummary_(
  values,
  setting
) {
  const total =
    values.reduce(
      (sum, item) =>
        sum + item.value,
      0
    );

  const nonZero =
    values.filter(item =>
      item.value > 0
    );

  const average =
    nonZero.length
      ? total /
        nonZero.length
      : 0;

  const maximum =
    values.reduce(
      (best, item) =>
        item.value > best.value
          ? item
          : best,
      {
        year: "—",
        value: 0
      }
    );

  const cards = [
    {
      label: "期間合計",
      value:
        `${total.toLocaleString("ja-JP")}${setting.suffix}`,
      note:
        `${values.length}年間の合計`
    },
    {
      label: "最多の年",
      value:
        `${maximum.year}年`,
      note:
        `${maximum.value.toLocaleString("ja-JP")}${setting.suffix}`
    },
    {
      label: "年平均",
      value:
        `${Math.round(average).toLocaleString("ja-JP")}${setting.suffix}`,
      note:
        "0件の年を除いて算出"
    }
  ];

  elements.summary.innerHTML =
    cards.map(card => `
      <div class="stat-summary-card">
        <div class="stat-summary-label">
          ${escapeHtml(card.label)}
        </div>

        <div class="stat-summary-value">
          ${escapeHtml(card.value)}
        </div>

        <div class="stat-summary-note">
          ${escapeHtml(card.note)}
        </div>
      </div>`
    ).join("");
}


function renderChart() {
  const setting =
    metricSettings[metric];

  elements.chartKicker.textContent =
    setting.kicker;

  elements.chartTitle.textContent =
    setting.title;

  const values =
    years.map(item => ({
      year:
        String(item.year || ""),
      value:
        Number(item[metric] || 0)
    }));

  const max =
    Math.max(
      1,
      ...values.map(item =>
        item.value
      )
    );

  renderSummary_(
    values,
    setting
  );

  elements.chart.innerHTML =
    values.map(item => {
      const width =
        item.value > 0
          ? Math.max(
              1.5,
              item.value /
              max *
              100
            )
          : 0;

      const isMaximum =
        item.value === max &&
        item.value > 0;

      const formattedValue =
        `${item.value.toLocaleString("ja-JP")}${setting.suffix}`;

      return `
        <div
          class="stat-row${isMaximum ? " is-maximum" : ""}"
          title="${escapeHtml(item.year)}年：${escapeHtml(formattedValue)}"
        >
          <span class="stat-year">
            ${escapeHtml(item.year)}
          </span>

          <span class="stat-track">
            <span
              class="stat-bar"
              style="width:${width.toFixed(2)}%"
            ></span>
          </span>

          <span class="stat-value">
            ${escapeHtml(formattedValue)}
          </span>
        </div>`;
    }).join("");
}


async function loadStatistics() {
  try {
    const response =
      await apiGet(
        "trends",
        {},
        {
          timeoutMs: 30000,
          retryCount: 1
        }
      );

    years =
      response.data?.years || [];

    renderChart();

    elements.status.hidden = true;
    elements.content.hidden = false;

  } catch (error) {
    elements.status.classList.add(
      "error"
    );

    elements.status.textContent =
      error?.message ||
      "統計データを取得できませんでした。";
  }
}


document
  .querySelectorAll(
    "[data-metric]"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(
            "[data-metric]"
          )
          .forEach(item =>
            item.classList.remove(
              "active"
            )
          );

        button.classList.add(
          "active"
        );

        metric =
          button.dataset.metric;

        renderChart();
      }
    );
  });


loadStatistics();
