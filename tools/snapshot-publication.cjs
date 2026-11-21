"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const context = new AsyncLocalStorage();
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const check = (ok, message) => { if (!ok) throw new Error(message); };

// All official snapshot/capture entry points share this lease. Never steal a
// stale lease: an interrupted owner needs explicit investigation, not a retry.
async function withSnapshotOperation(root, task) {
  root = path.resolve(root);
  const existing = context.getStore();
  if (existing?.root === root) {
    existing.assertHeld();
    return task(existing);
  }
  const file = path.join(root, ".snapshot-operation.lock");
  const bytes = Buffer.from(JSON.stringify({ pid: process.pid, token: crypto.randomUUID() }));
  let fd;
  try { fd = fs.openSync(file, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error("Concurrent snapshot/capture operation; refusing entry"); throw error; }
  try {
    fs.writeSync(fd, bytes);
    const lease = { root, assertHeld() { check(fs.readFileSync(file).equals(bytes), "Snapshot operation lease changed"); } };
    return await context.run(lease, () => task(lease));
  } finally {
    fs.closeSync(fd);
    // An unexpected replacement is evidence; do not delete another owner's lock.
    if (fs.readFileSync(file).equals(bytes)) fs.unlinkSync(file);
    else throw new Error("Snapshot operation lease changed; lock preserved");
  }
}

function reusableSingerList(reference, outputRevision, dataRevision) {
  if (reference === undefined) return undefined;
  check(reference.outputRevision === outputRevision && reference.dataRevision === dataRevision &&
    reference.payload?.data?._cache?.revision === dataRevision, "Reused singerList revision mismatch");
  return structuredClone(reference.payload);
}

module.exports = { withSnapshotOperation, reusableSingerList };
