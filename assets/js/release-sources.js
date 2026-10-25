// Presentation-only relocation of already validated product evidence. No fetch.
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function releaseSourceGroups(records) {
  const groups = new Map(), keys = new Set();
  for (const record of records) {
    const url = new URL(record.url), key = record.owner + ':' + record.key;
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || keys.has(key)) throw Error('RELEASE_SOURCE_BINDING');
    keys.add(key);
    // Keep the original URL verbatim: query, fragment and edition are significant.
    if (!groups.has(record.url)) groups.set(record.url, []);
    groups.get(record.url).push(record);
  }
  return [...groups].map(([url, refs]) => ({ url, refs }));
}
export function releaseSourcesMarkup(records, officialUrl) {
  const groups = releaseSourceGroups(records), others = groups.filter(g => g.url !== officialUrl);
  return others.length ? `<details class="release-source-disclosure"><summary>出典</summary><ul>${others.map(g => `<li><a class="release-official-link" data-release-source-refs="${esc(JSON.stringify(g.refs.map(r => [r.owner,r.key])))}" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${esc([...new Set(g.refs.map(r => r.label))].join('／'))}<span class="site-icon-inline" data-site-icon="external-link" aria-hidden="true"></span></a><p class="release-source-context">${esc([...new Set(g.refs.map(r => r.context).filter(Boolean))].join('／'))}</p></li>`).join('')}</ul></details>` : '';
}
export function consolidateReleaseSources(releaseId, doc = document) {
  const official = doc.getElementById('officialRelease');
  if (!official || !/^R\d{4}$/.test(releaseId)) return;
  const previous = doc.getElementById('releaseSources'), records = previous?.dataset.releaseId === releaseId ? JSON.parse(previous.dataset.releaseSourceRecords) : [], removals = [], notes = [];
  const collect = (owner, block, context, selector = 'a') => {
    if (!block) return;
    for (let i = records.length - 1; i >= 0; i--) if (records[i].owner === owner) records.splice(i,1);
    [...block.querySelectorAll(selector)].forEach((a,i) => records.push({ owner, key: String(i), url: a.getAttribute('href'), label: a.textContent.trim(), context: typeof context === 'function' ? context(a) : context }));
    removals.push(block);
  };
  collect('single',doc.querySelector('#singleProductSection .release-single-sources'),'特典・商品仕様');
  collect('album',doc.querySelector('#albumProductSection .release-single-sources'),'特典・商品仕様');
  collect('bluray',doc.querySelector('#bluRayProductSection .release-bd-source'),'本編・特典・商品仕様');
  for (const edition of doc.querySelectorAll('#bluRayProductSection [data-bd-edition]')) {
    const links = edition.querySelector('.release-bd-links');
    collect('bluray-related-' + edition.dataset.bdEdition,links,edition.querySelector('summary').textContent.trim());
    if (links?.previousElementSibling?.textContent === '関連リンク') removals.push(links.previousElementSibling);
  }
  const sidecar = doc.querySelector('.release-sidecar-sources');
  collect('sidecar',sidecar,a => a.parentElement.querySelector('[data-sidecar-associations]').textContent.trim());
  for (const node of (sidecar || previous)?.querySelectorAll('[data-sidecar-conditions]') || []) notes.push(node.cloneNode(true));
  if (!records.length) return;
  const primary = official.querySelector('.release-official-link'), officialUrl = primary?.getAttribute('href') || '';
  const groups = releaseSourceGroups(records), host = doc.createElement('div');
  host.id = 'releaseSources'; host.dataset.releaseId = releaseId; host.dataset.releaseSourceRecords = JSON.stringify(records);
  host.innerHTML = releaseSourcesMarkup(records,officialUrl);
  if (notes.length) {
    const disclosure = host.querySelector('details'), heading = doc.createElement('p');
    heading.textContent = '一次資料に記載されたソフマップ固有条件';
    disclosure.append(heading,...notes);
  }
  // Commit the relocation only after all evidence has been collected/rendered.
  if (primary) primary.dataset.releaseSourceRefs = JSON.stringify((groups.find(g => g.url === officialUrl)?.refs || []).map(r => [r.owner,r.key]));
  if (previous) previous.replaceWith(host); else official.after(host);
  removals.forEach(node => node.remove());
}
