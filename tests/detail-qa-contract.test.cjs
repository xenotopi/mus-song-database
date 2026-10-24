"use strict";

const test = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync, execFileSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { sha256, assertStaticDocument, assertRuntimeDocument, assertSingerEvidence } = require("./helpers/detail-document-contract.cjs");
const { captureDiscState, restoreDiscState, component, attachDiagnostics } = require("./helpers/detail-browser-contract.cjs");
const { validatePlan, validateObserved, readInputs, createRunStore, classifyFailure } = require("./helpers/qa-run-context.cjs");
const { fixtureValidators, readCanonicalBaseline, runPlan } = require("../tools/run-detail-qa.cjs");
const ORIGIN = "https://fixture.invalid";

function sample(kind = "release") {
  const id = kind === "release" ? "R0001" : "S001", title = kind === "release" ? "Fixture Release" : "Fixture Song";
  const data = kind === "release" ? { releaseId: id, releaseName: title, featuredSinger: { id: "SN0001", name: "Character" } } : { songId: id, songName: title };
  data.expected = { fields: { productFacts: "CD 1000円" }, relations: [["RT0001", "song/S001.html"]] };
  const info = kind === "release" ? '<dl id="releaseInfo"><div data-release-featured=""><dt>名義</dt><dd>Character</dd></div></dl>' : '<div id="songInfo">Fixture source</div>';
  const raw = `<!DOCTYPE html><html data-${kind}-id="${id}"><head><link rel="canonical" href="${ORIGIN}/${kind}/${id}.html"><meta name="robots" content="index,follow,max-image-preview:large"></head><body><h1 id="${kind}Name">${title}</h1><div id="heroMeta">2020/01/01</div><nav id="${kind === "release" ? "releaseSectionNav" : "otherNav"}">Sections</nav><main id="mainContent">${info}<p id="productFacts">CD 1000円</p><details id="disc1" open=""><summary>Disc 1</summary><a data-relation-id="RT0001" href="song/S001.html">Song</a></details><details id="disc2" open=""><summary>Disc 2</summary>Track 2</details></main></body></html>`;
  const bar = kind === "release" ? '<div class="detail-context-bar" data-release-context="" aria-hidden="true"><span class="detail-context-type">作品</span><span class="detail-context-title">Fixture Release</span><button class="detail-context-top-button" aria-label="ページ上部へ戻る">TOP</button></div>' : '<div id="songDetailContextV46" class="v46-detail-context" aria-hidden="true"><span class="v46-detail-context-type">曲</span><span class="v46-detail-context-title">Fixture Song</span><button class="v46-detail-context-top" aria-label="ページ上部へ戻る">TOP</button></div>';
  const html = raw.replace("</body>", bar + "</body>");
  return { rawHtml: raw, rawHash: sha256(raw), html, bar, kind, id, data, origin: ORIGIN, mode: "fixture", documentType: "fixture", canonicalOrigin: ORIGIN, caseId: kind + "-1280", ...fixtureValidators(data) };
}

function singerEvidence(caseId = "release-1280") {
  const member = { key: "fixture-key", character: "Character", cast: "Fixture Cast" };
  const master = { official: [{ singerId: "SN0001", category: "公式", displayName: "Character", memberCount: 1, members: [member] }], solo: [{ singerId: "SN0002", category: "ソロ", displayName: "Fixture Cast", memberCount: 1, members: [{ ...member }] }] };
  const body = "cb1(" + JSON.stringify({ success: true, data: master }) + ");";
  const url = ORIGIN + "/api?action=singerList&callback=cb1";
  return { body, sha256: sha256(body), requestUrl: url, url, status: 200, mode: "fixture", caseId, mocked: true, redirectChain: [] };
}

function enriched() {
  const s = sample(); s.apiEvidence = singerEvidence();
  s.html = s.html.replace("<dd>Character</dd>", '<dd><a href="singer.html?id=SN0001" aria-label="Characterの歌唱記録">Character</a></dd>')
    .replace("</dl>", '<div data-release-cv="" data-release-info-field="cv" class="release-info-row"><dt>CV</dt><dd><a href="singer.html?id=SN0002" aria-label="Fixture Castの歌唱記録">Fixture Cast</a></dd></div></dl>');
  return s;
}

test("strict original and runtime contracts accept separate Release/Song components", () => {
  for (const kind of ["release", "song"]) {
    const s = sample(kind);
    assertStaticDocument({ ...s, html: s.rawHtml, expectedHash: s.rawHash, validateBody: s.validateStaticBody });
    a.equal(assertRuntimeDocument(s).protectedMainDOM, "MATCH");
    a.throws(() => assertStaticDocument({ ...s, html: s.html, expectedHash: sha256(s.html), validateBody: s.validateStaticBody }), /Runtime element/);
  }
});

// Actual saved HTML, read only. Canonical/hash expectations come from the Git baseline,
// not from the HTML being checked or its localhost access location.
function formalSample(kind) {
  const targetRoot = path.resolve(__dirname, ".."), id = kind === "release" ? "R0001" : "S001";
  const git = (...args) => execFileSync("git", ["--no-optional-locks", ...args], { cwd: targetRoot, timeout: 30000 });
  const expectedHead = git("rev-parse", "HEAD").toString("utf8").trim();
  const current = JSON.parse(fs.readFileSync(path.join(targetRoot, "data/current.json"), "utf8"));
  const plan = { targetRoot, expectedHead, outputRevision: current.outputRevision, dataRevision: current.dataRevision };
  const manifest = JSON.parse(git("show", `${expectedHead}:${kind}/manifest.json`).toString("utf8"));
  const baseline = readCanonicalBaseline(plan, { kind, id });
  a.equal(baseline.canonicalOrigin, "https://mus-song-db.com");
  a.equal(baseline.canonicalBaseline.canonical, manifest.pages[id].canonical);
  const html = fs.readFileSync(path.join(targetRoot, kind, id + ".html"));
  a.equal(html.length, manifest.pages[id].bytes);
  const data = JSON.parse(fs.readFileSync(path.join(targetRoot, "data/snapshots", current.outputRevision, kind + "s", id + ".json"), "utf8")).data;
  const validateBody = kind === "release" ? doc => {
    const { validateReleaseBody } = require("../tools/validate-static-html.cjs");
    const list = JSON.parse(fs.readFileSync(path.join(targetRoot, "data/snapshots", current.outputRevision, "release-list.json"), "utf8")).data;
    validateReleaseBody(doc, data, list);
  } : doc => a.ok(doc.ids.has("songInfo")); // Canonical gate only; Song's full body validator is not exported.
  return { html, expectedHash: manifest.pages[id].sha256, kind, id, data, origin: "http://127.0.0.1:8123", mode: "localhost", documentType: "formal", canonicalOrigin: baseline.canonicalOrigin, validateBody, plan };
}

for (const kind of ["release", "song"]) {
  test(`formal ${kind} retains approved canonical with a localhost access origin`, () => {
    const s = formalSample(kind);
    assertStaticDocument(s);
    a.notEqual(s.origin, s.canonicalOrigin);
    a.equal(sha256(s.html), s.expectedHash);
  });
  test(`formal ${kind} rejects canonical origin and path changes even with a matching input hash`, () => {
    const s = formalSample(kind), canonical = `${s.canonicalOrigin}/${kind}/${s.id}.html`;
    const source = s.html.toString("utf8");
    const links = [...source.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/g)];
    a.equal(links.length, 1, "Exactly one canonical link mutation target required");
    const link = links[0], href = /\bhref="([^"]*)"/.exec(link[0]);
    a.ok(href, "Canonical href mutation target required");
    a.equal(href[1], canonical, "Mutation must target the approved canonical href");
    const start = link.index + href.index + href[0].indexOf('"') + 1, end = start + href[1].length;
    for (const replacement of [`${s.origin}/${kind}/${s.id}.html`, `${s.canonicalOrigin}/${kind}/wrong.html`]) {
      const html = source.slice(0, start) + replacement + source.slice(end);
      a.notEqual(html, source);
      a.equal(html.slice(start, start + replacement.length), replacement, "Canonical href was changed");
      a.equal(html.slice(0, start), source.slice(0, start), "HTML before canonical href is unchanged");
      a.equal(html.slice(start + replacement.length), source.slice(end), "HTML after canonical href is unchanged");
      a.deepEqual(html.match(/<meta\b[^>]*\bproperty="og:url"[^>]*>/g), source.match(/<meta\b[^>]*\bproperty="og:url"[^>]*>/g), "og:url is unchanged");
      a.throws(() => assertStaticDocument({ ...s, html, expectedHash: sha256(html) }), error =>
        error.code === "ERR_ASSERTION" && error.message.includes("Canonical URL mismatch") && error.actual === replacement && error.expected === canonical);
    }
  });
  test(`formal ${kind} rejects changed original bytes and expected hash`, () => {
    const s = formalSample(kind), bytes = Buffer.from(s.html); bytes[bytes.length - 1] ^= 1;
    a.equal(bytes.length, s.html.length);
    a.throws(() => assertStaticDocument({ ...s, html: bytes }), /HTTP original hash mismatch/);
    a.throws(() => assertStaticDocument({ ...s, expectedHash: "0".repeat(64) }), /HTTP original hash mismatch/);
  });
}

test("runtime canonical origin and path are checked separately from access origin", () => {
  const s = sample();
  for (const replacement of ["https://wrong.invalid/release/R0001.html", ORIGIN + "/song/S001.html"]) {
    const html = s.html.replace(ORIGIN + "/release/R0001.html", replacement);
    a.throws(() => assertRuntimeDocument({ ...s, html }), /Canonical URL mismatch/);
  }
});

test("canonical origin is mandatory and never inferred from the access origin", () => {
  const s = sample(); delete s.canonicalOrigin;
  a.throws(() => assertRuntimeDocument(s), /Explicit canonical origin/);
});

test("formal and synthetic fixture canonical contracts cannot be interchanged", () => {
  const formal = formalSample("release"), fixture = sample();
  a.throws(() => assertStaticDocument({ ...formal, documentType: "fixture", mode: "fixture", origin: ORIGIN, canonicalOrigin: ORIGIN }), /Synthetic fixture\/formal/);
  a.throws(() => assertRuntimeDocument({ ...fixture, documentType: "formal", mode: "localhost", origin: "http://127.0.0.1:8123", canonicalOrigin: formal.canonicalOrigin }), /Synthetic fixture\/formal/);
  a.throws(() => assertRuntimeDocument({ ...fixture, canonicalOrigin: formal.canonicalOrigin }), /Fixture origin/);
  a.throws(() => assertStaticDocument({ ...formal, canonicalOrigin: formal.origin }), /PROD requires HTTPS/);
});

test("canonical baseline rejects mismatched revisions and unregistered pages", () => {
  const s = formalSample("release"), row = { kind: "release", id: s.id };
  for (const key of ["outputRevision", "dataRevision"]) a.throws(() => readCanonicalBaseline({ ...s.plan, [key]: "sha256-" + "0".repeat(64) }, row), /Canonical baseline .* Revision mismatch/);
  a.throws(() => readCanonicalBaseline(s.plan, { ...row, id: "R9999" }), /Canonical baseline page mismatch/);
});

test("independently matched API permits exactly the verified featured and CV links", () => {
  a.deepEqual(assertRuntimeDocument(enriched()), { kind: "release", id: "R0001", contextBars: 1, protectedMainDOM: "MATCH", apiVerified: true, cv: "Fixture Cast" });
});

const negatives = {
  wrongTitle: s => { s.html = s.html.replace('id="releaseName">', 'id="releaseName">Wrong '); },
  wrongSongLink: s => { s.html = s.html.replace('href="song/S001.html"', 'href="song/S999.html"'); },
  lostProductFact: s => { s.html = s.html.replace("CD 1000円", "CD 9999円"); },
  extraCV: s => { s.html = s.html.replace("</dl>", '<div data-release-cv=""><dt>CV</dt><dd>Unverified</dd></div></dl>'); },
  missingBar: s => { s.html = s.html.replace(s.bar, ""); },
  duplicateBar: s => { s.html = s.html.replace(s.bar, s.bar + s.bar); },
  songReleaseConfusion: s => { s.html = s.html.replace(s.bar, sample("song").bar); },
  discStateChanged: s => { s.html = s.html.replace('id="disc2" open=""', 'id="disc2"'); },
  protectedHeroChanged: s => { s.html = s.html.replace("2020/01/01", "2099/01/01"); },
  originalHashMismatch: s => { s.rawHash = "0".repeat(64); },
  snapshotIdentityMismatch: s => { s.data.releaseId = "R9999"; }
};
for (const [name, mutate] of Object.entries(negatives)) test("rejects " + name, () => {
  const s = sample(), before = JSON.stringify(s); mutate(s); a.notEqual(JSON.stringify(s), before, "Negative mutation must actually apply");
  a.throws(() => assertRuntimeDocument(s));
});

for (const [name, mutate] of Object.entries({
  wrongCase: e => { e.caseId = "another-case"; },
  wrongMode: e => { e.mode = "prod"; },
  wrongHash: e => { e.sha256 = "0".repeat(64); },
  wrongCallback: e => { e.requestUrl = e.requestUrl.replace("cb1", "cb2"); },
  wrongAction: e => { e.requestUrl = e.requestUrl.replace("singerList", "releaseList"); },
  http503: e => { e.status = 503; }
})) test("rejects API evidence " + name, () => {
  const s = enriched(); mutate(s.apiEvidence); a.throws(() => assertRuntimeDocument(s));
});

for (const field of ["singerId", "category", "displayName", "memberKey", "cast"]) test("rejects enriched DOM inconsistent with API " + field, () => {
  const s = enriched(), payload = JSON.parse(s.apiEvidence.body.slice(4, -2));
  const person = payload.data.official[0];
  if (field === "memberKey") person.members[0].key = "different";
  else if (field === "cast") person.members[0].cast = "Different Cast";
  else person[field] = "different";
  s.apiEvidence.body = "cb1(" + JSON.stringify(payload) + ");"; s.apiEvidence.sha256 = sha256(s.apiEvidence.body);
  a.throws(() => assertRuntimeDocument(s));
});

test("PROD rejects mock API sources even when their body hash matches", () => {
  const e = singerEvidence(); e.mode = "prod";
  a.throws(() => assertSingerEvidence(e, { mode: "prod", caseId: e.caseId }), /mock/);
});

function fakePage(nodes, clickWorks = true) {
  return { locator() { return {
    evaluateAll: async fn => fn(nodes),
    all: async () => nodes.map(node => ({ evaluate: async fn => fn(node), locator: () => ({ click: async () => { if (clickWorks) node.open = !node.open; } }) }))
  }; } };
}
test("Disc restore preserves both actual initially open Discs", async () => {
  const nodes = [{ id: "disc1", open: true }, { id: "disc2", open: true }], page = fakePage(nodes);
  const state = await captureDiscState(page, "details"); nodes[1].open = false;
  await restoreDiscState(page, state); a.equal(nodes[1].open, true);
});
test("Disc restore failure is HARNESS and cannot become PASS", async () => {
  const nodes = [{ id: "disc1", open: true }], page = fakePage(nodes, false), state = await captureDiscState(page, "details"); nodes[0].open = false;
  await a.rejects(restoreDiscState(page, state), error => classifyFailure(error) === "HARNESS");
});
test("Disc identity changes and duplicate identities are rejected", async () => {
  const nodes = [{ id: "disc1", open: true }], page = fakePage(nodes), state = await captureDiscState(page, "details");
  nodes.push({ id: "disc2", open: false }); await a.rejects(restoreDiscState(page, state));
  await a.rejects(captureDiscState(fakePage([{ id: "x", open: true }, { id: "x", open: false }]), "details"));
});

function plan(root) {
  return { schemaVersion: 1, targetRoot: root, expectedHead: "a".repeat(40), expectedBranch: "main", outputRevision: "sha256-" + "b".repeat(64), dataRevision: "sha256-" + "c".repeat(64),
    mode: "fixture", origin: ORIGIN, documentType: "fixture", canonicalOrigin: ORIGIN, mocked: true, operation: "replay", allowedChanges: [],
    inputs: ["raw", "runtime", "data"].map(key => ({ key, path: path.join(root, key), sha256: "d".repeat(64) })),
    cases: [{ caseId: "release-1280", kind: "release", id: "R0001", rawInput: "raw", runtimeInput: "runtime", dataInput: "data", http: { mode: "fixture", status: 200, redirected: false, url: ORIGIN + "/release/R0001.html" } }] };
}
function observed(p) { return { head: p.expectedHead, branch: p.expectedBranch, originMain: p.expectedHead, staged: "", changes: [], current: { outputRevision: p.outputRevision, revision: p.outputRevision, dataRevision: p.dataRevision } }; }

test("explicit plan verifies observed SHA, branch, revisions and approved dirty hashes", () => {
  const p = plan(path.resolve(__dirname, "..")), o = observed(p);
  p.allowedChanges.push({ path: "AGENTS.md", status: "??", sha256: "e".repeat(64) }); o.changes = structuredClone(p.allowedChanges);
  validateObserved(p, o);
  o.changes[0].sha256 = "f".repeat(64); a.throws(() => validateObserved(p, o), /Unapproved/);
});
for (const field of ["head", "branch", "originMain", "staged", "revision", "dataRevision"]) test("precondition rejects " + field + " mismatch", () => {
  const p = plan(path.resolve(__dirname, "..")), o = observed(p);
  if (field === "revision" || field === "dataRevision") o.current[field] = "wrong"; else o[field] = "wrong";
  a.throws(() => validateObserved(p, o));
});
test("mode, URL, missing hashes, duplicate cases and PROD fixtures fail closed", () => {
  const p = plan(path.resolve(__dirname, "..")); validatePlan(p);
  const changes = [x => { x.mode = "localhost"; }, x => { delete x.inputs[0].sha256; }, x => { x.cases.push(structuredClone(x.cases[0])); }, x => { x.mode = "prod"; }, x => { x.cases[0].http.redirected = true; }];
  for (const mutate of changes) { const copy = structuredClone(p); mutate(copy); a.throws(() => validatePlan(copy)); }
  a.notEqual(component("release").bar, component("song").bar); a.throws(() => component("unknown"));
});

function temporary(t) {
  const parent = fs.realpathSync(os.tmpdir()), dir = fs.mkdtempSync(path.join(parent, "detail-qa-contract-"));
  t.after(() => { a.equal(path.dirname(fs.realpathSync(dir)), parent); fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
test("hashed inputs detect same-length mutation without changing source files", t => {
  const root = temporary(t), file = path.join(root, "source.txt"); fs.writeFileSync(file, "one");
  const p = { inputs: [{ key: "raw", path: file, sha256: sha256("one") }] };
  a.equal(readInputs(p).get("raw").toString(), "one"); fs.writeFileSync(file, "two");
  a.throws(() => readInputs(p), /Input hash mismatch/); a.equal(fs.readFileSync(file, "utf8"), "two");
});
test("run identity and evidence are exclusive; collision preserves originals", t => {
  const root = temporary(t), input = path.join(root, "input"); fs.mkdirSync(input);
  const options = { evidenceDir: root, sourceRun: "unique-run", protectedRoots: [input] };
  const store = createRunStore(options); store.write("original.html", "preserved");
  a.throws(() => store.write("original.html", "changed"), { code: "EEXIST" });
  a.equal(fs.readFileSync(path.join(store.directory, "original.html"), "utf8"), "preserved");
  a.throws(() => createRunStore(options), { code: "EEXIST" });
  a.throws(() => createRunStore({ ...options, evidenceDir: input, sourceRun: "unsafe" }), /protected root/);
  a.throws(() => store.write("../escape", "bad"));
  store.event({ status: "PASS" }); store.event({ status: "FAIL" });
  a.ok(fs.existsSync(path.join(store.directory, "event-00001.json")) && fs.existsSync(path.join(store.directory, "event-00002.json")));
});
test("failure classifications preserve uncertainty and strict navigation abort scope", () => {
  for (const [code, expected] of [["QA_PRODUCT", "PRODUCT"], ["QA_HARNESS", "HARNESS"], ["QA_COMMUNICATION", "COMMUNICATION"], ["EACCES", "ENVIRONMENT"], ["ERR_ASSERTION", "UNCLASSIFIED"]]) a.equal(classifyFailure({ code }), expected);
  const page = new EventEmitter(), diagnostics = attachDiagnostics(page), request = { url: () => "http://localhost/example", failure: () => ({ errorText: "net::ERR_ABORTED" }) };
  diagnostics.setPhase("navigation"); page.emit("requestfailed", request); diagnostics.assertClean();
  diagnostics.setPhase("main"); page.emit("requestfailed", request); a.throws(() => diagnostics.assertClean()); diagnostics.detach();
});

test("importing shared modules and CLI starts no network, writes, subprocess or browser", () => {
  const files = ["tests/helpers/detail-document-contract.cjs", "tests/helpers/detail-browser-contract.cjs", "tests/helpers/qa-run-context.cjs", "tools/run-detail-qa.cjs"].map(f => path.resolve(__dirname, "..", f));
  const script = `const fs=require('node:fs'),cp=require('node:child_process'),Module=require('node:module');
    for(const key of ['writeFileSync','mkdirSync','appendFileSync'])fs[key]=()=>{throw Error('Import writes: '+key)};
    cp.execFileSync=()=>{throw Error('Import starts subprocess')};globalThis.fetch=()=>{throw Error('Import fetches')};
    const load=Module._load;Module._load=function(name,...rest){if(/playwright|^node:(http|https|net)$/.test(name))throw Error('Import loads browser/network');return load.call(this,name,...rest)};
    for(const file of process.argv.slice(1))require(file);process.stdout.write('IMPORT_SAFE');`;
  const result = spawnSync(process.execPath, ["-e", script, ...files], { encoding: "utf8", timeout: 10000 });
  a.equal(result.status, 0, result.stderr); a.equal(result.stdout, "IMPORT_SAFE");
});

test("localhost transport accepts explicit synthetic Release and Song document contracts", () => {
  for (const kind of ["release", "song"]) {
    const s = { ...sample(kind), mode: "localhost", origin: "http://127.0.0.1:8123" };
    a.notEqual(s.origin, s.canonicalOrigin);
    a.equal(assertRuntimeDocument(s).protectedMainDOM, "MATCH");
  }
});

test("localhost synthetic API evidence is checked independently of fixture canonical identity", () => {
  const s = enriched(); s.mode = "localhost"; s.origin = "http://127.0.0.1:8123";
  const url = s.origin + "/api?action=singerList&callback=cb1";
  // Independently declared synthetic response, never rewritten real HTTP evidence.
  s.apiEvidence = { ...s.apiEvidence, mode: "localhost", requestUrl: url, url, redirectChain: [url] };
  a.equal(assertRuntimeDocument(s).cv, "Fixture Cast");
  s.apiEvidence.mode = "fixture";
  a.throws(() => assertRuntimeDocument(s), /API network contract mismatch/);
});

for (const [name, mutate, message] of [
  ["missing document type", s => { delete s.documentType; }, /Explicit fixture\/formal documentType/],
  ["unknown document type", s => { s.documentType = "auto"; }, /Explicit fixture\/formal documentType/],
  ["missing synthetic data", s => { s.data = { ...s.data }; delete s.data.expected; }, /Synthetic fixture\/formal/],
  ["public canonical on a synthetic document", s => { s.canonicalOrigin = "https://mus-song-db.com"; }, /Fixture origin/],
  ["loopback canonical on a synthetic document", s => { s.canonicalOrigin = "http://127.0.0.1:8123"; }, /Fixture origin/]
]) test("document contract rejects " + name + " on localhost", () => {
  const s = { ...sample(), mode: "localhost", origin: "http://127.0.0.1:8123" }; mutate(s);
  a.throws(() => assertRuntimeDocument(s), message);
});

test("formal document cannot select fixture canonical by changing only its transport mode", () => {
  const s = formalSample("release");
  a.throws(() => assertStaticDocument({ ...s, mode: "fixture", origin: ORIGIN, canonicalOrigin: ORIGIN }), /PROD cannot use a fixture/);
});

test("plan separates localhost transport from synthetic document identity", () => {
  const p = plan(path.resolve(__dirname, "..")); p.mode = "localhost"; p.origin = "http://127.0.0.1:8123";
  p.cases[0].http = { ...p.cases[0].http, mode: p.mode, url: p.origin + "/release/R0001.html" };
  a.equal(validatePlan(p).documentType, "fixture");
  a.equal(p.canonicalOrigin, ORIGIN);
});

test("plan rejects implicit document type and missing or public synthetic canonical", () => {
  const p = plan(path.resolve(__dirname, ".."));
  for (const mutate of [x => { delete x.documentType; }, x => { delete x.canonicalOrigin; }, x => { x.canonicalOrigin = "https://mus-song-db.com"; }]) {
    const copy = structuredClone(p); mutate(copy); a.throws(() => validatePlan(copy));
  }
});

test("formal plan cannot override the canonical authority from the approved manifest", () => {
  const p = plan(path.resolve(__dirname, "..")); p.documentType = "formal";
  a.throws(() => validatePlan(p), /Formal canonical must come from the approved manifest/);
  delete p.canonicalOrigin; validatePlan(p);
});

test("localhost synthetic replay runs without HTTP and retains a unique evidence result", async t => {
  const root = temporary(t), inputDir = path.join(root, "inputs"), evidenceDir = path.join(root, "evidence");
  fs.mkdirSync(inputDir); fs.mkdirSync(evidenceDir);
  const targetRoot = path.resolve(__dirname, ".."), git = (...args) => execFileSync("git", ["--no-optional-locks", ...args], { cwd: targetRoot, encoding: "utf8", timeout: 30000 });
  const current = JSON.parse(fs.readFileSync(path.join(targetRoot, "data/current.json"), "utf8")), s = sample();
  const p = plan(targetRoot); Object.assign(p, { expectedHead: git("rev-parse", "HEAD").trim(), expectedBranch: git("branch", "--show-current").trim(), outputRevision: current.outputRevision, dataRevision: current.dataRevision,
    mode: "localhost", origin: "http://127.0.0.1:8123" });
  p.allowedChanges = git("status", "--porcelain=v1", "-z", "--untracked-files=all").split("\0").filter(Boolean).map(row => ({ path: row.slice(3), status: row.slice(0, 2), sha256: sha256(fs.readFileSync(path.join(targetRoot, row.slice(3)))) }));
  p.inputs = Object.entries({ raw: s.rawHtml, runtime: s.html, data: JSON.stringify(s.data) }).map(([key, bytes]) => {
    const file = path.join(inputDir, key); fs.writeFileSync(file, bytes); return { key, path: file, sha256: sha256(bytes) };
  });
  p.cases[0].http = { ...p.cases[0].http, mode: p.mode, url: p.origin + "/release/R0001.html" };
  const result = await runPlan(p, { evidenceDir, sourceRun: "explicit-localhost-fixture-replay" });
  a.equal(result.status, "CONTRACT_PASS", result.error); a.equal(result.documentType, "fixture"); a.equal(result.mode, "localhost");
  a.equal(result.browser, "NOT_RUN"); a.equal(result.cases[0].protectedMainDOM, "MATCH");
  a.equal(fs.existsSync(path.join(evidenceDir, result.sourceRun, "formal-validator.json")), false);
  a.equal(JSON.parse(fs.readFileSync(path.join(evidenceDir, result.sourceRun, "result.json"), "utf8")).status, "CONTRACT_PASS");
});
