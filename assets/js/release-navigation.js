// Release-only navigation: IDs/date fields from the existing list, never titles
// interpreted as relationships. Static completed navigation is the fallback.
const escape = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export function validReleaseDate(value) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function releaseNavigationModel(id, list, data, count = 114) {
  if (!Array.isArray(list) || list.length !== count || new Set(list.map(r => r?.releaseId)).size !== count ||
      list.some(r => !/^R\d{4}$/.test(r?.releaseId || "") || !String(r.releaseName || "").trim())) return null;
  const current = list.find(r => r.releaseId === id); if (!current) return null;
  const ordered = list.filter(r => validReleaseDate(r.releaseDate)).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.releaseId.localeCompare(b.releaseId));
  const at = ordered.findIndex(r => r.releaseId === id);
  const model = { current, previous: at > 0 ? ordered[at - 1] : null, next: at >= 0 ? ordered[at + 1] || null : null, dateKnown: at >= 0, groups: [] };
  if (!data) return model;
  if (data.schemaVersion !== 1 || data.scope !== "release-navigation-only" || !Array.isArray(data.groups)) throw new Error("RELEASE_NAV_SCHEMA");
  const keys = new Set(), ids = new Set(list.map(r => r.releaseId));
  for (const group of data.groups) {
    if (!/^[a-z][a-z0-9-]*$/.test(group.key || "") || keys.has(group.key) || !group.label?.trim() || !Array.isArray(group.members) || group.members.length < 2 ||
        group.members.some(m => !ids.has(m.releaseId) || (m.label != null && typeof m.label !== "string")) || new Set(group.members.map(m => m.releaseId)).size !== group.members.length) throw new Error("RELEASE_NAV_GROUP");
    keys.add(group.key);
  }
  const used = new Set([id]);
  if (ids.has(current.parentReleaseId)) used.add(current.parentReleaseId);
  if (current.editionType === "memorial_box") list.filter(r => r.parentReleaseId === id).forEach(r => used.add(r.releaseId));
  if (current.releaseSeries?.id) list.filter(r => r.releaseSeries?.id === current.releaseSeries.id).forEach(r => used.add(r.releaseId));
  for (const group of data.groups.filter(g => g.members.some(m => m.releaseId === id))) {
    const members = group.members.filter(m => !used.has(m.releaseId)).map(m => ({ ...list.find(r => r.releaseId === m.releaseId), context: m.label || "" }));
    members.forEach(r => used.add(r.releaseId));
    if (members.length) model.groups.push({ key: group.key, label: group.label, members });
  }
  return model;
}
const arrow = kind => `<span class="site-icon-inline" data-site-icon="${kind}" aria-hidden="true"></span>`;
const kind = r => r.releaseType || r.classification || "";
export function applyReleaseNavigation(release, list, data, doc = document) {
  const nav = doc.getElementById("releaseChronologyNav"), related = doc.getElementById("relatedReleasesSection");
  // A failed/partial supplemental read must not replace completed static links.
  if (!data && nav?.dataset.releaseNavigationReady) return;
  const model = releaseNavigationModel(release.releaseId, list, data); if (!model || !nav) return;
  const side = (r, direction, label) => {
    const tag = r ? "a" : "div", attrs = r ? `href="release/${r.releaseId}.html" rel="${direction}"` : 'aria-disabled="true"';
    return `<${tag} class="release-neighbor release-neighbor-${direction}" ${attrs}>${arrow(direction === "prev" ? "arrow-left" : "arrow-right")}<span class="release-neighbor-copy"><span class="release-neighbor-label">${label}</span><span class="release-neighbor-title">${r ? escape(r.releaseName) : model.dateKnown ? (direction === "prev" ? "前の作品はありません" : "次の作品はありません") : "発売日未登録・不正のため表示できません"}</span>${r ? `<time datetime="${r.releaseDate}">${r.releaseDate.replaceAll("-", "/")}</time>` : ""}</span></${tag}>`;
  };
  nav.innerHTML = side(model.previous, "prev", "前の作品") + side(model.next, "next", "次の作品"); nav.hidden = false; if (data) nav.dataset.releaseNavigationReady = "true";
  const host = doc.getElementById("curatedReleasesHost"), currentHost = doc.getElementById("relatedCurrentHost");
  if (!host || !related || !currentHost) return;
  host.innerHTML = model.groups.map(g => `<section class="release-related" data-release-nav-group="${g.key}"><h3>${escape(g.label)}</h3><div class="release-child-list">${g.members.map(r => `<a class="release-child-row release-curated-row mus-card-link" href="release/${r.releaseId}.html"><span class="release-related-title">${escape(r.releaseName)}</span>${arrow("chevron-right")}<span class="release-related-kind">${escape([r.context, kind(r)].filter(Boolean).join(" · "))}</span></a>`).join("")}</div></section>`).join("");
  for (const row of related.querySelectorAll("#parentReleaseHost a, #childReleasesHost a, #seriesReleasesHost a")) {
    const rid = /^release\/(R\d{4})\.html$/.exec(row.getAttribute("href") || "")?.[1], item = list.find(r => r.releaseId === rid);
    if (item && !row.querySelector(".release-related-kind")) { const meta = doc.createElement("span"); meta.className = "release-related-kind"; meta.textContent = kind(item); row.append(meta); }
  }
  const hasLinks = related.querySelectorAll("a[href]").length > 0;
  currentHost.innerHTML = hasLinks ? `<div class="release-related-current" aria-current="true"><span class="release-related-title">${escape(model.current.releaseName)}</span><span class="release-current-label">閲覧中</span><span class="release-related-kind">${escape(kind(model.current))}</span></div>` : "";
  related.hidden = !hasLinks; if (data) related.dataset.releaseNavigationReady = "true";
}
let request;
export async function loadReleaseNavigation() {
  try {
    request ||= fetch(new URL("../../data/release-navigation.json?v=1.0.0", import.meta.url), { cache: "no-cache", signal: AbortSignal.timeout(8000) }).then(r => { if (!r.ok) throw new Error("RELEASE_NAV_HTTP"); return r.json(); }).catch(e => { request = null; throw e; });
    return await request;
  } catch (error) { if (window.__MUSDB_RELEASE_CAPTURE__) throw error; return null; }
}
