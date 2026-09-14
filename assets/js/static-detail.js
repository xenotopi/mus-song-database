const CURRENT_URL = "data/current.json";
const CURRENT_CACHE_KEY = "musdb:static-current:v1";
const FETCH_TIMEOUT_MS = 8000;

function timeoutSignal(ms = FETCH_TIMEOUT_MS) {
  return typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache", signal: timeoutSignal() });
  if (!response.ok) throw new Error(`Static snapshot HTTP ${response.status}`);
  return response.json();
}

function validRevision(value) { return /^sha256-[a-f0-9]{64}$/.test(String(value || "")); }

function validDetail(type, id, wrapper, revision) {
  if (!wrapper || wrapper.snapshot?.revision !== revision || !wrapper.data) throw new Error("Static snapshot revision mismatch");
  const idField = type === "release" ? "releaseId" : "songId";
  if (wrapper.data[idField] !== id) throw new Error("Static snapshot ID mismatch");
  if (type === "release" && (!Array.isArray(wrapper.data.includedSongs) || !wrapper.data.includedSongsMeta)) throw new Error("Static Release schema invalid");
  if (type === "song" && (!Array.isArray(wrapper.data.includedReleases) || !Array.isArray(wrapper.data.performances))) throw new Error("Static Song schema invalid");
  return wrapper.data;
}

async function currentPointer({ allowStale = false } = {}) {
  try {
    const current = await fetchJson(CURRENT_URL);
    if (!validRevision(current?.revision)) throw new Error("Static current revision invalid");
    try { localStorage.setItem(CURRENT_CACHE_KEY, JSON.stringify(current)); } catch {}
    return { current, stale: false };
  } catch (error) {
    if (!allowStale) throw error;
    let cached;
    try { cached = JSON.parse(localStorage.getItem(CURRENT_CACHE_KEY) || "null"); } catch {}
    if (!validRevision(cached?.revision)) throw error;
    return { current: cached, stale: true };
  }
}

export async function staticDetail(type, id, options = {}) {
  const { current, stale } = await currentPointer(options);
  const plural = type === "release" ? "releases" : "songs";
  const wrapper = await fetchJson(`data/snapshots/${current.revision}/${plural}/${encodeURIComponent(id)}.json`);
  return { data: validDetail(type, id, wrapper, current.revision), source: "static", stale, revision: current.revision };
}

export async function detailWithApiFallback(type, id, apiFetch, options = {}) {
  try {
    return await staticDetail(type, id, options);
  } catch (staticError) {
    const response = await apiFetch();
    return { ...response, source: "api", stale: false, staticError };
  }
}

export async function staticReleaseList(options = {}) {
  const { current, stale } = await currentPointer(options);
  const wrapper = await fetchJson(`data/snapshots/${current.revision}/release-list.json`);
  if (wrapper?.snapshot?.revision !== current.revision || !Array.isArray(wrapper?.data) || wrapper.data.length !== 114) throw new Error("Static Release list schema invalid");
  return { data: wrapper.data, source: "static", stale, revision: current.revision };
}
