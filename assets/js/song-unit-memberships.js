// Composition affiliation only. Never modify a performance or infer an affiliation.
const REFERENCES = Object.freeze({ printemps: "SN0007", lily_white: "SN0011", bibi: "SN0013" });
export function songUnitMembership(data, songId) {
  if (data?.schemaVersion !== 1 || data.scope !== "song_unit_affiliation_only" ||
      data.approvalScope !== "public" || data.publicReleaseApproved !== true ||
      data.unregisteredMeaning !== "unknown_not_nonmember" || !Array.isArray(data.memberships) || data.memberships.length !== 31) return null;
  const ids = new Set();
  for (const row of data.memberships) {
    const evidence = data.evidence?.find(e => e.id === row.evidenceId);
    if (!/^S\d{3}$/.test(row.songId) || ids.has(row.songId) || !Object.hasOwn(REFERENCES, row.unitKey) ||
        data.units?.[row.unitKey]?.displayNameRef !== REFERENCES[row.unitKey] || row.verificationStatus !== "source_matched" ||
        row.displayApproval !== "public" || evidence?.url !== "https://akihata.jp/works/music/27389/" ||
        evidence.scope !== "song_unit_affiliation_only" || evidence.kind !== "creator_official") return null;
    ids.add(row.songId);
  }
  const row = data.memberships.find(row => row.songId === songId);
  return row ? { unitKey: row.unitKey, displayNameRef: REFERENCES[row.unitKey] } : null;
}
let pending;
export function loadSongUnitMembership(songId) {
  pending ||= fetch("data/song-unit-memberships.json", { cache: "no-cache", signal: AbortSignal.timeout(3000) })
    .then(response => response.ok ? response.json() : null).catch(() => null);
  return pending.then(data => songUnitMembership(data, songId));
}
