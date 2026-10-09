"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sequenceComparisonValues } = require("./catalog-data.cjs");
const root = path.join(__dirname, "../..");
const post = JSON.parse(fs.readFileSync(path.join(root, "tools/post-card-catalog.json"))).posts.X0046;

test("3記録を保持しTODAYを比較から分離", () => {
  const values = sequenceComparisonValues("X0046", post);
  assert.deepEqual(JSON.parse(values.records).map(r => r.value), ["6", "9", "3"]);
  assert.equal(values.todayDate, "2026.10.07");
  assert.match(values.note, /歌唱尺/);
});
test("投稿IDに依存しない再利用可能な値生成", () => {
  assert.equal(sequenceComparisonValues("X9999", { ...post, title: "別の比較" }).title, "別の比較");
});
test("記録数・必須値・詳細行の検証", () => {
  assert.throws(() => sequenceComparisonValues("X9999", { ...post, records: post.records.slice(0, 2) }));
  assert.throws(() => sequenceComparisonValues("X9999", { ...post, title: "" }));
  assert.throws(() => sequenceComparisonValues("X9999", { ...post, records: [{ ...post.records[0], details: ["1", "2", "3", "4", "5"] }, ...post.records.slice(1)] }));
});
test("現行Staticの公式編成・Final注記と一致", () => {
  const current = JSON.parse(fs.readFileSync(path.join(root, "data/current.json")));
  const base = path.join(root, "data/snapshots", current.outputRevision || current.revision, "events");
  const record = id => JSON.parse(fs.readFileSync(path.join(base, `${id}.json`))).data.event.songs.find(s => s.songId === post.songId);
  for (const id of ["EV0051", "EV0052"]) {
    const row = record(id); assert.equal(row.singerCategory, "公式");
    assert.equal(row.singerDisplayName, "絢瀬絵里＆星空凛＆小泉花陽＆西木野真姫＆東條希＆矢澤にこ");
  }
  for (const id of ["EV0108", "EV0109"]) {
    const row = record(id); assert.equal(row.singerDisplayName, "μ's"); assert.match(row.note, /メドレー・TVサイズ/);
  }
  assert.equal(record("EV0322").singerDisplayName, "高坂穂乃果＆星空凛＆西木野真姫");
});
