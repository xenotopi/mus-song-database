import { apiGet, escapeHtml, formatDate } from "./api.js?v=4.6.2";
import { renderCommon } from "./common.js?v=4.6.2";

renderCommon("statistics");

const $ = id => document.getElementById(id);
const el = {
  status:$("status"),
  error:$("statsError"),
  overviewSection:$("overviewSection"),
  overviewCards:$("overviewCards"),
  yearlySection:$("yearlySection"),
  yearlyChart:$("yearlyChart"),
  yearlyNote:$("yearlyNote"),
  rankingSection:$("rankingSection"),
  topSongs:$("topSongs"),
  topVenues:$("topVenues"),
  heroSummary:$("heroSummary"),
  heroSongs:$("heroSongs"),
  heroEvents:$("heroEvents"),
  heroYears:$("heroYears"),
  comparisonSection:$("comparisonSection"),
  officialSoloChart:$("officialSoloChart"),
  officialSoloSummary:$("officialSoloSummary"),
  discoverySection:$("discoverySection"),
  discoveryCards:$("discoveryCards")
};

let trends = [];
let rankings = {};
let singerData = {};
let metric = "performanceCount";
let chart = null;
let comparisonChart = null;

const metricSettings = {
  performanceCount:{label:"歌唱記録数",suffix:"件",note:"同じ曲が複数回歌われた場合も、それぞれ1件の歌唱記録として数えます。"},
  eventCount:{label:"イベント数",suffix:"件",note:"登録イベントを開催年ごとに集計しています。"},
  uniqueSongCount:{label:"歌唱曲数",suffix:"曲",note:"その年に歌われた異なる曲数です。同じ曲が複数回歌われても1曲として数えます。"},
  venueCount:{label:"利用会場数",suffix:"会場",note:"その年に利用した異なる会場数です。"}
};

const number = value => Number(value || 0);

function renderOverview(){
  const s = rankings.summary || {};
  const cards = [
    ["登録曲数",number(s.songCount),"曲"],
    ["イベント数",number(s.eventCount),"件"],
    ["会場数",number(s.venueCount),"会場"],
    ["歌唱記録数",number(s.performanceCount),"件"],
    ["歌唱名義数",number(s.singerCount),"名義"]
  ];
  el.overviewCards.innerHTML = cards.map(([label,value,suffix]) => `
    <article class="stats-overview-card">
      <div class="stats-overview-label">${escapeHtml(label)}</div>
      <div class="stats-overview-value">${value.toLocaleString("ja-JP")}</div>
      <div class="stats-overview-note">${escapeHtml(suffix)}</div>
    </article>`).join("");

  if (el.heroSummary) {
    el.heroSongs.textContent = `全${number(s.songCount).toLocaleString("ja-JP")}曲`;
    el.heroEvents.textContent = `${number(s.eventCount).toLocaleString("ja-JP")}イベント`;

    const validYears = trends
      .map(item => number(item.year))
      .filter(Boolean);

    if (validYears.length) {
      const first = Math.min(...validYears);
      const last = Math.max(...validYears);
      el.heroYears.textContent = `${first} — ${last}`;
    } else {
      el.heroYears.textContent = "年別データ";
    }

    el.heroSummary.hidden = false;
  }

  el.overviewSection.hidden = false;
}

function renderYearlyChart(){
  const setting = metricSettings[metric];
  if(typeof window.Chart !== "function"){
    el.yearlyNote.textContent = "グラフライブラリを読み込めませんでした。";
    return;
  }
  if(chart) chart.destroy();

  const labels = trends.map(item => String(item.year || ""));
  const values = trends.map(item => number(item[metric]));

  chart = new window.Chart(el.yearlyChart,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:setting.label,
        data:values,
        backgroundColor:"rgba(79,70,229,.78)",
        hoverBackgroundColor:"#4338ca",
        borderRadius:6,
        borderSkipped:false
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      resizeDelay:0,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx => `${setting.label}：${number(ctx.raw).toLocaleString("ja-JP")}${setting.suffix}`}}
      },
      scales:{
        x:{grid:{display:false},ticks:{
          color:"#64748b",
          autoSkip:false,
          maxRotation:0,
          minRotation:0,
          font:{size:11,weight:"700"}
        }},
        y:{beginAtZero:true,ticks:{precision:0,color:"#64748b"},grid:{color:"rgba(148,163,184,.18)"}}
      }
    }
  });

  const maximum = trends.reduce((best,item) =>
    number(item[metric]) > number(best[metric]) ? item : best,
    trends[0] || {}
  );

  el.yearlyNote.textContent = maximum?.year
    ? `${setting.note} 最多は${maximum.year}年の${number(maximum[metric]).toLocaleString("ja-JP")}${setting.suffix}です。`
    : setting.note;

  el.yearlySection.hidden = false;
}

function rankRow(item,index,type){
  const isSong = type === "song";
  const href = isSong
    ? `song.html?id=${encodeURIComponent(item.songId || "")}`
    : `venue.html?id=${encodeURIComponent(item.venueId || "")}`;

  const name = isSong
    ? (item.displayName || item.songName || "曲名未設定")
    : (item.venueName || "会場名未設定");

  const value = isSong
    ? `${number(item.performanceCount).toLocaleString("ja-JP")}回`
    : `${number(item.eventCount).toLocaleString("ja-JP")}イベント`;

  const meta = isSong
    ? [item.media,item.songCategory,item.lastPerformanceDate ? `最終 ${formatDate(item.lastPerformanceDate)}` : ""].filter(Boolean).join("｜")
    : [item.prefectureCity || item.region,`${number(item.uniqueSongCount).toLocaleString("ja-JP")}曲`].filter(Boolean).join("｜");

  return `
    <a class="stats-rank-row" href="${href}">
      <span class="stats-rank-no">${index + 1}</span>
      <span>
        <span class="stats-rank-name">${escapeHtml(name)}</span>
        <span class="stats-rank-meta">${escapeHtml(meta)}</span>
      </span>
      <span class="stats-rank-value">${escapeHtml(value)}</span>
    </a>`;
}

function renderRankings(){
  const songs = Array.isArray(rankings.songs) ? rankings.songs.slice() : [];
  const venues = Array.isArray(rankings.venues) ? rankings.venues.slice() : [];

  songs.sort((a,b) => number(b.performanceCount) - number(a.performanceCount));
  venues.sort((a,b) => number(b.eventCount) - number(a.eventCount) || number(b.performanceCount) - number(a.performanceCount));

  el.topSongs.innerHTML = songs.slice(0,5).map((item,index) => rankRow(item,index,"song")).join("");
  el.topVenues.innerHTML = venues.slice(0,5).map((item,index) => rankRow(item,index,"venue")).join("");
  el.rankingSection.hidden = false;
}

function renderOfficialSoloComparison(){
  if (!el.comparisonSection || typeof window.Chart !== "function") return;

  const labels = trends.map(item => String(item.year || ""));
  const officialValues = trends.map(item => number(item.officialPerformanceCount));
  const soloValues = trends.map(item => number(item.soloPerformanceCount));

  if (comparisonChart) comparisonChart.destroy();

  comparisonChart = new window.Chart(el.officialSoloChart,{
    type:"bar",
    data:{
      labels,
      datasets:[
        {
          label:"公式",
          data:officialValues,
          backgroundColor:"rgba(87,78,224,.82)",
          borderRadius:5,
          borderSkipped:false
        },
        {
          label:"ソロ",
          data:soloValues,
          backgroundColor:"rgba(223,90,145,.82)",
          borderRadius:5,
          borderSkipped:false
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      resizeDelay:0,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{
          position:"top",
          labels:{
            usePointStyle:true,
            boxWidth:8,
            color:"#4f596c",
            font:{size:11,weight:"700"}
          }
        },
        tooltip:{
          callbacks:{
            label:ctx => `${ctx.dataset.label}：${number(ctx.raw).toLocaleString("ja-JP")}件`
          }
        }
      },
      scales:{
        x:{
          stacked:false,
          grid:{display:false},
          ticks:{
            color:"#64748b",
            autoSkip:false,
            maxRotation:0,
            minRotation:0,
            font:{size:10,weight:"700"}
          }
        },
        y:{
          beginAtZero:true,
          ticks:{precision:0,color:"#64748b"},
          grid:{color:"rgba(148,163,184,.18)"}
        }
      }
    }
  });

  const officialTotal = officialValues.reduce((sum,value) => sum + value,0);
  const soloTotal = soloValues.reduce((sum,value) => sum + value,0);
  const total = officialTotal + soloTotal;

  const percent = value =>
    total > 0 ? Math.round(value / total * 1000) / 10 : 0;

  el.officialSoloSummary.innerHTML = `
    <div class="stats-comparison-item official">
      <div class="stats-comparison-item-label">公式</div>
      <div class="stats-comparison-item-value">${officialTotal.toLocaleString("ja-JP")}件</div>
      <div class="stats-rank-meta">全体の${percent(officialTotal)}%</div>
    </div>
    <div class="stats-comparison-item solo">
      <div class="stats-comparison-item-label">ソロ</div>
      <div class="stats-comparison-item-value">${soloTotal.toLocaleString("ja-JP")}件</div>
      <div class="stats-rank-meta">全体の${percent(soloTotal)}%</div>
    </div>
  `;

  el.comparisonSection.hidden = false;
}

function renderDiscovery(){
  const songs = Array.isArray(rankings.songs) ? rankings.songs.slice() : [];
  const venues = Array.isArray(rankings.venues) ? rankings.venues.slice() : [];
  const soloSingers = Array.isArray(singerData.solo) ? singerData.solo.slice() : [];

  const longestGap = songs.filter(item => number(item.longestGapDays) > 0)
    .sort((a,b) => number(b.longestGapDays) - number(a.longestGapDays))[0];

  const latest = songs.filter(item => item.lastPerformanceDate)
    .sort((a,b) => String(b.lastPerformanceDate || "").localeCompare(String(a.lastPerformanceDate || "")))[0];

  const topVenue = venues.sort((a,b) => number(b.eventCount) - number(a.eventCount))[0];
  const topSoloSinger = soloSingers.sort((a,b) => number(b.performanceCount) - number(a.performanceCount))[0];

  const cards = [
    longestGap && {
      label:"LONGEST GAP",
      title:longestGap.displayName || longestGap.songName,
      value:`${number(longestGap.longestGapDays).toLocaleString("ja-JP")}日`,
      meta:"記録上の最長ブランク",
      href:`song.html?id=${encodeURIComponent(longestGap.songId || "")}`
    },
    latest && {
      label:"LATEST PERFORMANCE",
      title:latest.displayName || latest.songName,
      value:formatDate(latest.lastPerformanceDate) || "—",
      meta:"最近歌唱記録が追加された曲",
      href:`song.html?id=${encodeURIComponent(latest.songId || "")}`
    },
    topVenue && {
      label:"MOST EVENTS VENUE",
      title:topVenue.venueName,
      value:`${number(topVenue.eventCount).toLocaleString("ja-JP")}イベント`,
      meta:"開催イベント数が最も多い会場",
      href:`venue.html?id=${encodeURIComponent(topVenue.venueId || "")}`
    },
    topSoloSinger && {
      label:"TOP SOLO SINGING NAME",
      title:topSoloSinger.displayName || topSoloSinger.detailName || "",
      value:`${number(topSoloSinger.performanceCount).toLocaleString("ja-JP")}回`,
      meta:"ソロイベントで最も歌唱記録が多い名義",
      href:`singer.html?name=${encodeURIComponent(topSoloSinger.detailName || "")}&category=ソロ`
    }
  ].filter(Boolean);

  el.discoveryCards.innerHTML = cards.map(card => `
    <a class="stats-discovery-card" href="${card.href}">
      <div class="stats-discovery-label">${escapeHtml(card.label)}</div>
      <div class="stats-discovery-title">${escapeHtml(card.title || "—")}</div>
      <div class="stats-discovery-value">${escapeHtml(card.value || "—")}</div>
      <div class="stats-discovery-meta">${escapeHtml(card.meta || "")}</div>
    </a>`).join("");

  el.discoverySection.hidden = !cards.length;
}

function setupMetricTabs(){
  document.querySelectorAll("[data-metric]").forEach(button => {
    button.addEventListener("click",() => {
      document.querySelectorAll("[data-metric]").forEach(item => item.classList.toggle("active",item === button));
      metric = button.dataset.metric || "performanceCount";
      requestAnimationFrame(() => renderYearlyChart());
    });
  });
}

async function load(){
  try{
    const [trendResponse,rankingResponse,singerResponse] = await Promise.all([
      apiGet("trends",{},{
        timeoutMs:30000,retryCount:1,cache:true,cacheTtlMs:300000
      }),
      apiGet("rankings",{limit:1000,year:"",category:"",schema:"4.2.1"},{
        timeoutMs:30000,retryCount:1,cache:true,cacheTtlMs:300000
      }),
      apiGet("singerList",{},{
        timeoutMs:30000,retryCount:1,cache:true,cacheTtlMs:300000
      })
    ]);

    trends = Array.isArray(trendResponse.data?.years) ? trendResponse.data.years : [];
    rankings = rankingResponse.data || {};
    singerData = singerResponse.data || {};

    renderOverview();
    renderYearlyChart();
    renderRankings();
    renderOfficialSoloComparison();
    renderDiscovery();

    el.status.hidden = true;
  }catch(error){
    console.error(error);
    el.status.hidden = true;
    el.error.hidden = false;
    el.error.textContent = error?.message || "統計データを取得できませんでした。";
  }
}

setupMetricTabs();
load();
