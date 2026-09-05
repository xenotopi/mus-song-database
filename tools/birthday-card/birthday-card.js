(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const required = (key) => {
    const value = params.get(key)?.trim();
    if (!value) throw new Error(`Birthdayカードの必須値がありません: ${key}`);
    return value;
  };
  const number = (key) => {
    const value = required(key);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`不正な件数: ${key}`);
    return value;
  };
  const characterName = params.get("displayName")?.trim() || required("characterName");
  const cardType = params.get("cardType") || "character";
  if (!["character", "cast"].includes(cardType)) throw new Error("cardTypeはcharacterまたはcastです");
  const honorific = params.has("honorific") ? params.get("honorific").trim() : ({ character: "ちゃん", cast: "さん" })[cardType];
  const birthday = required("birthday");
  const asOf = required("asOf");
  const variant = params.get("variant") || "B";
  if (!/^(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])$/.test(birthday)) throw new Error("birthdayはMM.DD形式で指定してください");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("asOfはYYYY-MM-DD形式で指定してください");
  if (!["A", "B"].includes(variant)) throw new Error("variantはAまたはBです");
  // A palette token reuses the existing shared brand mapping without redefining a color.
  const characterColor = params.get("accentColor")?.trim() || required("characterColor");
  if (!/^(?:var\(--(?:h|e|k|u|r|m|n|ha|ni)\)|#[\da-fA-F]{6})$/.test(characterColor)) throw new Error("不正なキャラクターカラーです");
  const card = document.getElementById("birthdayCard");
  card.dataset.variant = variant;
  card.dataset.cake = String(params.get("cake") !== "false");
  card.dataset.cardType = cardType;
  card.style.setProperty("--character-color", characterColor);
  window.MusdbPostCard.bindText({
    characterName, honorific, birthday,
    regularSongCount: number("regularSongCount"),
    officialPerformanceCount: number("officialPerformanceCount"),
    topSongName: required("topSongName"),
    topSongCount: number("topSongCount"),
    performanceNote: `公式歌唱記録：${characterName}を含む公式歌唱編成の記録`,
    asOf: `DB登録分・${asOf.replaceAll("-", ".")}集計`
  });
  window.MusdbPostCard.finish();
})();
