"use strict";

// Approved, dated snapshots; never infer person statistics from post text or solo totals.
const BIRTHDAY_COLUMNS = Object.freeze({
  mode: "Birthday種別",
  displayName: "Birthday表示名",
  honorific: "Birthday敬称",
  birthday: "Birthday月日",
  themeColor: "Birthdayカラー",
  regularSongCount: "Birthday正規参加曲数",
  officialPerformanceCount: "Birthday公式歌唱記録数",
  topSongName: "Birthday最多曲名",
  topSongCount: "Birthday最多曲回数",
  asOf: "Birthday集計基準日"
});

function validateBirthday(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Birthdayデータがありません。");
  const result = {};
  for (const key of Object.keys(BIRTHDAY_COLUMNS)) {
    const value = data[key];
    if (typeof value !== "string" && typeof value !== "number") throw new Error(`Birthday ${key}がありません。`);
    result[key] = String(value).trim();
    if (key !== "honorific" && !result[key]) throw new Error(`Birthday ${key}が空です。`);
  }
  if (!["character", "cast"].includes(result.mode)) throw new Error("Birthday種別はcharacter / castです。");
  if (!/^#[\da-f]{6}$/i.test(result.themeColor)) throw new Error("Birthdayカラーは6桁HEXです。");
  if (!/^\d{2}\.\d{2}$/.test(result.birthday)) throw new Error("Birthday月日はMM.DDです。");
  const [month, day] = result.birthday.split(".").map(Number);
  const birthdayDate = new Date(Date.UTC(2000, month - 1, day));
  if (birthdayDate.getUTCMonth() + 1 !== month || birthdayDate.getUTCDate() !== day) throw new Error("Birthday月日が不正です。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.asOf)) throw new Error("Birthday集計基準日はYYYY-MM-DDです。");
  const date = new Date(`${result.asOf}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result.asOf) throw new Error("Birthday集計基準日が不正です。");
  for (const key of ["regularSongCount", "officialPerformanceCount", "topSongCount"]) {
    if (!/^\d+$/.test(result[key]) || !Number.isSafeInteger(Number(result[key]))) throw new Error(`Birthday ${key}は非負整数です。`);
    result[key] = Number(result[key]);
  }
  if (result.topSongCount > result.officialPerformanceCount) throw new Error("Birthday最多曲回数が公式歌唱記録数を超えています。");
  return result;
}

function birthdayFromRow(row, indexes) {
  const data = {};
  for (const [key, header] of Object.entries(BIRTHDAY_COLUMNS)) {
    if (!Object.hasOwn(indexes, header)) throw new Error(`不足ヘッダー: ${header}`);
    data[key] = row[indexes[header]] ?? "";
  }
  return validateBirthday(data);
}

function birthdayRenderValues(id, post) {
  if (post.categoryId !== "X08" || post.eventId || post.venueId || post.releaseId || post.scope) {
    throw new Error(`${id}: Birthdayのカテゴリまたは参照が不正です。`);
  }
  if (!/^S\d{3}$/.test(post.songId || "")) throw new Error(`${id}: Birthday最多曲のSong IDが必要です。`);
  const data = validateBirthday(post.birthdayCard);
  const { mode, themeColor, ...values } = data;
  return { id, ...values, cardType: mode, accentColor: themeColor, cake: "true" };
}

module.exports = { BIRTHDAY_COLUMNS, validateBirthday, birthdayFromRow, birthdayRenderValues };
