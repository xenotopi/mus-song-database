"use strict";

const a = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseUniqueJson, descendants, textContent } = require("./static-html-readonly-lib.cjs");
const { sha256, assertModeOrigin, assertRuntimeDocument } = require("../tests/helpers/detail-document-contract.cjs");
const { validatePlan, preflight, createRunStore, classifyFailure } = require("../tests/helpers/qa-run-context.cjs");

function fixtureValidators(data) {
  a.ok(data.expected && Object.keys(data.expected.fields || {}).length, "Independent synthetic field expectations required");
  const check = doc => {
    for (const [id, expected] of Object.entries(data.expected.fields)) {
      a.ok(doc.ids.has(id), "Fixture field missing: " + id);
      a.equal(textContent(doc.ids.get(id)).trim(), expected, "Fixture product/source field: " + id);
    }
    a.deepEqual(descendants(doc.ids.get("mainContent"), n => Object.hasOwn(n.attrs, "data-relation-id")).map(n => [n.attrs["data-relation-id"], n.attrs.href]), data.expected.relations);
  };
  return { validateStaticBody: check, validateRuntimeBody: check };
}

// Read the canonical authority at the explicitly approved SHA, never from received HTML.
function readCanonicalBaseline(plan, row) {
  a.match(plan.expectedHead, /^[a-f0-9]{40}$/);
  a.ok(["release", "song"].includes(row.kind));
  a.match(row.id, row.kind === "release" ? /^R\d{4}$/ : /^S\d{3}$/);
  const file = `${row.kind}/manifest.json`;
  const bytes = execFileSync("git", ["--no-optional-locks", "show", `${plan.expectedHead}:${file}`], { cwd: plan.targetRoot, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  const manifest = parseUniqueJson(bytes.toString("utf8")), entry = manifest.pages?.[row.id];
  a.equal(manifest.outputRevision, plan.outputRevision, "Canonical baseline output Revision mismatch");
  a.equal(manifest.dataRevision, plan.dataRevision, "Canonical baseline data Revision mismatch");
  a.equal(entry?.path, `${row.kind}/${row.id}.html`, "Canonical baseline page mismatch");
  const canonical = new URL(entry.canonical);
  assertModeOrigin("prod", canonical.origin);
  a.equal(entry.canonical, new URL(`/${row.kind}/${row.id}.html`, canonical.origin).href, "Canonical baseline URL mismatch");
  return { canonicalOrigin: canonical.origin, canonicalBaseline: { head: plan.expectedHead, path: file, sha256: sha256(bytes), canonical: entry.canonical } };
}

function releaseValidators(root, data) {
  const json = file => parseUniqueJson(fs.readFileSync(path.join(root, file), "utf8"));
  const pointer = json("data/current.json"), base = `data/snapshots/${pointer.outputRevision}/`;
  const list = json(base + "release-list.json").data;
  const releases = Object.fromEntries(list.map(row => [row.releaseId, json(base + "releases/" + row.releaseId + ".json").data]));
  const { validateReleaseBody } = require("./validate-static-html.cjs");
  const { validateAlbumData, validateAlbumBody } = require("./validate-release-album-products.cjs");
  const { validateSingleData, validateSingleBody } = require("./validate-release-single-products.cjs");
  const { validateReleaseContentsData, validateReleaseContentsBody } = require("./validate-release-contents.cjs");
  const { validateBluRayBody } = require("./validate-release-bluray.cjs");
  const { validateVocalBody } = require("./validate-release-vocals.cjs");
  const { validateNavigationBody } = require("./validate-release-navigation.cjs");
  const { validateSidecarBody } = require("./validate-release-sidecar.cjs");
  const album = validateAlbumData(json("data/release-album-products.json"), releases).get(data.releaseId);
  const single = validateSingleData(json("data/release-single-products.json"), releases).get(data.releaseId);
  const contents = validateReleaseContentsData(json("data/release-contents.json"), releases).get(data.releaseId);
  const bd = json("data/release-bluray-products.json").releases.find(r => r.releaseId === data.releaseId);
  const vocals = json("data/release-vocals.json"), nav = json("data/release-navigation.json");
  const sidecarPath = `data/release-sidecars/${data.releaseId}.json`;
  const sidecar = fs.existsSync(path.join(root, sidecarPath)) ? json(sidecarPath) : null;
  const product = doc => {
    validateAlbumBody(doc, data, album); validateSingleBody(doc, data, single); validateBluRayBody(doc, data, bd);
    validateReleaseContentsBody(doc, data, contents); validateVocalBody(doc, data, vocals); validateNavigationBody(doc, data, list, nav);
    if (sidecar) validateSidecarBody(doc, data, sidecar);
  };
  return { validateStaticBody(doc) { validateReleaseBody(doc, data, list, contents, nav, single, album); product(doc); }, validateRuntimeBody: product };
}

// Captured-document replay only. No implicit HTTP collection, old evidence discovery or browser launch.
async function runPlan(plan, { evidenceDir, sourceRun }) {
  validatePlan(plan);
  const store = createRunStore({ evidenceDir, sourceRun, protectedRoots: [plan.targetRoot, ...plan.inputs.map(row => path.dirname(row.path))] });
  const result = { sourceRun, phase: "document-contract", mode: plan.mode, documentType: plan.documentType, status: "RUNNING", browser: "NOT_RUN", cases: [], evidence: [] };
  try {
    store.write("plan.json", plan);
    const { observed, inputs } = preflight(plan);
    store.write("preflight.json", observed);
    if (plan.documentType === "formal") {
      // Use this checkout's complete saved-artifact validator, including Song's non-exported body checks.
      const formal = require("./validate-static-html.cjs").validateStaticHtml({ revision: plan.outputRevision });
      a.equal(formal.status, "PASS"); a.equal(formal.integrity, "PASS"); a.equal(formal.provenance, "VERIFIED"); a.deepEqual(formal.issues, []);
      store.write("formal-validator.json", formal);
    }
    for (const row of plan.cases) {
      const raw = inputs.get(row.rawInput), runtime = inputs.get(row.runtimeInput).toString("utf8");
      const source = parseUniqueJson(inputs.get(row.dataInput).toString("utf8")), data = source.data || source;
      const canonical = plan.documentType === "fixture" ? { canonicalOrigin: plan.canonicalOrigin } : readCanonicalBaseline(plan, row);
      if (plan.documentType === "formal") {
        a.deepEqual(raw, fs.readFileSync(path.join(plan.targetRoot, row.kind, row.id + ".html")), "Captured original differs from validated checkout");
        a.deepEqual(inputs.get(row.dataInput), fs.readFileSync(path.join(plan.targetRoot, "data/snapshots", plan.outputRevision, row.kind + "s", row.id + ".json")), "Snapshot input differs from validated checkout");
      }
      const validators = plan.documentType === "fixture" ? fixtureValidators(data) : row.kind === "release" ? releaseValidators(plan.targetRoot, data) : {
        // Source Song body was checked by the full formal validator above. Runtime protects its exact saved mainContent.
        validateStaticBody() {}, validateRuntimeBody() {}
      };
      const outcome = assertRuntimeDocument({ rawHtml: raw, rawHash: plan.inputs.find(input => input.key === row.rawInput).sha256,
        html: runtime, kind: row.kind, id: row.id, data, origin: plan.origin, mode: plan.mode, documentType: plan.documentType, canonicalOrigin: canonical.canonicalOrigin, caseId: row.caseId,
        apiEvidence: row.apiInput ? parseUniqueJson(inputs.get(row.apiInput).toString("utf8")) : null, ...validators });
      for (const [suffix, bytes] of [["original.html", raw], ["runtime.html", runtime]]) result.evidence.push(store.write(row.caseId + "-" + suffix, bytes));
      if (canonical.canonicalBaseline) result.evidence.push(store.write(row.caseId + "-canonical-baseline.json", canonical.canonicalBaseline));
      result.cases.push({ caseId: row.caseId, status: "PASS", ...outcome });
      store.event({ caseId: row.caseId, status: "PASS" });
    }
    // Also detect changed inputs or checkout during a run. Approved dirty files are not normalized away.
    preflight(plan);
    result.status = "CONTRACT_PASS";
    result.note = "Captured-document checks only. Browser NOT_RUN; this is not an overall QA or current PROD delivery PASS.";
  } catch (error) {
    result.status = "STOP"; result.failureClass = classifyFailure(error); result.error = error.stack;
  }
  store.write("result.json", result);
  return result;
}

async function main(argv) {
  a.equal(argv.length, 6, "Required: --plan <absolute.json> --source-run <unique> --evidence-dir <existing parent>");
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) { a.ok(["--plan", "--source-run", "--evidence-dir"].includes(argv[index])); a.ok(!flags.has(argv[index])); flags.set(argv[index], argv[index + 1]); }
  a.equal(flags.size, 3); a.ok(path.isAbsolute(flags.get("--plan")));
  const result = await runPlan(parseUniqueJson(fs.readFileSync(flags.get("--plan"), "utf8")), { evidenceDir: flags.get("--evidence-dir"), sourceRun: flags.get("--source-run") });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.status === "CONTRACT_PASS" ? 0 : 1;
}

module.exports = { runPlan, main, fixtureValidators, readCanonicalBaseline };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
