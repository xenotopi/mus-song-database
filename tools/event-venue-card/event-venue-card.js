(() => {
  "use strict";

  const DEFAULT_CARD = Object.freeze({
    id: "PREVIEW",
    mode: "event",
    title: "イベント名",
    meta: "開催日",
    category: "公式イベント",
    featureLabel: "会場",
    featureValue: "会場名",
    stat1Label: "登録曲数",
    stat1Value: "--",
    stat1Unit: "曲",
    stat2Label: "延べ歌唱人数（曲別合計）",
    stat2Value: "--",
    stat2Unit: "人",
    stat3Label: "フルメンバー歌唱",
    stat3Value: "--",
    stat3Unit: "曲",
    firstDate: "----",
    latestDate: "----"
  });

  const card = window.MusdbPostCard.readCard(DEFAULT_CARD);
  if (card.mode !== "event" && card.mode !== "venue") {
    throw new Error(`未対応のevent-venue-cardモードです: ${card.mode}`);
  }

  window.MusdbPostCard.bindText({
    cardSeries: card.mode === "event" ? "EVENT RECORD" : "VENUE RECORD",
    heroLabel: card.mode === "event" ? "EVENT" : "VENUE",
    cardTitle: card.title,
    cardMeta: card.meta,
    cardCategory: card.category,
    featureLabel: card.featureLabel,
    featureValue: card.featureValue,
    stat1Label: card.stat1Label,
    stat1Value: card.stat1Value,
    stat1Unit: card.stat1Unit,
    stat2Label: card.stat2Label,
    stat2Value: card.stat2Value,
    stat2Unit: card.stat2Unit,
    stat3Label: card.stat3Label,
    stat3Value: card.stat3Value,
    stat3Unit: card.stat3Unit,
    firstDate: card.firstDate,
    latestDate: card.latestDate
  });

  const cardElement = document.getElementById("recordCard");
  cardElement.dataset.mode = card.mode;
  cardElement.dataset.cardId = card.id;
  cardElement.setAttribute("aria-label", `${card.title} ${card.mode === "event" ? "イベント" : "会場"}記録 投稿カード`);
  document.getElementById("cardCategory").hidden = card.mode !== "event";
  document.getElementById("recordFeature").hidden = card.mode !== "event";
  document.getElementById("stat3Card").hidden = card.mode !== "event";
  document.getElementById("venueDates").hidden = card.mode !== "venue";
  document.title = `${card.id} ${card.mode === "event" ? "イベント" : "会場"}記録カード｜μ's Song Database`;
  window.MusdbPostCard.finish();
})();
