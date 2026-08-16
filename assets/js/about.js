import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.6.2";

import {
  renderCommon
} from "./common.js?v=4.8.0";


renderCommon("about");


const elements = {
  status:
    document.getElementById(
      "status"
    ),

  summary:
    document.getElementById(
      "aboutSummary"
    ),

  coverageText:
    document.getElementById(
      "coverageText"
    ),

  lastUpdated:
    document.getElementById(
      "aboutLastUpdated"
    ),

  apiUpdated:
    document.getElementById(
      "aboutApiUpdated"
    )
};


function formatPageUpdated() {
  const value =
    new Date(
      document.lastModified
    );

  if (
    Number.isNaN(
      value.getTime()
    )
  ) {
    elements.lastUpdated.textContent =
      "—";

    return;
  }

  elements.lastUpdated.dateTime =
    value
      .toISOString()
      .slice(
        0,
        10
      );

  elements.lastUpdated.textContent =
    new Intl.DateTimeFormat(
      "ja-JP",
      {
        dateStyle:
          "long"
      }
    ).format(value);
}


function formatApiUpdated(
  value
) {
  const date =
    new Date(
      value || ""
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short"
    }
  ).format(date);
}


async function loadAboutSummary() {
  try {
    const response =
      await apiGet(
        "about",
        {},
        {
          timeoutMs:
            30000,

          retryCount:
            1
        }
      );

    const data =
      response.data || {};

    const summary =
      data.summary || {};

    const items = [
      [
        summary.songCount,
        "管理曲数"
      ],
      [
        summary.eventCount,
        "登録イベント数"
      ],
      [
        summary.venueCount,
        "登録会場数"
      ],
      [
        summary.performanceCount,
        "歌唱記録数"
      ]
    ];

    elements.summary.innerHTML =
      items.map(
        ([value, label]) => `
          <div class="about-number">
            <strong>
              ${Number(
                value || 0
              ).toLocaleString(
                "ja-JP"
              )}
            </strong>

            <span>
              ${escapeHtml(label)}
            </span>
          </div>`
      ).join("");

    const firstDate =
      summary.firstRecordedDate
        ? formatDate(
            summary.firstRecordedDate
          )
        : "";

    const lastDate =
      summary.lastRecordedDate
        ? formatDate(
            summary.lastRecordedDate
          )
        : "";

    elements.coverageText.textContent =
      firstDate && lastDate
        ? `収録期間：${firstDate}〜${lastDate}`
        : "収録期間を取得できませんでした。";

    const apiUpdated =
      formatApiUpdated(
        data.updatedAt
      );

    elements.apiUpdated.textContent =
      apiUpdated
        ? `データ確認：${apiUpdated}`
        : "";

    elements.status.hidden = true;
    elements.summary.hidden = false;
    elements.coverageText.hidden = false;

  } catch (error) {
    console.error(error);

    elements.status.classList.add(
      "error"
    );

    elements.status.textContent =
      "データ概要を取得できませんでした。ページ本文はそのままご覧いただけます。";
  }
}


formatPageUpdated();
loadAboutSummary();
