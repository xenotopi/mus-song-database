"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {validateReleaseBody}=require("../tools/validate-static-html.cjs");
const {parseSerializedHtml}=require("../tools/static-html-readonly-lib.cjs");
const {releaseBody}=require("./helpers/release-body-fixture.cjs");
const {createFixture}=require("./helpers/static-html-validator-fixture.cjs");
const root=path.resolve(__dirname,".."),pointer=require("../data/current.json");
const base=path.join(root,"data/snapshots",pointer.outputRevision),list=JSON.parse(fs.readFileSync(path.join(base,"release-list.json"))).data;
const read=id=>JSON.parse(fs.readFileSync(path.join(base,"releases",id+".json"))).data;
const wrap=(r,body)=>parseSerializedHtml('<!DOCTYPE html><html data-release-id="'+r.releaseId+'"><head></head><body>'+body+'</body></html>');
const inspect=(r,body)=>validateReleaseBody(wrap(r,body),r,list);
for(const item of list.filter(r=>r.releaseId!=="R0072"))test("independent snapshot body "+item.releaseId,()=>{
 const r=read(item.releaseId);assert.doesNotThrow(()=>inspect(r,releaseBody(r,list)));
});
test("snapshot coverage is 99 complete / 14 not_applicable / 1 special_hold",()=>{
 const counts={};for(const r of list.map(i=>read(i.releaseId)))counts[r.includedSongsMeta.status]=(counts[r.includedSongsMeta.status]||0)+1;
 assert.deepEqual(counts,{complete:99,not_applicable:14,special_hold:1});
});
test("Release entrypoint CSS equals actual opt-in stylesheet references",()=>{
 const registry=require("./active-entrypoints.json"),html=fs.readFileSync(path.join(root,"release.html"),"utf8");
 const styles=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)/g)].map(m=>m[1]);
 assert.deepEqual(registry.pages["release.html"].css,styles);
 assert.deepEqual(styles,["assets/css/style.css","assets/css/link-ui.css","assets/css/release-detail.css"]);
});
function negative(name,id,mutate,pattern){
 test("reject "+name,()=>{const r=read(id),before=releaseBody(r,list),after=mutate(before);assert.notEqual(after,before,"mutation must take effect");assert.throws(()=>inspect(r,after),pattern);});
}
const firstRow=/<a class="release-included-song-row"[^>]*>[\s\S]*?<\/a>/;
negative("missing row","R0070",h=>h.replace(firstRow,""),/multiplicity/);
negative("duplicate row","R0070",h=>h.replace(firstRow,m=>m+m),/multiplicity/);
negative("wrong Song link","R0010",h=>h.replace('href="song/S017.html"','href="song/S018.html"'),/href/);
negative("wrong RT ID","R0010",h=>h.replace(/data-relation-id="RT\d+"/,'data-relation-id="RT9999"'),/RT identity/);
negative("wrong title with same href","R0010",h=>h.replace('class="release-included-song-title">','class="release-included-song-title">WRONG'),/included Song title/);
negative("invented Track","R0010",h=>h.replace('class="release-included-song-title">','class="release-track-number">1</span><span class="release-included-song-title">'),/Track/);
negative("wrong Track","R0070",h=>h.replace('class="release-track-number">1<','class="release-track-number">2<'),/Track/);
negative("relation count confused with unique Songs","R0081",h=>h.replace('46トラック（39曲）','46曲'),/count label/);
negative("wrong Disc","R0070",h=>h.replace('<summary>Disc 1','<summary>Disc 2'),/Disc\/heading/);
negative("missing origin","R0010",h=>h.replace('<span class="release-origin">初出・由来</span>',""),/origin set/);
negative("duplicate origin","R0010",h=>h.replace('<span class="release-origin">初出・由来</span>',m=>m+m),/origin set/);
negative("store reassignment","R0052",h=>h.replace('ゲーマーズ｜','アニメイト｜'),/store/);
negative("R0052 technical note visible","R0052",h=>h.replace('class="release-registration-details" hidden','class="release-registration-details"'),/technical note/);
negative("mixed Mix omission","R0081",h=>h.replace(/<span class="release-variant">[^<]+<\/span>/,""),/variant/);
negative("R0089 mixed Mix omission","R0089",h=>h.replace(/<span class="release-variant">[^<]+<\/span>/,""),/variant/);
negative("Movie Edit omission","R0090",h=>h.replace('<span class="release-variant">Movie Edit</span>',""),/variant/);
negative("wrong uniform Mix heading","R0088",h=>h.replace('Disc 1 · HONOKA Mix','Disc 1 · ELI Mix'),/heading variant/);
negative("Disc1 closed","R0088",h=>h.replace('is-selected" open','is-selected"'),/initial Disc state/);
negative("deleted member option","R0088",h=>h.replace(/<option value="SN0004">[^<]+<\/option>/,""),/members/);
negative("disabled member enrichment","R0088",h=>h.replace('data-box-member>','data-box-member disabled>'),/enrichment incomplete/);
negative("restored search","R0088",h=>h.replace('<p data-box-status>','<input data-box-search><p data-box-status>'),/removed BOX search/);
negative("removed selector Disc","R0088",h=>h.replace('<option value="release-disc-27">Disc 27</option>',""),/Disc selector/);
negative("wrong child URL","R0088",h=>h.replace('href="release/R0106.html"','href="release/R0001.html"'),/related identities/);
negative("wrong parent URL","R0106",h=>h.replace('href="release/R0088.html"','href="release/R0077.html"'),/related identities/);
negative("publicNote dropped","R0068",h=>h.replace(/<p class="release-coverage-note">[^<]+<\/p>/,""),/publicNote/);
negative("publicNote hidden","R0068",h=>h.replace('class="release-coverage-note"','class="release-coverage-note" hidden'),/publicNote/);
negative("hero date changed","R0032",h=>h.replace("2013/09/25","2014/09/25"),/hero date/);
negative("Release ID changed","R0010",h=>h.replace('<h1>','<h1>wrong'),/body title/);
test("duplicate snapshot RT is rejected even with matching DOM",()=>{
 const r=structuredClone(read("R0010"));r.includedSongs[1].relationId=r.includedSongs[0].relationId;
 assert.throws(()=>inspect(r,releaseBody(r,list)),/RT ID duplicate/);
});
test("outside origin preserved separately, intersection marked only once",()=>{
 const r=structuredClone(read("R0010"));r.debutSongs.push({songId:"S117",songName:"Fixture outside origin"});
 const body=releaseBody(r,list);inspect(r,body);
 assert.throws(()=>inspect(r,body.replace(/<a class="release-song-row"[^>]*>[\s\S]*?<\/a>/,"")),/related identities/);
});
test("partial Disc/Track and unknown variant never acquire guessed positions",()=>{
 const r=structuredClone(read("R0070"));r.includedSongs[0].disc=null;r.includedSongs[0].track=null;r.includedSongs[1].variant="Fixture mixed version";
 inspect(r,releaseBody(r,list));
});
test("partial, unreviewed, complete-empty and not_applicable states stay distinct",()=>{
 for(const status of ["partial","unreviewed","complete","not_applicable"]){
  const r={releaseId:"R9001",releaseName:"Fixture empty",classification:"CD",releaseType:"シングル",includedSongs:[],debutSongs:[],relatedEvents:[],includedSongsMeta:{status,...(status==="partial"?{confirmedCount:0,pendingCount:2}:{})}};
  inspect(r,releaseBody(r,list));
  if(status==="partial")assert.throws(()=>inspect(r,releaseBody(r,list).replace("確認中2件","確認中0件")),/progress/);
 }
});
for(const [name,id,change,pattern] of [
 ["missing Relation","R0088",h=>h.replace(firstRow,""),/multiplicity/],
 ["wrong RT","R0088",h=>h.replace(/data-relation-id="RT\d+"/,'data-relation-id="RT9999"'),/RT identity/],
 ["wrong shared Mix","R0088",h=>h.replace("Disc 1 · Fixture Mix 0","Disc 1 · Wrong Mix"),/heading variant/],
 ["restored BOX search","R0088",h=>h.replace("<p data-box-status>","<input data-box-search><p data-box-status>"),/removed BOX search/],
 ["linked dedicated Song","R0072",h=>h.replace('<h3>Fixture KP Song 1</h3>','<h3><a href="song/S118.html">Fixture KP Song 1</a></h3>'),/stay nonlink/]
])test("full validator returns FAIL for "+name+" despite matching output hashes",()=>{
 const f=createFixture(),before=f.files.get("release/"+id+".html").toString(),after=change(before);assert.notEqual(after,before);
 f.editHtml("release",id,()=>after,true);
 const result=require("../tools/validate-static-html.cjs").validateStaticHtml(f.options);
 assert.equal(result.status,"FAIL");assert.equal(result.reusable,false);assert.match(result.issues.find(i=>i.severity==="FAIL").message,pattern);
});
test("all Release renderer dependencies reject stale synthetic capture receipts independently of formal gate",t=>{
 const generator=require("../tools/generate-release-pages.cjs"),initial=generator.rendererFingerprint(),f=createFixture(),readFileSync=fs.readFileSync;
 for(const file of generator.RELEASE_RENDERER_FILES){
  const target=path.join(root,file),mock=t.mock.method(fs,"readFileSync",function(name,...args){const value=readFileSync.call(this,name,...args);return name===target?value+"\n/* TEST ONLY: changed dependency */\n":value;});
  try{
   assert.notEqual(generator.rendererFingerprint(),initial,file);
   const result=require("../tools/validate-static-html.cjs").validateStaticHtml(f.options);
   assert.equal(result.status,"FAIL",file);assert.match(result.issues.find(i=>i.severity==="FAIL").message,/renderer/);
  }finally{mock.mock.restore();}
 }
 assert.equal(generator.rendererFingerprint(),initial);
});
