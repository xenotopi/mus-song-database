const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { canonicalJson, sha256, validateSnapshot, getDetailWithStaticFallback } = require("../tools/detail-snapshot-lib.cjs");

const revision = `sha256-${"a".repeat(64)}`;
const releaseData = { releaseId: "R0088", releaseName: "Fixture", includedSongs: [], includedSongsMeta: { status: "complete" } };
const valid = { snapshot: { revision, generatedAt: "2026-09-14T00:00:00.000Z", source: "public-api" }, data: releaseData };
const apiResponse = { data: releaseData };

test("canonical data hash is deterministic and ignores wrapper timestamp", () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(sha256(valid.data), sha256({ ...valid, snapshot: { ...valid.snapshot, generatedAt: "later" } }.data));
});

test("valid static wins without API request", async () => {
  let apiCalls = 0;
  const result = await getDetailWithStaticFallback({ type: "release", id: "R0088", revision, staticFetch: async () => valid, apiFetch: async () => { apiCalls += 1; return apiResponse; } });
  assert.equal(result.source, "static");
  assert.equal(apiCalls, 0);
});

for (const [name, staticFetch] of [
  ["404", async () => { throw new Error("HTTP 404"); }],
  ["revision mismatch", async () => ({ ...valid, snapshot: { ...valid.snapshot, revision: `sha256-${"b".repeat(64)}` } })],
  ["corrupt JSON", async () => { JSON.parse("{"); }],
  ["schema invalid", async () => ({ ...valid, data: { releaseId: "R0088" } })]
]) {
  test(`${name} falls back to API`, async () => {
    const result = await getDetailWithStaticFallback({ type: "release", id: "R0088", revision, staticFetch, apiFetch: async () => apiResponse });
    assert.equal(result.source, "api");
  });
}

test("valid static survives API outage without calling API", async () => {
  const result = await getDetailWithStaticFallback({ type: "release", id: "R0088", revision, staticFetch: async () => valid, apiFetch: async () => { throw new Error("outage"); } });
  assert.equal(result.source, "static");
});

test("static outage with API success returns API", async () => {
  const result = await getDetailWithStaticFallback({ type: "release", id: "R0088", revision, staticFetch: async () => { throw new Error("outage"); }, apiFetch: async () => apiResponse });
  assert.equal(result.source, "api");
});

test("both sources failing reaches the existing error boundary", async () => {
  await assert.rejects(() => getDetailWithStaticFallback({ type: "release", id: "R0088", revision, staticFetch: async () => { throw new Error("static"); }, apiFetch: async () => { throw new Error("api"); } }), error => error.code === "DETAIL_SOURCES_FAILED");
});

test("stale snapshot is allowed only when policy explicitly opts in", async () => {
  const result = await getDetailWithStaticFallback({ type: "release", id: "R0088", revision: "", allowStale: true, staticFetch: async () => valid, apiFetch: async () => apiResponse });
  assert.equal(result.source, "static");
  assert.equal(result.stale, true);
});

test("ID mismatch is rejected", () => {
  assert.throws(() => validateSnapshot("release", "R0088", { ...valid, data: { ...releaseData, releaseId: "R0106" } }, revision), /ID mismatch/);
});

test("generated fixtures match manifest, revision and relation counts", () => {
  const fixtureRoot = path.resolve(__dirname, "..", "data", "fixtures");
  const current = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "current.json"), "utf8"));
  const revisionRoot = path.join(fixtureRoot, current.revision);
  const manifest = JSON.parse(fs.readFileSync(path.join(revisionRoot, "manifest.json"), "utf8"));
  assert.equal(current.basePath, `./${current.revision}/`);
  assert.equal(manifest.revision, current.revision);
  for (const [type, id, count] of [["release", "R0088", 285], ["release", "R0106", 31], ["song", "S100", 22], ["song", "S003", 13]]) {
    const wrapper = JSON.parse(fs.readFileSync(path.join(revisionRoot, `${type}s`, `${id}.json`), "utf8"));
    validateSnapshot(type, id, wrapper, current.revision);
    const actual = type === "release" ? wrapper.data.includedSongs.length : wrapper.data.includedReleases.length;
    assert.equal(actual, count);
    assert.equal(manifest[`${type}s`][id].count, count);
    assert.equal(manifest[`${type}s`][id].sha256, sha256(wrapper.data));
  }
});
