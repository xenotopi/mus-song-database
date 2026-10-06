(() => {
  "use strict";
  const card = window.MusdbPostCard.readCard({ id: "X0030", total: "45", count: "39", firstDate: "2016.06.26", singer: "飯田里穂", note: "アカペラ歌唱" });
  window.MusdbPostCard.bindText(card);
  window.MusdbPostCard.finish();
})();
