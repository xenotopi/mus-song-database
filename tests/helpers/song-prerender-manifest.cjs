"use strict";
const assert = require("node:assert/strict");

// Test-only, pure production completeness assertion. latestRendererSha256 is
// deliberately ignored: freshness of one batch cannot prove freshness of 117.
function assertProductionSongManifest(manifest, { ids, rendererSha256, outputRevision, dataRevision }) {
  assert.equal(ids.length, 117, "production requires 117 snapshot Song IDs");
  assert.equal(new Set(ids).size, 117, "snapshot Song IDs must be unique");
  assert.match(rendererSha256, /^[a-f0-9]{64}$/, "current renderer fingerprint required");
  assert.equal(manifest.count, 117, "production manifest count");
  assert.deepEqual(Object.keys(manifest.pages).sort(), [...ids].sort(), "complete production page set");
  assert.equal(manifest.outputRevision, outputRevision, "production snapshot revision");
  assert.equal(manifest.dataRevision, dataRevision, "production data revision");
  assert.equal(manifest.rendererSha256, rendererSha256, "complete-set renderer fingerprint is stale; regenerate all 117 Songs");
  for (const id of ids) {
    assert.equal(manifest.pages[id].rendererSha256, rendererSha256, `${id}: page renderer fingerprint is stale; regenerate all 117 Songs`);
  }
}

module.exports = { assertProductionSongManifest };
