// Presentation only. Source facts, evidence and edition identities stay intact.
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const publicText = text => text === 'Memorial BOX Ⅰに同梱されたCD。単売版との音源同一性は未確認。'
  ? 'Memorial BOX Ⅰに同梱されたCD。' : text;
const split = text => /^(アニメーションショートフィルム)(「.+」)$/.exec(text)
  || /^([^：]{2,40}：)(.+)$/.exec(text);
export function renderProductFacts(rows, field) {
  const facts = rows.map((row, index) => ({...row, index, text: publicText(row.text)}));
  const member = (row, text, tag='li') => `<${tag} data-product-fact="${row.index}"${row.historical?' data-single-historical="true"':''}${tag==='li'&&text.length<=30?' class="release-product-short-fact"':''}>${esc(text)}</${tag}>`;
  let body='';
  for(let i=0;i<facts.length;) {
    const parts=split(facts[i].text);let end=i+1;
    if(parts)while(end<facts.length&&split(facts[end].text)?.[1]===parts[1])end++;
    if(end-i>1) {
      body+=`<li class="release-product-fact-group"><span class="release-product-fact-label">${esc(parts[1])}</span><span class="release-product-fact-members">${facts.slice(i,end).map(row=>member(row,split(row.text)[2],'span')).join('<span aria-hidden="true">／</span>')}</span></li>`;
    } else body+=member(facts[i],facts[i].text);
    i=end;
  }
  return `<ul class="release-single-facts release-product-facts" data-product-facts="${esc(field)}">${body}</ul>`;
}
