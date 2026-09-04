(() => {
  "use strict";

  const DEFAULT_CARD = Object.freeze({
    id: "X0009",
    date: "2013年9月1日",
    event: "みもパ！vol.1 第2回",
    song: "ダイヤモンドプリンセスの憂鬱",
    singer: "三森すずこ",
    category: "ソロ",
    note: "ショートVer.",
    mode: "event",
    anniversary: "14周年",
    totalCount: "21",
    officialCount: "12",
    relatedSong: "Oh, Love & Peace!"
  });

  const card = window.MusdbPostCard.readCard(DEFAULT_CARD, { category: ["type"] });

  const fields = {
    cardDate: card.date,
    cardEvent: card.event,
    cardSong: card.song,
    cardSinger: card.singer,
    cardCategory: card.category,
    cardNote: card.note,
    cardReleaseSong: card.song,
    cardAnniversary: card.anniversary,
    cardTotalCount: card.totalCount,
    cardOfficialCount: card.officialCount,
    cardRelatedSong: card.relatedSong
  };

  window.MusdbPostCard.bindText(fields);

  document.title = `${card.id} Todayカード｜μ's Song Database`;
  const root = document.getElementById("todayCard");
  const isRelease = card.mode === "release";
  root?.setAttribute("data-card-id", card.id);
  root?.setAttribute("data-mode", isRelease ? "release" : "event");
  document.getElementById("eventTodayContent").hidden = isRelease;
  document.getElementById("releaseTodayContent").hidden = !isRelease;

  window.MusdbPostCard.finish();
})();
