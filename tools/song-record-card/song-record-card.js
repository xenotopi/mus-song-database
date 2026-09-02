(() => {
  "use strict";

  const DEFAULT_CARD = Object.freeze({
    id: "PREVIEW",
    song: "曲名",
    firstDate: "----",
    lastDate: "----",
    officialCount: "--",
    soloCount: "--",
    completeCount: "--",
    latestDate: "",
    latestEvent: "",
    latestSinger: ""
  });

  const card = window.MusdbPostCard.readCard(DEFAULT_CARD);
  window.MusdbPostCard.bindText({
    cardSong: card.song,
    firstDate: card.firstDate,
    lastDate: card.lastDate,
    officialCount: card.officialCount,
    soloCount: card.soloCount,
    completeCount: card.completeCount,
    latestDate: card.latestDate,
    latestEvent: card.latestEvent,
    latestSinger: card.latestSinger
  });

  const latestRecord = document.getElementById("latestRecord");
  if (latestRecord && (!card.latestDate || !card.latestEvent || !card.latestSinger)) {
    latestRecord.hidden = true;
  }

  document.title = `${card.id} 楽曲記録カード｜μ's Song Database`;
  document.getElementById("songRecordCard")?.setAttribute("data-card-id", card.id);
  window.MusdbPostCard.finish();
})();
