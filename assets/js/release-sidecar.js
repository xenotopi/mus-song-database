// Optional, explicitly approved overlay. Not a master or recording credit.
const LABELS = Object.freeze({ physicalMedia: "特典媒体", qualifyingProducts: "対象商品", acquisitionCondition: "入手条件" });
const SOURCE_HOSTS = new Set(["akihata.jp", "www.sofmap.com"]);
const DISPLAY_VALUES = Object.freeze({ physicalMedia: "CD", qualifyingProducts: "2期Blu-ray", acquisitionCondition: "全巻特典" });
export function sidecarFields(release, sidecar, local = false) {
  const scope = sidecar?.approvalScope;
  if (!(scope === "public" || local && scope === "local_only") || release?.releaseId !== "R0052" || sidecar?.releaseId !== release.releaseId ||
      sidecar?.schemaVersion !== 1 || !Array.isArray(sidecar.relations)) return [];
  const rows = release.includedSongs || [], ids = new Set();
  if (sidecar.relations.length !== 3) return [];
  const output = [];
  for (const entry of sidecar.relations) {
    if (ids.has(entry.relationId) || !["RT0090", "RT0091", "RT0092"].includes(entry.relationId)) return [];
    ids.add(entry.relationId);
    const matches = rows.filter(row => row.relationId === entry.relationId);
    if (matches.length !== 1 || !matches[0].benefitStore) return [];
    const fields = [];
    for (const [key, field] of Object.entries(entry.fields || {})) {
      if (!Object.hasOwn(LABELS, key) || field?.displayApproval !== scope || field.public !== (scope === "public") ||
          field.verificationStatus !== "partial" || typeof field.value !== "string" || !field.value.trim() ||
          !Array.isArray(field.sources) || !field.sources.length) continue;
      const urls = field.sources.map(source => {
        try { const u = new URL(source.url); return u.protocol === "https:" && !u.username && !u.password && SOURCE_HOSTS.has(u.hostname) && /^2014(?: |店舗別)/.test(source.edition || "") ? u.href : null; } catch { return null; }
      });
      if (urls.some(url => !url)) continue;
      // The reservation condition must never migrate to a different Relation.
      if (entry.relationId !== "RT0091" && /連続予約|第7巻|特装限定版/.test(field.value)) continue;
      fields.push({ key, label: LABELS[key], value: field.value, sources: [...new Set(urls)] });
    }
    output.push({ relationId: entry.relationId, fields });
  }
  return output;
}
const digest = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, "0")).join("");
export async function verifiedSidecarFields(release, sidecar, local = false) {
  const rows = sidecarFields(release, sidecar, local);
  if (!rows.length) return [];
  for (const entry of sidecar.relations) {
    const relation = release.includedSongs.find(row => row.relationId === entry.relationId);
    if (entry.relationBinding !== await digest([release.releaseId, relation.relationId, relation.songId, relation.benefitStore])) return [];
    for (const field of Object.values(entry.fields)) {
      if (field.valueHash !== await digest([field.value, field.sources])) return [];
    }
  }
  return rows;
}
// Display policy only: retain the original verified input and field evidence.
export function sidecarPresentation(row) {
  const sourceGroups = new Map(), conditions = [];
  const fields = row.fields.map(field => {
    for (const url of field.sources) {
      if (!sourceGroups.has(url)) sourceGroups.set(url, { url, labels: [] });
      const group = sourceGroups.get(url);
      if (!group.labels.includes(field.label)) group.labels.push(field.label);
    }
    if (field.value !== DISPLAY_VALUES[field.key]) conditions.push({ label: field.label, value: field.value });
    return { key: field.key, label: field.label, value: DISPLAY_VALUES[field.key] };
  });
  return { fields, sourceGroups: [...sourceGroups.values()], conditions };
}
export async function attachReleaseSidecar(release, host, options = {}) {
  if (release?.releaseId !== "R0052" || !host) return;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  try {
    const response = await (options.fetch || fetch)("data/release-sidecars/R0052.json", { cache: "no-cache", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const rows = await verifiedSidecarFields(release, await response.json(), local);
    for (const row of rows) {
      const links = [...host.querySelectorAll(".release-included-song-row")].filter(link => link.dataset.relationId === row.relationId);
      if (links.length !== 1 || !row.fields.length) continue;
      const link = links[0];
      if (!link.isConnected || link.nextElementSibling?.classList.contains("release-sidecar-info")) continue;
      const block = document.createElement("div"); block.className = "release-sidecar-info";
      const dl = document.createElement("dl"), details = document.createElement("details"), summary = document.createElement("summary");
      const presentation = sidecarPresentation(row);
      summary.textContent = "出典"; details.open = false; details.append(summary);
      for (const field of presentation.fields) {
        const pair = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
        pair.dataset.sidecarField = field.key; dt.textContent = field.label; dd.textContent = field.value; pair.append(dt, dd); dl.append(pair);
      }
      for (const source of presentation.sourceGroups) {
        const a = document.createElement("a"); a.href = source.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.textContent = (new URL(source.url).hostname === "www.sofmap.com" ? "ソフマップ 商品案内" : "畑亜貴 公式作品一覧") + "（" + source.labels.join("・") + "）";
        details.append(a);
      }
      if (presentation.conditions.length) {
        const heading = document.createElement("p"), conditions = document.createElement("dl");
        heading.textContent = "一次資料に記載されたソフマップ固有条件";
        for (const field of presentation.conditions) {
          const pair = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
          dt.textContent = field.label; dd.textContent = field.value; pair.append(dt, dd); conditions.append(pair);
        }
        details.append(heading, conditions);
      }
      block.append(dl, details); link.after(block);
    }
  } catch { /* Optional supplement must never clear successful Release content. */ }
}
