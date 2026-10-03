"use strict";

const CHARACTER_MEMBERS = Object.freeze(["高坂穂乃果", "絢瀬絵里", "南ことり", "園田海未", "星空凛", "西木野真姫", "東條希", "小泉花陽", "矢澤にこ"]);
const CAST_MEMBERS = Object.freeze(["新田恵海", "南條愛乃", "内田彩", "三森すずこ", "飯田里穂", "Pile", "楠田亜衣奈", "久保ユリカ", "徳井青空"]);

function assert(condition, message) { if (!condition) throw new Error(message); }

function buildMemberAnalytics(songDetails, singerList) {
  const official = singerList?.official;
  const solo = singerList?.solo;
  assert(Array.isArray(official) && official.length === 49 && Array.isArray(solo) && solo.length === 23, "Singer list must contain 49 official and 23 solo names");
  const singers = [...official, ...solo];
  const singerById = new Map();
  const shortToMember = new Map();
  for (const singer of singers) {
    assert(/^SN\d{4}$/.test(singer.singerId) && !singerById.has(singer.singerId), `Invalid or duplicate Singer ID: ${singer.singerId}`);
    assert(["公式", "ソロ"].includes(singer.category), `${singer.singerId}: invalid category`);
    assert(Array.isArray(singer.memberShorts) && singer.memberShorts.length === singer.memberCount, `${singer.singerId}: invalid member count`);
    assert(singer.memberShorts.join("＆") === singer.memberComposition, `${singer.singerId}: member composition mismatch`);
    assert(Array.isArray(singer.members) && singer.members.length === singer.memberShorts.length, `${singer.singerId}: member mapping incomplete`);
    singer.memberShorts.forEach((short, index) => {
      const member = singer.members[index];
      assert(member.key === short && CHARACTER_MEMBERS.includes(member.character) && CAST_MEMBERS.includes(member.cast), `${singer.singerId}: unknown member ${short}`);
      const previous = shortToMember.get(short);
      assert(!previous || (previous.character === member.character && previous.cast === member.cast), `${short}: conflicting member mapping`);
      shortToMember.set(short, { character: member.character, cast: member.cast });
    });
    singerById.set(singer.singerId, singer);
  }
  assert(shortToMember.size === 9, "Expected nine distinct member identities");
  const summaryState = [CHARACTER_MEMBERS, CAST_MEMBERS].map(names => names.map(memberName => ({ memberName, performanceCount: 0, songs: new Set(), events: new Set() })));
  const ids = new Set();
  let sourcePerformanceCount = 0;
  const songs = songDetails.map(song => {
    assert(/^S\d{3}$/.test(song.songId) && !ids.has(song.songId), `Invalid or duplicate Song ID: ${song.songId}`);
    ids.add(song.songId);
    assert(typeof song.displayName === "string" && Array.isArray(song.performances), `${song.songId}: invalid Song detail`);
    const counts = [Array(9).fill(0), Array(9).fill(0)];
    const performanceCounts = [0, 0];
    const events = [new Set(), new Set()];
    for (const performance of song.performances) {
      sourcePerformanceCount += 1;
      const singer = singerById.get(performance.singerId);
      assert(singer, `${song.songId}: unknown Singer ID ${performance.singerId}`);
      assert(performance.singerCategory === singer.category && performance.type === singer.category, `${song.songId}: Singer category mismatch`);
      assert(/^EV\d{4}$/.test(performance.eventId), `${song.songId}: missing Event ID`);
      const side = singer.category === "公式" ? 0 : 1;
      const names = side === 0 ? CHARACTER_MEMBERS : CAST_MEMBERS;
      performanceCounts[side] += 1;
      events[side].add(performance.eventId);
      for (const short of singer.memberShorts) {
        const member = shortToMember.get(short);
        const index = names.indexOf(side === 0 ? member.character : member.cast);
        assert(index >= 0, `${song.songId}: member not in fixed order`);
        counts[side][index] += 1;
        const summary = summaryState[side][index];
        summary.performanceCount += 1;
        summary.songs.add(song.songId);
        summary.events.add(performance.eventId);
      }
    }
    return {
      songId: song.songId, songName: song.displayName,
      characterCounts: counts[0], characterTotal: counts[0].reduce((a, b) => a + b, 0),
      characterPerformanceCount: performanceCounts[0], characterEventCount: events[0].size,
      castCounts: counts[1], castTotal: counts[1].reduce((a, b) => a + b, 0),
      castPerformanceCount: performanceCounts[1], castEventCount: events[1].size
    };
  }).sort((a, b) => a.songId.localeCompare(b.songId));
  assert(sourcePerformanceCount === 1400, `Expected 1400 performance rows, got ${sourcePerformanceCount}`);
  const summarize = state => state.map(row => ({ memberName: row.memberName, performanceCount: row.performanceCount, uniqueSongCount: row.songs.size, eventCount: row.events.size }));
  const data = { characterMembers: [...CHARACTER_MEMBERS], castMembers: [...CAST_MEMBERS], songs, characterSummary: summarize(summaryState[0]), castSummary: summarize(summaryState[1]) };
  validateMemberAnalytics(data);
  return data;
}

function validateMemberAnalytics(data) {
  assert(Array.isArray(data?.songs) && data.songs.length === 117, "Member Analytics must contain 117 Songs");
  assert(JSON.stringify(data.characterMembers) === JSON.stringify(CHARACTER_MEMBERS) && JSON.stringify(data.castMembers) === JSON.stringify(CAST_MEMBERS), "Member order mismatch");
  assert(new Set(data.songs.map(song => song.songId)).size === 117, "Duplicate Song ID");
  for (const song of data.songs) {
    for (const prefix of ["character", "cast"]) {
      const counts = song[`${prefix}Counts`];
      const total = song[`${prefix}Total`];
      const performances = song[`${prefix}PerformanceCount`];
      const events = song[`${prefix}EventCount`];
      assert(Array.isArray(counts) && counts.length === 9 && counts.every(n => Number.isInteger(n) && n >= 0), `${song.songId}: invalid ${prefix} counts`);
      assert(Number.isInteger(total) && total === counts.reduce((a, b) => a + b, 0), `${song.songId}: invalid ${prefix} total`);
      assert(Number.isInteger(performances) && performances >= 0 && performances <= total, `${song.songId}: invalid ${prefix} performance count`);
      assert(Number.isInteger(events) && events >= 0 && events <= performances, `${song.songId}: invalid ${prefix} event count`);
    }
  }
  for (const [key, members] of [["characterSummary", CHARACTER_MEMBERS], ["castSummary", CAST_MEMBERS]]) {
    assert(Array.isArray(data[key]) && data[key].length === 9, `${key}: expected nine rows`);
    data[key].forEach((row, index) => {
      assert(row.memberName === members[index], `${key}: member order mismatch`);
      for (const field of ["performanceCount", "uniqueSongCount", "eventCount"]) assert(Number.isInteger(row[field]) && row[field] >= 0, `${key}: invalid ${field}`);
    });
  }
  return data;
}

module.exports = { CHARACTER_MEMBERS, CAST_MEMBERS, buildMemberAnalytics, validateMemberAnalytics };
