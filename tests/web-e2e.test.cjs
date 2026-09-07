"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const API_HOST_PATTERN = /(?:script\.google\.com|script\.googleusercontent\.com)/i;
const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });
const READY_TIMEOUT_MS = Number(process.env.MUSDB_E2E_READY_TIMEOUT_MS || 45000);

const PAGE_CASES = Object.freeze([
  { name: "ホーム", path: "/index.html", ready: "#summary:not([hidden])", content: "#performanceCount" },
  { name: "曲一覧", path: "/songs.html", ready: "#allSongsSection:not([hidden])", content: "#songsList .song-list-card" },
  { name: "曲詳細", path: "/song.html?id=S003", ready: "#mainContent:not([hidden])", content: "#historyList" },
  { name: "リリース一覧", path: "/releases.html", ready: "#allReleasesSection:not([hidden])", content: "#releasesList .release-list-card" },
  { name: "リリース詳細", path: "/release.html?id=R0015", ready: "#mainContent:not([hidden])", content: "#debutSongs .release-song-row" },
  { name: "イベント一覧", path: "/events.html", ready: "#timelineSection:not([hidden])", content: "#yearsContainer .history-event-card" },
  { name: "イベント詳細", path: "/event.html?id=EV0017", ready: "#mainContent:not([hidden])", content: "#songList" },
  { name: "会場一覧", path: "/venues.html", ready: "#allVenuesSection:not([hidden])", content: "#venuesList .venue-list-card" },
  { name: "会場詳細", path: "/venue.html?id=VE0038", ready: "#mainContent:not([hidden])", content: "#eventList" },
  { name: "歌唱名義一覧", path: "/singers.html", ready: "#listSection:not([hidden])", content: "#singersList .singer-list-card" },
  { name: "歌唱名義詳細", path: "/singer.html?id=SN0054", ready: "#summary:not([hidden])", content: "#historyList" },
  { name: "ランキング", path: "/rankings.html", ready: "#summary:not([hidden])", content: ".ranking-row" },
  { name: "統計", path: "/statistics.html", ready: "#overviewSection:not([hidden])", content: ".stats-overview-card" },
  { name: "検索", path: "/search.html?q=%E3%82%B9%E3%83%8E%E3%83%8F%E3%83%AC", ready: "#resultsArea .result-section", content: "#resultsArea .result-row" },
  {
    name: "gap checker",
    path: "/gap-checker.html",
    ready: "#songSelect:not([disabled])",
    content: "#checkButton",
    countSelector: "#songSelect option:not([value=''])",
    minimumCount: 1
  },
  { name: "About", path: "/about.html", ready: "#aboutSummary:not([hidden])", content: "#aboutLastUpdated" },
  { name: "404", path: "/404.html", ready: "main h1", content: "main a[href='index.html']", apiOptional: true }
]);

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
});

function isInsideRoot(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function createStaticServer() {
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    } catch {
      response.writeHead(400);
      response.end("Bad Request");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, relativePath);

    if (!isInsideRoot(filePath)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        response.writeHead(404);
        response.end("Not Found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream"
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      fs.createReadStream(filePath).pipe(response);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve());
        })
      });
    });
  });
}

function findWindowsBrowser() {
  if (process.platform !== "win32") return "";

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || "";
}

async function launchBrowser() {
  const options = { headless: true };
  const explicitExecutable = String(process.env.MUSDB_E2E_EXECUTABLE_PATH || "").trim();
  const explicitChannel = String(process.env.MUSDB_E2E_BROWSER_CHANNEL || "").trim();

  if (explicitExecutable) {
    options.executablePath = explicitExecutable;
  } else if (explicitChannel && explicitChannel !== "chromium") {
    options.channel = explicitChannel;
  } else if (!explicitChannel) {
    const windowsBrowser = findWindowsBrowser();
    if (windowsBrowser) options.executablePath = windowsBrowser;
  }

  return chromium.launch(options);
}

function isApiUrl(url) {
  return API_HOST_PATTERN.test(String(url || ""));
}

function attachDiagnostics(page, baseUrl) {
  const diagnostics = {
    apiFailures: [],
    apiResponses: [],
    consoleErrors: [],
    localFailures: [],
    pageErrors: []
  };

  page.on("console", message => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });

  page.on("pageerror", error => {
    diagnostics.pageErrors.push(String(error?.stack || error?.message || error));
  });

  page.on("requestfailed", request => {
    const item = `${request.method()} ${request.url()} ${request.failure()?.errorText || "request failed"}`;
    if (isApiUrl(request.url())) diagnostics.apiFailures.push(item);
    if (request.url().startsWith(baseUrl)) diagnostics.localFailures.push(item);
  });

  page.on("response", response => {
    const item = `${response.status()} ${response.url()}`;
    if (isApiUrl(response.url())) {
      diagnostics.apiResponses.push(item);
      if (response.status() === 429 || response.status() >= 500) diagnostics.apiFailures.push(item);
    }
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      diagnostics.localFailures.push(item);
    }
  });

  return diagnostics;
}

async function readStatusText(page) {
  const status = page.locator("#status");
  return await status.count() ? String(await status.first().textContent() || "").trim() : "";
}

function apiFailureSummary(diagnostics) {
  return [...new Set(diagnostics.apiFailures)].slice(0, 3).join(" | ");
}

async function assertPageCase(t, context, baseUrl, pageCase) {
  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page, baseUrl);

  try {
    const response = await page.goto(`${baseUrl}${pageCase.path}`, {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS
    });

    assert.equal(response?.status(), 200, `${pageCase.name}: HTML HTTP status`);

    try {
      await page.locator(pageCase.ready).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
      await page.locator(pageCase.content).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
      if (pageCase.countSelector) {
        await page.waitForFunction(
          ({ selector, minimumCount }) => document.querySelectorAll(selector).length >= minimumCount,
          { selector: pageCase.countSelector, minimumCount: pageCase.minimumCount || 1 },
          { timeout: READY_TIMEOUT_MS }
        );
      }
    } catch (error) {
      if (!pageCase.apiOptional && diagnostics.apiFailures.length) {
        t.skip(`${pageCase.name}: Public API一時障害 (${apiFailureSummary(diagnostics)})`);
        return;
      }
      const statusText = await readStatusText(page);
      throw new Error(`${pageCase.name}: 主要DOM未表示。status=${statusText || "なし"}; ${error.message}`);
    }

    await page.waitForTimeout(500);

    const layout = await page.evaluate(() => ({
      bodyScrollWidth: document.body?.scrollWidth || 0,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));

    assert.equal(layout.innerWidth, MOBILE_VIEWPORT.width, `${pageCase.name}: viewport幅`);
    assert.ok(
      layout.documentScrollWidth <= layout.innerWidth && layout.bodyScrollWidth <= layout.innerWidth,
      `${pageCase.name}: 横overflow ${JSON.stringify(layout)}`
    );
    assert.ok((await page.title()).includes("μ's Song Database"), `${pageCase.name}: title`);
    assert.equal(await page.locator("#siteHeader .site-header").count(), 1, `${pageCase.name}: 共通ヘッダー`);
    assert.equal(await page.locator("#siteFooter .site-footer").count(), 1, `${pageCase.name}: 共通フッター`);
    assert.deepEqual(diagnostics.localFailures, [], `${pageCase.name}: ローカルasset失敗`);

    if (diagnostics.apiFailures.length) {
      t.skip(`${pageCase.name}: 表示後のPublic API一時障害 (${apiFailureSummary(diagnostics)})`);
      return;
    }

    assert.deepEqual(diagnostics.pageErrors, [], `${pageCase.name}: JavaScript例外`);
    assert.deepEqual(diagnostics.consoleErrors, [], `${pageCase.name}: Console error`);
  } finally {
    await page.close();
  }
}

async function waitForNavigationReady(page, selector) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator(selector).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
}

test("主要17ページ read-only E2E", { timeout: 12 * 60 * 1000 }, async t => {
  const server = await createStaticServer();
  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "ja-JP",
    serviceWorkers: "block",
    timezoneId: "Asia/Tokyo",
    viewport: MOBILE_VIEWPORT
  });

  try {
    for (const pageCase of PAGE_CASES) {
      await t.test(pageCase.name, async subtest => {
        await assertPageCase(subtest, context, server.baseUrl, pageCase);
      });
    }
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
});

test("主要導線は一覧から実在詳細へ遷移できる", { timeout: 5 * 60 * 1000 }, async t => {
  const server = await createStaticServer();
  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "ja-JP",
    serviceWorkers: "block",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page, server.baseUrl);

  try {
    await page.goto(`${server.baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS });
    await waitForNavigationReady(page, "#summary:not([hidden])");

    await page.locator(".mus-desktop-navigation a[href='songs.html']").click();
    await page.waitForURL("**/songs.html", { timeout: READY_TIMEOUT_MS });
    await waitForNavigationReady(page, "#songsList .song-list-card");

    await page.locator("#songsList .song-list-card").first().click();
    await page.waitForURL(/\/song\.html\?id=S\d+/, { timeout: READY_TIMEOUT_MS });
    await waitForNavigationReady(page, "#mainContent:not([hidden])");

    await page.locator(".mus-desktop-navigation a[href='events.html']").click();
    await page.waitForURL("**/events.html", { timeout: READY_TIMEOUT_MS });
    await waitForNavigationReady(page, "#yearsContainer .history-event-card");

    await page.locator("#yearsContainer .history-event-card").first().click();
    await page.waitForURL(/\/event\.html\?id=EV\d+/, { timeout: READY_TIMEOUT_MS });
    await waitForNavigationReady(page, "#mainContent:not([hidden])");

    if (diagnostics.apiFailures.length) {
      t.skip(`主要導線: Public API一時障害 (${apiFailureSummary(diagnostics)})`);
      return;
    }

    assert.deepEqual(diagnostics.localFailures, [], "主要導線: ローカルasset失敗");
    assert.deepEqual(diagnostics.pageErrors, [], "主要導線: JavaScript例外");
    assert.deepEqual(diagnostics.consoleErrors, [], "主要導線: Console error");
  } catch (error) {
    if (diagnostics.apiFailures.length) {
      t.skip(`主要導線: Public API一時障害 (${apiFailureSummary(diagnostics)})`);
      return;
    }
    throw error;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    await server.close();
  }
});
