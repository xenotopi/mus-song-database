// Product facts only. This module never creates Songs, Relations or performers.
const targetIds = new Set(['R0021','R0023','R0024','R0025','R0028','R0030','R0031','R0039','R0042','R0043','R0044','R0046','R0048','R0051','R0063']);
// Preserve historical source records in the JSON, but do not offer dead navigation.
const unavailableSourceUrls = new Set([
  'https://www.lovelive-anime.jp/otonokizaka/bd/tv1st/sp_4thlive.html',
  'https://www.lovelive-anime.jp/otonokizaka/bd/movie/sp_finallive.html'
]);
const check = (ok, reason) => { if (!ok) throw new Error(reason); };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2,'0')).join('');
export async function resolveBluRayProduct(release, data) {
  check(data?.schemaVersion === 1 && data.scope === 'release-bluray-product-facts-only' && Array.isArray(data.releases), 'BLURAY_SCHEMA');
  const matches = data.releases.filter(r => r.releaseId === release.releaseId);
  if (!matches.length) { check(!targetIds.has(release.releaseId), 'BLURAY_MISSING_TARGET'); return null; }
  check(matches.length === 1 && targetIds.has(release.releaseId), 'BLURAY_RELEASE_SET');
  const item = matches[0];
  check(item.releaseName === release.releaseName && item.releaseDate === release.releaseDate && item.source?.url === release.officialReleaseUrl &&
    /^https:\/\/www\.lovelive-anime\.jp\/otonokizaka\/bd\/(?:tv1st|tv2nd|movie)\/#bd0[1-7]$/.test(item.source.url) &&
    item.source.verification === 'official-product-page-reviewed' && /^[a-f0-9]{64}$/.test(item.source.contentSha256), 'BLURAY_RELEASE_SOURCE');
  check(item.editions?.length === 2 && item.editions[0].key === 'limited' && item.editions[1].key === 'regular' &&
    item.editions[0].bonusCD === 'bonusCD' && item.editions[1].bonusCD === null, 'BLURAY_EDITIONS');
  check(item.bonusCD?.edition === 'limited' && item.bonusCD.disc === 1 && item.bonusCD.tracks?.length === 2, 'BLURAY_CD');
  check(typeof item.bonusCD.officialName === 'string' && item.bonusCD.officialName &&
    item.editions.every(e => Array.isArray(e.relatedLinks) && e.relatedLinks.every(l => l.label && l.edition === e.key &&
      /^https?:$/.test(new URL(l.url).protocol) && ['www.lovelive-anime.jp','www.youtube.com','youtu.be','www.bandaivisual.co.jp'].includes(new URL(l.url).hostname) && new URL(l.sourceHref,item.source.url).href === l.url)), 'BLURAY_SOURCE_LINKS');
  const used = new Set();
  for (const [i, track] of item.bonusCD.tracks.entries()) {
    check(track.track === i + 1 && track.title && !Object.hasOwn(track,'songId') && !Object.hasOwn(track,'singerId'), 'BLURAY_TRACK');
    if (track.relationId === null) { check(i === 1 && track.version === 'Off Vocal' && track.relationBinding === null, 'BLURAY_UNLINKED'); continue; }
    const rows = release.includedSongs.filter(r => r.relationId === track.relationId);
    check(i === 0 && rows.length === 1 && !used.has(track.relationId) && await hash(rows[0]) === track.relationBinding &&
      track.title === (rows[0].displayName || rows[0].songName) && track.version === null, 'BLURAY_RELATION_BINDING'); used.add(track.relationId);
    check(typeof track.officialSinger === 'string' && track.officialSinger && typeof track.sourceCreditText === 'string' && track.sourceCreditText.includes(track.officialSinger), 'BLURAY_OFFICIAL_CREDIT');
  }
  check(used.size === release.includedSongs.length, 'BLURAY_RELATION_COVERAGE');
  return item;
}
// Hide editorial commentary, retaining the complete source facts in the JSON.
const productDetail = value => value === '発売当時の封入物' ? '' : String(value || '').replace('（発売当時の条件）','');
export function formatIllustrationCredit(credit) {
  const name = String(credit.name).replace(/西田亜沙子(?:先生)*/g,'西田亜沙子先生');
  return `${credit.role} ${name} ${credit.assignment}`;
}
function factDetail(fact) {
  if (fact.historical && /申込|応募|抽選/.test(fact.label)) return '';
  if (fact.credit) return formatIllustrationCredit(fact.credit);
  if (fact.label === 'ファイブクロス' && fact.officialName === 'ファイブクロス' + fact.detail) return '';
  const detail = productDetail(fact.detail);
  return (fact.sourceRole ? fact.sourceRole + '・' : '') + (fact.benefitContent ? fact.benefitContent + '／' : '') + detail + (fact.eventInfo ? (detail ? '／' : '') + fact.eventInfo.description : '');
}
const facts = (rows, field) => rows.length ? `<ul class="release-bd-facts" data-bd-field="${field}">${rows.map(r => `<li${r.historical ? ' data-bd-historical="true"' : ''}><span class="release-bd-fact-label">${esc(r.officialName || r.label)}</span>${factDetail(r) ? `<span class="release-bd-fact-detail">${esc(factDetail(r))}</span>` : ''}${r.performers?.length ? `<p class="release-bd-performers">出演：${esc(r.performers.join('、'))}</p>` : ''}${r.tracks?.length ? `<details class="release-bd-video-list"><summary>収録映像の楽曲一覧（${r.tracks.length}曲）</summary><ol>${r.tracks.map(t => `<li value="${t.number}">${esc(t.title)}${t.note ? ` <small>（${esc(t.note)}）</small>` : ''}</li>`).join('')}</ol></details>` : ''}</li>`).join('')}</ul>` : '';
function editionHtml(e, tv = false) {
  e = {...e, relatedLinks: e.relatedLinks.filter(link => !unavailableSourceUrls.has(link.url))};
  const key = `editions.${e.key}`;
  return `<details class="release-bd-edition" data-bd-edition="${e.key}"${!tv && e.key === 'limited' ? ' open' : ''}><summary>${esc(e.label)}</summary><div class="release-bd-edition-body"><dl class="release-bd-spec-grid"><div><dt>品番</dt><dd data-bd-field="${key}.catalogNumber">${esc(e.catalogNumber)}</dd></div><div><dt>掲載時価格</dt><dd data-bd-field="${key}.price">${Number(e.price.amount).toLocaleString('ja-JP')}円（税抜）</dd></div></dl>${e.included.length ? `<h4>封入特典</h4>${facts(e.included,key+'.included')}` : ''}${e.supplementaryDiscs.map((d,i) => `<div class="release-bd-supplement"><h4>${esc(d.label)}（${esc(d.medium)}）</h4>${facts(d.items,key+'.supplementaryDiscs.'+i)}<p class="release-bd-performers">出演：${esc(d.performers.join('、'))}</p></div>`).join('')}${e.videoExtras.length ? `<h4>映像特典</h4>${facts(e.videoExtras,key+'.videoExtras')}` : ''}${e.audioExtras.length ? `<h4>音声特典</h4>${facts(e.audioExtras,key+'.audioExtras')}` : ''}<h4>商品仕様</h4>${facts(e.specifications,key+'.specifications')}${e.relatedLinks?.length ? `<h4>関連リンク</h4><ul class="release-bd-links">${e.relatedLinks.map(link=>`<li><a data-bd-related-link href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}<span class="site-icon-inline" data-site-icon="external-link" aria-hidden="true"></span></a></li>`).join('')}</ul>` : ''}</div></details>`;
}
export function renderBluRayProduct(item, release) {
  const host = document.createElement('section');
  host.id = 'bluRayProductSection'; host.className = 'release-card release-bluray'; host.dataset.releaseBlurayReady = release.releaseId; host.setAttribute('aria-labelledby','bluRayProductHeading');
  host.innerHTML = `<p class="release-section-kicker">BLU-RAY DETAILS</p><h2 id="bluRayProductHeading">本編・特典・商品仕様</h2>${item.mainFeature.type === 'tv' ? '' : `<h3>本編収録情報</h3><p data-bd-main-movie>${esc(item.mainFeature.title)}（本編）</p>`}<details class="release-bd-cd"${item.mainFeature.type === 'tv' ? ' open' : ''}><summary>特典CDの収録情報（${esc(item.editions[0].label)}・全${item.bonusCD.tracks.length}トラック）</summary><p class="release-bd-cd-name" data-bd-cd-name>${esc(item.bonusCD.officialName)}</p><ol class="release-bd-cd-tracks">${item.bonusCD.tracks.map(t => {
    const row = release.includedSongs.find(r => r.relationId === t.relationId);
    if (row && item.mainFeature.type === 'tv') return `<li data-bd-cd-track="${t.track}" data-bd-cd-disc="${item.bonusCD.disc}" data-bd-card-slot="${esc(row.relationId)}"><span class="release-bd-track-number">${t.track}</span></li>`;
    return `<li data-bd-cd-track="${t.track}" data-bd-cd-disc="${item.bonusCD.disc}"><span class="release-bd-track-number">${t.track}</span>${row ? `<span class="release-bd-track-copy"><a class="release-bd-song-link" data-bd-relation="${esc(row.relationId)}" href="song/${esc(row.songId)}.html">${esc(row.displayName || row.songName)}<span class="site-icon-inline mus-link-chevron" data-site-icon="chevron-right" aria-hidden="true"></span></a><span class="release-bd-vocal" data-bd-official-singer>歌唱：${esc(t.officialSinger)}</span></span>` : `<span class="release-bd-plain-track">${esc(t.title)}</span>`}</li>`;
  }).join('')}</ol></details><div class="release-bd-editions">${item.editions.map(e => editionHtml(e, item.mainFeature.type === 'tv')).join('')}</div><details class="release-bd-history"><summary>発売当時の予約情報</summary><p>店頭予約締切：<time datetime="${item.historicalReservationDeadline}">${esc(item.historicalReservationDeadline)}</time></p></details><p class="release-bd-source"><a href="${esc(item.source.url)}" target="_blank" rel="noopener noreferrer">出典：公式商品ページ（${esc(item.series)}${item.volume ? ` 第${item.volume}巻` : ''}）<span class="site-icon-inline" data-site-icon="external-link" aria-hidden="true"></span></a></p>`;
  return host;
}
// Relocate the registered cards, rather than re-creating an incomplete copy.
export function applyTvBluRayLayout(item, release, section) {
  if (item.mainFeature.type !== 'tv') return;
  const included = document.getElementById('includedSongsContent');
  check(included && section, 'BLURAY_TV_HOST');
  const rows = item.bonusCD.tracks.filter(t => t.relationId).map(t => ({
    slot: section.querySelector(`[data-bd-card-slot="${t.relationId}"]`),
    row: included.querySelector(`[data-relation-id="${t.relationId}"]`)
  }));
  check(rows.every(r => r.slot && r.row), 'BLURAY_TV_CARD_MISSING');
  const notes = [...included.querySelectorAll('.release-registration-details')];
  rows.forEach(({slot,row}) => slot.append(row));
  section.querySelector('.release-bd-cd').append(...notes);
  included.innerHTML = '<h3>本編</h3><ol class="release-bd-episodes">' + item.mainFeature.episodes.map(ep => `<li value="${ep.episode}" data-bd-episode="${ep.episode}">第${ep.episode}話「${esc(ep.title)}」</li>`).join('') + '</ol>';
  included.dataset.releaseBdMain = release.releaseId;
  document.getElementById('includedSongsCount').textContent = '本編 · ' + item.mainFeature.episodes.length + '話';
}
let request;
export async function loadBluRayProduct(release) {
  if (!targetIds.has(release.releaseId)) return null;
  try {
    request ||= fetch(new URL('../../data/release-bluray-products.json?v=1.1.0',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(8000)}).then(r => { if(!r.ok)throw Error('BLURAY_HTTP'); return r.json(); }).catch(e => { request=null; throw e; });
    return await resolveBluRayProduct(release,await request);
  } catch (error) {
    if (window.__MUSDB_RELEASE_CAPTURE__) throw error;
    return null;
  }
}
export async function attachReleaseBluRay(release, item) {
  if (!targetIds.has(release.releaseId)) return null;
  const existing = document.getElementById('bluRayProductSection');
  item ??= await loadBluRayProduct(release);
  if (!item) return existing || null;
  const section = renderBluRayProduct(item,release), anchor = document.getElementById('includedSongsSection');
  check(anchor, 'BLURAY_HOST');
  applyTvBluRayLayout(item,release,section);
  if (existing) existing.replaceWith(section); else anchor.after(section);
  return section;
}
