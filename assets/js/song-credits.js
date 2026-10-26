// Recording-scoped credits only; never infer credits for another Relation/Mix.
export const CREDIT_ROLES = Object.freeze({ lyricist: "作詞", composer: "作曲", arranger: "編曲" });
const https = value => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };
const officialKinds = ["publisher_official", "creator_official", "creator_agency_official"];
function userEvidence(e) {
  const c = e?.confirmation, a = c?.assertions;
  if (e?.kind !== "user_confirmation" || Object.hasOwn(e, "url") || !c?.reference || c.confirmedBy !== "user" || !c.statement?.trim() ||
      !/^\d{4}-\d\d-\d\dT/.test(c.recordedAt || "") || !a || a.songId !== e.songId || a.relationId !== e.relationId ||
      a.releaseId !== e.releaseId || a.catalogNumber !== e.catalogNumber || a.disc !== e.disc || a.track !== e.track) return false;
  if (e.purpose === "recording_identity") return c.type === "physical_item_report" && a.discCount === 1 && a.disc === 1 && a.track === 1 &&
    Array.isArray(a.tracks) && a.tracks.length >= 2 && new Set(a.tracks.map(t => t.track)).size === a.tracks.length &&
    a.tracks.every((t, i) => t.track === i + 1 && t.kind === (i === 0 ? "song" : i === 1 ? "off_vocal" : "drama"));
  return e.purpose === "credit" && ["creator_correction_report", "explicit_credit_adoption"].includes(c.type) &&
    Object.hasOwn(CREDIT_ROLES, a.role) && e.roles?.length === 1 && e.roles[0] === a.role &&
    Array.isArray(a.creditedNames) && a.creditedNames.length > 0 && a.creditedNames.every(n => typeof n === "string" && n.trim());
}
const sourceValid = e => officialKinds.includes(e?.kind) ? https(e.url) && !Object.hasOwn(e, "confirmation") : userEvidence(e);
const userPublicationApproved = data => data.publicationApproval?.scope === "verified_song_credits" && typeof data.publicationApproval.reference === "string" && !!data.publicationApproval.reference.trim() && data.publicationApproval.userConfirmedSources === true;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function songCredits(data, song) {
  if (data?.schemaVersion !== 1 || data.scope !== "song_baseline_recording_credits" || !Array.isArray(data.songs) || !Array.isArray(data.evidence)) return null;
  if (new Set(data.songs.map(s => s.songId)).size !== data.songs.length || new Set(data.evidence.map(e => e.evidenceId)).size !== data.evidence.length) return null;
  const item = data.songs.find(s => s.songId === song?.songId);
  if (!item) return null;
  const target = item.recording;
  // Disc/Track below refer to the cited product, not invented snapshot positions.
  if (!target || target.releaseId !== song.debutRelease?.releaseId || target.songVersion !== song.version ||
      !/^RT\d+$/.test(target.relationId) || !target.catalogNumber || !Number.isInteger(target.disc) || target.disc < 1 || !Number.isInteger(target.track) || target.track < 1 ||
      song.includedReleases?.filter(r => r.releaseId === target.releaseId && r.relationId === target.relationId && (r.variant || null) === target.variant).length !== 1 || !Array.isArray(item.credits)) return null;
  if (target.identityEvidenceRefs !== undefined && (!Array.isArray(target.identityEvidenceRefs) || !target.identityEvidenceRefs.length ||
      target.identityEvidenceRefs.some(ref => { const e = data.evidence.find(e => e.evidenceId === ref); return !userEvidence(e) || e.purpose !== "recording_identity" || e.songId !== song.songId || e.relationId !== target.relationId || e.releaseId !== target.releaseId || e.catalogNumber !== target.catalogNumber || e.disc !== target.disc || e.track !== target.track; }) || (!userPublicationApproved(data) && item.credits.some(c => c.publishAllowed !== false)))) return null;
  const ids = new Set(), positions = new Set(), names = new Set();
  for (const credit of item.credits) {
    const key = `${credit.role}:${credit.displayOrder}`, name = `${credit.role}:${credit.creditedName}`;
    if (!credit.creditId || ids.has(credit.creditId) || !Object.hasOwn(CREDIT_ROLES, credit.role) ||
        typeof credit.creditedName !== "string" || !credit.creditedName.trim() || !Number.isInteger(credit.displayOrder) || credit.displayOrder < 1 || positions.has(key) || names.has(name) ||
        !["verified", "partial", "unverified"].includes(credit.verificationStatus) || typeof credit.publishAllowed !== "boolean" ||
        !Array.isArray(credit.evidenceRefs) || !credit.evidenceRefs.length) return null;
    ids.add(credit.creditId); positions.add(key); names.add(name);
    for (const ref of credit.evidenceRefs) {
      const evidence = data.evidence.find(e => e.evidenceId === ref);
      if (!evidence || !sourceValid(evidence) ||
          evidence.releaseId !== target.releaseId || evidence.catalogNumber !== target.catalogNumber || evidence.disc !== target.disc || evidence.track !== target.track ||
          !evidence.roles?.includes(credit.role) || !evidence.locator || !evidence.title ||
          (credit.verificationStatus === "verified" && evidence.verificationStatus !== "verified")) return null;
      if (evidence.recordingIdentityEvidenceRef && !target.identityEvidenceRefs?.includes(evidence.recordingIdentityEvidenceRef)) return null;
      if (evidence.kind === "user_confirmation" && ((credit.publishAllowed !== false && !userPublicationApproved(data)) || evidence.purpose !== "credit" || evidence.songId !== song.songId || evidence.relationId !== target.relationId || evidence.confirmation.assertions.creditedNames[credit.displayOrder - 1] !== credit.creditedName)) return null;
    }
  }
  const credits = item.credits.filter(c => c.verificationStatus === "verified" && c.publishAllowed === true);
  const rows = Object.entries(CREDIT_ROLES).flatMap(([role, label]) => {
    const group = credits.filter(c => c.role === role).sort((a, b) => a.displayOrder - b.displayOrder);
    return group.length ? [{ role, label, value: group.map(c => c.creditedName).join("・") }] : [];
  });
  const refs = new Set([...credits.flatMap(c => c.evidenceRefs), ...(rows.length ? target.identityEvidenceRefs || [] : [])]);
  return rows.length ? { rows, recording: target, sources: data.evidence.filter(e => refs.has(e.evidenceId)).map(e => ({ ...e, labels: e.purpose === "recording_identity" ? ["品番・収録位置"] : rows.filter(r => credits.some(c => c.role === r.role && c.evidenceRefs.includes(e.evidenceId))).map(r => r.label) })) } : null;
}

export function songCreditRowsHtml(credits) {
  return (credits?.rows || []).map(row => `<dt data-song-credit="${row.role}">${row.label}</dt><dd data-song-credit="${row.role}">${esc(row.value)}</dd>`).join("");
}

export function songCreditSourcesHtml(credits) {
  if (!credits?.rows.length) return "";
  return `<details class="song-credit-sources"><summary>クレジットの出典</summary><ul>${credits.sources.map(source => `<li>${source.kind === "user_confirmation" ? "ユーザー確認資料" : `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`}<span>（${esc(source.labels.join("・"))}／${esc(source.catalogNumber)}・Disc ${source.disc} Track ${source.track}）</span></li>`).join("")}</ul></details>`;
}

let pending;
export function loadSongCredits(song) {
  pending ||= fetch("data/song-credits.json", { cache: "no-cache", signal: AbortSignal.timeout(3000) })
    .then(response => response.ok ? response.json() : null).catch(() => null);
  return pending.then(data => songCredits(data, song)).catch(() => null);
}
