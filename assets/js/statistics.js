import {
  apiGet,
  escapeHtml
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.6.0";


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


function renderChart() {
  const setting =
    metricSettings[metric];

  elements.chartKicker.textContent =
    setting.kicker;

  elements.chartTitle.textContent =
    setting.title;

  const max =
    Math.max(
      1,
      ...years.map(item =>
        Number(
          item[metric] || 0
        )
      )
    );

  elements.chart.innerHTML =
    years.map(item => {
      const value =
        Number(
          item[metric] || 0
        );

      const width =
        Math.max(
          value > 0
            ? 2
            : 0,
          Math.round(
            value /
            max *
            100
          )
        );

      return `
        <div class="stat-row">
          <span class="stat-year">
            ${escapeHtml(item.year)}
          </span>

          <span class="stat-track">
            <span
              class="stat-bar"
              style="width:${width}%"
            ></span>
          </span>

          <span class="stat-value">
            ${value.toLocaleString(
              "ja-JP"
            )}${setting.suffix}
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
