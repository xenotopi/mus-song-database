"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArguments, renderCard } = require("./card-shared/render-card.cjs");
const { birthdayRenderValues } = require("./birthday-card/catalog-data.cjs");

const PUBLIC_API = "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";
const DEFAULT_CATALOG = path.join(__dirname, "post-card-catalog.json");
const DEFAULT_FIXTURES = path.join(__dirname, "fixtures", "post-card-fixtures.json");

function loadCatalog(filePath) {
  const catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!catalog || typeof catalog.posts !== "object") {
    throw new Error("投稿カードカタログの形式が不正です。");
  }
  return catalog;
}

function loadFixtures(filePath) {
  const catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!catalog || typeof catalog.fixtures !== "object") {
    throw new Error("投稿カードfixtureの形式が不正です。");
  }
  return catalog;
}

async function fetchApi(action, params = {}) {
  const url = new URL(PUBLIC_API);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Public API ${action} がHTTP ${response.status}を返しました。`);
  const payload = await response.json();
  if (!payload?.success || !payload.data) throw new Error(`Public API ${action} のレスポンスが不正です。`);
  return payload.data;
}

function formatJapaneseDate(isoDate) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!matched) throw new Error(`イベント日付の形式が不正です: ${isoDate || "空欄"}`);
  return `${Number(matched[1])}年${Number(matched[2])}月${Number(matched[3])}日`;
}

function formatDotDate(isoDate) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!matched) throw new Error(`発売日の形式が不正です: ${isoDate || "空欄"}`);
  return `${matched[1]}.${matched[2]}.${matched[3]}`;
}

function getJstYear(now = new Date()) {
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric"
  }).format(now);
  return Number(year);
}

async function buildTodayValues(id, post) {
  if (!post.eventId || !post.songId) {
    throw new Error(`${id}: Todayカードに必要なEvent IDまたはSong IDがありません。`);
  }
  const event = await fetchApi("event", { id: post.eventId });
  if (event.eventId !== post.eventId) throw new Error(`${id}: Event IDのAPI照合に失敗しました。`);
  const performance = event.songs?.find((song) => song.songId === post.songId);
  if (!performance) throw new Error(`${id}: ${post.eventId}に${post.songId}の歌唱記録がありません。`);
  return {
    id,
    date: formatJapaneseDate(event.date),
    event: event.eventName,
    song: performance.songName,
    singer: performance.singerDisplayName || performance.singer,
    category: displayTodayCategory(performance.singerCategory || performance.type || event.category),
    note: performance.note || ""
  };
}

async function buildReleaseTodayValues(id, post) {
  if (!post.releaseId || !post.songId) {
    throw new Error(`${id}: リリースTodayカードに必要なRelease IDまたはSong IDがありません。`);
  }
  if (!/^R\d{4}$/.test(post.releaseId)) throw new Error(`${id}: Release IDの形式が不正です。`);

  const song = await fetchApi("song", { id: post.songId });
  if (song.songId !== post.songId) throw new Error(`${id}: Song IDのAPI照合に失敗しました。`);
  if (!song.recordingCd || !song.releaseDate) throw new Error(`${id}: リリース情報がPublic APIにありません。`);

  const releaseYear = Number(String(song.releaseDate).slice(0, 4));
  const anniversary = getJstYear() - releaseYear;
  const totalCount = Number(song.statistics?.performanceCount);
  const officialCount = Number(song.statistics?.officialEventCount);
  if (!Number.isInteger(anniversary) || anniversary < 0
    || !Number.isFinite(totalCount) || !Number.isFinite(officialCount)) {
    throw new Error(`${id}: リリースTodayの集計値が不正です。`);
  }

  const search = await fetchApi("search", { q: song.recordingCd });
  const relatedSongs = (Array.isArray(search.results?.songs) ? search.results.songs : [])
    .filter((candidate) => candidate.songId !== song.songId
      && candidate.recordingCd === song.recordingCd
      && candidate.releaseDate === song.releaseDate
      && candidate.category === "カップリング");
  if (relatedSongs.length !== 1) {
    throw new Error(`${id}: 同日発売のカップリング曲を一意に特定できませんでした。`);
  }

  return {
    id,
    mode: "release",
    date: formatDotDate(song.releaseDate),
    song: song.recordingCd,
    anniversary: `${anniversary}周年`,
    totalCount: String(totalCount),
    officialCount: String(officialCount),
    relatedSong: relatedSongs[0].displayName || relatedSongs[0].songName
  };
}

const RANKING_SCOPES = Object.freeze({
  official: Object.freeze({
    category: "公式",
    title: "公式歌唱数ランキング",
    label: "DATABASE RANKING"
  }),
  solo: Object.freeze({
    category: "ソロ",
    title: "声優ソロ系歌唱数ランキング",
    label: "VOICE ACTOR SOLO RANKING"
  })
});

async function buildRankingValues(id, scopeValue) {
  const scope = String(scopeValue || "official").trim().toLowerCase();
  const definition = RANKING_SCOPES[scope];
  if (!definition) throw new Error(`${id}: X04の集計範囲はofficial / soloのいずれかです。`);
  const limit = 5;
  const data = await fetchApi("rankings", { limit, category: definition.category, schema: "4.2.1" });
  const songs = Array.isArray(data.songs) ? data.songs.slice(0, limit) : [];
  if (songs.length !== 5) throw new Error(`${id}: ランキング上位5件を取得できませんでした。`);
  songs.forEach((song, index) => {
    if (song.rank !== index + 1 || !song.songName || !Number.isFinite(Number(song.performanceCount))) {
      throw new Error(`${id}: ランキング${index + 1}位のAPIデータが不正です。`);
    }
  });
  return {
    id,
    title: definition.title,
    label: definition.label,
    unit: "回",
    rows: JSON.stringify(songs.map((song) => ({
      rank: song.rank,
      name: song.songName,
      value: Number(song.performanceCount)
    })))
  };
}

const BLANK_RANKING_SCOPES = Object.freeze({
  all: Object.freeze({ category: "", title: "全歌唱 ブランクランキング", label: "ALL PERFORMANCES" }),
  official: Object.freeze({ category: "公式", title: "公式歌唱 ブランクランキング", label: "OFFICIAL PERFORMANCES" }),
  solo: Object.freeze({ category: "ソロ", title: "声優ソロ系 ブランクランキング", label: "VOICE ACTOR SOLO" })
});

async function buildBlankRankingValues(id, scopeValue) {
  const scope = String(scopeValue || "all").trim().toLowerCase();
  const definition = BLANK_RANKING_SCOPES[scope];
  if (!definition) throw new Error(`${id}: ブランク集計対象はall / official / soloのいずれかです。`);
  const params = { limit: 1000, schema: "4.2.1" };
  if (definition.category) params.category = definition.category;
  const data = await fetchApi("rankings", params);
  const songs = Array.isArray(data.songs) ? data.songs : [];
  const rows = songs
    .filter((song) => song.songId && song.songName && Number.isFinite(Number(song.longestGapDays)) && Number(song.longestGapDays) > 0)
    .sort((left, right) => Number(right.longestGapDays) - Number(left.longestGapDays)
      || String(left.songId).localeCompare(String(right.songId)))
    .slice(0, 5)
    .map((song, index) => ({ rank: index + 1, name: song.songName, value: Number(song.longestGapDays) }));
  if (rows.length !== 5) throw new Error(`${id}: ブランクランキング上位5件を取得できませんでした。`);
  return {
    id,
    title: definition.title,
    label: definition.label,
    unit: "日",
    rows: JSON.stringify(rows)
  };
}

const displayEventCategory = (category) => ({
  "公式": "公式イベント",
  "ソロ": "声優ソロ系イベント"
})[category] || category;

const displayTodayCategory = (category) => ({
  "公式": "公式イベント",
  "ソロ": "声優ソロ系"
})[category] || category;

async function buildEventRecordValues(id, eventId) {
  const event = await fetchApi("event", { id: eventId });
  if (event.eventId !== eventId) throw new Error(`${id}: Event IDのAPI照合に失敗しました。`);
  const statistics = event.statistics || {};
  const numericFields = ["songCount", "totalSingerCount", "completeSongCount"];
  numericFields.forEach((field) => {
    if (!Number.isFinite(Number(statistics[field]))) throw new Error(`${id}: イベント統計${field}が不正です。`);
  });
  if (!event.eventName || !event.date || !event.venue?.venueName || !event.category) {
    throw new Error(`${id}: イベント記録カードの必須データが不足しています。`);
  }
  return {
    id,
    mode: "event",
    title: event.eventName,
    meta: formatJapaneseDate(event.date),
    category: displayEventCategory(event.category),
    featureLabel: "会場",
    featureValue: event.venue.venueName,
    stat1Label: "登録曲数",
    stat1Value: String(Number(statistics.songCount)),
    stat1Unit: "曲",
    stat2Label: "延べ歌唱人数（曲別合計）",
    stat2Value: String(Number(statistics.totalSingerCount)),
    stat2Unit: "人",
    stat3Label: "フルメンバー歌唱",
    stat3Value: String(Number(statistics.completeSongCount)),
    stat3Unit: "曲",
    firstDate: "",
    latestDate: ""
  };
}

async function buildVenueRecordValues(id, venueId) {
  const venue = await fetchApi("venue", { id: venueId });
  if (venue.venueId !== venueId) throw new Error(`${id}: Venue IDのAPI照合に失敗しました。`);
  const statistics = venue.statistics || {};
  const numericFields = ["performanceCount", "uniqueSongCount"];
  numericFields.forEach((field) => {
    if (!Number.isFinite(Number(statistics[field]))) throw new Error(`${id}: 会場統計${field}が不正です。`);
  });
  if (!venue.venueName || !statistics.firstEventDate || !statistics.lastEventDate) {
    throw new Error(`${id}: 会場記録カードの必須データが不足しています。`);
  }
  const location = [venue.prefectureCity, venue.country].filter(Boolean).join("｜");
  return {
    id,
    mode: "venue",
    title: venue.venueName,
    meta: location || "所在地未登録",
    category: "",
    featureLabel: "",
    featureValue: "",
    stat1Label: "歌唱記録",
    stat1Value: String(Number(statistics.performanceCount)),
    stat1Unit: "件",
    stat2Label: "記録楽曲",
    stat2Value: String(Number(statistics.uniqueSongCount)),
    stat2Unit: "曲",
    stat3Label: "",
    stat3Value: "",
    stat3Unit: "",
    firstDate: formatJapaneseDate(statistics.firstEventDate),
    latestDate: formatJapaneseDate(statistics.lastEventDate)
  };
}

async function buildSongRecordValues(id, post) {
  if (!post.songId) throw new Error(`${id}: 楽曲記録カードに必要なSong IDがありません。`);
  const song = await fetchApi("song", { id: post.songId });
  if (song.songId !== post.songId) throw new Error(`${id}: Song IDのAPI照合に失敗しました。`);
  const performances = Array.isArray(song.performances) ? song.performances : [];
  const statistics = song.statistics || {};
  const officialCount = performances.filter((performance) => performance.type === "公式").length;
  const soloCount = performances.filter((performance) => performance.type === "ソロ").length;
  const completeCount = Number(statistics.completePerformanceCount);
  if (!statistics.firstPerformanceDate || !statistics.lastPerformanceDate || !Number.isFinite(completeCount)) {
    throw new Error(`${id}: 楽曲統計のAPIデータが不正です。`);
  }

  const latestPerformance = performances
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);
  if (!latestPerformance) throw new Error(`${id}: 直近の歌唱記録を取得できませんでした。`);

  return {
    id,
    song: song.displayName || song.songName,
    firstDate: formatJapaneseDate(statistics.firstPerformanceDate),
    lastDate: formatJapaneseDate(statistics.lastPerformanceDate),
    officialCount: String(officialCount),
    soloCount: String(soloCount),
    completeCount: String(completeCount),
    latestDate: formatJapaneseDate(latestPerformance.date),
    latestEvent: latestPerformance.eventName,
    latestSinger: latestPerformance.singerDisplayName || latestPerformance.singer
  };
}

function calculateSongGaps(performances) {
  const sorted = performances.slice().sort((left, right) => {
    const dateOrder = String(left.date).localeCompare(String(right.date));
    return dateOrder || String(left.eventId).localeCompare(String(right.eventId));
  });
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const returning = sorted[index];
    const previousTime = Date.parse(`${previous.date}T00:00:00Z`);
    const returningTime = Date.parse(`${returning.date}T00:00:00Z`);
    const gapDays = (returningTime - previousTime) / 86400000;
    if (!Number.isInteger(gapDays) || gapDays < 0) throw new Error("歌唱履歴の日付順序が不正です。");
    gaps.push({ gapDays, previous, returning });
  }
  return gaps.sort((left, right) => right.gapDays - left.gapDays);
}

async function buildBlankValues(id, post) {
  if (!post.songId) throw new Error(`${id}: ブランクカードに必要なSong IDがありません。`);
  const scope = String(post.scope || "all").trim().toLowerCase();
  const definition = BLANK_RANKING_SCOPES[scope];
  if (!definition) throw new Error(`${id}: ブランク集計対象はall / official / soloのいずれかです。`);
  const song = await fetchApi("song", { id: post.songId });
  if (song.songId !== post.songId) throw new Error(`${id}: Song IDのAPI照合に失敗しました。`);
  const performances = (Array.isArray(song.performances) ? song.performances : [])
    .filter((performance) => !definition.category
      || performance.singerCategory === definition.category
      || performance.type === definition.category);
  const longest = calculateSongGaps(performances)[0];
  if (!longest) throw new Error(`${id}: ブランクを計算できる歌唱履歴がありません。`);
  return {
    id,
    mode: "single",
    song: song.displayName || song.songName,
    gapDays: String(longest.gapDays),
    previousDate: formatJapaneseDate(longest.previous.date),
    returnDate: formatJapaneseDate(longest.returning.date),
    previousEvent: longest.previous.eventName,
    returnEvent: longest.returning.eventName,
    singer: longest.returning.singerDisplayName || longest.returning.singer,
    category: longest.returning.singerCategory || longest.returning.type
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const fixtureName = String(args.fixture || "").trim().toLowerCase();
  let id;
  let post;
  let defaultOutputName;
  if (fixtureName) {
    if (!/^[a-z0-9-]+$/.test(fixtureName)) throw new Error("fixture名の形式が不正です。");
    if (args.id) throw new Error("--idと--fixtureは同時指定できません。");
    const fixturePath = path.resolve(args.fixtures || DEFAULT_FIXTURES);
    const fixtures = loadFixtures(fixturePath);
    post = fixtures.fixtures[fixtureName];
    if (!post) throw new Error(`${fixtureName}: 投稿カードfixtureに登録されていません。`);
    id = `FIXTURE-${fixtureName.toUpperCase()}`;
    defaultOutputName = path.join("fixtures", fixtureName);
  } else {
    id = String(args.id || "").trim().toUpperCase();
    if (!/^X\d{4}$/.test(id)) throw new Error("投稿IDを `--id X0010` の形式で指定してください。");
    const catalogPath = path.resolve(args.catalog || DEFAULT_CATALOG);
    const catalog = loadCatalog(catalogPath);
    post = catalog.posts[id];
    if (!post) throw new Error(`${id}: 投稿カードカタログに登録されていません。`);
    defaultOutputName = `post-card-${id}`;
  }

  let templateDir;
  let values;
  let outputQualifier = "";
  if (post.categoryId === "X01") {
    templateDir = path.join(__dirname, "today-card");
    values = post.releaseId
      ? await buildReleaseTodayValues(id, post)
      : await buildTodayValues(id, post);
  } else if (post.categoryId === "X02") {
    templateDir = path.join(__dirname, "song-record-card");
    values = await buildSongRecordValues(id, post);
  } else if (post.categoryId === "X03") {
    if (post.songId) {
      templateDir = path.join(__dirname, "blank-card");
      values = await buildBlankValues(id, post);
    } else {
      templateDir = path.join(__dirname, "ranking-card");
      const scope = String(args.scope || "all").trim().toLowerCase();
      values = await buildBlankRankingValues(id, scope);
      outputQualifier = `-${scope}`;
    }
  } else if (post.categoryId === "X04") {
    templateDir = path.join(__dirname, "ranking-card");
    values = await buildRankingValues(id, post.scope);
  } else if (post.categoryId === "X05") {
    templateDir = path.join(__dirname, "event-venue-card");
    if (post.eventId && post.venueId) {
      throw new Error(`${id}: X05ではEvent IDとVenue IDを同時指定できません。どちらか一方にしてください。`);
    }
    if (post.eventId) {
      values = await buildEventRecordValues(id, post.eventId);
    } else if (post.venueId) {
      values = await buildVenueRecordValues(id, post.venueId);
    } else {
      throw new Error(`${id}: X05にEvent IDまたはVenue IDが必要です。`);
    }
  } else if (post.categoryId === "X08") {
    templateDir = path.join(__dirname, "birthday-card");
    values = birthdayRenderValues(id, post);
  } else {
    throw new Error(`${id}: カテゴリ${post.categoryId || "未設定"}は未対応です（対応: X01, X02, X03, X04, X05, X08）。`);
  }

  const outputPath = path.resolve(
    args.output || path.join(__dirname, "..", "outputs", `${defaultOutputName}${outputQualifier}.png`)
  );
  await renderCard({ templateDir, values, outputPath });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
