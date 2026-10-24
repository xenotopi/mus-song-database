"use strict";

const a = require("node:assert/strict");
const { sha256, assertSingerEvidence } = require("./detail-document-contract.cjs");

const COMPONENTS = Object.freeze({
  release: Object.freeze({ bar: ".detail-context-bar[data-release-context]", foreign: "#songDetailContextV46", hero: ".release-hero", title: "#releaseName", type: ".detail-context-type", label: "作品", barTitle: ".detail-context-title", button: ".detail-context-top-button" }),
  song: Object.freeze({ bar: "#songDetailContextV46.v46-detail-context", foreign: ".detail-context-bar", hero: ".song-hero-v46", title: "#songName", type: ".v46-detail-context-type", label: "曲", barTitle: ".v46-detail-context-title", button: ".v46-detail-context-top" })
});
function component(kind) { a.ok(Object.hasOwn(COMPONENTS, kind), "Explicit Song/Release kind required"); return COMPONENTS[kind]; }

async function waitForDetailReady(page, kind, timeout = 30000) {
  component(kind);
  if (kind === "release") await page.evaluate(async () => {
    const entry = document.querySelector('script[src*="release-v500.js"]');
    if (!entry) throw Error("Release renderer entry missing");
    const module = await import(entry.src); await module.releaseReady; await module.releasePersonReady;
  });
  await page.waitForFunction(() => document.getElementById("status")?.hidden && !document.getElementById("mainContent")?.hidden, {}, { timeout });
  await page.evaluate(() => document.fonts.ready);
}

async function captureDiscState(page, selector) {
  a.ok(typeof selector === "string" && selector.length, "Explicit Disc scope required");
  const rows = await page.locator(selector).evaluateAll(nodes => nodes.map(n => ({ id: n.id, open: n.open })));
  a.ok(rows.every(r => r.id && typeof r.open === "boolean"), "Stable Disc IDs required");
  a.equal(new Set(rows.map(r => r.id)).size, rows.length, "Duplicate Disc identity");
  return { selector, rows };
}

async function restoreDiscState(page, state) {
  try {
    const current = await captureDiscState(page, state.selector);
    a.deepEqual(current.rows.map(r => r.id), state.rows.map(r => r.id), "Disc identity/count changed");
    for (const [index, node] of (await page.locator(state.selector).all()).entries()) {
      if (await node.evaluate(n => n.open) !== state.rows[index].open) await node.locator(":scope > summary").click();
      a.equal(await node.evaluate(n => n.open), state.rows[index].open, "Restore actual initial Disc state");
    }
    a.deepEqual(await captureDiscState(page, state.selector), state);
  } catch (cause) {
    const error = new Error("Disc restoration failed", { cause }); error.code = "QA_HARNESS"; throw error;
  }
}

async function assertScrollNavigation(page, { kind, width, timeout = 30000 }) {
  const c = component(kind), bar = page.locator(c.bar), url = page.url();
  a.equal(await page.locator(c.foreign).count(), 0, "Foreign detail component");
  a.equal(await bar.count(), 1); a.equal(await bar.locator(c.type).innerText(), c.label);
  const title = (await page.locator(c.title).innerText()).replace(/\s+/g, " ").trim();
  const wait = visible => page.waitForFunction(({ selector, visible }) => {
    const node = document.querySelector(selector);
    return node && node.getAttribute("aria-hidden") === String(!visible) && node.classList.contains("is-visible") === visible && (visible || scrollY <= 2);
  }, { selector: c.bar, visible }, { timeout });
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(false);
  await page.locator(c.hero).evaluate(n => window.scrollTo(0, window.scrollY + n.getBoundingClientRect().bottom + 160)); await wait(true);
  a.equal((await bar.locator(c.barTitle).innerText()).replace(/\s+/g, " ").trim(), title);
  const box = await bar.boundingBox(); a.ok(box && box.x >= -1 && box.x + box.width <= width + 1);
  if (kind === "release") { const header = await page.locator(".site-header").boundingBox(); a.ok(header && box.y >= header.y + header.height - 1, "Header must remain clear"); }
  const button = bar.locator(c.button); a.equal(await button.getAttribute("aria-label"), "ページ上部へ戻る");
  if (width === 1280) { await button.focus(); await page.keyboard.press("Enter"); } else await button.click();
  await wait(false); a.equal(page.url(), url);
  return { kind, width, title, returnTop: true, urlUnchanged: true, operation: width === 1280 ? "Enter" : "click" };
}

async function captureSingerResponse(response, { mode, caseId, mocked }) {
  const chain = []; let request = response.request();
  while (request) { chain.unshift(request.url()); request = request.redirectedFrom(); }
  const requestUrl = chain.find(url => new URL(url).searchParams.get("action") === "singerList");
  if (!requestUrl) return null;
  const body = await response.text();
  const evidence = { mode, caseId, mocked, requestUrl, url: response.url(), redirectChain: chain, status: response.status(), body, sha256: sha256(body) };
  assertSingerEvidence(evidence, { mode, caseId });
  return evidence;
}

function attachDiagnostics(page) {
  const record = { pageerror: [], console: [], httpErrors: [], requestfailed: [], navigationAborts: [] };
  let phase = "main";
  const listeners = {
    pageerror: error => record.pageerror.push(error.message),
    console: message => { if (message.type() === "error") record.console.push({ phase, text: message.text() }); },
    response: response => { if (response.status() >= 400) record.httpErrors.push({ phase, url: response.url(), status: response.status() }); },
    requestfailed: request => {
      const row = { phase, url: request.url(), error: request.failure()?.errorText };
      (phase === "navigation" && row.error === "net::ERR_ABORTED" ? record.navigationAborts : record.requestfailed).push(row);
    }
  };
  for (const [event, listener] of Object.entries(listeners)) page.on(event, listener);
  return { record, setPhase(value) { a.ok(["main", "navigation"].includes(value)); phase = value; },
    assertClean() { for (const key of ["pageerror", "console", "httpErrors", "requestfailed"]) a.deepEqual(record[key], [], key); },
    detach() { for (const [event, listener] of Object.entries(listeners)) page.off(event, listener); } };
}

module.exports = { COMPONENTS, component, waitForDetailReady, captureDiscState, restoreDiscState, assertScrollNavigation, captureSingerResponse, attachDiagnostics };
