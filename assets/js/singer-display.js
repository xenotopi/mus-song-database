// Presentation only. IDs, original names, membership and statistics stay intact.
const UNIT_NAMES = Object.freeze({ SN0007: "Printemps", SN0011: "lily white", SN0013: "BiBi" });
export function singerDisplayName(item = {}, fallback = "") {
  const id = String(item?.singerId || item?.id || "").trim();
  return Object.hasOwn(UNIT_NAMES, id) ? UNIT_NAMES[id] : String(fallback || "");
}
export function singerDisplaySearchText(item = {}) {
  return [singerDisplayName(item), item.displayName, item.rawName, item.singerName,
    ...(item.members || []).map(member => member.label)].filter(Boolean).join(" ");
}
