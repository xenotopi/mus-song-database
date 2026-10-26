// Supplementary product inventory. Never creates a Song, Relation or performance.
const targets = new Set(['R0016','R0041','R0054','R0055','R0056','R0060','R0069','R0073','R0074','R0075','R0076','R0079','R0080','R0083','R0084','R0085','R0086','R0087']);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const check = (ok,why) => { if(!ok)throw Error(why); };
const digest = async v => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function resolveMediaProduct(release,data) {
  check(data?.schemaVersion===1 && data.scope==='release-media-product-facts-only' && Array.isArray(data.releases),'MEDIA_SCHEMA');
  const matches=data.releases.filter(x=>x.releaseId===release.releaseId);
  if(!matches.length){check(!targets.has(release.releaseId),'MEDIA_MISSING_TARGET');return null;}
  check(matches.length===1 && targets.has(release.releaseId),'MEDIA_IDENTITY');
  const item=matches[0];
  check(item.releaseName===release.releaseName && item.relationBinding===await digest(release.includedSongs),'MEDIA_RELATION_BINDING');
  check(['radio','live','collection','ticket','fandisc'].includes(item.kind) && item.summary && item.sections?.length && item.sources?.length,'MEDIA_PRODUCT');
  const keys=new Set();
  for(const s of item.sources){const url=new URL(s.url);check(url.protocol==='https:' && !url.username && !url.password && s.key && !keys.has(s.key) && s.label && ['official','press','retailer'].includes(s.kind),'MEDIA_SOURCE');keys.add(s.key);}
  const bound=new Set();
  for(const section of item.sections){
    check(section.label && keys.has(section.sourceKey) && Array.isArray(section.entries),'MEDIA_SECTION');
    const numbers=new Set();
    for(const entry of section.entries){
      check(Number.isInteger(entry.number) && entry.number>0 && !numbers.has(entry.number) && entry.title,'MEDIA_POSITION');numbers.add(entry.number);
      check(!Object.hasOwn(entry,'singerId'),'MEDIA_NO_NEW_SINGER');
      if(entry.relationId){const rows=release.includedSongs.filter(r=>r.relationId===entry.relationId);check(rows.length===1 && !bound.has(entry.relationId) && entry.title===(rows[0].displayName||rows[0].songName) && !entry.songId,'MEDIA_AUDIO_BINDING');bound.add(entry.relationId);}
      else if(entry.songId)check(item.kind==='collection' && /^S\d{3}$/.test(entry.songId),'MEDIA_WORK_LINK');
    }
  }
  check(!['radio','ticket'].includes(item.kind) || bound.size===release.includedSongs.length,'MEDIA_AUDIO_COVERAGE');
  check(item.editions.every(e=>e.label && keys.has(e.sourceKey) && e.facts.every(f=>typeof f==='string' && f)),'MEDIA_EDITION');
  return item;
}
let request;
export async function loadMediaProduct(release) {
  if(!targets.has(release.releaseId))return null;
  try {
    request ||= fetch(new URL('../../data/release-media-products.json?v=1.0.1',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw Error('MEDIA_HTTP');return r.json();}).catch(e=>{request=null;throw e;});
    return await resolveMediaProduct(release,await request);
  } catch(error){if(window.__MUSDB_RELEASE_CAPTURE__)throw error;return null;}
}
const arrow='<span class="site-icon-inline mus-link-chevron" data-site-icon="chevron-right" aria-hidden="true"></span>';
function workLinkTitle(title) {
  const letters = Array.from(title);
  return `<span class="mus-title-chip">${esc(letters.slice(0,-2).join(''))}<span class="mus-title-tail">${esc(letters.slice(-2).join(''))}${arrow}</span></span>`;
}
export function mediaCountLabel(item) {
  if(item.kind==='fandisc')return '映像 · '+item.sections.length+'項目';
  if(item.kind==='radio')return item.sections.length+' Disc';
  if(item.kind==='collection')return '映像 · '+item.sections[0].entries.length+'項目';
  if(item.kind==='live')return 'ライブ映像';
  return ''; // Retain the registered-song count until the complete CD inventory is verified.
}
export function mediaInventoryMarkup(item) {
  const rows=s=>s.entries.length?`<ol class="release-media-tracks${item.kind==='collection'?' release-work-track-list':''}">${s.entries.map(t=>t.relationId?`<li class="release-media-track" data-media-position="${t.number}" data-media-slot="${esc(t.relationId)}"><span class="release-media-track-number">${t.number}</span></li>`:t.songId?`<li class="release-media-work-track" data-media-position="${t.number}"><a class="release-work-track-row mus-card-link mus-chip-link" href="song/${esc(t.songId)}.html"><span class="release-track-number">${t.number}</span><span class="release-included-song-copy">${workLinkTitle(t.title)}</span></a></li>`:`<li class="release-media-track" data-media-position="${t.number}"><span class="release-track-number release-single-track-number">${t.number}</span><span class="release-media-title">${esc(t.title)}</span></li>`).join('')}</ol>`:'';
  return `<div class="release-media-inventory release-bluray" data-release-media-ready="${item.releaseId}"><p class="release-media-intro">${esc(item.summary)}</p>${item.sections.map((s,i)=>`<details class="release-bd-cd release-media-disc" data-media-section="${i}"${i===0||!s.entries.length?' open':''}><summary>${esc(s.label)}${s.entries.length?` · ${s.entries.length}項目`:''}</summary>${s.description?`<p class="release-media-description">${esc(s.description)}</p>`:''}${rows(s)}</details>`).join('')}</div>`;
}
export function applyMediaProduct(release,item) {
  if(!item)return null;
  const included=document.getElementById('includedSongsContent'),section=document.getElementById('includedSongsSection');
  check(included && section,'MEDIA_HOST');
  const bound=item.sections.flatMap(s=>s.entries).filter(e=>e.relationId),rows=bound.map(t=>included.querySelector(`[data-relation-id="${t.relationId}"]`));
  check(rows.every(Boolean),'MEDIA_REGISTERED_CARD_MISSING');
  const inventory=document.createElement('div');inventory.innerHTML=mediaInventoryMarkup(item);
  const products=document.createElement('section');products.id='mediaProductSection';products.className='release-card release-single-product release-media-products';products.setAttribute('aria-labelledby','mediaProductHeading');products.dataset.releaseMediaProduct=release.releaseId;
  products.innerHTML=`<p class="release-section-kicker">PRODUCT DETAILS</p><h2 id="mediaProductHeading">特典・商品仕様</h2>${item.editions.map((e,i)=>`<details class="release-single-edition" data-media-edition="${i}"><summary>${esc(e.label)}</summary><div class="release-single-edition-body"><ul class="release-single-facts">${e.facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></div></details>`).join('')}<div class="release-media-sources">${item.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join('')}</div>`;
  if(!item.editions.length)inventory.firstElementChild.append(products.querySelector('.release-media-sources'));
  // Build and check everything before moving the original cards. Their title,
  // vocal, Track, Mix and origin metadata stay on the same nodes.
  bound.forEach((t,i)=>inventory.querySelector(`[data-media-slot="${t.relationId}"]`).append(rows[i]));
  included.querySelector('.release-media-inventory')?.remove();
  included.querySelector('.release-media-audio-heading')?.remove();
  if(bound.length){
    const notes=[...included.querySelectorAll('.release-registration-details'),...included.querySelectorAll('.release-coverage-note')];
    included.innerHTML='';included.append(inventory.firstElementChild,...notes);
  } else {
    if(release.includedSongs.length){const heading=document.createElement('h3');heading.className='release-media-audio-heading';heading.textContent='収録楽曲';included.prepend(heading);}
    included.prepend(inventory.firstElementChild);
  }
  included.dataset.releaseMediaReady=release.releaseId;
  section.hidden=false;section.className=section.className.split(/\s+/).filter(c=>c!=='is-empty').join(' ');
  const label=mediaCountLabel(item);if(label)document.getElementById('includedSongsCount').textContent=label;
  document.getElementById('mediaProductSection')?.remove();if(item.editions.length)section.after(products);
  return item.editions.length?products:included.querySelector('.release-media-inventory');
}
