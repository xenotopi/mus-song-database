"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
let server;
let browser;
let baseUrl;
let releaseListFixture = [];
const releaseDetailFixtures = new Map();

function activeApiUrl() {
  const source = fs.readFileSync(path.join(ROOT, "assets", "js", "api.js"), "utf8");
  const match = source.match(/export\s+const\s+API_URL\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "active Public API URLを取得できること");
  return match[1];
}

async function fetchApi(action, params = {}) {
  const url = new URL(activeApiUrl());
  url.searchParams.set("action", action);
  url.searchParams.set("fresh", "1");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  assert.equal(response.status, 200, `${action} HTTP 200`);
  const json = await response.json();
  assert.equal(json.success, true, `${action} success`);
  return json.data;
}

async function installApiFixtures(page) {
  await page.route(/script\.google(?:usercontent)?\.com\//, route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");
    if (action === "revision") return jsonpResult(route, { dataRevision: "release-detail-test" });
    if (action === "releaseList") return jsonpResult(route, releaseListFixture);
    if (action === "release") {
      const detail = releaseDetailFixtures.get(url.searchParams.get("id"));
      if (detail) return jsonpResult(route, detail);
      const callback = url.searchParams.get("callback");
      return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: false, error: { code: "RELEASE_NOT_FOUND", message: "指定されたリリースは見つかりません。" } })});` });
    }
    return route.continue();
  });
}

test.before(async () => {
  releaseListFixture = await fetchApi("releaseList");
  const ids = ["R0015", "R0041", "R0054", "R0058", "R0060", "R0068", "R0069", "R0070", "R0071", "R0072", "R0074", "R0077", "R0087", "R0088", "R0090"];
  const details = await Promise.all(ids.map(id => fetchApi("release", { id })));
  ids.forEach((id, index) => releaseDetailFixtures.set(id, details[index]));
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "release.html" : pathname.replace(/^\/+/, ""));
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.MUSDB_E2E_BROWSER_CHANNEL || undefined });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function openDetail(id, options = {}) {
  const page = await browser.newPage({ viewport: options.viewport || { width: 1280, height: 900 } });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
  await installApiFixtures(page);
  await page.goto(`${baseUrl}/release.html${id == null ? "" : `?id=${encodeURIComponent(id)}`}`, { waitUntil: "domcontentloaded" });
  return { page, issues };
}

async function waitForDetail(page) {
  await page.locator("#mainContent").waitFor({ state: "visible", timeout: 45000 });
}

function jsonpResult(route, data) {
  const url = new URL(route.request().url());
  const callback = url.searchParams.get("callback");
  return route.fulfill({ status: 200, contentType: "text/javascript", body: `${callback}(${JSON.stringify({ success: true, apiVersion: "test", generatedAt: "2026-09-07T00:00:00+09:00", data })});` });
}

test("Release詳細", async t => {
  await t.test("R0015とR0058の複数debutSongs・公式URL", async () => {
    for (const expected of [
      { id: "R0015", name: "Wonderful Rush", date: "2012/09/05", songs: ["S032", "S033"] },
      { id: "R0058", name: "SUNNY DAY SONG／？←HEARTBEAT", date: "2015/07/08", songs: ["S100", "S101"] }
    ]) {
      const { page, issues } = await openDetail(expected.id);
      await waitForDetail(page);
      assert.equal(await page.locator("#releaseName").innerText(), expected.name);
      assert.match(await page.locator("#releaseInfo").innerText(), new RegExp(expected.date.replaceAll("/", "\\/")));
      assert.match(await page.locator("#releaseInfo").innerText(), /大分類[\s\S]*リリース種別/);
      assert.equal(await page.locator(".release-related").count(), 0);
      assert.deepEqual((await page.locator(".release-song-row").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id")))).sort(), expected.songs);
      const official = page.locator(".release-official-link");
      assert.equal(await official.getAttribute("target"), "_blank");
      assert.equal(await official.getAttribute("rel"), "noopener noreferrer");
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("relatedEvents 5 Releaseをorder順でEvent詳細へ表示", async () => {
    for (const expected of [
      { id: "R0041", events: ["EV0029"] },
      { id: "R0060", events: ["EV0051", "EV0052"] },
      { id: "R0069", events: ["EV0001"] },
      { id: "R0074", events: ["EV0013"] },
      { id: "R0087", events: ["EV0108", "EV0109"] }
    ]) {
      const { page, issues } = await openDetail(expected.id);
      await waitForDetail(page);
      assert.match(await page.locator("#releaseInfo").innerText(), /リリース種別\s*ライブBlu-ray/);
      assert.equal(await page.locator(".release-related h2").innerText(), "関連イベント");
      assert.deepEqual(await page.locator(".release-event-row").evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get("id"))), expected.events);
      const text = await page.locator(".release-related").innerText();
      assert.match(text, /収録公演/);
      assert.match(text, /\d{4}\/\d{2}\/\d{2}/);
      if (expected.id === "R0060") {
        for (const width of [1440, 1280, 1024, 768, 620, 390]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
        }
      }
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("releaseType代表値と不正relatedEventsへの耐性", async () => {
    const types = ["シングル", "Solo Live!", "ラジオCD", "サウンドトラック", "ベストアルバム", "コンプリートBOX", "企画アルバム", "アニメBlu-ray", "劇場版Blu-ray", "ライブBlu-ray", "映像集", "映像BOX", "前売券特典", "全巻購入特典"];
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const issues = [];
    page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
    await page.route(/script\.google(?:usercontent)?\.com\//, route => {
      const url = new URL(route.request().url());
      const callback = url.searchParams.get("callback");
      const index = Number(url.searchParams.get("id")?.slice(1)) - 9100;
      return jsonpResult(route, url.searchParams.get("action") === "revision" ? { dataRevision: "test" } : { releaseId: url.searchParams.get("id"), releaseDate: "2026-09-09", releaseName: `表示耐性 ${types[index]}`, classification: "CD", releaseType: types[index], sourceMedia: "CD", officialReleaseUrl: "", relatedEvents: [null, {}, { eventId: "INVALID", eventName: "除外" }], debutSongs: [], includedSongs: [], includedSongsMeta: { status: "complete", confirmedCount: 0, pendingCount: 0, publicNote: null } });
    });
    for (let index = 0; index < types.length; index += 1) {
      await page.goto(`${baseUrl}/release.html?id=R${9100 + index}`, { waitUntil: "domcontentloaded" });
      await waitForDetail(page);
      assert.match(await page.locator("#releaseInfo").innerText(), new RegExp(types[index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(await page.locator(".release-related").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    }
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("R0054長文と各viewportでoverflowなし", async () => {
    const { page, issues } = await openDetail("R0054");
    await waitForDetail(page);
    assert.match(await page.locator("#releaseName").innerText(), /MUSEUMでどうしたい/);
    for (const width of [1080, 900, 620, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
    }
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("R0068のdebutSongs 0件は正常な空状態", async () => {
    const { page, issues } = await openDetail("R0068");
    await waitForDetail(page);
    assert.equal(await page.locator(".release-songs-empty").innerText(), "このリリースを初出・由来とする登録曲はありません");
    assert.doesNotMatch(await page.locator("body").innerText(), /収録曲なし|曲情報がありません/);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("URLなし・発売日なし・非表示項目・HTML escape", async () => {
    const { page, issues } = await openDetail("R9001");
    await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/, route => jsonpResult(route, {
      releaseId: "R9001", releaseDate: "", releaseName: "<img src=x onerror=alert(1)> 長いテスト作品", classification: "その他", releaseType: "<script>alert(1)</script>", sourceMedia: "テスト媒体", officialReleaseUrl: "", todayEligible: true, note: "SECRET_INTERNAL_NOTE", relatedEvents: null, debutSongs: [], includedSongs: [], includedSongsMeta: { status: "complete", confirmedCount: 0, pendingCount: 0, publicNote: null }
    }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForDetail(page);
    const body = await page.locator("body").innerText();
    assert.match(body, /発売日未登録/);
    assert.match(body, /公式作品ページは未登録です/);
    assert.doesNotMatch(body, /R9001|SECRET_INTERNAL_NOTE|todayEligible/);
    assert.equal(await page.locator("#releaseName img").count(), 0);
    assert.equal(await page.locator("#releaseInfo script").count(), 0);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("収録情報のcomplete・partial・special_holdとDisc表示", async () => {
    const cases = [
      { id: "R0070", count: 31, groups: 2, details: 0, progress: null },
      { id: "R0071", count: 17, groups: 2, details: 0, progress: "確認済み17件 / 確認中1件" },
      { id: "R0077", count: 115, groups: 0, details: 9, progress: "確認済み115件 / 確認中9件" },
      { id: "R0088", count: 285, groups: 0, details: 27, progress: null },
      { id: "R0090", count: 116, groups: 0, details: 12, progress: null }
    ];
    for (const expected of cases) {
      const started = Date.now();
      const { page, issues } = await openDetail(expected.id);
      await waitForDetail(page);
      assert.equal(await page.locator("#includedSongsCount").innerText(), `${expected.count}件`);
      assert.equal(await page.locator(".release-included-song-row").count(), expected.count);
      assert.equal(await page.locator(".release-disc-group").count(), expected.groups);
      assert.equal(await page.locator(".release-disc-details").count(), expected.details);
      if (expected.details) {
        assert.equal(await page.locator(".release-disc-details[open]").count(), 1);
      }
      if (expected.progress) assert.match(await page.locator(".release-coverage-note").innerText(), new RegExp(expected.progress));
      if (expected.id === "R0088") assert.ok(Date.now() - started < 10000, "285件を10秒以内に描画");
      if (expected.id === "R0090") {
        const sunny = page.locator('.release-included-song-row[href="song.html?id=S100"]');
        assert.equal(await sunny.count(), 2);
        assert.equal(await sunny.filter({ hasText: "Movie Edit" }).count(), 1);
      }
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("0件coverage状態と収録schema異常をsection内で処理", async () => {
    for (const expected of [
      { id: "R0068", section: true, progress: "確認済み0件 / 確認中48件", empty: false },
      { id: "R0072", section: true, progress: null, empty: false }
    ]) {
      const { page, issues } = await openDetail(expected.id);
      await waitForDetail(page);
      assert.equal(await page.locator("#includedSongsSection").isVisible(), expected.section);
      assert.equal(await page.locator("#includedSongsSection .release-songs-empty").count(), expected.empty ? 1 : 0);
      if (expected.progress) assert.match(await page.locator(".release-coverage-note").innerText(), new RegExp(expected.progress));
      if (expected.id === "R0072") assert.equal(await page.locator("#includedSongsCount").innerText(), "");
      assert.deepEqual(issues, []);
      await page.close();
    }

    const page = await browser.newPage();
    await installApiFixtures(page);
    await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/, route => jsonpResult(route, { releaseId: "R9010", releaseName: "schema test", classification: "CD", releaseType: "シングル", relatedEvents: [], debutSongs: [] }));
    await page.goto(`${baseUrl}/release.html?id=R9010`, { waitUntil: "domcontentloaded" });
    await waitForDetail(page);
    assert.equal(await page.locator(".release-inclusion-error").innerText(), "収録情報を表示できません。再読み込みしてください。");
    assert.equal(await page.locator("#status.error").count(), 0);
    await page.close();
  });

  await t.test("1Disc・Disc不明・variant・重複relation・escape・not_applicable", async () => {
    const fixtures = {
      R9011: { status: "unreviewed", publicNote: "<b>確認中</b>", songs: [
        { relationId: "RT9001", songId: "S100", songName: "SUNNY DAY SONG", displayName: "SUNNY DAY SONG", disc: 3, track: 9, displayOrder: 1, variant: "<img src=x onerror=alert(1)>" },
        { relationId: "RT9002", songId: "S100", songName: "SUNNY DAY SONG", displayName: "SUNNY DAY SONG", disc: 3, track: 10, displayOrder: 2, variant: "Movie Edit" },
        { relationId: "RT9003", songId: "S101", songName: "？←HEARTBEAT", displayName: "<script>alert(1)</script>", disc: null, track: null, displayOrder: 3, variant: null }
      ] },
      R9012: { status: "complete", publicNote: null, songs: [] },
      R9013: { status: "not_applicable", publicNote: null, songs: [] }
    };
    for (const [id, fixture] of Object.entries(fixtures)) {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      await installApiFixtures(page);
      await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/, route => jsonpResult(route, { releaseId: id, releaseName: "fixture", classification: "CD", releaseType: "シングル", relatedEvents: [], debutSongs: [], includedSongs: fixture.songs, includedSongsMeta: { status: fixture.status, confirmedCount: fixture.songs.length, pendingCount: null, publicNote: fixture.publicNote } }));
      await page.goto(`${baseUrl}/release.html?id=${id}`, { waitUntil: "domcontentloaded" });
      await waitForDetail(page);
      if (id === "R9011") {
        assert.equal(await page.locator(".release-included-song-row").count(), 3);
        assert.equal(await page.locator('.release-included-song-row[href="song.html?id=S100"]').count(), 2);
        assert.match(await page.locator("#includedSongsContent").innerText(), /Disc 3[\s\S]*Track 9/);
        assert.match(await page.locator("#includedSongsContent").innerText(), /Disc情報なし/);
        assert.equal(await page.locator("#includedSongsContent img, #includedSongsContent script").count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      } else if (id === "R9012") {
        assert.equal(await page.locator("#includedSongsSection .release-songs-empty").innerText(), "収録楽曲の登録はありません。");
      } else {
        assert.equal(await page.locator("#includedSongsSection").isVisible(), false);
      }
      await page.close();
    }
  });

  await t.test("idなし・形式不正ではAPIを呼ばない", async () => {
    for (const id of [null, "ABC"]) {
      const { page } = await openDetail(id);
      let releaseCalls = 0;
      await page.route(/script\.google(?:usercontent)?\.com\//, route => { if (new URL(route.request().url()).searchParams.get("action") === "release") releaseCalls += 1; return route.continue(); });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#status.error").waitFor({ state: "visible" });
      assert.match(await page.locator("#releaseName").innerText(), id == null ? /指定されていません/ : /形式が正しくありません/);
      assert.equal(await page.locator("#retryButton").count(), 0);
      assert.equal(releaseCalls, 0);
      await page.close();
    }
  });

  await t.test("存在しないIDはnot-foundで再試行なし", async () => {
    const { page, issues } = await openDetail("R9999");
    await page.locator("#status.error").waitFor({ state: "visible", timeout: 45000 });
    assert.equal(await page.locator("#releaseName").innerText(), "該当するリリースが見つかりません");
    assert.equal(await page.locator("#retryButton").count(), 0);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("APIエラー後の再試行で復旧", async () => {
    const { page } = await openDetail("R0015");
    await page.route(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/, route => route.fulfill({ status: 503, body: "unavailable" }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#retryButton").waitFor({ state: "visible", timeout: 45000 });
    assert.equal(await page.locator("#releaseName").innerText(), "リリースデータを表示できません");
    await page.unroute(/script\.google(?:usercontent)?\.com\/.*[?&]action=release(?:&|$)/);
    await page.locator("#retryButton").click();
    await waitForDetail(page);
    assert.equal(await page.locator("#releaseName").innerText(), "Wonderful Rush");
    await page.close();
  });

  await t.test("一覧から詳細、詳細から一覧へ遷移", async () => {
    const page = await browser.newPage();
    await installApiFixtures(page);
    await page.goto(`${baseUrl}/releases.html?q=Wonderful%20Rush`, { waitUntil: "domcontentloaded" });
    await page.locator(".release-list-card").waitFor({ state: "visible", timeout: 45000 });
    await page.locator(".release-list-card").click();
    await page.waitForURL(/release\.html\?id=R0015/);
    await waitForDetail(page);
    await page.locator(".release-back").click();
    await page.waitForURL(/releases\.html$/);
    await page.close();
  });

  await t.test("2段階filterから詳細へ遷移しブラウザBackでqueryを復元", async () => {
    const page = await browser.newPage();
    await installApiFixtures(page);
    await page.goto(`${baseUrl}/releases.html?classification=Blu-ray&type=%E3%83%A9%E3%82%A4%E3%83%96Blu-ray`, { waitUntil: "domcontentloaded" });
    await page.locator('.release-list-card[href="release.html?id=R0041"]').waitFor({ state: "visible", timeout: 45000 });
    await page.locator('.release-list-card[href="release.html?id=R0041"]').click();
    await waitForDetail(page);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.locator("#allReleasesSection").waitFor({ state: "visible", timeout: 45000 });
    assert.equal(new URL(page.url()).searchParams.get("classification"), "Blu-ray");
    assert.equal(new URL(page.url()).searchParams.get("type"), "ライブBlu-ray");
    assert.equal(await page.locator('[data-release-type="ライブBlu-ray"]').getAttribute("aria-pressed"), "true");
    await page.close();
  });
});
