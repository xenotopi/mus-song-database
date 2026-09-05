"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { BIRTHDAY_COLUMNS, validateBirthday, birthdayRenderValues } = require("./catalog-data.cjs");
const { parseSheetRows, comparePosts, mergeCatalog } = require("../sync-post-card-catalog.cjs");
const baseHeaders = ["投稿ID", "カテゴリID", "Event ID", "Song ID", "Venue ID", "Release ID", "集計範囲"];
const example = require("./kotori.example.json");
const sample = {
  mode: example.cardType, displayName: example.displayName, honorific: example.honorific,
  birthday: example.birthday, themeColor: "#B7B7B7", regularSongCount: example.regularSongCount,
  officialPerformanceCount: example.officialPerformanceCount, topSongName: example.topSongName,
  topSongCount: example.topSongCount, asOf: example.asOf
};
const post = { categoryId: "X08", songId: "S036", birthdayCard: sample };
function sheet(data = sample, headers = [...baseHeaders, ...Object.values(BIRTHDAY_COLUMNS)]) {
  const cells = { "投稿ID": "X0021", "カテゴリID": "X08", "Song ID": "S036" };
  for (const [key, header] of Object.entries(BIRTHDAY_COLUMNS)) cells[header] = data[key];
  return [headers, headers.map((header) => cells[header] ?? "")];
}

test("X08 snapshot is validated, typed and mapped to unchanged v1 renderer", () => {
  const parsed = parseSheetRows(sheet());
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.posts.X0021, post);
  const values = birthdayRenderValues("X0021", post);
  assert.equal(values.cardType, "character");
  assert.equal(values.accentColor, "#B7B7B7");
  for (const key of ["displayName", "honorific", "birthday", "regularSongCount", "officialPerformanceCount", "topSongName", "topSongCount", "asOf"]) assert.equal(values[key], example[key]);
});
test("headers can be reordered; post text and analytics are not consumed", () => {
  const headers = [...baseHeaders, ...Object.values(BIRTHDAY_COLUMNS), "投稿本文", "IMP"].reverse();
  const rows = sheet(sample, headers);
  rows[1][headers.indexOf("投稿本文")] = "999999回";
  assert.deepEqual(parseSheetRows(rows).posts.X0021, post);
});
test("invalid birthday rows reject synchronization, including missing headers", () => {
  const cases = [
    { mode: "solo" }, { displayName: "" }, { birthday: "02.30" }, { birthday: "9.12" },
    { themeColor: "red" }, { regularSongCount: "" }, { regularSongCount: -1 },
    { officialPerformanceCount: "472回" }, { topSongCount: 1.5 }, { topSongCount: 473 },
    { asOf: "2026-02-30" }, { topSongName: "" }
  ];
  for (const change of cases) assert.ok(parseSheetRows(sheet({ ...sample, ...change })).errors.length, JSON.stringify(change));
  assert.ok(parseSheetRows(sheet(sample, baseHeaders)).errors.length);
});
test("X08 without references is validated, not silently excluded; ambiguous references rejected", () => {
  const rows = sheet();
  rows[1][3] = "";
  assert.ok(parseSheetRows(rows).errors.length);
  for (const index of [2, 4, 5, 6]) {
    const changed = sheet();
    changed[1][index] = { 2: "EV0001", 4: "VE0001", 5: "R0001", 6: "solo" }[index];
    assert.ok(parseSheetRows(changed).errors.length);
  }
});
test("duplicate post IDs rejected and no catalog mutation during validation", () => {
  const existing = { X0010: { categoryId: "X04" } };
  const before = JSON.stringify(existing);
  const rows = sheet();
  rows.push(rows[1].slice());
  assert.ok(parseSheetRows(rows, existing).errors.some((error) => error.includes("重複")));
  assert.equal(JSON.stringify(existing), before);
});
test("merge preserves prior categories and final dry-run is zero diff", () => {
  const catalog = { schemaVersion: 1, posts: { X0010: { categoryId: "X04" }, X0014: { categoryId: "X04", scope: "solo" } } };
  const before = JSON.stringify(catalog);
  const parsed = parseSheetRows(sheet(), catalog.posts);
  const merged = mergeCatalog(catalog, parsed.posts);
  assert.equal(JSON.stringify(catalog), before);
  assert.deepEqual(merged.posts.X0010, catalog.posts.X0010);
  assert.deepEqual(merged.posts.X0014, catalog.posts.X0014);
  assert.deepEqual(comparePosts(merged.posts, parsed.posts).updated, []);
  assert.deepEqual(comparePosts(merged.posts, parsed.posts).added, []);
  const changed = parseSheetRows(sheet({ ...sample, topSongCount: 44 })).posts;
  assert.deepEqual(comparePosts(merged.posts, changed).updated, ["X0021"]);
});
test("character and cast stay distinct; explicit empty honorific remains empty", () => {
  const cast = { ...sample, mode: "cast", displayName: "内田彩", honorific: "さん", officialPerformanceCount: 2, topSongCount: 1 };
  const values = birthdayRenderValues("X0099", { ...post, birthdayCard: cast });
  assert.equal(values.cardType, "cast");
  assert.equal(values.officialPerformanceCount, 2);
  assert.equal(values.honorific, "さん");
  assert.equal(validateBirthday({ ...sample, honorific: "" }).honorific, "");
  assert.deepEqual(sample, validateBirthday(sample));
});
test("catalog renderer also fails closed on invalid input", () => {
  for (const invalid of [{ ...post, songId: "" }, { ...post, scope: "solo" }, { ...post, birthdayCard: null }]) {
    assert.throws(() => birthdayRenderValues("X0021", invalid));
  }
});
test("existing X01-X05 catalog sync and fixture definitions are preserved", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "post-card-catalog.json"), "utf8"));
  const old = Object.entries(catalog.posts).filter(([, p]) => p.categoryId !== "X08");
  const rows = [baseHeaders, ...old.map(([id, p]) => [id, p.categoryId, p.eventId || "", p.songId || "", p.venueId || "", p.releaseId || "", p.scope || ""])];
  const parsed = parseSheetRows(rows, Object.fromEntries(old));
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.posts, Object.fromEntries(old));
  const fixtures = require("../fixtures/post-card-fixtures.json");
  const merged = mergeCatalog(catalog, parsed.posts);
  for (const name of Object.keys(fixtures.fixtures)) assert.equal(Object.hasOwn(merged.posts, name), false);
});
