import { songCredits } from "./song-credits.js?v=1.1.0";

// The sole credit source declares its baseline recording. Reuse the Song
// formatter/verification rules without fetching one Song JSON per track.
// This context validates that declaration; it does NOT prove audio identity
// for another Release. Only the exact original Relation may use its arranger.
function baselineContext(item) {
  const r = item.recording;
  return { songId: item.songId, version: r?.songVersion,
    debutRelease: { releaseId: r?.releaseId },
    includedReleases: [{ releaseId: r?.releaseId, relationId: r?.relationId, variant: r?.variant }] };
}

export function resolveReleaseSongCredits(release, data) {
  const tracks = release?.includedSongs;
  if (!/^R\d{4}$/.test(release?.releaseId || "") || !Array.isArray(tracks) ||
      !Array.isArray(data?.songs) || tracks.some(t => !/^RT\d{4}$/.test(t.relationId || "")) ||
      new Set(tracks.map(t => t.relationId)).size !== tracks.length) return [];
  const resolved = new Map();
  return tracks.flatMap(track => {
    const entries = data.songs.filter(s => s.songId === track.songId);
    if (entries.length !== 1) return [];
    const item = entries[0];
    if (!resolved.has(track.songId)) resolved.set(track.songId, songCredits(data, baselineContext(item)));
    const source = resolved.get(track.songId);
    if (!source) return [];
    const r = source.recording;
    const original = release.releaseId === r.releaseId && track.relationId === r.relationId &&
      (track.variant || null) === r.variant &&
      (track.disc == null || track.disc === r.disc) && (track.track == null || track.track === r.track);
    const rows = source.rows.filter(row => row.role !== "arranger" || original);
    return rows.length ? [{ relationId: track.relationId, songId: track.songId, rows }] : [];
  });
}

let request;
export async function attachReleaseSongCredits(release, host) {
  if (!host || !release?.includedSongs?.length) return { status: "not-applicable", count: 0 };
  try {
    request ||= fetch(new URL("../../data/song-credits.json", import.meta.url),
      { cache: "no-cache", signal: AbortSignal.timeout(3000) })
      .then(response => { if (!response.ok) throw new Error("SONG_CREDITS_HTTP"); return response.json(); });
    const data = await request;
    const entries = resolveReleaseSongCredits(release, data);
    const anchors = [...host.querySelectorAll(".release-included-song-row[data-relation-id]")];
    let count = 0;
    for (const entry of entries) {
      const matches = anchors.filter(row => row.dataset.relationId === entry.relationId);
      if (matches.length !== 1) continue;
      const row = matches[0], title = row.querySelector(".release-included-song-title");
      // Preserve any explicitly supplied legacy credit block, without duplicates.
      if (!title || row.querySelector(".release-credits")) continue;
      const block = document.createElement("span"); block.className = "release-song-credits";
      for (const credit of entry.rows) {
        if (block.childNodes.length) block.append(document.createTextNode(" ／ "));
        const line = document.createElement("span"); line.dataset.releaseCredit = credit.role;
        line.textContent = `${credit.label}：${credit.value}`; block.append(line);
      }
      row.querySelectorAll(".release-song-credits").forEach(node => node.remove());
      (row.querySelector(".release-recording-vocal") || title).after(block);
      count++;
    }
    return { status: "complete", count };
  } catch (error) {
    if (window.__MUSDB_RELEASE_CAPTURE__) throw error;
    return { status: "unavailable", count: 0 };
  }
}
