(() => {
  "use strict";

  const card = window.MusdbPostCard.readCard({
    id: "X0029",
    song1: "きっと青春が聞こえる",
    total1: "35",
    official1: "31",
    solo1: "4",
    song2: "どんなときもずっと",
    total2: "35",
    official2: "31",
    solo2: "4"
  });

  window.MusdbPostCard.bindText({
    song1: card.song1,
    total1: card.total1,
    official1: card.official1,
    solo1: card.solo1,
    song2: card.song2,
    total2: card.total2,
    official2: card.official2,
    solo2: card.solo2
  });

  document.title = `${card.id} 2曲比較カード｜μ's Song Database`;
  document.getElementById("comparisonCard")?.setAttribute("data-card-id", card.id);
  window.MusdbPostCard.finish();
})();
