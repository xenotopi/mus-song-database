"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { serializeCanonicalForCapture } = require("../tools/capture-canonical.cjs");
const canonical = "https://mus-song-db.com/song/S001.html";
const prefix = '<!doctype html><html><head><title>capture</title>', tail = '<script type="application/ld+json">{"a":1}</script>', suffix = '</head><body><main>same content</main></body></html>';
let browser;
before(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); });
after(async () => { await browser?.close(); });
async function pageWith(head, action) { const page = await browser.newPage(); try { await page.setContent(prefix + head + suffix); return await action(page); } finally { await page.close(); } }
test("canonical serialization has exact attributes, order, URL and last-head-child placement", async () => {
  await pageWith(tail, async page => {
    const html = await page.evaluate(serializeCanonicalForCapture, { canonical });
    assert.equal(html, await page.content());
    assert.ok(html.includes(tail + `<link rel="canonical" href="${canonical}"></head>`));
    assert.deepEqual(await page.evaluate(() => [...document.head.lastChild.attributes].map(a => [a.name, a.value])), [["rel", "canonical"], ["href", canonical]]);
  });
});
test("helper-first and generator-first attributes/positions produce the same complete HTML", async () => {
  const a = await pageWith(`<link rel="canonical" data-seo-dynamic="true" href="${canonical}">` + tail, p => p.evaluate(serializeCanonicalForCapture, { canonical }));
  const b = await pageWith(tail + `<link href="${canonical}" rel="canonical">`, p => p.evaluate(serializeCanonicalForCapture, { canonical }));
  const c = await pageWith(tail, p => p.evaluate(serializeCanonicalForCapture, { canonical }));
  assert.equal(a, b); assert.equal(b, c);
});
test("serialization is byte-idempotent", async () => pageWith(tail, async page => {
  assert.equal(await page.evaluate(serializeCanonicalForCapture, { canonical }), await page.evaluate(serializeCanonicalForCapture, { canonical }));
}));
for (const [name, head] of [
  ["duplicates", `<link rel="canonical" href="${canonical}"><link rel="canonical" href="${canonical}">`],
  ["wrong existing URL", '<link rel="canonical" href="https://mus-song-db.com/song/S002.html">'],
  ["unexpected attribute", `<link rel="canonical" href="${canonical}" data-unreviewed="x">`],
  ["unexpected runtime marker", `<link rel="canonical" href="${canonical}" data-seo-dynamic="false">`]
]) test("rejects " + name, async () => pageWith(head, async page => assert.rejects(page.evaluate(serializeCanonicalForCapture, { canonical }), /capture canonical/i)));
test("rejects noncanonical target URLs", async () => pageWith(tail, async page => {
  for (const value of ["https://example.com/song/S001.html", canonical + "?x=1", canonical + "#x", "http://mus-song-db.com/song/S001.html", "https://mus-song-db.com/song/S9999.html"]) await assert.rejects(page.evaluate(serializeCanonicalForCapture, { canonical: value }), /Invalid capture canonical/);
}));
test("Release uses the same contract", async () => pageWith(tail, async page => {
  const url = "https://mus-song-db.com/release/R0090.html", html = await page.evaluate(serializeCanonicalForCapture, { canonical: url });
  assert.ok(html.endsWith(`<link rel="canonical" href="${url}"></head><body><main>same content</main></body></html>`));
}));
test("both renderer fingerprints pin the canonical producer dependency", () => {
  const song = require("../tools/generate-song-pages.cjs"), release = require("../tools/generate-release-pages.cjs");
  assert.ok(song.SONG_RENDERER_FILES.includes("tools/capture-canonical.cjs"));
  assert.ok(release.RELEASE_RENDERER_FILES.includes("tools/capture-canonical.cjs"));
});
