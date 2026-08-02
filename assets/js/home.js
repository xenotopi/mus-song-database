import { apiGet, escapeHtml, formatDate } from "./api.js?v=2.7.0";
import { renderCommon } from "./common.js?v=2.7.0";
renderCommon("home");
const e={status:document.getElementById("status"),retryButton:document.getElementById("retryButton"),summary:document.getElementById("summary"),songCount:document.getElementById("songCount"),eventCount:document.getElementById("eventCount"),venueCount:document.getElementById("venueCount"),performanceCount:document.getElementById("performanceCount"),featuredSection:document.getElementById("featuredSection"),featuredSong:document.getElementById("featuredSong"),featuredVenue:document.getElementById("featuredVenue"),featuredEvent:document.getElementById("featuredEvent"),topSection:document.getElementById("topSection"),middleSection:document.getElementById("middleSection"),todayDate:document.getElementById("todayDate"),todayContent:document.getElementById("todayContent"),topSongs:document.getElementById("topSongs"),topVenues:document.getElementById("topVenues"),latestEventsSection:document.getElementById("latestEventsSection"),latestEventsList:document.getElementById("latestEventsList"),recentSection:document.getElementById("recentSection"),recentList:document.getElementById("recentList"),recentMoreButton:document.getElementById("recentMoreButton"),homeSearchInput:document.getElementById("homeSearchInput")};
let recentItems=[],recentVisibleCount=5;
function setLoading(){
  e.status.hidden=false;
  e.status.classList.remove("error");
  e.status.innerHTML=
    '<span class="home-loading-inline">最新データを確認しています<span><i></i><i></i><i></i></span></span>';

  e.retryButton.hidden=true;

  [
    e.summary,
    e.featuredSection,
    e.topSection,
    e.middleSection,
    e.latestEventsSection,
    e.recentSection
  ].forEach(
    section=>{
      if(section){
        section.hidden=false;
        section.classList.add(
          "home-section-loading"
        );
      }
    }
  );
}

function clearLoadingState(){
  [
    e.summary,
    e.featuredSection,
    e.topSection,
    e.middleSection,
    e.latestEventsSection,
    e.recentSection
  ].forEach(
    section=>{
      section?.classList.remove(
        "home-section-loading"
      );
    }
  );

  e.status.hidden = true;
}

function setError(error){
  [
    e.summary,
    e.featuredSection,
    e.topSection,
    e.middleSection,
    e.latestEventsSection,
    e.recentSection
  ].forEach(section=>{
    section?.classList.remove("home-section-loading");
  });

  e.status.hidden=false;
  e.status.classList.add("error");e.status.innerHTML=`<strong>ホームデータを取得できませんでした。</strong><span>${escapeHtml(error?.message||"不明なエラー")}</span>`;e.retryButton.hidden=false}
function renderSummary(s){e.songCount.textContent=Number(s.songCount||0).toLocaleString("ja-JP");e.eventCount.textContent=Number(s.eventCount||0).toLocaleString("ja-JP");e.venueCount.textContent=Number(s.venueCount||0).toLocaleString("ja-JP");e.performanceCount.textContent=Number(s.performanceCount||0).toLocaleString("ja-JP")}
function renderFeatured(f){const song=f.topSong||{},venue=f.topVenue||{},event=f.latestEvent||{};e.featuredSong.href=song.songId?`song.html?id=${encodeURIComponent(song.songId)}`:"#";e.featuredSong.innerHTML=`<span class="home-featured-label">MOST PERFORMED SONG</span><span class="home-featured-title">${escapeHtml(song.songName||"データなし")}</span><span class="home-featured-meta">${Number(song.performanceCount||0).toLocaleString("ja-JP")}回歌唱</span>`;e.featuredVenue.href=venue.venueId?`venue.html?id=${encodeURIComponent(venue.venueId)}`:"#";e.featuredVenue.innerHTML=`<span class="home-featured-label">MOST USED VENUE</span><span class="home-featured-title">${escapeHtml(venue.venueName||"データなし")}</span><span class="home-featured-meta">${Number(venue.eventCount||0).toLocaleString("ja-JP")}イベント</span>`;e.featuredEvent.href=event.eventId?`event.html?id=${encodeURIComponent(event.eventId)}`:"#";e.featuredEvent.innerHTML=`<span class="home-featured-label">LATEST EVENT</span><span class="home-featured-title">${escapeHtml(event.eventName||"データなし")}</span><span class="home-featured-meta">${escapeHtml(formatDate(event.date))}</span>`}
function renderToday(t){e.todayDate.textContent=t.label||"";const g=[["この日に開催されたイベント",t.events||[],x=>`<a class="today-item" href="event.html?id=${encodeURIComponent(x.eventId)}"><b>${escapeHtml(x.date?x.date.slice(0,4)+"年 ":"")}${escapeHtml(x.eventName||"イベント名未設定")}</b><div class="home-ranking-meta">${escapeHtml([x.category,x.eventType].filter(Boolean).join("｜"))}</div></a>`],["この日に初披露された曲",t.firstPerformedSongs||[],x=>`<a class="today-item" href="song.html?id=${encodeURIComponent(x.songId)}"><b>${escapeHtml(x.songName||"曲名未設定")}</b><div class="home-ranking-meta">${escapeHtml(x.date?x.date.slice(0,4)+"年":"")}</div></a>`],["この日に最後に歌われた曲",t.lastPerformedSongs||[],x=>`<a class="today-item" href="song.html?id=${encodeURIComponent(x.songId)}"><b>${escapeHtml(x.songName||"曲名未設定")}</b><div class="home-ranking-meta">${escapeHtml(x.date?x.date.slice(0,4)+"年":"")}</div></a>`]];e.todayContent.innerHTML=g.some(([,i])=>i.length)?g.map(([title,items,r])=>`<section class="today-group"><h3>${escapeHtml(title)}</h3>${items.length?items.slice(0,6).map(r).join(""):`<div class="today-empty">該当する記録はありません。</div>`}</section>`).join(""):`<section class="today-group"><div class="today-empty">今日は登録されている記録がありません。</div></section>`}
function renderTopSongs(items){e.topSongs.innerHTML=items.map(x=>`<a class="home-ranking-row" href="song.html?id=${encodeURIComponent(x.songId)}"><span class="home-rank">${x.rank}</span><span><span class="home-ranking-name">${escapeHtml(x.songName||"曲名未設定")}</span><span class="home-ranking-meta">イベント ${Number(x.eventCount||0).toLocaleString("ja-JP")}件</span></span><span class="home-ranking-count">${Number(x.performanceCount||0).toLocaleString("ja-JP")}回</span></a>`).join("")}
function renderTopVenues(items){e.topVenues.innerHTML=items.map(x=>`<a class="home-ranking-row" href="venue.html?id=${encodeURIComponent(x.venueId)}"><span class="home-rank">${x.rank}</span><span><span class="home-ranking-name">${escapeHtml(x.venueName||"会場名未設定")}</span><span class="home-ranking-meta">${escapeHtml([x.prefectureCity,x.country].filter(Boolean).join("｜"))}</span></span><span class="home-ranking-count">${Number(x.eventCount||0).toLocaleString("ja-JP")}件</span></a>`).join("")}
function renderLatestEvents(items){e.latestEventsList.innerHTML=items.map(x=>{const m=[x.category,x.eventType,x.day,x.performance,x.venueName].filter(Boolean).join("｜");return `<a class="latest-event-row" href="event.html?id=${encodeURIComponent(x.eventId)}"><span class="latest-event-date">${escapeHtml(formatDate(x.date))}</span><span><span class="latest-event-name">${escapeHtml(x.eventName||"イベント名未設定")}</span><span class="latest-event-meta">${escapeHtml(m)}</span></span><span class="latest-event-arrow">›</span></a>`}).join("")}
function renderRecent(){const items=recentItems.slice(0,recentVisibleCount);e.recentList.innerHTML=items.map(x=>{const p=[x.day,x.performance].filter(Boolean).join(" ");return `<article class="recent-card"><div class="recent-card-head"><div class="recent-date">${escapeHtml(formatDate(x.date))}</div><a class="recent-event" href="event.html?id=${encodeURIComponent(x.eventId)}">${escapeHtml(x.eventName||"イベント名未設定")}</a><div class="recent-tags"><span class="type-badge">${escapeHtml(x.category||"未分類")}</span>${x.eventType?`<span class="recent-meta-link">${escapeHtml(x.eventType)}</span>`:""}${p?`<span class="recent-meta-link">${escapeHtml(p)}</span>`:""}${x.venueName?`<a class="recent-meta-link" href="venue.html?id=${encodeURIComponent(x.venueId)}">${escapeHtml(x.venueName)}</a>`:""}</div></div><div class="recent-song-list">${(x.songs||[]).map(s=>`<a class="recent-song" href="song.html?id=${encodeURIComponent(s.songId)}"><span class="recent-song-name">${escapeHtml(s.songName||"曲名未設定")}</span>${s.singer?`<span class="recent-song-singer">${escapeHtml(s.singer)}</span>`:`<span class="recent-empty-singer">歌唱者情報なし</span>`}</a>`).join("")}</div></article>`}).join("");e.recentMoreButton.hidden=recentVisibleCount>=recentItems.length;if(!e.recentMoreButton.hidden)e.recentMoreButton.textContent=`もっと見る（残り${recentItems.length-recentVisibleCount}件）`}
function renderHome(d){
  recentItems=d.recentPerformances||[];
  recentVisibleCount=5;

  renderSummary(d.summary||{});
  renderFeatured(d.featured||{});
  renderToday(d.today||{});
  renderTopSongs(d.topSongs||[]);
  renderTopVenues(d.topVenues||[]);
  renderLatestEvents(d.latestEvents||[]);
  renderRecent();

  e.summary.hidden=false;
  e.featuredSection.hidden=false;
  e.topSection.hidden=false;
  e.middleSection.hidden=false;
  e.latestEventsSection.hidden=false;
  e.recentSection.hidden=false;

  clearLoadingState();
}
async function loadHome(){setLoading();try{const r=await apiGet("home",{recentLimit:20},{
      timeoutMs:30000,
      retryCount:1,
      cache:true,
      cacheTtlMs:600000,
      staleWhileRevalidate:true
    });renderHome(r.data)}catch(error){console.error(error);setError(error)}}
e.homeSearchInput.addEventListener("keydown",event=>{if(event.key==="Enter"&&e.homeSearchInput.value.trim())location.href=`search.html?q=${encodeURIComponent(e.homeSearchInput.value.trim())}`});
e.recentMoreButton.addEventListener("click",()=>{recentVisibleCount=Math.min(recentVisibleCount+5,recentItems.length);renderRecent()});
e.retryButton.addEventListener("click",loadHome);loadHome();
