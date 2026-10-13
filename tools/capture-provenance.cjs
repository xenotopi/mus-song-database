"use strict";

// Producer-side capture session. The read-only validator collects and checks its
// inputs independently; this must never synthesize receipts for existing HTML.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { sha256, validateSnapshot, validateEventSnapshot, validateKamiparaDashboard } = require("./detail-snapshot-lib.cjs");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const check = (ok, message) => { if (!ok) throw new Error(message); };
const sameIds = (a, b) => a.length === b.length && new Set(a).size === a.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

function beginCapture({ root, type, revision, ids, rendererFiles, rendererFingerprint, io = fs }) {
  check(["song", "release"].includes(type) && /^sha256-[a-f0-9]{64}$/.test(revision), "Invalid capture target/revision");
  const count = type === "song" ? 117 : 114;
  const prefix = `data/snapshots/${revision}/`;
  const observed = new Map(), directories = new Map(), inputs = {};
  function read(relative) {
    const bytes = Buffer.from(io.readFileSync(path.join(root, relative)));
    check(Buffer.from(bytes.toString("utf8")).equals(bytes), `${relative}: invalid UTF-8`);
    observed.set(relative, bytes);
    return bytes;
  }
  const manifest = JSON.parse(read(prefix + "manifest.json"));
  check(manifest.revision === revision && manifest.outputRevision === revision && /^sha256-[a-f0-9]{64}$/.test(manifest.dataRevision), "Capture manifest revision mismatch");
  const dataRevision = manifest.dataRevision;
  const rendererSha256 = rendererFingerprint();
  check(/^[a-f0-9]{64}$/.test(rendererSha256), "Invalid capture renderer fingerprint");
  for (const file of rendererFiles) read(file);
  function snapshot(relative, hash) {
    const bytes = read(prefix + relative), wrapper = JSON.parse(bytes);
    check(wrapper.snapshot?.revision === revision && wrapper.snapshot?.outputRevision === revision && wrapper.snapshot?.dataRevision === dataRevision, `${relative}: capture input revision mismatch`);
    check(hash && sha256(wrapper.data) === hash.sha256 && digest(bytes) === hash.fileSha256 && bytes.length === hash.bytes, `${relative}: capture input hash/bytes mismatch`);
    inputs[relative] = { dataSha256: hash.sha256, fileSha256: hash.fileSha256, bytes: hash.bytes };
    return wrapper;
  }
  const group = `${type}s`, entries = manifest.hashes?.[group] || {};
  const allIds = Object.keys(entries);
  check(manifest.counts?.[group] === count && allIds.length === count && allIds.every(id => (type === "song" ? /^S\d{3}$/ : /^R\d{4}$/).test(id)), "Capture snapshot completeness mismatch");
  check(ids.length === count ? sameIds(ids, allIds) : type === "song" && ids.length === 3 && new Set(ids).size === 3 && ids.every(id => allIds.includes(id)), "Capture target ID set mismatch");
  function requireDirectory(group, expected) {
    const relative = prefix + group;
    const files = io.readdirSync(path.join(root, relative)).filter(f => f.endsWith(".json")).sort();
    check(sameIds(files, expected.map(id => `${id}.json`)), `${group}: capture source directory mismatch`);
    directories.set(relative, files);
  }
  requireDirectory(group, allIds);
  // Partial Song capture validates/pins only the three inputs it actually uses.
  for (const id of ids) {
    const wrapper = snapshot(`${group}/${id}.json`, entries[id]);
    validateSnapshot(type, id, wrapper, revision, dataRevision);
    check(wrapper.data._cache?.revision === dataRevision, `${id}: capture cache revision mismatch`);
  }
  if (type === "release") {
    const list = snapshot("release-list.json", manifest.releaseList).data;
    check(Array.isArray(list) && manifest.releaseList.count === 114 && sameIds(list.map(r => r.releaseId), allIds), "Capture Release list completeness mismatch");
    const dashboard = validateKamiparaDashboard(snapshot("kamipara-dashboard.json", manifest.kamiparaDashboard).data, dataRevision);
    check(dashboard.songs.length === 10 && dashboard.events.length === 5 && dashboard.performances.length === 10, "Capture Kamipara completeness mismatch");
    const events = manifest.hashes?.events || {};
    check(manifest.counts.events === 353 && Object.keys(events).length === 353 && Object.keys(events).every(id => /^EV\d+$/.test(id)), "Capture Event source completeness mismatch");
    requireDirectory("events", Object.keys(events));
    for (const [id, hash] of Object.entries(events)) validateEventSnapshot(id, snapshot(`events/${id}.json`, hash), revision, dataRevision);
  }
  function assertStable() {
    check(rendererFingerprint() === rendererSha256, "Renderer changed during capture");
    for (const [relative, bytes] of observed) check(Buffer.from(io.readFileSync(path.join(root, relative))).equals(bytes), `${relative}: input/renderer changed during capture`);
    for (const [relative, files] of directories) check(sameIds(io.readdirSync(path.join(root, relative)).filter(f => f.endsWith(".json")), files), `${relative}: input directory changed during capture`);
  }
  // Check again after collecting dependencies, before starting any browser work.
  assertStable();
  let committed = false;
  return {
    manifest, rendererSha256,
    current: { revision, outputRevision: revision, dataRevision },
    source(relative) { const bytes = observed.get(relative); return bytes && Buffer.from(bytes); },
    snapshot(relative) { const bytes = observed.get(prefix + relative); check(bytes, `Unrecorded capture input: ${relative}`); return JSON.parse(bytes); },
    assertStable,
    publish(pages, outputManifest) {
      check(!committed, "Capture session already published");
      assertStable();
      check(sameIds(pages.map(p => p.id), ids) && sameIds(Object.keys(outputManifest.pages), outputManifest.count === count ? allIds : ids), "Captured output ID set mismatch");
      check(outputManifest.outputRevision === revision && outputManifest.dataRevision === dataRevision, "Captured output revision mismatch");
      const outputs = {};
      for (const page of pages) {
        const entry = outputManifest.pages[page.id], bytes = Buffer.from(page.html);
        check(entry.path === `${type}/${page.id}.html` && entry.sha256 === digest(bytes) && entry.bytes === bytes.length, `${page.id}: captured output hash/bytes mismatch`);
        if (type === "song") check(entry.rendererSha256 === rendererSha256, `${page.id}: captured output renderer mismatch`);
        outputs[page.id] = { sha256: entry.sha256, bytes: entry.bytes };
      }
      // Never inherit the old complete-set receipt in a partial merge.
      delete outputManifest.captureProvenance;
      if (ids.length === count) {
        check(outputManifest.count === count && outputManifest.rendererSha256 === rendererSha256, "Captured complete-set renderer/count mismatch");
        outputManifest.captureProvenance = { schemaVersion: 1, outputRevision: revision, dataRevision, rendererSha256,
          entry: `${type}.html`, completion: "all-pages-and-enrichment",
          externalJsonp: type === "song" ? "song-empty-discover-v1" : "release-kamipara-snapshot-v1",
          inputs, outputs };
      }
      // Stage verified bytes on the destination filesystem. Invalidate the old
      // receipt before replacing any page, and publish the new manifest LAST.
      // A failure after invalidation leaves UNVERIFIED/FAIL, never a new receipt.
      const directory = path.join(root, type), manifestPath = path.join(directory, "manifest.json");
      io.mkdirSync(directory, { recursive: true });
      const pending = new Set(), staged = [];
      function stage(target, value) {
        const temporary = `${target}.capture-${process.pid}-${crypto.randomBytes(8).toString("hex")}.tmp`;
        pending.add(temporary);
        io.writeFileSync(temporary, value, { flag: "wx" });
        check(Buffer.from(io.readFileSync(temporary)).equals(Buffer.from(value)), `${target}: staged bytes mismatch`);
        return temporary;
      }
      function replace(temporary, target) { io.renameSync(temporary, target); pending.delete(temporary); }
      try {
        for (const page of pages) staged.push([stage(path.join(directory, `${page.id}.html`), page.html), path.join(directory, `${page.id}.html`)]);
        const manifestText = JSON.stringify(outputManifest, null, 2) + "\n";
        const stagedManifest = stage(manifestPath, manifestText);
        assertStable();
        let invalid = { ...outputManifest }; delete invalid.captureProvenance;
        if (io.existsSync(manifestPath)) { invalid = JSON.parse(io.readFileSync(manifestPath)); delete invalid.captureProvenance; }
        replace(stage(manifestPath, JSON.stringify(invalid, null, 2) + "\n"), manifestPath);
        for (const [temporary, target] of staged) replace(temporary, target);
        for (const page of pages) check(Buffer.from(io.readFileSync(path.join(directory, `${page.id}.html`))).equals(Buffer.from(page.html)), `${page.id}: published HTML mismatch`);
        assertStable();
        replace(stagedManifest, manifestPath);
        committed = true;
        return outputManifest;
      } finally {
        for (const temporary of pending) { try { io.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; } }
      }
    }
  };
}

module.exports = { beginCapture };
