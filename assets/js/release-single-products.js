
import { renderProductFacts } from './release-product-facts.js?v=1.0.0';
// Product-only inventory: never changes snapshot Relations, Song IDs or vocals.
const check = (ok, message) => { if (!ok) throw Error(message); };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const digest = async row => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(row))))].map(n=>n.toString(16).padStart(2,'0')).join('');
const sourceAllowed = source => {
  try { const u=new URL(source.url);return u.protocol==='https:'&&['www.lovelive-anime.jp','catalog.bandainamcomusiclive.co.jp','www.sunrise-inc.co.jp'].includes(u.hostname)&&/^[a-f0-9]{64}$/.test(source.sha256)&&Number.isFinite(Date.parse(source.checkedAt)); } catch { return false; }
};
export async function resolveSingleProduct(release, data) {
  check(data?.schemaVersion===1&&data.scope==='release-single-product-facts-only'&&Array.isArray(data.releases),'SINGLE_SCHEMA');
  check(new Set(data.releases.map(r=>r.releaseId)).size===data.releases.length,'SINGLE_DUPLICATE');
  const item=data.releases.find(r=>r.releaseId===release.releaseId);
  if(!item) { check(release.releaseType!=='シングル','SINGLE_MISSING');return null; }
  check(release.releaseType==='シングル'&&item.releaseName===release.releaseName&&item.releaseDate===release.releaseDate,'SINGLE_RELEASE');
  check(item.sources?.length>=2&&item.sources.every(sourceAllowed)&&new Set(item.sources.map(s=>s.key)).size===item.sources.length&&item.sources[0].key==='official'&&item.sources[0].url===release.officialReleaseUrl,'SINGLE_SOURCE');
  const refs=new Set(item.sources.map(s=>s.key)),seen=new Set();
  check(item.cd?.medium==='CD'&&Array.isArray(item.cd.tracks)&&item.cd.tracks.length>0,'SINGLE_CD');
  for(const [i,t] of item.cd.tracks.entries()) {
    check(t.track===i+1&&typeof t.title==='string'&&t.title&&refs.has(t.sourceRef)&&['song','off-vocal','drama'].includes(t.kind)&&!Object.hasOwn(t,'songId')&&!Object.hasOwn(t,'singerId'),'SINGLE_TRACK');
    if(t.relationId===null){check(t.relationBinding===null&&t.kind!=='song','SINGLE_PLAIN');continue;}
    const rows=release.includedSongs.filter(r=>r.relationId===t.relationId);
    check(rows.length===1&&!seen.has(t.relationId)&&rows[0].disc===null&&rows[0].track===null&&await digest(rows[0])===t.relationBinding&&t.kind==='song','SINGLE_BINDING');seen.add(t.relationId);
  }
  check(seen.size===release.includedSongs.length,'SINGLE_RELATION_COVERAGE');
  check(item.editions?.length>0&&new Set(item.editions.map(e=>e.key)).size===item.editions.length,'SINGLE_EDITIONS');
  for(const e of item.editions){check(e.key===e.catalogNumber&&/^LACM-\d+$/.test(e.catalogNumber)&&e.label&&refs.has(e.sourceRef)&&Number.isInteger(e.price?.amount)&&e.price.amount>0&&['inclusive','exclusive'].includes(e.price.tax)&&refs.has(e.price.sourceRef)&&(e.price.exclusiveAmount===null||Number.isInteger(e.price.exclusiveAmount)&&e.price.exclusiveAmount>0),'SINGLE_EDITION');for(const key of ['included','videoExtras','specifications'])check(Array.isArray(e[key])&&e[key].every(f=>typeof f.text==='string'&&f.text&&refs.has(f.sourceRef)&&(key!=='included'||f.historical===true&&typeof f.initialProduction==='boolean')),'SINGLE_FACT');}
  return item;
}
let request;
export async function loadSingleProduct(release) {
  if(release.releaseType!=='シングル')return null;
  try {
    request ||= fetch(new URL('../../data/release-single-products.json?v=1.0.0',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw Error('SINGLE_HTTP');return r.json();}).catch(e=>{request=null;throw e;});
    return await resolveSingleProduct(release,await request);
  } catch(error) { if(window.__MUSDB_RELEASE_CAPTURE__)throw error;return null; }
}
export const singlePrice = price => `${price.amount.toLocaleString('ja-JP')}円（${price.tax==='inclusive'?'税込':'税抜'}）${price.exclusiveAmount===null?'':`／${price.exclusiveAmount.toLocaleString('ja-JP')}円（税抜）`}`;
function productSection(item) {
  const section=document.createElement('section');section.id='singleProductSection';section.className='release-card release-single-product';section.dataset.releaseSingleReady=item.releaseId;section.setAttribute('aria-labelledby','singleProductHeading');
  section.innerHTML=`<p class="release-section-kicker">PRODUCT DETAILS</p><h2 id="singleProductHeading">特典・商品仕様</h2>${item.editions.map((e,i)=>`<details class="release-single-edition" data-single-edition="${esc(e.key)}"${i?'':' open'}><summary>${esc(e.label)}</summary><div class="release-single-edition-body"><dl class="release-single-spec-grid"><div><dt>品番</dt><dd data-single-catalog>${esc(e.catalogNumber)}</dd></div><div><dt>発売時掲載価格</dt><dd data-single-price>${esc(singlePrice(e.price))}</dd></div></dl>${e.videoExtras.length?`<h3>${e.label.startsWith('BD')?'Blu-ray':'DVD'}収録内容</h3>${renderProductFacts(e.videoExtras,'videoExtras')}`:''}${e.included.length?`<h3>${e.included.every(f=>f.initialProduction)?'初回生産分の封入特典':'封入特典'}（発売当時）</h3>${renderProductFacts(e.included,'included')}`:''}${e.specifications.length?`<h3>商品仕様</h3>${renderProductFacts(e.specifications,'specifications')}`:''}</div></details>`).join('')}<details class="release-single-sources"><summary>出典</summary><ul>${item.sources.map((s,i)=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${i===0?'公式商品情報':s.key==='supplement'?'公式発売時情報':`発売元：${esc(s.key)}`}<span class="site-icon-inline" data-site-icon="external-link" aria-hidden="true"></span></a></li>`).join('')}</ul></details>`;
  return section;
}
export function applySingleProduct(release, item) {
  if(!item)return null;
  const host=document.getElementById('includedSongsContent');check(host,'SINGLE_DOM_HOST');
  const lists=host.querySelectorAll('.release-included-list'),links=[...host.querySelectorAll('.release-included-song-row')];
  check(lists?.length===1&&links.length===release.includedSongs.length,'SINGLE_DOM_HOST');
  const map=new Map(links.map(a=>[a.dataset.relationId,a]));check(map.size===links.length&&item.cd.tracks.every(t=>!t.relationId||map.has(t.relationId)),'SINGLE_DOM_BINDING');
  const fragment=document.createDocumentFragment();
  for(const t of item.cd.tracks){const row=document.createElement('div');row.className='release-single-track';row.dataset.singleTrack=t.track;row.setAttribute('role','listitem');const number=document.createElement('span');number.className='release-single-track-number';number.textContent=t.track;row.append(number);if(t.relationId)row.append(map.get(t.relationId));else{const title=document.createElement('span');title.className='release-single-plain-track';title.textContent=t.title;row.append(title);}fragment.append(row);}
  lists[0].replaceChildren(fragment);lists[0].classList.add('release-single-track-list');lists[0].setAttribute('role','list');host.dataset.releaseSingleInventory=release.releaseId;
  // This number is the product inventory, not a new Relation/Song total.
  document.getElementById('includedSongsCount').textContent=`CD · ${item.cd.tracks.length}トラック`;
  const notes=host.querySelector('.release-registration-details');
  // The master remains unchanged; its missing-position notice no longer describes this sourced inventory.
  notes?.querySelectorAll('.release-registration-note').forEach(n=>{if(n.textContent==='Track番号は未登録です。')n.remove();});
  if(notes&&!notes.querySelector('.release-registration-note'))notes.remove();
  const existing=document.getElementById('singleProductSection');if(existing)check(existing.dataset.releaseSingleReady===release.releaseId,'SINGLE_DOM_ID');
  const section=productSection(item);if(existing)existing.replaceWith(section);else document.getElementById('includedSongsSection').after(section);return section;
}
