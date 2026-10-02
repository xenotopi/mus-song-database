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

function dataRevisionOf(current) { return current.dataRevision || current.revision; }

function validDetail(type, id, wrapper, current) {
  const revision = current.revision;
  const dataRevision = dataRevisionOf(current);
  if (!wrapper || wrapper.snapshot?.revision !== revision || !wrapper.data) throw new Error("Static snapshot revision mismatch");
  if (wrapper.snapshot.outputRevision && wrapper.snapshot.outputRevision !== revision) throw new Error("Static output revision mismatch");
  if ((wrapper.snapshot.dataRevision || revision) !== dataRevision || wrapper.data._cache?.revision !== dataRevision) throw new Error("Static data revision mismatch");
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
    if (current.outputRevision && current.outputRevision !== current.revision) throw new Error("Static current output revision mismatch");
    if (current.dataRevision && !validRevision(current.dataRevision)) throw new Error("Static current data revision invalid");
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
  return { data: validDetail(type, id, wrapper, current), source: "static", stale, revision: current.revision, dataRevision: dataRevisionOf(current) };
}

export async function staticEventDetail(id, options = {}) {
  if (!/^EV\d+$/.test(id)) throw new Error("Static Event ID invalid");
  const { current, stale } = await currentPointer(options);
  const wrapper = await fetchJson(`data/snapshots/${current.revision}/events/${encodeURIComponent(id)}.json`);
  const { event, discover } = wrapper?.data || {};
  const dataRevision = dataRevisionOf(current);
  if (wrapper?.snapshot?.revision !== current.revision || event?.eventId !== id || discover?.eventId !== id ||
      (wrapper.snapshot.dataRevision || current.revision) !== dataRevision ||
      (wrapper.snapshot.outputRevision && wrapper.snapshot.outputRevision !== current.revision) ||
      event?._cache?.revision !== dataRevision || discover?._cache?.revision !== dataRevision ||
      typeof event.eventName !== "string" || !Array.isArray(event.songs) ||
      !event.statistics || !event.navigation || !Array.isArray(event.relatedReleases) ||
      !Array.isArray(discover.firstPerformedSongs) || !Array.isArray(discover.lastPerformedSongs) ||
      !Array.isArray(discover.uniqueSongs)) throw new Error("Static Event snapshot invalid");
  return { data: wrapper.data, source: "static", stale, revision: current.revision, dataRevision };
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
  if (wrapper?.snapshot?.revision !== current.revision || (wrapper.snapshot.dataRevision || current.revision) !== dataRevisionOf(current) || !Array.isArray(wrapper?.data) || wrapper.data.length !== 114) throw new Error("Static Release list schema invalid");
  return { data: wrapper.data, source: "static", stale, revision: current.revision, dataRevision: dataRevisionOf(current) };
}

export async function staticKamiparaDashboard(options = {}) {
  const { current, stale } = await currentPointer(options);
  const wrapper = await fetchJson(`data/snapshots/${current.revision}/kamipara-dashboard.json`);
  const data = wrapper?.data;
  if (wrapper?.snapshot?.revision !== current.revision || (wrapper.snapshot.dataRevision || current.revision) !== dataRevisionOf(current) || data?.revision !== dataRevisionOf(current) || data?._cache?.revision !== dataRevisionOf(current) || !data.summary) throw new Error("Static Kamipara revision mismatch");
  for (const [key, count] of [["songs", "songCount"], ["performers", "performerCount"], ["events", "eventCount"], ["performances", "performanceCount"]]) {
    if (!Array.isArray(data[key]) || data[key].length !== data.summary[count]) throw new Error(`Static Kamipara ${key} schema invalid`);
  }
  return { data, source: "static", stale, revision: current.revision, dataRevision: dataRevisionOf(current) };
}
