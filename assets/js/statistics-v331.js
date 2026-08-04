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

  chartCanvas:
    document.getElementById(
      "statisticsChart"
    ),

  comparisonCanvas:
    document.getElementById(
      "comparisonChart"
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
    ),

  comparisonTitle:
    document.getElementById(
      "comparisonTitle"
    ),

  comparisonCards:
    document.getElementById(
      "comparisonCards"
    ),

  statisticsTable:
    document.getElementById(
      "statisticsTable"
    ),

  chartError:
    document.getElementById(
      "chartError"
    ),

  comparisonError:
    document.getElementById(
      "comparisonError"
    )
};


let years = [];
let metric =
  "performanceCount";
let chartMode =
  "bar";
let mainChart = null;
let comparisonChart = null;


function isMobileViewport_() {
  return window.matchMedia(
    "(max-width: 760px)"
  ).matches;
}


const metricSettings = {
  performanceCount: {
    kicker:
      "PERFORMANCE RECORDS",

    title:
      "年別の延べ歌唱記録数",

    shortTitle:
      "歌唱記録数",

    suffix:
      "件",

    officialKey:
      "officialPerformanceCount",

    soloKey:
      "soloPerformanceCount",

    totalLabel:
      "期間中の延べ歌唱記録数合計",

    maximumLabel:
      "歌唱記録数が最多の年",

    averageLabel:
      "1年あたりの平均歌唱記録数",

    totalNote:
      "同じ曲が複数回歌われた場合もすべて計上",

    averageNote:
      "歌唱記録がある年のみで算出",

    description:
      "同じ曲が複数回歌われた場合も、歌唱記録としてすべて数えます。グラフ上にカーソルを合わせると年ごとの数値を確認できます。"
  },

  eventCount: {
    kicker:
      "EVENTS",

    title:
      "年別の登録イベント数",

    shortTitle:
      "イベント数",

    suffix:
      "件",

    officialKey:
      "officialEventCount",

    soloKey:
      "soloEventCount",

    totalLabel:
      "期間中の登録イベント数合計",

    maximumLabel:
      "イベント数が最多の年",

    averageLabel:
      "1年あたりの平均イベント数",

    totalNote:
      "登録イベントを開催年ごとに集計",

    averageNote:
      "イベントがある年のみで算出",

    description:
      "登録イベントを開催年ごとに数えています。1公演を1イベントとして集計します。"
  },

  uniqueSongCount: {
    kicker:
      "UNIQUE SONGS",

    title:
      "年別の歌唱曲数（重複なし）",

    shortTitle:
      "歌唱曲数",

    suffix:
      "曲",

    officialKey:
      "officialUniqueSongCount",

    soloKey:
      "soloUniqueSongCount",

    totalLabel:
      "各年の歌唱曲数合計",

    maximumLabel:
      "歌唱曲数が最多の年",

    averageLabel:
      "1年あたりの平均歌唱曲数",

    totalNote:
      "各年で重複を除いた曲数を合算",

    averageNote:
      "歌唱曲がある年のみで算出",

    description:
      "その年に歌われた異なる曲数です。同じ曲が年内に複数回歌われても1曲として数えます。"
  },

  venueCount: {
    kicker:
      "VENUES",

    title:
      "年別の利用会場数（重複なし）",

    shortTitle:
      "利用会場数",

    suffix:
      "会場",

    officialKey:
      "officialVenueCount",

    soloKey:
      "soloVenueCount",

    totalLabel:
      "各年の利用会場数合計",

    maximumLabel:
      "利用会場数が最多の年",

    averageLabel:
      "1年あたりの平均利用会場数",

    totalNote:
      "各年で重複を除いた会場数を合算",

    averageNote:
      "会場利用がある年のみで算出",

    description:
      "その年に利用した異なる会場数です。同じ会場を年内に複数回利用しても1会場として数えます。"
  }
};


function getSetting_() {
  return metricSettings[
    metric
  ];
}


function getMetricValues_(
  key = metric
) {
  return years.map(item => ({
    year:
      String(
        item.year || ""
      ),

    value:
      Number(
        item[key] || 0
      )
  }));
}


function renderSummary_() {
  const setting =
    getSetting_();

  const values =
    getMetricValues_();

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
        year:
          "—",

        value:
          0
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
        maximum.value
          ? `${maximum.year}年`
          : "—",

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
      <article class="stat-summary-card">
        <div class="stat-summary-label">
          ${escapeHtml(card.label)}
        </div>

        <div class="stat-summary-value">
          ${escapeHtml(card.value)}
        </div>

        <div class="stat-summary-note">
          ${escapeHtml(card.note)}
        </div>
      </article>`
    ).join("");
}


function getChartDefaults_() {
  const setting =
    getSetting_();

  return {
    responsive:
      true,

    maintainAspectRatio:
      false,

    interaction: {
      mode:
        "index",

      intersect:
        false
    },

    plugins: {
      legend: {
        display:
          false
      },

      tooltip: {
        callbacks: {
          label:
            context =>
              `${setting.shortTitle}：${Number(context.raw || 0).toLocaleString("ja-JP")}${setting.suffix}`
        }
      }
    },

    scales: {
      x: {
        grid: {
          display:
            false
        },

        ticks: {
          color:
            "#64748b",

          autoSkip:
            false,

          maxRotation:
            0,

          minRotation:
            0,

          padding:
            isMobileViewport_()
              ? 8
              : 4,

          font: {
            weight:
              "700",

            size:
              isMobileViewport_()
                ? 11
                : 12
          }
        }
      },

      y: {
        beginAtZero:
          true,

        ticks: {
          precision:
            0,

          color:
            "#64748b",

          callback:
            value =>
              `${Number(value).toLocaleString("ja-JP")}${setting.suffix}`
        },

        grid: {
          color:
            "rgba(148,163,184,.18)"
        }
      }
    }
  };
}


function renderMainChart_() {
  elements.chartError.hidden =
    true;

  const setting =
    getSetting_();

  elements.chartKicker.textContent =
    setting.kicker;

  elements.chartTitle.textContent =
    setting.title;

  elements.chartDescription.textContent =
    setting.description;

  if (
    typeof window.Chart !==
    "function"
  ) {
    elements.chartError.hidden =
      false;

    elements.chartError.textContent =
      "Chart.jsを読み込めなかったため、グラフを表示できません。下の数値一覧は利用できます。";

    return;
  }

  if (mainChart) {
    mainChart.destroy();
  }

  const labels =
    years.map(item =>
      String(
        item.year || ""
      )
    );

  const values =
    years.map(item =>
      Number(
        item[metric] || 0
      )
    );

  const isLine =
    chartMode ===
    "line";

  mainChart =
    new window.Chart(
      elements.chartCanvas,
      {
        type:
          chartMode,

        data: {
          labels:
            labels,

          datasets: [
            {
              label:
                setting.shortTitle,

              data:
                values,

              borderColor:
                "#4f46e5",

              backgroundColor:
                isLine
                  ? "rgba(79,70,229,.13)"
                  : "rgba(79,70,229,.78)",

              hoverBackgroundColor:
                "#4338ca",

              borderWidth:
                isLine
                  ? 3
                  : 0,

              borderRadius:
                isLine
                  ? 0
                  : 7,

              categoryPercentage:
                isMobileViewport_()
                  ? .72
                  : .8,

              barPercentage:
                isMobileViewport_()
                  ? .78
                  : .9,

              pointRadius:
                isLine
                  ? 4
                  : 0,

              pointHoverRadius:
                isLine
                  ? 6
                  : 0,

              fill:
                isLine,

              tension:
                .3
            }
          ]
        },

        options:
          getChartDefaults_()
      }
    );
}


function renderComparison_() {
  elements.comparisonError.hidden =
    true;

  const setting =
    getSetting_();

  elements.comparisonTitle.textContent =
    `公式・ソロの年別${setting.shortTitle}比較`;

  const officialValues =
    years.map(item =>
      Number(
        item[
          setting.officialKey
        ] || 0
      )
    );

  const soloValues =
    years.map(item =>
      Number(
        item[
          setting.soloKey
        ] || 0
      )
    );

  const officialTotal =
    officialValues.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const soloTotal =
    soloValues.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const combined =
    officialTotal +
    soloTotal;

  const officialRatio =
    combined
      ? Math.round(
          officialTotal /
          combined *
          100
        )
      : 0;

  const soloRatio =
    combined
      ? 100 -
        officialRatio
      : 0;

  elements.comparisonCards.innerHTML =
    [
      {
        label:
          "公式",

        value:
          `${officialTotal.toLocaleString("ja-JP")}${setting.suffix}`,

        note:
          `全体の${officialRatio}%`
      },
      {
        label:
          "ソロ",

        value:
          `${soloTotal.toLocaleString("ja-JP")}${setting.suffix}`,

        note:
          `全体の${soloRatio}%`
      }
    ]
      .map(card => `
        <article class="comparison-card">
          <div class="comparison-card-label">
            ${escapeHtml(card.label)}
          </div>

          <div class="comparison-card-value">
            ${escapeHtml(card.value)}
          </div>

          <div class="comparison-card-note">
            ${escapeHtml(card.note)}
          </div>
        </article>`
      )
      .join("");

  if (
    typeof window.Chart !==
    "function"
  ) {
    elements.comparisonError.hidden =
      false;

    elements.comparisonError.textContent =
      "Chart.jsを読み込めなかったため、比較グラフを表示できません。";

    return;
  }

  if (comparisonChart) {
    comparisonChart.destroy();
  }

  comparisonChart =
    new window.Chart(
      elements.comparisonCanvas,
      {
        type:
          "bar",

        data: {
          labels:
            years.map(item =>
              String(
                item.year || ""
              )
            ),

          datasets: [
            {
              label:
                "公式",

              data:
                officialValues,

              backgroundColor:
                "rgba(79,70,229,.82)",

              categoryPercentage:
                isMobileViewport_()
                  ? .72
                  : .8,

              barPercentage:
                isMobileViewport_()
                  ? .76
                  : .9,

              borderRadius:
                5
            },
            {
              label:
                "ソロ",

              data:
                soloValues,

              backgroundColor:
                "rgba(236,72,153,.72)",

              categoryPercentage:
                isMobileViewport_()
                  ? .72
                  : .8,

              barPercentage:
                isMobileViewport_()
                  ? .76
                  : .9,

              borderRadius:
                5
            }
          ]
        },

        options: {
          responsive:
            true,

          maintainAspectRatio:
            false,

          interaction: {
            mode:
              "index",

            intersect:
              false
          },

          plugins: {
            legend: {
              position:
                "top",

              align:
                "end",

              labels: {
                usePointStyle:
                  true,

                boxWidth:
                  9
              }
            },

            tooltip: {
              callbacks: {
                label:
                  context =>
                    `${context.dataset.label}：${Number(context.raw || 0).toLocaleString("ja-JP")}${setting.suffix}`
              }
            }
          },

          scales: {
            x: {
              stacked:
                false,

              grid: {
                display:
                  false
              },

              ticks: {
                color:
                  "#64748b",

                autoSkip:
                  false,

                maxRotation:
                  0,

                minRotation:
                  0,

                padding:
                  isMobileViewport_()
                    ? 8
                    : 4,

                font: {
                  weight:
                    "700",

                  size:
                    isMobileViewport_()
                      ? 11
                      : 12
                }
              }
            },

            y: {
              beginAtZero:
                true,

              ticks: {
                precision:
                  0,

                color:
                  "#64748b",

                callback:
                  value =>
                    `${Number(value).toLocaleString("ja-JP")}${setting.suffix}`
              },

              grid: {
                color:
                  "rgba(148,163,184,.18)"
              }
            }
          }
        }
      }
    );
}


function renderTable_() {
  const setting =
    getSetting_();

  elements.statisticsTable.innerHTML =
    `
      <table>
        <thead>
          <tr>
            <th>年</th>
            <th>${escapeHtml(setting.shortTitle)}</th>
            <th>公式</th>
            <th>ソロ</th>
          </tr>
        </thead>

        <tbody>
          ${years.map(item => `
            <tr>
              <td>${escapeHtml(item.year)}</td>
              <td>${Number(item[metric] || 0).toLocaleString("ja-JP")}${escapeHtml(setting.suffix)}</td>
              <td>${Number(item[setting.officialKey] || 0).toLocaleString("ja-JP")}${escapeHtml(setting.suffix)}</td>
              <td>${Number(item[setting.soloKey] || 0).toLocaleString("ja-JP")}${escapeHtml(setting.suffix)}</td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
    `;
}


function renderAll_() {
  renderSummary_();
  renderMainChart_();
  renderComparison_();
  renderTable_();
}


async function loadStatistics_() {
  try {
    const response =
      await apiGet(
        "trends",
        {},
        {
          timeoutMs:
            30000,

          retryCount:
            1
        }
      );

    years =
      Array.isArray(
        response.data?.years
      )
        ? response.data.years
        : [];

    renderAll_();

    elements.status.hidden =
      true;

    elements.content.hidden =
      false;

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

        renderAll_();
      }
    );
  });


document
  .querySelectorAll(
    "[data-chart-mode]"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(
            "[data-chart-mode]"
          )
          .forEach(item =>
            item.classList.remove(
              "active"
            )
          );

        button.classList.add(
          "active"
        );

        chartMode =
          button.dataset.chartMode;

        renderMainChart_();
      }
    );
  });


loadStatistics_();



let resizeTimerV331 = null;

window.addEventListener(
  "resize",
  () => {
    clearTimeout(
      resizeTimerV331
    );

    resizeTimerV331 =
      setTimeout(
        () => {
          if (!years.length) {
            return;
          }

          renderMainChart_();
          renderComparison_();
        },
        180
      );
  }
);
