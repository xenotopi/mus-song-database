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

function validateSnapshot(type, id, snapshot, expectedRevision) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Snapshot must be an object");
  if (!snapshot.snapshot || typeof snapshot.snapshot.revision !== "string") throw new Error("Snapshot revision missing");
  if (expectedRevision && snapshot.snapshot.revision !== expectedRevision) throw new Error("Snapshot revision mismatch");
  validateDetail(type, id, snapshot.data);
  return snapshot;
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

module.exports = { canonicalJson, sha256, validateDetail, validateSnapshot, getDetailWithStaticFallback };
