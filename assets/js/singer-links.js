/**
 * STEP17-A2 歌唱名義URL共通生成。
 * IDを正式経路とし、旧APIレスポンス時だけname/categoryへ退避する。
 */
export function buildSingerUrl(item = {}) {
  const singerId = String(
    item.singerId ||
    item.id ||
    ""
  ).trim();

  if (singerId) {
    return `singer.html?id=${encodeURIComponent(singerId)}`;
  }

  const name = String(
    item.rawName ||
    item.detailName ||
    item.singerName ||
    item.displayName ||
    item.name ||
    ""
  ).trim();

  const category = String(
    item.category || ""
  ).trim();

  const query = new URLSearchParams();
  if (name) query.set("name", name);
  if (category) query.set("category", category);

  return `singer.html?${query.toString()}`;
}
