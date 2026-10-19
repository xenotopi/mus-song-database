"use strict";
const assert = require("node:assert/strict");
const { parseSerializedHtml } = require("../../tools/static-html-readonly-lib.cjs");
const { validateReleaseBody, validateKamiparaBody } = require("../../tools/validate-static-html.cjs");

function assertReleaseDom(html, release, releaseList, dedicated) {
  const doc = parseSerializedHtml(html);
  validateReleaseBody(doc, release, releaseList);
  if (release.releaseId === "R0072") {
    assert.ok(dedicated?.dashboard && dedicated?.venues, "R0072 requires its dedicated snapshot, not a normal Release assertion");
    validateKamiparaBody(doc, dedicated.dashboard, dedicated.venues);
  }
}

async function assertReleasePage(page, release, releaseList, dedicated) {
  // Wait for existing renderer completion, not a fixed delay or hidden input.
  await page.evaluate(async () => {
    const entry = document.querySelector('script[src*="release-v500.js"]');
    if (!entry) throw new Error("Release renderer entry missing");
    await (await import(entry.src)).releaseReady;
  });
  assertReleaseDom(await page.content(), release, releaseList, dedicated);
}
module.exports = { assertReleaseDom, assertReleasePage };
