'use strict';

const assert = require('node:assert/strict');
const {same} = require('./policy.cjs');

const hex = /^[a-f0-9]{64}$/;
const off = value => value === undefined || value === '' || value === 'false';

function legacyManualEnabled(env) {
  return env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.MUSDB_RUN_REF_PROTECTED === 'true' &&
    env.MUSDB_LEGACY_MANUAL_ENABLED === 'true' && off(env.MUSDB_PUBLICATION_FENCE_ENABLED) &&
    off(env.MUSDB_EVENT_MONITOR_ENABLED) && off(env.MUSDB_EVENT_PUBLICATION_ENABLED);
}

function requirePagesDeployment(env) {
  assert.equal(env.MUSDB_PAGES_DEPLOY_ENABLED, 'true', 'Pages deployment disabled');
}

function verifiedSnapshotBinding(published, target) {
  assert.ok(published?.verified === true && same(published, target), 'The target must already have a verified public snapshot');
  assert.ok(Number.isSafeInteger(published.runId) && published.runId > 0 && published.runId === published.release?.runId,
    'Missing verified publication run');
  assert.equal(published.receiptEntry?.path, 'data/sync-release.json');
  const binding = {runId: published.runId, receiptSha256: published.receiptEntry.sha256,
    filesManifestSha256: published.release.filesManifestSha256, snapshotManifestSha256: published.release.snapshotManifestSha256};
  for (const hash of Object.values(binding).slice(1)) assert.match(hash, hex, 'Missing published snapshot proof');
  return binding;
}

function bindPublicationSource(authorized, published, env) {
  if (authorized.decision !== 'BUILD') return authorized;
  if (Object.hasOwn(authorized, 'sourceImageSha256')) {
    assert.match(authorized.sourceImageSha256, hex);
    if (env.MUSDB_PUBLICATION_FENCE_ENABLED === 'true') return authorized;
  } else if (legacyManualEnabled(env) && published?.verified === true && same(published, authorized.target)) {
    return {...authorized, publishedSnapshot: verifiedSnapshotBinding(published, authorized.target)};
  }
  return {decision: 'BLOCKED', reason: 'COMPLETED_SOURCE_IMAGE_AND_FENCE_REQUIRED'};
}

function validatePublicationSource(plan, env) {
  if (!Object.hasOwn(plan, 'publishedSnapshot')) {
    assert.match(plan.sourceImageSha256, hex, 'An update with a confirmed source image is required');
    assert.equal(env.MUSDB_PUBLICATION_FENCE_ENABLED, 'true', 'Publication fence is required');
    return false;
  }
  assert.ok(legacyManualEnabled(env), 'Verified-snapshot publication is manual only');
  assert.ok(!Object.hasOwn(plan, 'completionNotice') && !Object.hasOwn(plan, 'sourceImageSha256'),
    'Verified-snapshot publication cannot carry an automatic notice or frozen input');
  return true;
}

function confirmPublishedSnapshot(plan, published) {
  if (Object.hasOwn(plan, 'publishedSnapshot')) {
    assert.deepEqual(verifiedSnapshotBinding(published, plan.target), plan.publishedSnapshot,
      'Verified public snapshot changed after authorization');
  }
}

module.exports = {bindPublicationSource, confirmPublishedSnapshot, legacyManualEnabled, requirePagesDeployment, validatePublicationSource};
