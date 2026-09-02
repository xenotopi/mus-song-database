(() => {
  "use strict";

  const DEFAULT_CARD = Object.freeze({
    id: "PREVIEW",
    mode: "single",
    song: "曲名",
    gapDays: "----",
    previousDate: "----",
    returnDate: "----",
    previousEvent: "前回イベント",
    returnEvent: "再歌唱イベント",
    singer: "歌唱名義",
    category: "区分"
  });

  const card = window.MusdbPostCard.readCard(DEFAULT_CARD);
  const categoryLabels = Object.freeze({
    "公式": "公式イベント",
    "ソロ": "声優ソロ系イベント"
  });
  if (card.mode !== "single") throw new Error(`未対応のblank-cardモードです: ${card.mode}`);
  window.MusdbPostCard.bindText({
    cardSong: card.song,
    gapDays: card.gapDays,
    previousDate: card.previousDate,
    returnDate: card.returnDate,
    previousEvent: card.previousEvent,
    returnEvent: card.returnEvent,
    cardSinger: card.singer,
    cardCategory: categoryLabels[card.category] || card.category
  });

  document.title = `${card.id} いつ振りカード｜μ's Song Database`;
  document.getElementById("blankCard")?.setAttribute("data-card-id", card.id);
  window.MusdbPostCard.finish();
})();
