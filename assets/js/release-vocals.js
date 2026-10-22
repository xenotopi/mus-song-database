import { singerDisplayName } from "./singer-display.js?v=1.0.0";

const id = (value, pattern) => typeof value === "string" && pattern.test(value);
const fields = ["songId", "disc", "track", "variant", "displayName", "benefitStore"];
function recordingSinger(record, sidecar) {
  const matches = sidecar.singers.filter(s => s.singerId === record.singerId);
  if (matches.length !== 1 || !matches[0].name?.trim()) throw new Error("VOCAL_SINGER_REFERENCE");
  const singer = matches[0];
  if (id(singer.singerId, /^SN\d{4}$/)) {
    if (singer.scope || singer.memberSingerIds) throw new Error("VOCAL_SINGER_SCOPE");
  } else {
    const members = singer.memberSingerIds;
    if (!id(singer.singerId, /^RVN\d{4}$/) || singer.scope !== "release-only" || singer.cv !== null ||
        record.basis !== "user_confirmed_recording" || !Array.isArray(members) || members.length < 2 || members.length > 9 ||
        new Set(members).size !== members.length) throw new Error("VOCAL_SINGER_SCOPE");
    const names = members.map(memberId => {
      const found = sidecar.singers.filter(s => s.singerId === memberId);
      if (!id(memberId, /^SN\d{4}$/) || found.length !== 1 || !found[0].cv || !found[0].name?.trim()) throw new Error("VOCAL_MEMBER_REFERENCE");
      return found[0].name;
    });
    if (names.join("＆") !== singer.name) throw new Error("VOCAL_MEMBER_ORDER");
  }
  return singer;
}
function evidenceMatches(key, record, release, sidecar, name) {
  const evidence = sidecar.evidence?.[key];
  if (record.basis !== "user_confirmed_recording") return false;
  return evidence?.kind === "user-confirmed-recording" && evidence.reference === "RELEASE-VOCAL-04B" &&
    evidence.recordingIdentity === "vocal-credit-only" && /^[a-f0-9]{64}$/.test(evidence.sourceContentSha256 || "") &&
    Array.isArray(evidence.approvals) && new Set(evidence.approvals.map(a => a.relationId)).size === evidence.approvals.length &&
    evidence.approvals.filter(a => a.releaseId === release.releaseId && a.relationId === record.relationId &&
      [...fields, "singerId"].every(field => a[field] === record[field]) && a.name === name &&
      Number.isInteger(a.sourceRow) && a.sourceRow >= 2 && a.sourceRow <= 78).length === 1;
}
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
    if (!["explicit_relation", "featured_singer", "child_release_exact", "solo_disc_reference", "user_confirmed_recording"].includes(record.basis) ||
        (record.basis === "featured_singer" && record.singerId !== release.featuredSinger?.id) ||
        (["child_release_exact", "solo_disc_reference"].includes(record.basis) && (!id(record.childReleaseId, /^R\d{4}$/) || !id(record.childRelationId, /^RT\d{4}$/))) ||
        (record.basis === "solo_disc_reference" && (!Array.isArray(record.referenceRelationIds) || !record.referenceRelationIds.includes(record.childRelationId) || new Set(record.referenceRelationIds).size !== record.referenceRelationIds.length || !record.referenceRelationIds.every(value => id(value, /^RT\d{4}$/))))) throw new Error("VOCAL_BASIS");
    const singer = recordingSinger(record, sidecar), name = singerDisplayName(singer, singer.name);
    if (!Array.isArray(record.evidence) || !record.evidence.length || record.evidence.some(key => {
      if (record.basis === "user_confirmed_recording") return !evidenceMatches(key, record, release, sidecar, name);
      const source = sidecar.evidence?.[key];
      return !(source?.kind === "official-product" || (source?.kind === "official-creator-product" && /^https:\/\/akihata\.jp\/works\/(?:music|video)\/\d+\/$/.test(source.url))) || !/^https:\/\//.test(source?.url || "");
    })) throw new Error("VOCAL_EVIDENCE");
    // Preserve CV data; omit it only from the recording-list presentation.
    return { relationId: record.relationId, singerId: record.singerId, text: `歌唱：${name}` };
  });
}

let dataRequest;
export async function attachReleaseVocals(release, host) {
  if (release.releaseId === "R0072") return { status: "not-applicable", count: 0 };
  try {
    dataRequest ||= fetch(new URL("../../data/release-vocals.json?v=1.3.0", import.meta.url), { cache: "no-cache", signal: AbortSignal.timeout(8000) })
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
