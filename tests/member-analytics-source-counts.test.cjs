"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildMemberAnalytics, CHARACTER_MEMBERS, CAST_MEMBERS } = require("../tools/member-analytics-lib.cjs");

function fixture() {
  const singers = ["公式", "ソロ"].map((category, side) => CHARACTER_MEMBERS.map((character, i) => ({
    singerId: `SN${String(side * 9 + i + 1).padStart(4, "0")}`, category,
    memberShorts: [`member${i}`], memberComposition: `member${i}`, memberCount: 1,
    members: [{ key: `member${i}`, character, cast: CAST_MEMBERS[i] }],
    performanceCount: side === 1 && i === 0 ? 1 : 0
  })));
  const list = { official: singers[0], solo: singers[1], summary: { official: 9, solo: 9, total: 18 } };
  const songs = Array.from({ length: 117 }, (_, i) => ({ songId: `S${String(i + 1).padStart(3, "0")}`, displayName: `fixture song ${i + 1}`, performances: [] }));
  songs[0].performances.push({ singerId: "SN0010", singerCategory: "ソロ", type: "ソロ", eventId: "EV0001" });
  return { songs, list };
}
test("current source counts replace historical 1400 / 49 / 23 constants", () => { const { songs, list } = fixture(); assert.equal(buildMemberAnalytics(songs, list).castSummary[0].performanceCount, 1); });
test("missing Song-side performance cannot pass source count reconciliation", () => { const { songs, list } = fixture(); songs[0].performances = []; assert.throws(() => buildMemberAnalytics(songs, list), /Singer\/Song performance count mismatch/); });
test("missing source count is rejected", () => { const { songs, list } = fixture(); delete list.solo[0].performanceCount; assert.throws(() => buildMemberAnalytics(songs, list), /source performance count/); });
test("source Singer list size mismatch is rejected", () => { const { songs, list } = fixture(); list.summary.total++; assert.throws(() => buildMemberAnalytics(songs, list), /source count mismatch/); });
test("duplicate Singer IDs stay rejected", () => { const { songs, list } = fixture(); list.solo[0].singerId = list.official[0].singerId; assert.throws(() => buildMemberAnalytics(songs, list), /duplicate Singer ID/); });
test("unknown Singer reference stays rejected", () => { const { songs, list } = fixture(); songs[0].performances[0].singerId = "SN9999"; assert.throws(() => buildMemberAnalytics(songs, list), /unknown Singer ID/); });
test("invalid Event reference stays rejected", () => { const { songs, list } = fixture(); songs[0].performances[0].eventId = "invalid"; assert.throws(() => buildMemberAnalytics(songs, list), /missing Event ID/); });
test("performance category mismatch stays rejected", () => { const { songs, list } = fixture(); songs[0].performances[0].type = "公式"; assert.throws(() => buildMemberAnalytics(songs, list), /category mismatch/); });
