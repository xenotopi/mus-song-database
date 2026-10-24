"use strict";

const test = require("node:test");
const a = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { sha256, assertRuntimeDocument } = require("./helpers/detail-document-contract.cjs");
const { captureDiscState, restoreDiscState, assertScrollNavigation, captureSingerResponse, attachDiagnostics } = require("./helpers/detail-browser-contract.cjs");
const { createRunStore, classifyFailure } = require("./helpers/qa-run-context.cjs");
const { fixtureValidators } = require("../tools/run-detail-qa.cjs");

// Synthetic document identity is independent of the loopback transport origin.
const FIXTURE_CANONICAL_ORIGIN = "https://detail-qa.fixture.invalid";
let browser, server, origin, store;
const cases = new Map(), outcomes = [];

// Small in-memory UI fixture. It is not generated/formal product HTML or a receipt.
function fixture(kind) {
  const id = kind === "release" ? "R0001" : "S001", title = "Synthetic " + kind;
  const data = { [kind + "Id"]: id, [kind === "release" ? "releaseName" : "songName"]: title,
    expected: { fields: { productFacts: "Synthetic CD" }, relations: [["RT0001", "song/S001.html"]] } };
  const c = kind === "release" ? { cls: "detail-context-bar", identity: 'data-release-context=""', type: "detail-context-type", title: "detail-context-title", button: "detail-context-top-button", label: "作品" } :
    { cls: "v46-detail-context", identity: 'id="songDetailContextV46"', type: "v46-detail-context-type", title: "v46-detail-context-title", button: "v46-detail-context-top", label: "曲" };
  const markup = `<div class="${c.cls}" ${c.identity} aria-hidden="true"><span class="${c.type}">${c.label}</span><span class="${c.title}">${title}</span><button type="button" class="${c.button}" aria-label="ページ上部へ戻る">TOP</button></div>`;
  const script = `(function(){const host=document.createElement('div');host.innerHTML=${JSON.stringify(markup)};const bar=host.firstElementChild;document.body.appendChild(bar);const update=()=>{const on=scrollY>120;bar.setAttribute('aria-hidden',String(!on));bar.classList.toggle('is-visible',on)};addEventListener('scroll',update);bar.querySelector('button').addEventListener('click',()=>{scrollTo(0,0);update()});update()})();`;
  const html = `<!DOCTYPE html><html data-${kind}-id="${id}"><head><link rel="canonical" href="${FIXTURE_CANONICAL_ORIGIN}/${kind}/${id}.html"><meta name="robots" content="index,follow,max-image-preview:large"><style>body{margin:0;font-family:sans-serif}.site-header{height:40px}.release-hero,.song-hero-v46{height:100px}.detail-context-bar,.v46-detail-context{display:none;position:fixed;top:50px;left:0;right:0;background:white;padding:8px}.is-visible{display:block}button,summary{min-height:44px}main{padding:12px}#tail{height:2400px}</style></head><body><header class="site-header">Header</header><section class="${kind === "release" ? "release-hero" : "song-hero-v46"}"><h1 id="${kind}Name">${title}</h1></section><div id="heroMeta">Synthetic</div><main id="mainContent"><dl id="releaseInfo"></dl><div id="songInfo">Synthetic info</div><p id="productFacts">Synthetic CD</p><details id="disc1" open=""><summary>Disc 1</summary><a data-relation-id="RT0001" href="song/S001.html">Song</a></details><details id="disc2" open=""><summary>Disc 2</summary>Track 2</details></main><div id="tail"></div><script>${script}</script></body></html>`;
  return { html, data, id, kind };
}

test.before(async () => {
  a.ok(process.env.DETAIL_QA_EVIDENCE_DIR && path.isAbsolute(process.env.DETAIL_QA_EVIDENCE_DIR), "Explicit evidence parent required");
  a.ok(process.env.DETAIL_QA_SOURCE_RUN, "Explicit unique sourceRun required");
  // No fallback dependency tree, install, alternate channel or browser download.
  const { chromium } = require("playwright");
  store = createRunStore({ evidenceDir: process.env.DETAIL_QA_EVIDENCE_DIR, sourceRun: process.env.DETAIL_QA_SOURCE_RUN, protectedRoots: [path.resolve(__dirname, "..")] });
  server = http.createServer((request, response) => {
    const url = new URL(request.url, origin || "http://localhost");
    if (url.pathname === "/favicon.ico") return response.writeHead(204).end();
    if (url.pathname === "/api") {
      const body = "fixtureCb(" + JSON.stringify({ success: true, data: { official: [], solo: [] } }) + ");";
      return response.writeHead(200, { "content-type": "text/javascript" }).end(body);
    }
    const row = cases.get(url.pathname);
    if (!row) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(row.html);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  for (const kind of ["release", "song"]) { const row = fixture(kind); cases.set(`/${kind}/${row.id}.html`, row); }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  store.write("environment.json", { sourceRun: process.env.DETAIL_QA_SOURCE_RUN, mode: "localhost", documentType: "fixture", canonicalOrigin: FIXTURE_CANONICAL_ORIGIN, network: "loopback-only synthetic fixture", browser: browser.version(), channel: "chrome", node: process.version });
});

test.after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (store) store.write("result.json", { sourceRun: process.env.DETAIL_QA_SOURCE_RUN, status: outcomes.length === 4 && outcomes.every(row => row.status === "PASS") ? "PASS" : "STOP", cases: outcomes });
});

for (const kind of ["release", "song"]) for (const width of [1280, 390]) test(`localhost ${kind} ${width}: document, scroll and Disc restoration`, async () => {
  const row = [...cases.values()].find(r => r.kind === kind), caseId = `${kind}-${width}`;
  const outcome = { caseId, status: "RUNNING" }; outcomes.push(outcome);
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, reducedMotion: "reduce" });
  await context.tracing.start({ screenshots: true, snapshots: true });
  // A fixture run may never escape loopback or silently contact Public APIs.
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  const page = await context.newPage(), diagnostics = attachDiagnostics(page);
  try {
    const response = await page.goto(`${origin}/${kind}/${row.id}.html`, { waitUntil: "load", timeout: 30000 });
    a.equal(response.status(), 200); a.equal(response.request().redirectedFrom(), null);
    const received = Buffer.from(await response.body()); a.equal(sha256(received), sha256(row.html));
    const state = await captureDiscState(page, "main details"); a.deepEqual(state.rows.map(d => d.open), [true, true]);
    await page.locator("#disc2 > summary").click(); a.equal(await page.locator("#disc2").evaluate(n => n.open), false);
    await restoreDiscState(page, state);
    outcome.scroll = await assertScrollNavigation(page, { kind, width });
    const observed = page.waitForResponse(r => new URL(r.url()).pathname === "/api");
    await page.evaluate(() => fetch("/api?action=singerList&callback=fixtureCb").then(r => r.text()));
    const evidence = await captureSingerResponse(await observed, { mode: "localhost", caseId, mocked: true });
    const runtime = await page.content();
    outcome.document = assertRuntimeDocument({ rawHtml: received, rawHash: sha256(row.html), html: runtime, kind, id: row.id, data: row.data, origin, mode: "localhost", documentType: "fixture", canonicalOrigin: FIXTURE_CANONICAL_ORIGIN, caseId, apiEvidence: evidence, ...fixtureValidators(row.data) });
    a.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    diagnostics.assertClean();
    store.write(caseId + "-original.html", received); store.write(caseId + "-runtime.html", runtime); store.write(caseId + "-api.json", evidence); store.write(caseId + "-diagnostics.json", diagnostics.record);
    outcome.status = "PASS";
  } catch (error) {
    outcome.status = "FAIL"; outcome.failureClass = classifyFailure(error); outcome.error = error.stack;
    try { store.write(caseId + "-FAIL.html", await page.content()); } catch (e) { outcome.evidenceError = e.message; }
    throw error;
  } finally {
    diagnostics.detach();
    await context.tracing.stop({ path: path.join(store.directory, caseId + "-trace.zip") });
    await context.close(); store.event(outcome);
  }
});
