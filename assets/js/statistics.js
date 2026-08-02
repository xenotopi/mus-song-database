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
    ),

  chartDescription:
    document.getElementById(
      "chartDescription"
    )
};


let years = [];
let metric =
  "performanceCount";


const metricSettings = {
  performanceCount: {
    kicker: "PERFORMANCE RECORDS",
    title: "年別の延べ歌唱記録数",
    suffix: "件",
    totalLabel: "期間中の延べ歌唱記録数合計",
    maximumLabel: "歌唱記録数が最多の年",
    averageLabel: "1年あたりの平均歌唱記録数",
    totalNote: "同じ曲が複数回歌われた場合もすべて計上",
    averageNote: "歌唱記録がある年のみで算出",
    description:
      "同じ曲が複数回歌われた場合も、歌唱記録としてすべて数えます。棒の長さは最大年を100%として比較しています。"
  },

  eventCount: {
    kicker: "EVENTS",
    title: "年別の登録イベント数",
    suffix: "件",
    totalLabel: "期間中の登録イベント数合計",
    maximumLabel: "イベント数が最多の年",
    averageLabel: "1年あたりの平均イベント数",
    totalNote: "登録されているイベントを開催年ごとに集計",
    averageNote: "イベントがある年のみで算出",
    description:
      "登録イベントを開催年ごとに数えています。1公演を1イベントとして集計します。"
  },

  uniqueSongCount: {
    kicker: "UNIQUE SONGS",
    title: "年別の歌唱曲数（重複なし）",
    suffix: "曲",
    totalLabel: "各年の歌唱曲数合計",
    maximumLabel: "歌唱曲数が最多の年",
    averageLabel: "1年あたりの平均歌唱曲数",
    totalNote: "各年で重複を除いた曲数を合算",
    averageNote: "歌唱曲がある年のみで算出",
    description:
      "その年に歌われた異なる曲数です。同じ曲が年内に複数回歌われても1曲として数えます。"
  },

  venueCount: {
    kicker: "VENUES",
    title: "年別の利用会場数（重複なし）",
    suffix: "会場",
    totalLabel: "各年の利用会場数合計",
    maximumLabel: "利用会場数が最多の年",
    averageLabel: "1年あたりの平均利用会場数",
    totalNote: "各年で重複を除いた会場数を合算",
    averageNote: "会場利用がある年のみで算出",
    description:
      "その年に利用した異なる会場数です。同じ会場を年内に複数回利用しても1会場として数えます。"
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
      label:
        setting.totalLabel,
      value:
        `${total.toLocaleString("ja-JP")}${setting.suffix}`,
      note:
        setting.totalNote
    },
    {
      label:
        setting.maximumLabel,
      value:
        `${maximum.year}年`,
      note:
        `${maximum.value.toLocaleString("ja-JP")}${setting.suffix}`
    },
    {
      label:
        setting.averageLabel,
      value:
        `${Math.round(average).toLocaleString("ja-JP")}${setting.suffix}`,
      note:
        setting.averageNote
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



function buildStatisticsScale_(
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


function renderChart() {
  const setting =
    metricSettings[metric];

  elements.chartKicker.textContent =
    setting.kicker;

  elements.chartTitle.textContent =
    setting.title;

  elements.chartDescription.textContent =
    setting.description;

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

  const scaleLabels =
    buildStatisticsScale_(
      max,
      setting.suffix
    );

  elements.chart.innerHTML =
    `
      <div class="stat-scale">
        <span></span>

        <span class="stat-scale-labels">
          ${scaleLabels.map(label =>
            `<span>${escapeHtml(label)}</span>`
          ).join("")}
        </span>

        <span></span>
      </div>
    ` +
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
