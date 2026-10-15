"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };
const actions = ["trends", "rankings", "singerList"];
const fixture = {
  trends: { years: [
    {year:2010,performanceCount:10,eventCount:2,uniqueSongCount:3,venueCount:1,officialPerformanceCount:8,soloPerformanceCount:2},
    {year:2015,performanceCount:80,eventCount:20,uniqueSongCount:30,venueCount:10,officialPerformanceCount:60,soloPerformanceCount:20},
    {year:2026,performanceCount:30,eventCount:7,uniqueSongCount:9,venueCount:4,officialPerformanceCount:22,soloPerformanceCount:8}
  ] },
  rankings: {
    summary:{songCount:117,performedSongCount:111,unperformedSongCount:6,eventCount:353,venueCount:155,performanceCount:1400,singerCount:20},
    songs:[
      {songId:"S003",songName:"Snow halation",performanceCount:10,longestGapDays:365,lastPerformanceDate:"2025-01-01"},
      {songId:"S032",songName:"Wonderful Rush",performanceCount:12,longestGapDays:100,lastPerformanceDate:"2026-01-01"}
    ],
    venues:[{venueId:"VE0001",venueName:"会場A",eventCount:4,performanceCount:30,uniqueSongCount:10}]
  },
  singerList:{summary:{total:70,official:10,solo:60},solo:[{singerId:"SN0001",displayName:"歌唱名義A",performanceCount:25}]}
};
let server, browser, origin, finalDOM;

test.before(async () => {
  server = http.createServer((request,response) => {
    const pathname = decodeURIComponent(new URL(request.url,"http://localhost").pathname);
    const file = path.resolve(root,pathname.replace(/^\/+/,"") || "index.html");
    if(path.relative(root,file).startsWith("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
    response.writeHead(200,{"content-type":mime[path.extname(file)] || "application/octet-stream"});
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,channel:process.env.MUSDB_E2E_BROWSER_CHANNEL || "chrome"});
});
test.after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});

async function open(t, {width=1280, noChart=false, chartThrows=false}={}) {
  const page=await browser.newPage({viewport:{width,height:900}});
  t.after(()=>page.close());
  const errors=[], pageErrors=[];
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem("musdb_analytics_consent","rejected");
    window.statsRequests=[];window.statsCharts=[];
    window.statsApi=(action,params,options)=>new Promise((resolve,reject)=>window.statsRequests.push({action,params,options,resolve,reject}));
    window.statsWrites={};
    new MutationObserver(records=>{
      // Count section redraws, not SiteIcons replacing an opt-in icon host's children.
      for(const record of records){const host=record.target.closest?.("#overviewCards,#topSongs,#topVenues,#discoveryCards");if(host===record.target)window.statsWrites[host.id]=(window.statsWrites[host.id]||0)+1;}
    }).observe(document,{childList:true,subtree:true});
  });
  await page.route(url=>url.origin===origin && url.pathname==="/assets/js/api.js" && url.searchParams.get("v")==="4.9.6",route=>route.fulfill({contentType:"text/javascript",body:`export { buildSongUrl, escapeHtml, formatDate } from "/assets/js/api.js?statistics-test-real";
    export const apiGet=(...args)=>window.statsApi(...args);`}));
  await page.route("**/chart.umd.min.js",route=>route.fulfill({contentType:"text/javascript",body:noChart ? "" : `window.Chart=class {
    constructor(canvas,config){
      ${chartThrows ? 'if(canvas.id==="yearlyChart")throw Error("controlled chart failure");' : ""}
      if(window.statsCharts.some(c=>c.id===canvas.id&&!c.destroyed))throw Error("duplicate chart instance");
      this.record={id:canvas.id,config,destroyed:false};window.statsCharts.push(this.record);
    }
    destroy(){this.record.destroyed=true;}
  };`}));
  await page.route(/script\.google(?:usercontent)?\.com\//,route=>{
    const callback=new URL(route.request().url()).searchParams.get("callback");
    return route.fulfill({contentType:"text/javascript",body:`${callback}(${JSON.stringify({success:true,data:{dataRevision:"statistics-test"}})});`});
  });
  await page.goto(origin+"/statistics.html",{waitUntil:"load"});
  await page.waitForFunction(()=>window.statsRequests.length===3);
  assert.deepEqual(await page.evaluate(()=>window.statsRequests.map(x=>x.action)),actions);
  return {page,errors,pageErrors};
}
async function settle(page,action,{fail=false,data=fixture[action]}={}) {
  await page.evaluate(async({action,fail,data})=>{
    const request=window.statsRequests.find(x=>x.action===action);
    if(fail)request.reject(new Error(`controlled ${action} failure`));else request.resolve({success:true,data});
    // Drain settled request/render/status continuations without a timing sleep.
    for(let i=0;i<12;i++)await Promise.resolve();
  },{action,fail,data});
}
async function hidden(page,id,value) {assert.equal(await page.locator("#"+id).isHidden(),value,id);}
async function healthy(ctx,failures=0) {
  assert.deepEqual(ctx.pageErrors,[]);assert.equal(ctx.errors.length,failures,JSON.stringify(ctx.errors));
  assert.equal(await ctx.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"horizontal overflow");
}
async function snapshot(page) {
  return page.evaluate(()=>({
    sections:["heroSummary","overviewSection","yearlySection","rankingSection","comparisonSection","discoverySection","status","statsError"].map(id=>document.getElementById(id).outerHTML),
    charts:window.statsCharts.filter(x=>!x.destroyed).map(x=>({id:x.id,type:x.config.type,data:x.config.data}))
  }));
}
async function complete(ctx) {
  const {page}=ctx;
  for(const id of ["overviewSection","yearlySection","rankingSection","comparisonSection","discoverySection","heroSummary"]) await hidden(page,id,false);
  await hidden(page,"status",true);await hidden(page,"statsError",true);
  assert.deepEqual(await page.locator(".stats-overview-value").allTextContents(),["117","111","6","353","155","1,400","70"]);
  assert.equal(await page.locator("#heroSongs").innerText(),"全117曲");assert.equal(await page.locator("#heroEvents").innerText(),"353イベント");
  assert.equal(await page.locator("#heroYears").innerText(),"2010 — 2026");await hidden(page,"heroYears",false);
  assert.deepEqual(await page.locator("#topSongs a").evaluateAll(nodes=>nodes.map(x=>x.getAttribute("href"))),["song/S032.html","song/S003.html"]);
  assert.equal(await page.locator("#topVenues a").getAttribute("href"),"venue.html?id=VE0001");
  assert.deepEqual(await page.locator("#discoveryCards a").evaluateAll(nodes=>nodes.map(x=>x.getAttribute("href"))),["song/S003.html","song/S032.html","venue.html?id=VE0001","singer.html?id=SN0001"]);
  assert.match(await page.locator("#officialSoloSummary").innerText(),/90件/);assert.match(await page.locator("#officialSoloSummary").innerText(),/30件/);
  assert.deepEqual(await page.evaluate(()=>window.statsCharts.filter(x=>!x.destroyed).map(x=>x.id)),["yearlyChart","officialSoloChart"]);
  assert.equal(await page.evaluate(()=>window.statsCharts.length),2);
  assert.deepEqual(await page.evaluate(()=>window.statsWrites),{topSongs:1,topVenues:1,discoveryCards:2,overviewCards:1});
  await healthy(ctx);
}

const orders = [
  ["trends","rankings","singerList"],["trends","singerList","rankings"],
  ["rankings","trends","singerList"],["rankings","singerList","trends"],
  ["singerList","trends","rankings"],["singerList","rankings","trends"]
];
for(const order of orders)test(`all completion orders preserve final DOM: ${order.join(" > ")}`,async t=>{
  const ctx=await open(t);for(const action of order)await settle(ctx.page,action);await complete(ctx);
  const dom=await snapshot(ctx.page);if(!finalDOM)finalDOM=dom;else assert.deepEqual(dom,finalDOM);
});

for(const action of actions)test(`${action} alone renders only available dependencies while global loading remains`,async t=>{
  const ctx=await open(t),{page}=ctx;await settle(page,action);
  await hidden(page,"status",false);assert.match(await page.locator("#status").innerText(),/読み込んで/);await hidden(page,"statsError",true);
  await hidden(page,"yearlySection",action!=="trends");await hidden(page,"comparisonSection",action!=="trends");
  await hidden(page,"rankingSection",action!=="rankings");await hidden(page,"overviewSection",true);
  if(action==="rankings") {await hidden(page,"heroSummary",false);await hidden(page,"heroYears",true);assert.equal(await page.locator("#heroSongs").innerText(),"全117曲");}
  else await hidden(page,"heroSummary",true);
  const labels=await page.locator(".stats-discovery-label").allTextContents();
  assert.deepEqual(labels.map(x=>x.trim()),action==="rankings" ? ["LONGEST GAP","LATEST PERFORMANCE","MOST EVENTS VENUE"] : action==="singerList" ? ["TOP SOLO SINGING NAME"] : []);
  await healthy(ctx);
});

for(const failed of actions)test(`partial failure ${failed} preserves successful sections and final fallback`,async t=>{
  const ctx=await open(t),{page}=ctx;
  for(const action of actions)await settle(page,action,{fail:action===failed});
  await hidden(page,"statsError",true);await hidden(page,"status",false);assert.match(await page.locator("#status").innerText(),/一部の統計データ/);
  await hidden(page,"yearlySection",failed==="trends");await hidden(page,"rankingSection",failed==="rankings");await hidden(page,"overviewSection",failed==="rankings");
  if(failed==="singerList")assert.equal((await page.locator(".stats-overview-value").allTextContents()).at(-1),"20");
  if(failed==="trends")assert.equal(await page.locator("#heroYears").innerText(),"年別データ");
  if(failed==="rankings"){await hidden(page,"heroSummary",true);assert.equal(await page.locator("#discoveryCards a").count(),1);}
  await healthy(ctx,1);
});
for(const success of actions)test(`only ${success} succeeds without invented zero sections`,async t=>{
  const ctx=await open(t),{page}=ctx;for(const action of actions)await settle(page,action,{fail:action!==success});
  await hidden(page,"statsError",true);await hidden(page,"overviewSection",success!=="rankings");await hidden(page,"rankingSection",success!=="rankings");await hidden(page,"yearlySection",success!=="trends");await healthy(ctx,2);
});
test("all failures retain the existing whole-page error",async t=>{
  const ctx=await open(t);for(const action of actions)await settle(ctx.page,action,{fail:true});
  await hidden(ctx.page,"status",true);await hidden(ctx.page,"statsError",false);assert.equal(await ctx.page.locator("#statsError").innerText(),"統計データを取得できませんでした。");await healthy(ctx,3);
});

for(const first of [false,true])test(`metric/mode changes ${first ? "after" : "before"} trends preserve selection through later responses`,async t=>{
  const ctx=await open(t),{page}=ctx;if(first)await settle(page,"trends");
  if(first){
    await page.locator('[data-metric="eventCount"]').click();await page.locator('[data-chart-mode="line"]').click();
  } else {
    // The controls are intentionally hidden until trends arrive. Exercise the
    // handler defensively, not as a user-visible pre-load interaction.
    await page.locator('[data-metric="eventCount"]').evaluate(button=>button.click());
    await page.locator('[data-chart-mode="line"]').evaluate(button=>button.click());
  }
  if(!first){await hidden(page,"yearlySection",true);assert.equal(await page.evaluate(()=>window.statsCharts.length),0);await settle(page,"trends");}
  await page.waitForFunction(()=>window.statsCharts.some(x=>!x.destroyed&&x.id==="yearlyChart"&&x.config.type==="line"));
  const before=await page.evaluate(()=>window.statsCharts.length);
  await settle(page,"singerList");await settle(page,"rankings");
  assert.equal(await page.locator('[data-metric="eventCount"]').getAttribute("class"),"stats-metric-button active");
  assert.match(await page.locator('[data-chart-mode="line"]').getAttribute("class"),/active/);
  assert.deepEqual(await page.evaluate(()=>window.statsCharts.find(x=>!x.destroyed&&x.id==="yearlyChart").config.data.datasets[0].data),[2,20,7]);
  assert.equal(await page.evaluate(()=>window.statsCharts.length),before);assert.equal(await page.evaluate(()=>window.statsCharts.filter(x=>!x.destroyed).length),2);await healthy(ctx);
});
test("empty successful payloads keep existing empty-result semantics",async t=>{
  const ctx=await open(t);for(const action of actions)await settle(ctx.page,action,{data:{}});
  await hidden(ctx.page,"status",true);assert.equal(await ctx.page.locator("#heroYears").innerText(),"年別データ");assert.equal(await ctx.page.locator("#heroSongs").innerText(),"全0曲");await hidden(ctx.page,"discoverySection",true);await healthy(ctx);
});
test("legacy rankings breakdown and singer failure retain established fallback",async t=>{
  const ctx=await open(t);await settle(ctx.page,"singerList",{fail:true});await settle(ctx.page,"rankings",{data:{summary:{songCount:111,singerCount:20}}});await settle(ctx.page,"trends");
  assert.deepEqual((await ctx.page.locator(".stats-overview-value").allTextContents()).slice(0,3),["117","111","6"]);await healthy(ctx,1);
});
test("missing Chart library does not block rankings/overview or reject API success",async t=>{
  const ctx=await open(t,{noChart:true});for(const action of actions)await settle(ctx.page,action);await hidden(ctx.page,"overviewSection",false);await hidden(ctx.page,"status",true);assert.match(await ctx.page.locator("#yearlyNote").textContent(),/ライブラリ/);await healthy(ctx);
});
test("rendering exceptions are consumed without an unhandled promise",async t=>{
  const ctx=await open(t,{chartThrows:true});for(const action of actions)await settle(ctx.page,action);await hidden(ctx.page,"rankingSection",false);assert.match(await ctx.page.locator("#status").innerText(),/一部の統計データ/);await healthy(ctx,1);
});
test("request parameters, cache, retry/timeout policy and parallel start are unchanged",async t=>{
  const ctx=await open(t);
  const requests=await ctx.page.evaluate(()=>window.statsRequests.map(({action,params,options})=>({action,params,options})));
  assert.deepEqual(requests,actions.map(action=>({action,params:action==="rankings" ? {limit:1000,year:"",category:"",schema:"4.2.1"} : {},options:{timeoutMs:30000,retryCount:1,cache:true,cacheTtlMs:300000}})));
  for(const action of actions)await settle(ctx.page,action);await healthy(ctx);
});
for(const width of [1280,390])test(`progressive and completed responsive layout (${width}px)`,async t=>{
  const ctx=await open(t,{width});await settle(ctx.page,"trends");await healthy(ctx);await settle(ctx.page,"rankings");await healthy(ctx);await settle(ctx.page,"singerList");await complete(ctx);
});
