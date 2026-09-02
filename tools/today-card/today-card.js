(() => {
  "use strict";

  const DEFAULT_CARD = Object.freeze({
    id: "X0009",
    date: "2013年9月1日",
    event: "みもパ！vol.1 第2回",
    song: "ダイヤモンドプリンセスの憂鬱",
    singer: "三森すずこ",
    category: "ソロ",
    note: "ショートVer."
  });

  const card = window.MusdbPostCard.readCard(DEFAULT_CARD, { category: ["type"] });

  const fields = {
    cardDate: card.date,
    cardEvent: card.event,
    cardSong: card.song,
    cardSinger: card.singer,
    cardCategory: card.category,
    cardNote: card.note
  };

  window.MusdbPostCard.bindText(fields);

  document.title = `${card.id} Todayカード｜μ's Song Database`;
  document.getElementById("todayCard")?.setAttribute("data-card-id", card.id);

  window.MusdbPostCard.finish();
})();
