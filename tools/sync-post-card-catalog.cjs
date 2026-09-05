"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArguments } = require("./card-shared/render-card.cjs");
const { getSheetsReadonlyAccessToken } = require("./google-sheets-readonly-auth.cjs");
const { BIRTHDAY_COLUMNS, birthdayFromRow, validateBirthday } = require("./birthday-card/catalog-data.cjs");

const DEFAULT_CATALOG = path.join(__dirname, "post-card-catalog.json");
const DEFAULT_CONFIG = path.join(__dirname, "post-card-sync.config.json");
const REQUIRED_HEADERS = Object.freeze(["投稿ID", "カテゴリID", "Event ID", "Song ID", "Venue ID", "Release ID", "集計範囲"]);
const SUPPORTED_CATEGORIES = new Set(["X01", "X02", "X03", "X04", "X05", "X08"]);
const BLANK_SCOPES = new Set(["all", "official", "solo"]);
const RANKING_SCOPES = new Set(["official", "solo"]);
const ID_PATTERNS = Object.freeze({
  postId: /^X\d{4}$/,
  categoryId: /^X\d{2}$/,
  eventId: /^EV\d{4}$/,
  songId: /^S\d{3}$/,
  venueId: /^VE\d{4}$/,
  releaseId: /^R\d{4}$/
});

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeScope(value) {
  return String(value ?? "").trim().toLowerCase();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig(args) {
  let config = {};
  const configPath = args.config ? path.resolve(args.config) : DEFAULT_CONFIG;
  if (fs.existsSync(configPath)) config = readJson(configPath);
  const spreadsheetId = String(args["spreadsheet-id"] || process.env.MUSDB_POST_CARD_SPREADSHEET_ID || config.spreadsheetId || "").trim();
  const sheetName = String(args.sheet || process.env.MUSDB_POST_CARD_SHEET_NAME || config.sheetName || "投稿管理").trim();
  const catalogPath = path.resolve(args.catalog || config.catalogPath || DEFAULT_CATALOG);
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) {
    throw new Error("Spreadsheet IDを --spreadsheet-id、環境変数、またはlocal configで指定してください。");
  }
  if (!sheetName) throw new Error("シート名が空です。");
  return { spreadsheetId, sheetName, catalogPath };
}

function quoteSheetName(sheetName) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function columnLetter(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

async function fetchSheetsJson(endpoint, accessToken) {
  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error(`Google Sheets API応答がJSONではありません（HTTP ${response.status}）。`);
  }
  if (!response.ok) {
    const reason = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Google Sheets API read-only取得に失敗しました: ${reason}`);
  }
  return payload;
}

async function fetchSheetRows({ spreadsheetId, sheetName, accessToken }) {
  const sheet = quoteSheetName(sheetName);
  const headerRange = `${sheet}!1:1`;
  const headerEndpoint = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(headerRange)}`
  );
  headerEndpoint.searchParams.set("majorDimension", "ROWS");
  headerEndpoint.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const headerPayload = await fetchSheetsJson(headerEndpoint, accessToken);
  const headerRow = headerPayload.values?.[0] || [];
  const indexes = resolveHeaders(headerRow);

  const endpoint = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`);
  const selectedHeaders = Object.keys(indexes);
  selectedHeaders.forEach((header) => {
    const letter = columnLetter(indexes[header]);
    endpoint.searchParams.append("ranges", `${sheet}!${letter}2:${letter}`);
  });
  endpoint.searchParams.set("majorDimension", "ROWS");
  endpoint.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const payload = await fetchSheetsJson(endpoint, accessToken);
  const columns = selectedHeaders.map((_header, index) => payload.valueRanges?.[index]?.values || []);
  const rowCount = Math.max(0, ...columns.map((column) => column.length));
  const rows = [selectedHeaders];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    rows.push(columns.map((column) => column[rowIndex]?.[0] ?? ""));
  }
  return rows;
}

function resolveHeaders(headerRow) {
  const indexes = new Map();
  const duplicates = [];
  headerRow.forEach((value, index) => {
    const header = String(value ?? "").trim();
    if (!header) return;
    if (indexes.has(header)) duplicates.push(header);
    else indexes.set(header, index);
  });
  const missing = REQUIRED_HEADERS.filter((header) => !indexes.has(header));
  if (duplicates.length || missing.length) {
    const details = [];
    if (missing.length) details.push(`不足ヘッダー: ${missing.join(", ")}`);
    if (duplicates.length) details.push(`重複ヘッダー: ${[...new Set(duplicates)].join(", ")}`);
    throw new Error(details.join(" / "));
  }
  const selectedHeaders = [...REQUIRED_HEADERS, ...Object.values(BIRTHDAY_COLUMNS).filter((header) => indexes.has(header))];
  return Object.fromEntries(selectedHeaders.map((header) => [header, indexes.get(header)]));
}

function validateReferences(rowNumber, categoryId, refs, errors) {
  Object.entries(refs).forEach(([field, value]) => {
    if (value && !ID_PATTERNS[field].test(value)) errors.push(`行${rowNumber}: ${field}の形式が不正です（${value}）。`);
  });
  if (categoryId === "X01") {
    if (refs.releaseId) {
      if (!refs.songId) errors.push(`行${rowNumber}: リリースTodayにはRelease IDとSong IDが必要です。`);
      if (refs.eventId || refs.venueId) errors.push(`行${rowNumber}: リリースTodayではEvent IDとVenue IDを保存しません。`);
    } else if (!refs.eventId || !refs.songId) {
      errors.push(`行${rowNumber}: イベントTodayにはEvent IDとSong IDが必要です。`);
    }
  }
  if ((categoryId === "X02" || categoryId === "X03") && !refs.songId) {
    errors.push(`行${rowNumber}: ${categoryId}にはSong IDが必要です。`);
  }
  if (categoryId === "X05") {
    const modeCount = Number(Boolean(refs.eventId)) + Number(Boolean(refs.venueId));
    if (modeCount !== 1) errors.push(`行${rowNumber}: X05はEvent IDまたはVenue IDのどちらか一方が必要です。`);
    if (refs.songId) errors.push(`行${rowNumber}: X05ではSong IDを保存しません。`);
  }
  if (categoryId !== "X01" && refs.releaseId) {
    errors.push(`行${rowNumber}: Release IDはX01でのみ指定できます。`);
  }
  if (categoryId === "X08") {
    if (!refs.songId) errors.push(`行${rowNumber}: Birthday最多曲のSong IDが必要です。`);
    if (refs.eventId || refs.venueId) errors.push(`行${rowNumber}: BirthdayではEvent ID・Venue IDを保存しません。`);
  }
}

function parseSheetRows(rows, existingPosts = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("投稿管理シートにヘッダー行がありません。");
  const headerIndexes = resolveHeaders(rows[0]);
  const posts = {};
  const errors = [];
  const excluded = [];
  const seenPostIds = new Map();

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const postId = normalize(row[headerIndexes["投稿ID"]]);
    const categoryId = normalize(row[headerIndexes["カテゴリID"]]);
    const refs = {
      eventId: normalize(row[headerIndexes["Event ID"]]),
      songId: normalize(row[headerIndexes["Song ID"]]),
      venueId: normalize(row[headerIndexes["Venue ID"]]),
      releaseId: normalize(row[headerIndexes["Release ID"]])
    };
    const scope = normalizeScope(row[headerIndexes["集計範囲"]]);
    const hasAnyValue = Boolean(postId || categoryId || refs.eventId || refs.songId || refs.venueId || refs.releaseId || scope);
    if (!hasAnyValue) return;
    const hasReferenceId = Boolean(refs.eventId || refs.songId || refs.venueId || refs.releaseId);
    const existsInCatalog = Boolean(postId && Object.hasOwn(existingPosts, postId));
    const isConfiguredRanking = categoryId === "X04" && Boolean(scope);
    if (!hasReferenceId && !existsInCatalog && !isConfiguredRanking && categoryId !== "X08") {
      excluded.push({ postId: postId || `行${rowNumber}`, reason: "同期対象外" });
      return;
    }
    if (!postId) {
      errors.push(`行${rowNumber}: 投稿IDが空です。`);
      return;
    }
    if (!ID_PATTERNS.postId.test(postId)) errors.push(`行${rowNumber}: 投稿IDの形式が不正です（${postId}）。`);
    if (seenPostIds.has(postId)) {
      errors.push(`行${rowNumber}: 投稿ID ${postId} は行${seenPostIds.get(postId)}と重複しています。`);
    } else {
      seenPostIds.set(postId, rowNumber);
    }
    if (!categoryId) {
      if (refs.eventId || refs.songId || refs.venueId || refs.releaseId) errors.push(`行${rowNumber}: 参照IDがありますがカテゴリIDが空です。`);
      else excluded.push({ postId, reason: "カテゴリ未設定" });
      return;
    }
    if (!ID_PATTERNS.categoryId.test(categoryId)) {
      errors.push(`行${rowNumber}: カテゴリIDの形式が不正です（${categoryId}）。`);
      return;
    }
    if (!SUPPORTED_CATEGORIES.has(categoryId)) {
      excluded.push({ postId, reason: `同期対象外カテゴリ ${categoryId}` });
      return;
    }
    if (scope && categoryId === "X03" && !BLANK_SCOPES.has(scope)) {
      errors.push(`行${rowNumber}: X03の集計範囲はall / official / soloのいずれかです（${scope}）。`);
    } else if (scope && categoryId === "X04" && !RANKING_SCOPES.has(scope)) {
      errors.push(`行${rowNumber}: X04の集計範囲はofficial / soloのいずれかです（${scope}）。`);
    } else if (scope && categoryId !== "X03" && categoryId !== "X04") {
      errors.push(`行${rowNumber}: 集計範囲はX03またはX04でのみ指定できます。`);
    }
    validateReferences(rowNumber, categoryId, refs, errors);
    const post = { categoryId };
    if (refs.eventId) post.eventId = refs.eventId;
    if (refs.songId) post.songId = refs.songId;
    if (refs.venueId) post.venueId = refs.venueId;
    if (refs.releaseId) post.releaseId = refs.releaseId;
    if ((categoryId === "X03" || categoryId === "X04") && scope) post.scope = scope;
    if (categoryId === "X08") {
      try {
        post.birthdayCard = birthdayFromRow(row, headerIndexes);
      } catch (error) {
        errors.push(`行${rowNumber}: ${error.message}`);
      }
    }
    posts[postId] = post;
  });
  return { posts, errors, excluded, headerIndexes };
}

function loadCatalog(catalogPath) {
  const catalog = readJson(catalogPath);
  if (!catalog || typeof catalog !== "object" || typeof catalog.posts !== "object" || Array.isArray(catalog.posts)) {
    throw new Error("投稿カードカタログの形式が不正です。");
  }
  return catalog;
}

function stablePost(post) {
  const result = { categoryId: post.categoryId };
  ["eventId", "songId", "venueId", "releaseId", "scope"].forEach((key) => {
    if (post[key]) result[key] = post[key];
  });
  if (post.categoryId === "X08") result.birthdayCard = validateBirthday(post.birthdayCard);
  return result;
}

function mergeCatalog(catalog, sheetPosts) {
  const posts = { ...catalog.posts };
  Object.entries(sheetPosts).forEach(([postId, post]) => {
    posts[postId] = stablePost(post);
  });
  const orderedPosts = Object.fromEntries(Object.entries(posts).sort(([left], [right]) => left.localeCompare(right)));
  return { ...catalog, posts: orderedPosts };
}

function comparePosts(currentPosts, sheetPosts) {
  const added = [];
  const updated = [];
  const unchanged = [];
  Object.entries(sheetPosts).forEach(([postId, post]) => {
    if (!Object.hasOwn(currentPosts, postId)) added.push(postId);
    else if (JSON.stringify(stablePost(currentPosts[postId])) === JSON.stringify(stablePost(post))) unchanged.push(postId);
    else updated.push(postId);
  });
  const preserved = Object.keys(currentPosts).filter((postId) => !Object.hasOwn(sheetPosts, postId));
  return { added, updated, unchanged, preserved };
}

function atomicWriteCatalog(catalogPath, catalog) {
  const temporaryPath = `${catalogPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporaryPath, catalogPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function printSummary({ mode, authSource, parsed, diff }) {
  process.stdout.write(`${JSON.stringify({
    mode,
    authentication: authSource,
    synchronizedRows: Object.keys(parsed.posts).length,
    excludedRows: parsed.excluded.length,
    added: diff.added,
    updated: diff.updated,
    unchanged: diff.unchanged,
    preserved: diff.preserved
  }, null, 2)}\n`);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const allowed = new Set(["dry-run", "apply", "config", "spreadsheet-id", "sheet", "catalog"]);
  const unknown = Object.keys(args).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`未対応の引数です: ${unknown.map((key) => `--${key}`).join(", ")}`);
  const dryRun = args["dry-run"] === "true";
  const apply = args.apply === "true";
  if (Number(dryRun) + Number(apply) !== 1) throw new Error("--dry-run または --apply のどちらか一方を指定してください。");

  const config = loadConfig(args);
  const authentication = await getSheetsReadonlyAccessToken();
  const rows = await fetchSheetRows({
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    accessToken: authentication.accessToken
  });
  const catalog = loadCatalog(config.catalogPath);
  const parsed = parseSheetRows(rows, catalog.posts);
  if (parsed.errors.length) {
    throw new Error(`投稿管理シートの検証に失敗しました（${parsed.errors.length}件）。\n${parsed.errors.join("\n")}`);
  }
  const diff = comparePosts(catalog.posts, parsed.posts);
  printSummary({ mode: dryRun ? "dry-run" : "apply", authSource: authentication.source, parsed, diff });
  if (dryRun) return;
  const merged = mergeCatalog(catalog, parsed.posts);
  atomicWriteCatalog(config.catalogPath, merged);
  process.stdout.write(`${config.catalogPath} を原子的に更新しました。\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  comparePosts,
  columnLetter,
  mergeCatalog,
  parseSheetRows,
  resolveHeaders,
  stablePost,
  validateReferences
};
