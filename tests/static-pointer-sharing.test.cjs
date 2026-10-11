"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const revision = `sha256-${"a".repeat(64)}`;
const nextRevision = `sha256-${"b".repeat(64)}`;
const pointer = { revision, outputRevision: revision, dataRevision: revision };
function loader(getPointer, cached = pointer) {
  const reads = [], writes = [];
  const context = vm.createContext({ AbortSignal,
    localStorage: { getItem: () => JSON.stringify(cached), setItem: (key, value) => writes.push(JSON.parse(value)) },
    fetch: async url => {
      reads.push(url);
      if (url === "data/current.json") return { ok: true, json: getPointer };
      const rev = url.split("/")[2];
      const data = url.endsWith("release-list.json") ? Array.from({ length: 114 }, () => ({}))
        : { releaseId: "R0094", includedSongs: [], includedSongsMeta: {}, _cache: { revision: rev } };
      return { ok: true, json: async () => ({ snapshot: { revision: rev, outputRevision: rev, dataRevision: rev }, data }) };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/static-detail.js"), "utf8").replaceAll("export ", ""), context);
  return { reads, writes, run: code => vm.runInContext(code, context) };
}
test("detail then list pin one fresh pointer even when current source changes", async () => {
  let source = pointer;
  const l = loader(async () => source);
  const detail = await l.run('staticDetail("release", "R0094")');
  source = { revision: nextRevision };
  const list = await l.run("staticReleaseList()");
  assert.equal(detail.revision, revision); assert.equal(list.revision, revision);
  assert.equal(l.reads.filter(url => url === "data/current.json").length, 1);
  assert.equal(l.reads.filter(url => url.endsWith("R0094.json")).length, 1);
  assert.equal(l.reads.filter(url => url.endsWith("release-list.json")).length, 1);
});
test("concurrent detail/list share the in-flight fresh fetch", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const l = loader(async () => { await gate; return pointer; });
  const result = l.run('Promise.all([staticDetail("release", "R0094"), staticReleaseList()])');
  assert.equal(l.reads.length, 1);
  release(); const values = await result;
  assert.ok(values.every(value => value.revision === revision && !value.stale));
  assert.equal(l.writes.length, 1);
});
test("failed fresh fetch is not permanently cached; retry can succeed", async () => {
  let attempts = 0;
  const l = loader(async () => { if (++attempts === 1) throw Error("offline"); return pointer; });
  await assert.rejects(l.run("currentPointer()"), /offline/);
  assert.equal((await l.run("currentPointer()")).stale, false);
  assert.equal(attempts, 2);
});
test("allowStale retains localStorage fallback without promoting it to fresh", async () => {
  let offline = true, attempts = 0;
  const l = loader(async () => { attempts++; if (offline) throw Error("offline"); return { revision: nextRevision }; });
  assert.equal((await l.run("currentPointer({allowStale:true})")).stale, true);
  await assert.rejects(l.run("currentPointer()"), /offline/);
  offline = false;
  const fresh = await l.run("currentPointer()");
  assert.equal(fresh.current.revision, nextRevision); assert.equal(fresh.stale, false);
  assert.equal(attempts, 3);
});
test("concurrent stale and strict callers share failure but not fallback policy", async () => {
  const l = loader(async () => { throw Error("offline"); });
  const [stale, strict] = await Promise.allSettled([l.run("currentPointer({allowStale:true})"), l.run("currentPointer()")]);
  assert.equal(stale.status, "fulfilled"); assert.equal(stale.value.stale, true);
  assert.equal(strict.status, "rejected"); assert.equal(l.reads.length, 1);
});
for (const invalid of [{ revision: "invalid" }, { revision, outputRevision: nextRevision }, { revision, dataRevision: "invalid" }]) {
  test(`invalid fresh pointer is rejected and retryable: ${JSON.stringify(invalid)}`, async () => {
    let source = invalid;
    const l = loader(async () => source);
    await assert.rejects(l.run("currentPointer()"), /revision/);
    source = pointer;
    assert.equal((await l.run("currentPointer()")).current.revision, revision);
    assert.equal(l.reads.length, 2);
  });
}
