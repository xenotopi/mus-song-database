"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const API_SOURCE = path.join(ROOT, "assets", "js", "api.js");
const REQUEST_TIMEOUT_MS = Number(
  process.env.MUSDB_SEARCH_CONTRACT_TIMEOUT_MS || 30000
);

class TransientApiError extends Error {}

function readActiveApiUrl() {
  const source = fs.readFileSync(API_SOURCE, "utf8");
  const match = source.match(
    /export\s+const\s+API_URL\s*=\s*["']([^"']+)["']/
  );

  assert.ok(match, "assets/js/api.jsからactive Public API URLを取得できること");
  return match[1];
}

const API_URL = readActiveApiUrl();
const responseCache = new Map();

async function requestSearch(query) {
  const url = new URL(API_URL);
  url.searchParams.set("action", "search");
  url.searchParams.set("q", query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal
    });
  } catch (error) {
    const reason = error?.name === "AbortError"
      ? `${REQUEST_TIMEOUT_MS}msでタイムアウト`
      : String(error?.message || error);
    throw new TransientApiError(`Public API通信失敗: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429 || response.status >= 500) {
    throw new TransientApiError(`Public API一時障害: HTTP ${response.status}`);
  }

  assert.equal(response.status, 200, `Public API HTTP status (${query})`);

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    assert.fail(`Public APIがJSONを返すこと (${query})`);
  }

  assert.equal(payload?.success, true, `search API success (${query})`);
  assert.equal(payload?.data?.query, query, `query echo (${query})`);
  assert.ok(payload?.data?.results, `results object (${query})`);

  for (const category of ["songs", "events", "venues", "singers"]) {
    assert.ok(
      Array.isArray(payload.data.results[category]),
      `${category} result array (${query})`
    );
    for (const item of payload.data.results[category]) {
      assert.equal(
        typeof item.matchAlias,
        "string",
        `${category}.matchAlias contract (${query})`
      );
    }
  }

  return payload.data;
}

function getSearch(query) {
  if (!responseCache.has(query)) {
    responseCache.set(query, requestSearch(query));
  }
  return responseCache.get(query);
}

async function withSearch(t, query, assertions) {
  try {
    const data = await getSearch(query);
    assertions(data);
  } catch (error) {
    if (error instanceof TransientApiError) {
      t.skip(`${query}: ${error.message}`);
      return;
    }
    throw error;
  }
}

function assertFirstSong(data, expectedId, expectedAlias) {
  assert.ok(data.results.songs.length > 0, "song resultが存在すること");
  assert.equal(data.results.songs[0].songId, expectedId, `${expectedId}が曲の先頭`);
  assert.equal(data.results.songs[0].matchAlias, expectedAlias, "matchAlias");
}

test("スノハレ aliasはSnow halation (S003)を曲先頭で返す", async t => {
  await withSearch(t, "スノハレ", data => {
    assertFirstSong(data, "S003", "スノハレ");
  });
});

test("ひらがなのすのはれもalias経由でS003を曲先頭で返す", async t => {
  await withSearch(t, "すのはれ", data => {
    assertFirstSong(data, "S003", "スノハレ");
  });
});

test("AA aliasはAngelic Angel (S098)を曲先頭で返す", async t => {
  await withSearch(t, "AA", data => {
    assertFirstSong(data, "S098", "AA");
  });
});

test("STARTは別曲のS041、S046をこの順で上位表示する", async t => {
  await withSearch(t, "START", data => {
    const ids = data.results.songs.map(item => item.songId);
    assert.deepEqual(ids.slice(0, 2), ["S041", "S046"]);
    assert.notEqual(ids[0], ids[1], "START:DASH!!の別曲IDを維持すること");
  });
});

test("歌唱名義aliasのえみつんは新田恵海 (SN0054)を先頭で返す", async t => {
  await withSearch(t, "えみつん", data => {
    assert.ok(data.results.singers.length > 0, "singer resultが存在すること");
    assert.equal(data.results.singers[0].singerId, "SN0054");
    assert.equal(data.results.singers[0].matchAlias, "えみつん");
  });
});

test("イベント完全名はみもパ！vol.1 第2回 (EV0017)を先頭で返す", async t => {
  await withSearch(t, "みもパ！vol.1 第2回", data => {
    assert.ok(data.results.events.length > 0, "event resultが存在すること");
    assert.equal(data.results.events[0].eventId, "EV0017");
  });
});

test("会場完全名は横浜アリーナ (VE0022)を先頭で返す", async t => {
  await withSearch(t, "横浜アリーナ", data => {
    assert.ok(data.results.venues.length > 0, "venue resultが存在すること");
    assert.equal(data.results.venues[0].venueId, "VE0022");
  });
});
