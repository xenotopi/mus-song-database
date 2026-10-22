// Product inventory only: never creates Songs, Relations or vocal identities.
const fields = ["relationId", "songId", "songName", "displayName", "disc", "track", "displayOrder", "variant", "benefitStore"];
const check = (ok, reason) => { if (!ok) throw new Error(reason); };
async function binding(row) {
  const bytes = new TextEncoder().encode(JSON.stringify(fields.map(key => row[key])));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
}
export async function resolveReleaseContents(release, data) {
  check(data?.schemaVersion === 2 && data.scope === "release-product-track-list-only" && Array.isArray(data.releases), "CONTENTS_SCHEMA");
  const matches = data.releases.filter(item => item.releaseId === release.releaseId);
  if (!matches.length) return null;
  check(matches.length === 1, "CONTENTS_DUPLICATE_RELEASE");
  const item = matches[0], registered = release.includedSongs;
  check(item.releaseName === release.releaseName && item.releaseDate === release.releaseDate && Array.isArray(registered) &&
    item.verification === "official-catalog-position-reviewed" && /^https:\/\/catalog\.bandainamcomusiclive\.co\.jp\/release\/\d+\/$/.test(item.sourceUrl) &&
    /^[a-f0-9]{64}$/.test(item.sourceContentSha256) && Array.isArray(item.discs) && item.discs.length > 0, "CONTENTS_RELEASE_BINDING");
  const codeSource = { R0071: "386", R0078: "313", R0082: "262" }[release.releaseId];
  check(codeSource && item.managementCodeSource?.url === `https://www.sunrise-music.co.jp/list/detail.php?id=${codeSource}` && /^[a-f0-9]{64}$/.test(item.managementCodeSource.contentSha256), "CONTENTS_CODE_SOURCE");
  const used = new Set(), tracks = [], managementCodes = {};
  for (const [i, disc] of item.discs.entries()) {
    check(disc.disc === i + 1 && Array.isArray(disc.tracks) && disc.tracks.length > 0, "CONTENTS_DISC_SEQUENCE");
    for (const [j, entry] of disc.tracks.entries()) {
      check(entry.track === j + 1 && typeof entry.officialTitle === "string" && entry.officialTitle.trim() && entry.sourceUrl === item.sourceUrl &&
        (entry.officialVersion === null || typeof entry.officialVersion === "string") && !["songId", "singerId"].some(key => Object.hasOwn(entry, key)), "CONTENTS_TRACK_SEQUENCE");
      check(entry.managementCode === null || typeof entry.managementCode === "string" && /^(?:LM(?:\d+[A-Z]*|OP)|[TP]M\d+[A-Z]*|M\d+[A-Z]*)(?: [^\r\n<>]+)?$/.test(entry.managementCode), "CONTENTS_MANAGEMENT_CODE");
      managementCodes[`${disc.disc}:${entry.track}`] = entry.managementCode;
      const rows = registered.filter(r => r.disc === disc.disc && r.track === entry.track);
      if (entry.relationId === null) {
        check(rows.length === 0 && entry.relationBinding === null, "CONTENTS_UNBOUND_REGISTERED_POSITION");
        tracks.push({ contentOnly: true, disc: disc.disc, track: entry.track, officialTitle: entry.officialTitle });
      } else {
        check(/^RT\d{4}$/.test(entry.relationId) && rows.length === 1 && rows[0].relationId === entry.relationId && !used.has(entry.relationId), "CONTENTS_RELATION_POSITION");
        check(await binding(rows[0]) === entry.relationBinding, "CONTENTS_RELATION_BINDING");
        used.add(entry.relationId); tracks.push(rows[0]);
      }
    }
  }
  check(used.size === registered.length, "CONTENTS_RELATION_COVERAGE");
  return { tracks, discCounts: item.discs.map(d => d.tracks.length), sourceUrl: item.sourceUrl, managementCodes };
}
let request;
export async function loadReleaseContents(release) {
  if (release.releaseType !== "サウンドトラック" && release.sourceMedia !== "サウンドトラック") return null;
  try {
    request ||= fetch(new URL("../../data/release-contents.json?v=1.1.0", import.meta.url), { cache: "no-cache", signal: AbortSignal.timeout(8000) })
      .then(r => { if (!r.ok) throw new Error("CONTENTS_HTTP"); return r.json(); }).catch(e => { request = null; throw e; });
    return await resolveReleaseContents(release, await request);
  } catch (error) {
    if (window.__MUSDB_RELEASE_CAPTURE__) throw error;
    return null; // Existing registered tracks remain the safe fallback.
  }
}
