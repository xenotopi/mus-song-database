"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),p=require("node:path"),os=require("node:os"),{EventEmitter}=require("node:events");
const generator=require("../tools/generate-release-pages.cjs"),validator=require("../tools/validate-static-html.cjs");
const {parseSerializedHtml}=require("../tools/static-html-readonly-lib.cjs");
const {createFixture}=require("./helpers/static-html-validator-fixture.cjs"),{releaseBody}=require("./helpers/release-body-fixture.cjs"),{assertReleaseDom}=require("./helpers/release-e2e-assertions.cjs");
const root=p.resolve(__dirname,".."),pointer=require("../data/current.json"),base=p.join(root,"data/snapshots",pointer.outputRevision),read=f=>JSON.parse(fs.readFileSync(p.join(base,f))).data,list=read("release-list.json");
const expected={
 R0032:"1期Blu-ray全巻購入特典。1期Blu-ray最終巻発売日基準：2013/09/25。収録情報：ぷわぷわーお！",
 R0052:"2期Blu-ray全巻購入特典。2期Blu-ray最終巻発売日基準：2014/12/25。店舗別の収録情報：CheerDay CheerGirl!、同じ星が見たい、Silent tonight。"
};
for(const id of Object.keys(expected))test(id+" exact approved SEO, independent validator matches",()=>{
 const r=read("releases/"+id+".json"),before=JSON.stringify(r);
 assert.equal(generator.releaseDescription(r),expected[id]);assert.equal(validator.releaseDescription(r),expected[id]);assert.equal(JSON.stringify(r),before);
});
test("the two date-basis descriptions never invent a missing source date",()=>{
 for(const id of Object.keys(expected)){const r={...read("releases/"+id+".json"),releaseDate:null};assert.equal(generator.releaseDescription(r),validator.releaseDescription(r));assert.match(generator.releaseDescription(r),/発売日未登録/);}
});
test("other 112 descriptions are byte-for-byte unchanged from the legacy algorithm",()=>{
 let checked=0;
 for(const item of list){if(expected[item.releaseId])continue;const r=read("releases/"+item.releaseId+".json"),rows=r.includedSongs;
  const text=rows.length?"収録情報："+rows.slice(0,3).map(s=>s.displayName||s.songName).join("、")+(rows.length>3?"ほか"+(rows.length-3)+"件":"")+"。":"収録楽曲の登録はありません。";
  const legacy=r.releaseName+"（"+(r.releaseDate||"発売日未登録")+"発売、"+(r.releaseType||r.classification||"リリース")+"）の詳細。"+text;
  assert.equal(generator.releaseDescription(r),legacy,item.releaseId);assert.equal(validator.releaseDescription(r),legacy,item.releaseId);checked++;
 }assert.equal(checked,112);
});
test("synthetic meta description and og:description agree, head identity remains intact",()=>{
 const f=createFixture();
 for(const id of Object.keys(expected)){
  const r=f.getJson(f.prefix+"releases/"+id+".json").data,doc=parseSerializedHtml(f.files.get("release/"+id+".html").toString());
  assert.equal(doc.nodes.find(n=>n.tag==="meta"&&n.attrs.name==="description").attrs.content,generator.releaseDescription(r));
  assert.equal(doc.nodes.find(n=>n.tag==="meta"&&n.attrs.property==="og:description").attrs.content,generator.releaseDescription(r));
 }
 assert.equal(validator.validateStaticHtml(f.options).status,"PASS");
});
for(const id of Object.keys(expected))for(const property of ["name","property"])test(id+" rejects stale "+property+" description despite matching synthetic hash",()=>{
 const f=createFixture(),key=property==="name"?"description":"og:description";
 f.editHtml("release",id,h=>h.replace(new RegExp('<meta '+property+'="'+key+'"[^>]+>'),'<meta '+property+'="'+key+'" content="2014-12-25発売">'),true);
 const result=validator.validateStaticHtml(f.options);assert.equal(result.status,"FAIL");assert.match(result.issues[0].message,/description/);
});
class Response extends EventEmitter{
 writeHead(status,headers){this.status=status;this.headers=headers;}
 end(body){this.body=body;this.emit("finish");}
}
function guard(read=()=>Buffer.from("/* fixture */"),audit=[]){return generator.pinReleaseCss({read,audit:row=>audit.push(row)});}
function serve(g,response=new Response()){g.serve(response);return response;}
test("CSS pin stores SHA-256/bytes and emits pre/post audit records",()=>{
 const events=[],g=guard(undefined,events),res=serve(g);let commits=0;
 assert.equal(res.status,200);assert.equal(res.headers["content-type"],"text/css; charset=utf-8");assert.equal(res.body.length,g.info.bytes);
 assert.equal(require("node:crypto").createHash("sha256").update(res.body).digest("hex"),g.info.sha256);
 g.assertLoaded(true);assert.equal(g.publish(()=>++commits),1);assert.equal(commits,1);
 assert.deepEqual(events.map(e=>[e.phase,e.status]),[["start","PASS"],["before-publish","PASS"],["after-publish","PASS"]]);
});
test("real temporary CSS changes do not change served bytes; publish is blocked",t=>{
 const dir=fs.mkdtempSync(p.join(os.tmpdir(),"release-css-fixture-")),file=p.join(dir,"test.css");t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(file,".fixture { color: purple; }");const events=[],g=guard(()=>fs.readFileSync(file),events),one=serve(g);
 fs.writeFileSync(file,".fixture { color: indigo; }");const two=serve(g);
 assert.deepEqual(two.body,one.body);let commits=0;assert.throws(()=>g.publish(()=>commits++),/CSS_CHANGED/);assert.equal(commits,0);assert.equal(events.at(-1).status,"FAIL");
});
test("response cannot mutate the private pinned buffer",()=>{
 const g=guard(),one=serve(g),expected=Buffer.from(one.body);one.body.fill(0);assert.deepEqual(serve(g).body,expected);g.publish(()=>{});
});
test("local HTTP serves pinned bytes after fixture mutation and blocks publish",async()=>{
 const http=require("node:http");let current="/* first fixture bytes */";const g=guard(()=>Buffer.from(current));
 const server=http.createServer((request,response)=>g.serve(response));
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const url="http://127.0.0.1:"+server.address().port+"/assets/css/release-detail.css";
  const before=await(await fetch(url)).text();current="/* modified fixture bytes */";
  const after=await(await fetch(url)).text();assert.equal(after,before);assert.equal(after,"/* first fixture bytes */");
  assert.throws(()=>g.publish(()=>assert.fail("publisher ran")),/CSS_CHANGED/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
for(const [name,read]of[["missing",()=>{throw Error("ENOENT");}],["unreadable",()=>{throw Error("EACCES");}],["empty",()=>Buffer.alloc(0)]])test("CSS "+name+" fails before any publisher exists",()=>assert.throws(()=>guard(read),/CSS_UNAVAILABLE/));
test("missing CSS at pre-publish blocks publisher",()=>{
 let missing=false,commits=0;const g=guard(()=>{if(missing)throw Error("ENOENT");return Buffer.from("fixture");});serve(g);missing=true;assert.throws(()=>g.publish(()=>commits++),/CSS_CHANGED/);assert.equal(commits,0);
});
test("same-length changed CSS is detected by hash before publishing",()=>{
 let value="one";const g=guard(()=>Buffer.from(value));serve(g);value="two";let commits=0;assert.throws(()=>g.publish(()=>commits++),/CSS_CHANGED/);assert.equal(commits,0);
});
test("CSS never requested cannot publish",()=>assert.throws(()=>guard().publish(()=>assert.fail("publisher ran")),/DELIVERY_INCOMPLETE/));
test("unfinished delivery cannot publish",()=>{
 const g=guard(),res=new Response();res.end=()=>{};serve(g,res);assert.throws(()=>g.publish(()=>assert.fail("publisher ran")),/DELIVERY_INCOMPLETE/);
});
test("failed response cannot publish even when a previous request succeeded",()=>{
 const g=guard();serve(g);const res=new Response();res.end=()=>{throw Error("write failed");};serve(g,res);assert.throws(()=>g.publish(()=>assert.fail("publisher ran")),/CSS_CHANGED/);
});
test("response error or premature close blocks publish",()=>{
 for(const event of["error","close"]){const g=guard(),res=new Response();res.end=()=>{};serve(g,res);res.emit(event,Error("fixture disconnect"));assert.throws(()=>g.publish(()=>assert.fail("publisher ran")),/CSS_CHANGED/);}
});
test("browser stylesheet load failure blocks publish",()=>{
 const g=guard();serve(g);assert.throws(()=>g.assertLoaded(false),/NOT_LOADED/);assert.throws(()=>g.publish(()=>assert.fail("publisher ran")),/CSS_CHANGED/);
});
test("post-publish mutation is reported FAIL, never silently accepted or rolled back",()=>{
 const events=[];let value="start",commits=0;const g=guard(()=>Buffer.from(value),events);serve(g);
 assert.throws(()=>g.publish(()=>{commits++;value="after";}),/CSS_CHANGED/);assert.equal(commits,1);assert.equal(events.at(-1).phase,"after-publish");assert.equal(events.at(-1).status,"FAIL");
});
test("generator wires fixed CSS before filesystem fallback and wraps publication",()=>{
 const s=fs.readFileSync(p.join(root,"tools/generate-release-pages.cjs"),"utf8");
 assert.ok(s.indexOf("const css = pinReleaseCss")<s.indexOf("const capture = beginCapture"));
 assert.ok(s.indexOf("pathname === css.path")<s.indexOf("const pinned = capture.source"));
 assert.match(s,/css\.assertLoaded\(await page\.evaluate/);assert.match(s,/css\.publish\(\(\) => capture\.publish/);
 assert.match(s,/meta\("description", description\)/);assert.match(s,/meta\("og:description", description, true\)/);
});
const html=(r,body)=>'<!DOCTYPE html><html data-release-id="'+r.releaseId+'"><head></head><body>'+body+'</body></html>';
test("E2E accepts origins integrated into Relation rows without independent duplicate list",()=>{
 const r=read("releases/R0015.json");assertReleaseDom(html(r,releaseBody(r,list)),r,list);
});
for(const kind of["missing","duplicate","wrong href"])test("E2E rejects "+kind+" Relation",()=>{
 const r=read("releases/R0015.json"),before=releaseBody(r,list),re=/<a class="release-included-song-row"[^>]*>[\s\S]*?<\/a>/;
 const after=kind==="missing"?before.replace(re,""):kind==="duplicate"?before.replace(re,m=>m+m):before.replace(/href="song\/S\d+\.html"/,'href="song/S999.html"');
 assert.notEqual(after,before);assert.throws(()=>assertReleaseDom(html(r,after),r,list),/multiplicity|href/);
});
test("E2E keeps independent origins outside the Relation intersection",()=>{
 const r=structuredClone(read("releases/R0015.json"));r.debutSongs.push({songId:"S117",songName:"TEST outside"});const body=releaseBody(r,list);
 assertReleaseDom(html(r,body),r,list);assert.throws(()=>assertReleaseDom(html(r,body.replace(/<a class="release-song-row"[^>]*>[\s\S]*?<\/a>/,"")),r,list),/identities/);
});
test("E2E requires dedicated R0072 snapshot rather than normal Song rows",()=>{
 const f=createFixture(),r=f.getJson(f.prefix+"releases/R0072.json").data,h=f.files.get("release/R0072.html").toString(),l=f.getJson(f.prefix+"release-list.json").data,dashboard=f.getJson(f.prefix+"kamipara-dashboard.json").data,venues=new Map(Array.from({length:4},(_,i)=>["VE000"+(i+1),"Fixture Venue "+(i+1)]));
 assert.throws(()=>assertReleaseDom(h,r,l),/dedicated snapshot/);assertReleaseDom(h,r,l,{dashboard,venues});
});
test("E2E R0088 preserves 27 Discs, members and no song-search",()=>{
 const r=read("releases/R0088.json"),body=releaseBody(r,list);assertReleaseDom(html(r,body),r,list);
 assert.throws(()=>assertReleaseDom(html(r,body.replace("<p data-box-status>","<input data-box-search><p data-box-status>")),r,list),/removed BOX search/);
});
