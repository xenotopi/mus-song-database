import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=2.0.2";

import {
  renderCommon
} from "./common.js?v=2.6.0";


renderCommon("about");


const elements = {
  status:
    document.getElementById(
      "status"
    ),

  content:
    document.getElementById(
      "aboutContent"
    ),

  summary:
    document.getElementById(
      "aboutSummary"
    ),

  coverageText:
    document.getElementById(
      "coverageText"
    ),

  updatedText:
    document.getElementById(
      "updatedText"
    )
};


async function loadAbout() {
  try {
    const response =
      await apiGet(
        "about",
        {},
        {
          timeoutMs: 30000,
          retryCount: 1
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

    elements.coverageText.textContent =
      [
        formatDate(
          summary.firstRecordedDate
        ),
        formatDate(
          summary.lastRecordedDate
        )
      ]
        .filter(Boolean)
        .join("〜") ||
      "収録期間を取得できませんでした。";

    elements.updatedText.textContent =
      `API確認日時：${String(
        data.updatedAt || ""
      ).replace(
        "T",
        " "
      )}`;

    elements.status.hidden = true;
    elements.content.hidden = false;

  } catch (error) {
    elements.status.classList.add(
      "error"
    );

    elements.status.textContent =
      error?.message ||
      "データ概要を取得できませんでした。";
  }
}


loadAbout();
