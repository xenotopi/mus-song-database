import { singerDisplayName } from "./singer-display.js?v=1.0.0";

const id = (value, pattern) => typeof value === "string" && pattern.test(value);
const fields = ["songId", "disc", "track", "variant", "displayName", "benefitStore"];
export function resolveReleaseVocals(release, sidecar) {
  if (sidecar?.schemaVersion !== 1 || !Array.isArray(sidecar.releases) || !Array.isArray(sidecar.singers)) throw new Error("VOCAL_SCHEMA");
  const definitions = sidecar.releases.filter(item => item.releaseId === release.releaseId);
  if (!definitions.length) return [];
  if (definitions.length !== 1 || !id(release.releaseId, /^R\d{4}$/)) throw new Error("VOCAL_RELEASE_DUPLICATE");
  const definition = definitions[0], rows = release.includedSongs;
  if (!Array.isArray(rows) || !Array.isArray(definition.records) ||
      (release.featuredSinger?.id || null) !== definition.featuredSingerId ||
      (release.parentReleaseId || null) !== definition.parentReleaseId) throw new Error("VOCAL_RELEASE_REFERENCE");
  const seen = new Set();
  return definition.records.map(record => {
    const matches = rows.filter(row => row.relationId === record.relationId);
    if (!id(record.relationId, /^RT\d{4}$/) || seen.has(record.relationId) || matches.length !== 1 ||
        !fields.every(key => matches[0][key] === record[key])) throw new Error("VOCAL_RELATION_REFERENCE");
    seen.add(record.relationId);
    if (!["explicit_relation", "featured_singer", "child_release_exact"].includes(record.basis) ||
        (record.basis === "featured_singer" && record.singerId !== release.featuredSinger?.id) ||
        (record.basis === "child_release_exact" && (!id(record.childReleaseId, /^R\d{4}$/) || !id(record.childRelationId, /^RT\d{4}$/)))) throw new Error("VOCAL_BASIS");
    if (!Array.isArray(record.evidence) || !record.evidence.length || record.evidence.some(key =>
      sidecar.evidence?.[key]?.kind !== "official-product" || !/^https:\/\//.test(sidecar.evidence[key].url))) throw new Error("VOCAL_EVIDENCE");
    const singers = sidecar.singers.filter(singer => singer.singerId === record.singerId);
    if (!id(record.singerId, /^SN\d{4}$/) || singers.length !== 1 || !singers[0].name?.trim()) throw new Error("VOCAL_SINGER_REFERENCE");
    const singer = singers[0], name = singerDisplayName(singer, singer.name);
    return { relationId: record.relationId, singerId: record.singerId, text: `歌唱：${name}${singer.cv ? `（CV：${singer.cv}）` : ""}` };
  });
}

let dataRequest;
export async function attachReleaseVocals(release, host) {
  if (release.releaseId === "R0072") return { status: "not-applicable", count: 0 };
  try {
    dataRequest ||= fetch(new URL("../../data/release-vocals.json?v=1.0.0", import.meta.url), { cache: "no-cache", signal: AbortSignal.timeout(8000) })
      .then(response => { if (!response.ok) throw new Error("VOCAL_HTTP"); return response.json(); })
      .catch(error => { dataRequest = null; throw error; });
    const data = await dataRequest, vocals = resolveReleaseVocals(release, data), anchors = [...host.querySelectorAll(".release-included-song-row")];
    // Validate the whole batch before touching DOM; duplicates never get a guess.
    const entries = vocals.map(vocal => {
      const matches = anchors.filter(node => node.dataset.relationId === vocal.relationId);
      if (matches.length !== 1 || !matches[0].querySelector(".release-included-song-title")) throw new Error("VOCAL_DOM_REFERENCE");
      return { vocal, row: matches[0] };
    });
    if (!host.isConnected) throw new Error("VOCAL_STALE_HOST");
    for (const { vocal, row } of entries) {
      row.querySelectorAll(".release-recording-vocal").forEach(node => node.remove());
      const span = document.createElement("span"); span.className = "release-recording-vocal";
      span.dataset.singerId = vocal.singerId; span.textContent = vocal.text;
      row.querySelector(".release-included-song-title").after(span);
    }
    return { status: "complete", count: entries.length };
  } catch (error) {
    // Supplement failures never clear the saved tracks or replace them with a guess.
    if (window.__MUSDB_RELEASE_CAPTURE__) throw error;
    return { status: "unavailable", count: 0, reason: error.message };
  }
}
