import { singerDisplayName } from './singer-display.js?v=1.0.0';

// The existing singer-list member mappings are the identity source.
export function individualSingers(catalog) {
  return [...(catalog?.official || []), ...(catalog?.solo || [])].filter(item =>
    ['公式', 'ソロ'].includes(item.category) && item.memberCount === 1 &&
    item.members?.length === 1 && item.memberShorts?.length === 1 &&
    item.members[0].key === item.memberShorts[0] &&
    item.members[0].label === (item.category === '公式' ? item.members[0].character : item.members[0].cast));
}

export function findIndividual(catalog, category, key) {
  const matches = individualSingers(catalog).filter(item => item.category === category && item.memberShorts[0] === key);
  return matches.length === 1 ? matches[0] : null;
}

export function relatedSingers(catalog, id) {
  const all = [...(catalog?.official || []), ...(catalog?.solo || [])];
  const current = all.find(item => item.singerId === id);
  if (!current) return [];
  const person = individualSingers(catalog).some(item => item.singerId === id);
  const groups = [];
  const add = (label, items, collapsed = false, layout) => {
    const unique = [...new Map(items.filter(item => item && item.singerId !== id).map(item => [item.singerId, item])).values()];
    if (unique.length) groups.push({ label, items: unique, collapsed, ...(layout ? { layout } : {}) });
  };
  if (person) {
    const key = current.memberShorts[0];
    add(current.category === '公式' ? '担当キャスト' : 'キャラクター', [findIndividual(catalog, current.category === '公式' ? 'ソロ' : '公式', key)]);
    const units = all.filter(item => item.category === '公式' && item.memberCount === 3 &&
      singerDisplayName(item) && item.memberShorts.includes(key));
    add('関連ユニット', units);
    add('参加した歌唱名義', all.filter(item => item.category === current.category && item.memberCount > 1 &&
      item.performanceCount > 0 && item.memberShorts.includes(key) && !units.some(unit => unit.singerId === item.singerId)), true, 'cards');
    const peerKeys = (catalog.memberFilters?.official || []).map(filter => filter.key);
    const peers = peerKeys.length === 9 && new Set(peerKeys).size === 9
      ? peerKeys.map(peerKey => findIndividual(catalog, current.category, peerKey)) : [];
    add('ほかのメンバー', peers, true);
  } else {
    add('構成メンバー', (current.memberShorts || []).map(key => findIndividual(catalog, current.category, key)));
  }
  return groups;
}
