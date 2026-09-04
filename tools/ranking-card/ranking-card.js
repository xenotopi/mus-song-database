(() => {
  "use strict";

  const DEFAULT_CARD = Object.freeze({
    id: "X0010",
    title: "公式歌唱数ランキング",
    label: "DATABASE RANKING",
    unit: "回",
    rows: JSON.stringify([
      { rank: 1, name: "ミはμ'sicのミ", value: 53 },
      { rank: 2, name: "Snow halation", value: 51 },
      { rank: 3, name: "僕らは今のなかで", value: 48 },
      { rank: 4, name: "僕らのLIVE 君とのLIFE", value: 46 },
      { rank: 5, name: "No brand girls", value: 35 }
    ])
  });

  const card = window.MusdbPostCard.readCard(DEFAULT_CARD);
  let rows;
  try {
    rows = JSON.parse(card.rows);
  } catch (_error) {
    throw new Error("ランキングrowsのJSON形式が不正です。");
  }
  if (!Array.isArray(rows) || rows.length !== 5) {
    throw new Error("ランキングrowsは5件必要です。");
  }
  rows.forEach((row, index) => {
    if (Number(row?.rank) !== index + 1 || !String(row?.name || "").trim() || !Number.isFinite(Number(row?.value))) {
      throw new Error(`ランキング${index + 1}位のデータが不正です。`);
    }
  });

  const fields = { cardTitle: card.title };
  rows.forEach((row, index) => {
    const rank = index + 1;
    fields[`rank${rank}Name`] = row.name;
    fields[`rank${rank}Count`] = String(row.value);
    fields[`rank${rank}Unit`] = card.unit;
  });

  window.MusdbPostCard.bindText(fields);

  document.title = `${card.id} ランキングカード｜μ's Song Database`;
  const cardElement = document.getElementById("rankingCard");
  cardElement?.setAttribute("data-card-id", card.id);
  cardElement?.setAttribute("aria-label", `${card.title} 投稿カード`);

  window.MusdbPostCard.finish();
})();
