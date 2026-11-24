'use strict';

const {snapshotDataFingerprint} = require('../detail-snapshot-lib.cjs');

function assertSnapshotIdentity(published, candidate) {
  const digest = value => {
    for (const key of ["revision", "outputRevision", "dataRevision"]) {
      if (!/^sha256-[a-f0-9]{64}$/.test(value[key])) throw new Error("Missing snapshot revision evidence");
    }
    if (value.revision !== value.outputRevision || value.counts?.memberAnalytics !== 1 ||
        value.counts?.songs !== 117 || value.counts?.releases !== 114 || !(value.counts?.events > 0)) {
      throw new Error("Incomplete snapshot evidence");
    }
    for (const group of ["songs", "releases", "events"]) {
      const entries = Object.values(value.hashes?.[group] || {});
      if (entries.length !== value.counts[group] || entries.some(entry => !/^[a-f0-9]{64}$/.test(entry.sha256))) {
        throw new Error("Missing snapshot data digest: " + group);
      }
    }
    for (const key of ["releaseList", "kamiparaDashboard", "memberAnalytics"]) {
      if (!/^[a-f0-9]{64}$/.test(value[key]?.sha256)) throw new Error("Missing snapshot data digest: " + key);
    }
    return snapshotDataFingerprint(value);
  };
  const hash = digest(published);
  if (digest(candidate) !== hash) throw new Error("Existing snapshot data differs from the frozen input");
  return hash;
}

module.exports = {assertSnapshotIdentity};
