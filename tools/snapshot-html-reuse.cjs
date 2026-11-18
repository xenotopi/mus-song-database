"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const check = (ok, message) => { if (!ok) throw new Error(message); };

// No receipts are manufactured here. The unchanged independent validator must
// accept both complete formal capture sets before the pointer may be replaced.
function switchVerifiedCurrent({ root, revision, lease, io = fs }) {
  const { validateStaticHtml } = require("./validate-static-html.cjs");
  const { SONG_RENDERER_FILES } = require("./generate-song-pages.cjs");
  const { RELEASE_RENDERER_FILES } = require("./generate-release-pages.cjs");
  check(/^sha256-[a-f0-9]{64}$/.test(revision), "Invalid switch revision");
  check(lease?.root === path.resolve(root), "Exclusive snapshot operation required");
  lease.assertHeld();
  const observed = new Map(), directories = new Map();
  function read(file) {
    const bytes = Buffer.from(io.readFileSync(file));
    if (observed.has(file)) check(observed.get(file) === hash(bytes), "Switch input changed during validation: " + file);
    observed.set(file, hash(bytes));
    return bytes;
  }
  function directory(file) {
    const names = io.readdirSync(file).slice().sort();
    if (directories.has(file)) check(JSON.stringify(names) === directories.get(file), "Switch directory changed: " + file);
    directories.set(file, JSON.stringify(names));
    return names;
  }
  const pointer = path.join(root, "data/current.json");
  read(pointer);
  for (const file of new Set([...SONG_RENDERER_FILES, ...RELEASE_RENDERER_FILES])) read(path.join(root, file));
  const manifest = JSON.parse(read(path.join(root, "data/snapshots", revision, "manifest.json")));
  const result = validateStaticHtml({ revision, repoRoot: root, readFile: read, readDirectory: directory });
  check(result.status === "PASS" && result.integrity === "PASS" && result.provenance === "VERIFIED" && result.reusable === true &&
    result.revision === revision && result.dataRevision === manifest.dataRevision && result.checked.songs === 117 && result.checked.releases === 114,
  "Verified HTML reuse rejected: " + JSON.stringify(result));
  function assertStable() {
    lease.assertHeld();
    for (const [file, digest] of observed) check(hash(io.readFileSync(file)) === digest, "Switch input changed before commit: " + file);
    for (const [file, names] of directories) check(JSON.stringify(io.readdirSync(file).slice().sort()) === names, "Switch directory changed before commit: " + file);
  }
  const body = JSON.stringify({ revision, outputRevision: manifest.outputRevision, dataRevision: manifest.dataRevision,
    basePath: `./${revision}/`, manifest: `./${revision}/manifest.json` }, null, 2) + "\n";
  const temporary = path.join(root, "data/snapshots", `.current-${crypto.randomUUID()}.tmp.json`);
  let created = false;
  try {
    assertStable();
    io.writeFileSync(temporary, body, { flag: "wx" }); created = true;
    check(Buffer.from(io.readFileSync(temporary)).equals(Buffer.from(body)), "Switch pointer staging mismatch");
    // Keep the final guard and atomic rename synchronous under the same lease.
    assertStable();
    io.renameSync(temporary, pointer); created = false;
  } finally { if (created) io.unlinkSync(temporary); }
  return result;
}

module.exports = { switchVerifiedCurrent };
