"use strict";

const a = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { parseUniqueJson } = require("../../tools/static-html-readonly-lib.cjs");
const { sha256, assertModeOrigin } = require("./detail-document-contract.cjs");

function validatePlan(plan) {
  a.equal(plan.schemaVersion, 1);
  a.ok(path.isAbsolute(plan.targetRoot), "Absolute target root required");
  a.match(plan.expectedHead, /^[a-f0-9]{40}$/);
  a.ok(typeof plan.expectedBranch === "string" && plan.expectedBranch.length, "Explicit branch required");
  for (const revision of [plan.outputRevision, plan.dataRevision]) a.match(revision, /^sha256-[a-f0-9]{64}$/);
  a.ok(["fixture", "localhost", "prod"].includes(plan.mode));
  assertModeOrigin(plan.mode, plan.origin);
  a.ok(["fixture", "formal"].includes(plan.documentType), "Explicit fixture/formal documentType required");
  if (plan.documentType === "fixture") {
    a.equal(typeof plan.canonicalOrigin, "string", "Explicit synthetic canonicalOrigin required");
    assertModeOrigin("fixture", plan.canonicalOrigin);
  } else a.ok(!Object.hasOwn(plan, "canonicalOrigin"), "Formal canonical must come from the approved manifest");
  a.equal(plan.operation, "replay", "This entry only validates explicit captured documents; it never contacts PROD");
  a.equal(plan.mocked, plan.mode === "prod" ? false : true, "Explicit fixture/PROD separation");
  a.ok(Array.isArray(plan.allowedChanges), "Approved dirty inventory required");
  const names = new Set();
  for (const row of plan.allowedChanges) {
    a.ok(row.path && !row.path.includes("\\") && !row.path.split("/").some(x => x === "..") && !path.isAbsolute(row.path));
    a.ok(!names.has(row.path)); names.add(row.path);
    a.ok([" M", "??"].includes(row.status), "Staged, renamed and deleted inputs are not supported");
    a.match(row.sha256, /^[a-f0-9]{64}$/);
  }
  a.ok(Array.isArray(plan.inputs) && plan.inputs.length, "Explicit hashed inputs required");
  const inputs = new Map();
  for (const input of plan.inputs) {
    a.match(input.key, /^[A-Za-z0-9_-]+$/); a.ok(!inputs.has(input.key));
    a.ok(path.isAbsolute(input.path)); a.match(input.sha256, /^[a-f0-9]{64}$/); inputs.set(input.key, input);
  }
  a.ok(Array.isArray(plan.cases) && plan.cases.length, "Explicit case selection required");
  const cases = new Set();
  for (const row of plan.cases) {
    a.match(row.caseId, /^[A-Za-z0-9_-]+$/); a.ok(!cases.has(row.caseId)); cases.add(row.caseId);
    a.ok(["song", "release"].includes(row.kind)); a.match(row.id, row.kind === "song" ? /^S\d{3}$/ : /^R\d{4}$/);
    for (const key of [row.rawInput, row.runtimeInput, row.dataInput]) a.ok(inputs.has(key), "Unregistered case input");
    if (row.apiInput) a.ok(inputs.has(row.apiInput));
    a.equal(row.http.mode, plan.mode); a.equal(row.http.status, 200); a.equal(row.http.redirected, false);
    a.equal(row.http.url, new URL(`/${row.kind}/${row.id}.html`, plan.origin).href);
  }
  return plan;
}

function validateObserved(plan, observed) {
  validatePlan(plan);
  a.equal(observed.head, plan.expectedHead, "HEAD mismatch");
  a.equal(observed.branch, plan.expectedBranch, "Branch mismatch");
  a.equal(observed.originMain, plan.expectedHead, "Local origin/main mismatch");
  a.equal(observed.staged, "", "Staged changes prohibited");
  a.deepEqual(observed.changes, plan.allowedChanges, "Unapproved local changes");
  a.equal(observed.current.outputRevision, plan.outputRevision, "Output Revision mismatch");
  a.equal(observed.current.revision, plan.outputRevision, "Legacy Revision alias mismatch");
  a.equal(observed.current.dataRevision, plan.dataRevision, "Data Revision mismatch");
}

function readInputs(plan) {
  const result = new Map();
  for (const input of plan.inputs) {
    const bytes = fs.readFileSync(input.path);
    a.equal(sha256(bytes), input.sha256, "Input hash mismatch: " + input.key);
    result.set(input.key, bytes);
  }
  return result;
}

function preflight(plan) {
  validatePlan(plan);
  const root = fs.realpathSync(plan.targetRoot);
  // The validator/parser and product sources must belong to the same checkout.
  a.equal(root, fs.realpathSync(path.resolve(__dirname, "../..")), "Cross-checkout validator reuse prohibited");
  const git = (...args) => cp.execFileSync("git", ["--no-optional-locks", ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
  const status = git("status", "--porcelain=v1", "-z", "--untracked-files=all");
  const changes = status.split("\0").filter(Boolean).map(row => {
    const file = row.slice(3); a.ok([" M", "??"].includes(row.slice(0, 2)), "Unsupported Git state");
    const absolute = path.resolve(root, file), relative = path.relative(root, fs.realpathSync(absolute));
    a.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Dirty path escapes checkout");
    return { path: file.replaceAll("\\", "/"), status: row.slice(0, 2), sha256: sha256(fs.readFileSync(absolute)) };
  });
  const observed = { head: git("rev-parse", "HEAD").trim(), branch: git("branch", "--show-current").trim(), originMain: git("rev-parse", "refs/remotes/origin/main").trim(), staged: git("diff", "--cached", "--name-only").trim(), changes,
    current: parseUniqueJson(fs.readFileSync(path.join(root, "data/current.json"), "utf8")) };
  validateObserved(plan, observed);
  return { observed, inputs: readInputs(plan) };
}

function inside(parent, file) {
  const relative = path.relative(parent, file); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function createRunStore({ evidenceDir, sourceRun, protectedRoots }) {
  a.ok(path.isAbsolute(evidenceDir)); a.match(sourceRun, /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/);
  a.ok(Array.isArray(protectedRoots) && protectedRoots.length, "Explicit protected roots required");
  const parent = fs.realpathSync(evidenceDir), directory = path.join(parent, sourceRun);
  for (const root of protectedRoots) a.ok(!inside(fs.realpathSync(root), directory), "Evidence destination is inside a protected root");
  fs.mkdirSync(directory); // Exclusive run identity; EEXIST must never be retried under the same name.
  let sequence = 0;
  function write(name, value) {
    a.match(name, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/); a.ok(name !== "." && name !== "..");
    const bytes = Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n";
    fs.writeFileSync(path.join(directory, name), bytes, { flag: "wx" });
    return { file: name, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) };
  }
  return { directory, write, event(value) { return write(`event-${String(++sequence).padStart(5, "0")}.json`, { ...value, sourceRun, at: new Date().toISOString() }); } };
}

function classifyFailure(error) {
  return ({ QA_PRODUCT: "PRODUCT", QA_HARNESS: "HARNESS", QA_COMMUNICATION: "COMMUNICATION", EACCES: "ENVIRONMENT", EPERM: "ENVIRONMENT", ENOENT: "ENVIRONMENT", QA_ENVIRONMENT: "ENVIRONMENT" })[error.code] || "UNCLASSIFIED";
}

module.exports = { validatePlan, validateObserved, readInputs, preflight, createRunStore, classifyFailure };
