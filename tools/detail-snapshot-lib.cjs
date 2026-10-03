const crypto = require("node:crypto");

const ID_PATTERNS = {
  release: /^R\d{4}$/,
  song: /^S\d{3,}$/
};

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function validateDetail(type, id, data) {
  if (!ID_PATTERNS[type]?.test(id)) throw new Error(`Unsupported snapshot target: ${type}/${id}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${type}/${id}: data must be an object`);
  const idField = type === "release" ? "releaseId" : "songId";
  if (data[idField] !== id) throw new Error(`${type}/${id}: ID mismatch`);
  if (type === "release") {
    if (typeof data.releaseName !== "string" || !Array.isArray(data.includedSongs) || !data.includedSongsMeta) throw new Error(`${type}/${id}: required field missing`);
  } else if (typeof data.displayName !== "string" || !Array.isArray(data.includedReleases) || !Array.isArray(data.performances)) {
    throw new Error(`${type}/${id}: required field missing`);
  }
  return data;
}

function validateSnapshot(type, id, snapshot, expectedRevision, expectedDataRevision = expectedRevision) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Snapshot must be an object");
  if (!snapshot.snapshot || typeof snapshot.snapshot.revision !== "string") throw new Error("Snapshot revision missing");
  if (expectedRevision && snapshot.snapshot.revision !== expectedRevision) throw new Error("Snapshot revision mismatch");
  if (expectedRevision && snapshot.snapshot.outputRevision && snapshot.snapshot.outputRevision !== expectedRevision) throw new Error("Snapshot output revision mismatch");
  if (expectedDataRevision && (snapshot.snapshot.dataRevision || snapshot.snapshot.revision) !== expectedDataRevision) throw new Error("Snapshot data revision mismatch");
  validateDetail(type, id, snapshot.data);
  return snapshot;
}

function validateEventSnapshot(id, snapshot, expectedRevision, expectedDataRevision = expectedRevision) {
  if (!/^EV\d+$/.test(id)) throw new Error(`Unsupported Event snapshot target: ${id}`);
  if (!snapshot || snapshot.snapshot?.revision !== expectedRevision) throw new Error("Event snapshot revision mismatch");
  if (snapshot.snapshot.outputRevision && snapshot.snapshot.outputRevision !== expectedRevision) throw new Error("Event output revision mismatch");
  if ((snapshot.snapshot.dataRevision || snapshot.snapshot.revision) !== expectedDataRevision) throw new Error("Event snapshot data revision mismatch");
  const { event, discover } = snapshot.data || {};
  if (event?.eventId !== id || discover?.eventId !== id) throw new Error("Event snapshot ID mismatch");
  if (typeof event.eventName !== "string" || !Array.isArray(event.songs) ||
      !event.statistics || typeof event.statistics !== "object" ||
      !event.navigation || typeof event.navigation !== "object" ||
      !Array.isArray(event.relatedReleases)) throw new Error("Event snapshot schema invalid");
  for (const key of ["firstPerformedSongs", "lastPerformedSongs", "uniqueSongs"]) {
    if (!Array.isArray(discover[key])) throw new Error(`Event discover ${key} missing`);
  }
  if (event._cache?.revision !== expectedDataRevision || discover._cache?.revision !== expectedDataRevision) {
    throw new Error("Event data revision mismatch");
  }
  return snapshot.data;
}

function validateKamiparaDashboard(data, revision) {
  if (!data || data.revision !== revision || data._cache?.revision !== revision || !data.summary) throw new Error("Kamipara revision or summary mismatch");
  for (const [key, count] of [["songs", "songCount"], ["performers", "performerCount"], ["events", "eventCount"], ["performances", "performanceCount"]]) {
    if (!Array.isArray(data[key]) || data[key].length !== data.summary[count]) throw new Error(`Kamipara ${key} count mismatch`);
  }
  return data;
}

async function getDetailWithStaticFallback({ type, id, revision, staticFetch, apiFetch, allowStale = false }) {
  let staticError;
  try {
    if (!revision && !allowStale) throw new Error("Current revision unavailable and stale snapshots are disabled");
    const candidate = await staticFetch({ type, id, revision });
    const expected = revision || "";
    return { source: "static", data: validateSnapshot(type, id, candidate, expected).data, stale: !revision };
  } catch (error) {
    staticError = error;
  }
  try {
    const response = await apiFetch({ type, id });
    return { source: "api", data: validateDetail(type, id, response?.data), stale: false, staticError };
  } catch (apiError) {
    const error = new AggregateError([staticError, apiError], `Static and API detail failed for ${type}/${id}`);
    error.code = "DETAIL_SOURCES_FAILED";
    throw error;
  }
}

function snapshotDataFingerprint(manifest) {
  const hashes = Object.fromEntries(Object.entries(manifest.hashes).map(([type, entries]) =>
    [type, Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.sha256]))]));
  return sha256({ revision: manifest.revision, ...(manifest.dataRevision ? { dataRevision: manifest.dataRevision } : {}), counts: manifest.counts, hashes,
    releaseList: { count: manifest.releaseList.count, sha256: manifest.releaseList.sha256 },
    ...(manifest.kamiparaDashboard ? { kamiparaDashboard: { sha256: manifest.kamiparaDashboard.sha256 } } : {}),
    ...(manifest.memberAnalytics ? { memberAnalytics: { sha256: manifest.memberAnalytics.sha256 } } : {}) });
}

module.exports = { canonicalJson, sha256, validateDetail, validateSnapshot, validateEventSnapshot, validateKamiparaDashboard, getDetailWithStaticFallback, snapshotDataFingerprint };
