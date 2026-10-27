import { renderCommon } from './common.js?v=4.12.0&cache=release-ux&songUrls=1';
import { escapeHtml, buildSongUrl } from './api.js?v=5.3.0&cache=solo-live-schema';
import { getJstDateKey, getMillisecondsUntilNextJstDay } from './home-date-v493.js?v=4.9.3&cache=today-jst';
import { SCOPES, rankSongs, validateDataset } from './gap-rankings-model.js?v=1';
import { periodAnalogy } from './gap-rankings-presentation.js?v=1';

renderCommon('');
const $=id=>document.getElementById(id);
let dataset=null,tab='current',scope='official',timer=null,generation=0;
function readUrl(){const p=new URLSearchParams(location.search);tab=p.get('tab')==='history'?'history':'current';scope=Object.hasOwn(SCOPES,p.get('scope'))?p.get('scope'):'official';}
readUrl();
async function digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function get(url){const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error(`データ取得失敗（HTTP ${response.status}）`);return response;}
function eventLinks(ids){return ids.map(id=>`<a class="mus-link-secondary" href="event.html?id=${encodeURIComponent(id)}">${escapeHtml(dataset.payload.events[id].eventName)}</a>`).join(' ／ ');}
function render(){
  if(!dataset)return;
  const base=getJstDateKey(),result=rankSongs(dataset.payload,scope,tab,base);
  $('rankingTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
  $('rankingScopes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===scope)));
  $('rankingTitle').textContent=tab==='current'?'もし今日歌われたらランキング':'歴代『何日ぶり？』ランキング';
  $('rankingMeta').textContent=`基準日：${base}（JST）｜区分：${SCOPES[scope]}｜対象${result.population}曲のTOP${result.rows.length}（最大20曲）`;
  $('rankingList').innerHTML=result.rows.map(row=>{
    const analogy=periodAnalogy(row.days,row.id);
    return `<li class="gap-rankings-row mus-card-multi"><span class="gap-rankings-rank" aria-label="${row.rank}位">${row.rank}</span><div class="gap-rankings-song"><h3><a class="mus-link-primary" href="${buildSongUrl(row.id)}"><span class="mus-link-label">${escapeHtml(row.name)}</span><span class="site-icon-inline mus-link-chevron" data-site-icon="chevron-right" aria-hidden="true"></span></a></h3></div><div class="gap-rankings-days"><span class="gap-rankings-number">${row.days.toLocaleString('ja-JP')}日</span><small>${tab==='current'?'もし今日歌われたら':'これまでの最長記録'}</small>${analogy?`<p class="gap-rankings-analogy">${escapeHtml(analogy)}</p>`:''}<a class="gap-rankings-checker mus-link-action" href="gap-checker.html?song=${encodeURIComponent(row.id)}&baseDate=${base}&scope=${scope}&mode=current">いつ振りチェッカーで確認 <span aria-hidden="true">→</span></a></div><div class="gap-rankings-dates"><p><span class="gap-rankings-date-label">${tab==='current'?'前回歌唱日':'前の歌唱日'}：${row.fromDate}</span><br>${eventLinks(row.fromEvents)}</p>${tab==='history'?`<p><span class="gap-rankings-date-label">次の歌唱日：${row.toDate}</span><br>${eventLinks(row.toEvents)}</p>`:''}${row.todayEvents.length?`<p class="gap-rankings-today">基準日当日の歌唱記録があります：${eventLinks(row.todayEvents)}。表示日数は当日を除外した仮定の比較値です。</p>`:''}</div></li>`;
  }).join('')||'<li class="gap-rankings-status">この区分にはランキング対象の歌唱記録がありません。</li>';
  const excluded=tab==='current'?result.noHistory:result.noInterval;
  $('unrankedSummary').textContent=tab==='current'?`基準日前の歌唱記録なし・順位対象外：${excluded.length}曲`:`異なる歌唱日が2日未満・順位対象外：${excluded.length}曲`;
  $('unrankedList').innerHTML=excluded.map(song=>`<li><a href="${buildSongUrl(song.id)}">${escapeHtml(song.name)}</a> — ${song.dates.some(d=>d.date===base&&d[scope].length)?'当日の記録あり（Aでは当日を除外）':tab==='current'?'基準日前の歌唱記録なし':'比較できる歌唱日の組がありません'}</li>`).join('');
  $('rankingSource').textContent=`正式snapshot ${dataset.source.outputRevision} ／ dataRevision ${dataset.source.dataRevision}。正本データ更新後は派生データの再生成が必要です。`;
  $('rankingStatus').hidden=true;$('rankingResults').hidden=false;
}
async function load(){
  const request=++generation;
  $('rankingResults').hidden=true;$('rankingStatus').hidden=false;$('rankingStatus').classList.remove('error');$('rankingStatus').textContent='正式データを確認しています…';
  try {
    const [pointer,data]=await Promise.all([get('data/current.json').then(r=>r.json()),get('data/gap-rankings.json').then(r=>r.json())]);
    validateDataset(data,pointer);
    if(!/^sha256-[a-f0-9]{64}$/.test(pointer.outputRevision))throw Error('Revision形式不正');
    const manifestBytes=await get(`data/snapshots/${pointer.outputRevision}/manifest.json`).then(r=>r.arrayBuffer());
    if(await digest(manifestBytes)!==data.source.manifestSha256||await digest(JSON.stringify(data.payload))!==data.payloadSha256)throw Error('派生データの入力／本文hashが一致しません。');
    if(request!==generation)return;
    dataset=data;render();
  } catch(error){if(request!==generation)return;dataset=null;$('rankingStatus').classList.add('error');$('rankingStatus').textContent=`ランキングを表示できません。${error.message}`;const retry=document.createElement('button');retry.type='button';retry.textContent='再試行';retry.addEventListener('click',load,{once:true});$('rankingStatus').append(retry);}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{render();schedule();},getMillisecondsUntilNextJstDay()+50);}
for(const id of ['rankingTabs','rankingScopes'])$(id).addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.tab)tab=button.dataset.tab;if(button.dataset.scope)scope=button.dataset.scope;const url=new URL(location.href);url.searchParams.set('tab',tab);url.searchParams.set('scope',scope);history.pushState(null,'',url);render();});
window.addEventListener('popstate',()=>{readUrl();render();});
window.addEventListener('focus',()=>{render();schedule();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();schedule();}});
load();schedule();
