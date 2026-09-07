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

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
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

async function open(pathname, viewport) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", error => issues.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  await page.locator("#siteHeader .site-header").waitFor({ state: "visible", timeout: 15000 });
  return { page, issues };
}

test("共通ナビ Release追加", { timeout: 4 * 60 * 1000 }, async t => {
  await t.test("PCナビは指定順・一行・非衝突", async () => {
    const { page, issues } = await open("/releases.html", { width: 1440, height: 900 });
    const expected = ["ホーム", "曲", "リリース", "イベント", "会場", "歌唱名義", "ランキング", "統計", "About"];
    assert.deepEqual(await page.locator(".mus-desktop-navigation a").allTextContents().then(values => values.map(value => value.trim())), expected);
    for (const width of [1440, 1280, 1080, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const brand = document.querySelector(".site-header .brand").getBoundingClientRect();
        const search = document.querySelector(".site-header .global-search-wrap").getBoundingClientRect();
        const nav = document.querySelector(".mus-desktop-navigation");
        const navBox = nav.getBoundingClientRect();
        const links = [...nav.querySelectorAll("a")].map(link => link.getBoundingClientRect());
        return {
          bodyWidth: document.body.scrollWidth,
          documentWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          display: getComputedStyle(nav).display,
          navHeight: navBox.height,
          linkTops: links.map(box => Math.round(box.top)),
          collision: brand.right > search.left || search.right > navBox.left
        };
      });
      assert.equal(layout.display === "none", false, `${width}px desktop nav`);
      assert.equal(new Set(layout.linkTops).size, 1, `${width}px nav wrap`);
      assert.equal(layout.collision, false, `${width}px brand/search/nav collision`);
      assert.ok(layout.documentWidth <= layout.innerWidth && layout.bodyWidth <= layout.innerWidth, `${width}px overflow`);
    }
    assert.equal(await page.locator(".mus-desktop-navigation a.active[href='releases.html']").count(), 1);
    assert.deepEqual(issues, []);
    await page.close();
  });

  await t.test("Release一覧・詳細でactiveになる", async () => {
    for (const pathname of ["/releases.html", "/release.html?id=R0015"]) {
      const { page, issues } = await open(pathname, { width: 1280, height: 900 });
      assert.equal(await page.locator(".mus-desktop-navigation a.active[href='releases.html']").count(), 1);
      assert.equal(await page.locator(".mus-mobile-drawer-nav a.active[href='releases.html']").count(), 1);
      assert.deepEqual(issues, []);
      await page.close();
    }
  });

  await t.test("mobile drawerの表示・開閉・キーボード操作", async () => {
    const { page, issues } = await open("/releases.html", { width: 900, height: 900 });
    for (const width of [900, 768, 620, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator(".mus-desktop-navigation").evaluate(node => getComputedStyle(node).display), "none", `${width}px desktop hidden`);
      assert.notEqual(await page.locator("#musMobileMenuButton").evaluate(node => getComputedStyle(node).display), "none", `${width}px menu visible`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width}px overflow`);
    }
    await page.locator("#musMobileMenuButton").click();
    assert.equal(await page.locator("#musMobileMenuButton").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#musMobileDrawer").getAttribute("aria-hidden"), "false");
    assert.equal(await page.locator(".mus-mobile-drawer-nav a.active[href='releases.html']").count(), 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#musMobileMenuButton").getAttribute("aria-expanded"), "false");
    await page.locator("#musMobileMenuButton").click();
    await page.locator("#musMobileMenuClose").click();
    assert.equal(await page.locator("#musMobileDrawer").getAttribute("aria-hidden"), "true");
    assert.deepEqual(issues, []);
    await page.close();
  });
});
