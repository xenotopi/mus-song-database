"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArguments, renderCard } = require("./card-shared/render-card.cjs");
const { birthdayRenderValues } = require("./birthday-card/catalog-data.cjs");
const { sequenceComparisonValues } = require("./sequence-comparison-card/catalog-data.cjs");

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

function songRecordSummaryValues(id, post) {
  const required = (value, field) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${field}が必要です。`);
    return value.trim();
  };
  if (post.categoryId !== "X04") throw new Error(`${id}: song-record-summaryはX04専用です。`);
  if (post.breakdown !== undefined && (!Array.isArray(post.breakdown) || ![0, 2].includes(post.breakdown.length))) {
    throw new Error(`${id}: song-record-summaryの内訳は0件または2件です。`);
  }
  const breakdown = post.breakdown || [];
  const metrics = [post.primary, post.secondary, ...breakdown];
  metrics.forEach((metric, index) => {
    if (!metric || typeof metric !== "object") throw new Error(`${id}: 指標${index + 1}が不正です。`);
    required(metric.label, `指標${index + 1}.label`);
    required(metric.value, `指標${index + 1}.value`);
    required(metric.unit, `指標${index + 1}.unit`);
  });
  return {
    id,
    title: required(post.title, "title"),
    subtitle: required(post.subtitle, "subtitle"),
    primaryLabel: post.primary.label.trim(),
    primaryValue: post.primary.value.trim(),
    primaryUnit: post.primary.unit.trim(),
    secondaryLabel: post.secondary.label.trim(),
    secondaryValue: post.secondary.value.trim(),
    secondaryUnit: post.secondary.unit.trim(),
    showBreakdown: String(breakdown.length === 2),
    breakdown1Label: breakdown[0]?.label.trim() || "",
    breakdown1Value: breakdown[0]?.value.trim() || "",
    breakdown1Unit: breakdown[0]?.unit.trim() || "",
    breakdown2Label: breakdown[1]?.label.trim() || "",
    breakdown2Value: breakdown[1]?.value.trim() || "",
    breakdown2Unit: breakdown[1]?.unit.trim() || "",
    footerNote: required(post.footerNote, "footerNote")
  };
}

function songListValues(id, post) {
  if (!Array.isArray(post.songs) || post.songs.length === 0 ||
      post.songs.some((song) => typeof song !== "string" || !song.trim()) ||
      new Set(post.songs).size !== post.songs.length) {
    throw new Error(`${id}: song-listには重複のない曲名配列が必要です。`);
  }
  for (const key of ["title", "subtitle", "footerNote"]) {
    if (typeof post[key] !== "string" || !post[key].trim()) throw new Error(`${id}: ${key}が必要です。`);
  }
  return { id, title: post.title.trim(), subtitle: post.subtitle.trim(), songs: JSON.stringify(post.songs), footerNote: post.footerNote.trim() };
}

function pairedRecordValues(id, post) {
  const required = (value, field) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${field}が必要です。`);
    return value.trim();
  };
  if (!Array.isArray(post.metrics) || post.metrics.length !== 2) {
    throw new Error(`${id}: paired-recordには同格の指標2件が必要です。`);
  }
  const metrics = post.metrics.map((metric, index) => ({
    label: required(metric?.label, `metrics[${index}].label`),
    value: required(metric?.value, `metrics[${index}].value`),
    unit: required(metric?.unit, `metrics[${index}].unit`)
  }));
  return {
    id,
    title: required(post.title, "title"),
    metrics: JSON.stringify(metrics),
    context: required(post.context, "context"),
    conclusion: required(post.conclusion, "conclusion"),
    noteLabel: post.noteLabel ? required(post.noteLabel, "noteLabel") : "",
    noteValue: post.noteValue ? required(post.noteValue, "noteValue") : ""
  };
}

function songComebackValues(id, post) {
  const required = (value, field) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${field}が必要です。`);
    return value.trim();
  };
  const record = (value, field) => ({
    date: required(value?.date, `${field}.date`),
    event: required(value?.event, `${field}.event`),
    singer: required(value?.singer, `${field}.singer`),
    category: required(value?.category, `${field}.category`),
    note: typeof value?.note === "string" ? value.note.trim() : ""
  });
  if (post.categoryId !== "X03") throw new Error(`${id}: song-comebackはX03専用です。`);
  return {
    id,
    title: required(post.title, "title"),
    gapDays: required(post.gapDays, "gapDays"),
    duration: required(post.duration, "duration"),
    before: JSON.stringify(record(post.before, "before")),
    after: JSON.stringify(record(post.after, "after"))
  };
}

function featureLaunchValues(id, post) {
  const required = (value, field) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${field}が必要です。`);
    return value.trim();
  };
  if (post.categoryId !== "X06") throw new Error(`${id}: feature-launchはX06専用です。`);
  if (!Array.isArray(post.metrics) || post.metrics.length !== 2) {
    throw new Error(`${id}: feature-launchには主要情報2件が必要です。`);
  }
  const metrics = post.metrics.map((metric, index) => ({
    value: required(metric?.value, `metrics[${index}].value`),
    label: required(metric?.label, `metrics[${index}].label`)
  }));
  return {
    id,
    series: required(post.series, "series"),
    title: required(post.title, "title"),
    badge: required(post.badge, "badge"),
    status: required(post.status, "status"),
    description: required(post.description, "description"),
    metrics: JSON.stringify(metrics),
    scope: required(post.scope, "scope")
  };
}

function firstOfficialRecordValues(id, post) {
  const required = (value, field) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${field}が必要です。`);
    return value.trim();
  };
  const snapshotRoot = path.join(__dirname, "..", "data", "snapshots");
  const current = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "current.json"), "utf8"));
  const revision = current.outputRevision || current.revision;
  const songId = required(post.songId, "songId");
  const eventId = required(post.eventId, "eventId");
  if (!/^S\d{3}$/.test(songId) || !/^EV\d{4}$/.test(eventId)) throw new Error(`${id}: Song/Event IDが不正です。`);
  const song = JSON.parse(fs.readFileSync(path.join(snapshotRoot, revision, "songs", `${songId}.json`), "utf8")).data;
  const event = JSON.parse(fs.readFileSync(path.join(snapshotRoot, revision, "events", `${eventId}.json`), "utf8")).data.event;
  const official = song.performances.filter((row) => row.type === "公式").sort((a, b) => a.date.localeCompare(b.date));
  const first = official[0];
  const eventSong = event.songs.find((row) => row.songId === songId && row.type === "公式");
  if (song.songId !== songId || event.eventId !== eventId || !first || first.eventId !== eventId
    || first.date !== event.date || !eventSong || eventSong.singerId !== first.singerId) {
    throw new Error(`${id}: 最初の公式歌唱記録とEvent snapshotが一致しません。`);
  }
  return {
    id,
    song: song.songName,
    date: event.date.replaceAll("-", "."),
    event: event.eventName,
    eventHighlight: required(post.eventHighlight, "eventHighlight"),
    contrast: required(post.contrast, "contrast"),
    singer: eventSong.singerDisplayName || eventSong.singer,
    venue: required(event.venue?.venueName, "会場名"),
    eventType: required(event.eventType, "イベント種別")
  };
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

async function buildX0029ComparisonValues(id) {
  const definitions = [
    { songId: "S038", expectedName: "きっと青春が聞こえる" },
    { songId: "S066", expectedName: "どんなときもずっと" }
  ];
  const songs = await Promise.all(definitions.map(({ songId }) => fetchApi("song", { id: songId })));
  const values = { id };
  songs.forEach((song, index) => {
    const definition = definitions[index];
    if (song.songId !== definition.songId || song.songName !== definition.expectedName) {
      throw new Error(`${id}: 比較対象${definition.songId}のAPI照合に失敗しました。`);
    }
    const performances = Array.isArray(song.performances) ? song.performances : [];
    const total = performances.length;
    const official = performances.filter((performance) => performance.type === "公式").length;
    const solo = performances.filter((performance) => performance.type === "ソロ").length;
    if (total !== 35 || official !== 31 || solo !== 4) {
      throw new Error(`${id}: ${definition.songId}の比較値が想定と一致しません（${total}/${official}/${solo}）。`);
    }
    const number = index + 1;
    values[`song${number}`] = song.displayName || song.songName;
    values[`total${number}`] = String(total);
    values[`official${number}`] = String(official);
    values[`solo${number}`] = String(solo);
  });
  return values;
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

async function buildX0030Values(id, post) {
  if (post.songId !== "S018") throw new Error(`${id}: S018専用カードです。`);
  const song = await fetchApi("song", { id: post.songId });
  const rows = Array.isArray(song.performances) ? song.performances : [];
  const after = rows.filter((row) => row.date > "2016-04-01")
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = after[0];
  const recent = after.filter((row) => row.date >= "2024-01-01" && row.date < "2026-01-01");
  if (song.songId !== "S018" || song.songName !== "愛してるばんざーい!"
    || rows.length !== 45 || after.length !== 39
    || first?.date !== "2016-06-26" || first?.singerDisplayName !== "飯田里穂"
    || first?.note !== "アカペラ歌唱" || recent.length !== 21) {
    throw new Error(`${id}: 本番履歴が承認済みの45/39件・初回履歴と一致しません。`);
  }
  return { id, total: String(rows.length), count: String(after.length),
    firstDate: first.date.replaceAll("-", "."), singer: first.singerDisplayName, note: first.note };
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
    const entry = catalog.posts[id];
    if (!entry) throw new Error(`${id}: 投稿カードカタログに登録されていません。`);
    const cardNumber = Number(args.card || 1);
    const cards = [entry, ...(entry.additionalCards || [])];
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > cards.length) {
      throw new Error(`${id}: --cardは1～${cards.length}を指定してください。`);
    }
    post = { categoryId: entry.categoryId, ...cards[cardNumber - 1] };
    defaultOutputName = `post-card-${id}${cards.length > 1 ? `-${cardNumber}` : ""}`;
  }

  let templateDir;
  let values;
  let outputQualifier = "";
  if (post.template === "sequence-comparison") {
    templateDir = path.join(__dirname, "sequence-comparison-card");
    values = sequenceComparisonValues(id, post);
  } else if (post.template === "song-record-summary") {
    templateDir = path.join(__dirname, "song-record-summary-card");
    values = songRecordSummaryValues(id, post);
  } else if (post.template === "paired-record") {
    templateDir = path.join(__dirname, "paired-record-card");
    values = pairedRecordValues(id, post);
  } else if (post.template === "song-comeback") {
    templateDir = path.join(__dirname, "song-comeback-card");
    values = songComebackValues(id, post);
  } else if (post.template === "song-list") {
    templateDir = path.join(__dirname, "song-list-card");
    values = songListValues(id, post);
  } else if (post.template === "feature-launch") {
    templateDir = path.join(__dirname, "feature-launch-card");
    values = featureLaunchValues(id, post);
  } else if (post.template === "first-official-record") {
    templateDir = path.join(__dirname, "first-official-record-card");
    values = firstOfficialRecordValues(id, post);
  } else if (post.template) {
    throw new Error(`${id}: 未対応のテンプレートです: ${post.template}`);
  } else if (id === "X0032" && post.categoryId === "X01") {
    templateDir = path.join(__dirname, "x0032-today-card");
    values = { id };
  } else if (post.categoryId === "X01") {
    templateDir = path.join(__dirname, "today-card");
    values = post.releaseId
      ? await buildReleaseTodayValues(id, post)
      : await buildTodayValues(id, post);
  } else if (post.categoryId === "X02") {
    if (id === "X0034" || id === "X0035") {
      if (post.songId) throw new Error(`${id}: 投稿管理シートにないSong IDは指定しないでください。`);
      templateDir = path.join(__dirname, `${id.toLowerCase()}-record-card`);
      values = { id };
    } else if (id === "X0033") {
      if (post.songId !== "S017") throw new Error("X0033: Song IDはS017を指定してください。");
      templateDir = path.join(__dirname, "x0033-record-card");
      values = { id };
    } else if (id === "X0031") {
      if (post.songId !== "S099") throw new Error("X0031: Song IDはS099を指定してください。");
      templateDir = path.join(__dirname, "x0031-record-card");
      values = { id };
    } else if (id === "X0030") {
      templateDir = path.join(__dirname, "x0030-record-card");
      values = await buildX0030Values(id, post);
    } else {
      templateDir = path.join(__dirname, "song-record-card");
      values = await buildSongRecordValues(id, post);
    }
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
    if (id === "X0029") {
      templateDir = path.join(__dirname, "x0029-comparison-card");
      values = await buildX0029ComparisonValues(id);
    } else {
      templateDir = path.join(__dirname, "ranking-card");
      values = await buildRankingValues(id, post.scope);
    }
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
