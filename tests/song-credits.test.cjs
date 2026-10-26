'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),p=require('node:path');
const root=p.resolve(__dirname,'..'),data=require('../data/song-credits.json'),current=require('../data/current.json');
const song=id=>JSON.parse(fs.readFileSync(p.join(root,'data/snapshots',current.revision,'songs',id+'.json'))).data;
const songs=new Map(data.songs.map(s=>[s.songId,song(s.songId)]));
const {validateSongCreditsData,validateSongCreditsBody}=require('../tools/song-credits-lib.cjs');
const {parseSerializedHtml}=require('../tools/static-html-readonly-lib.cjs');
let ui;
test.before(async()=>{ui=await import('data:text/javascript;base64,'+fs.readFileSync(p.join(root,'assets/js/song-credits.js')).toString('base64'));});
const expected={S005:['畑 亜貴','藤末 樹','藤末 樹・松坂 康司'],S036:['畑 亜貴','森慎太郎','森慎太郎'],S041:['畑 亜貴','佐々木裕','佐々木裕'],S046:['畑 亜貴','佐々木裕','佐々木裕']};
function doc(resolved){return parseSerializedHtml(`<!doctype html><html><head></head><body><dl id="songInfo"></dl>${ui.songCreditHeroHtml(resolved)}<div id="songCreditSources">${ui.songCreditSourcesHtml(resolved)}</div></body></html>`);}
for(const id of Object.keys(expected))test(`${id}: official scoped credits, order, sources and independent body check`,()=>{
 const result=ui.songCredits(data,song(id));a.deepEqual(result.rows.map(r=>r.value),expected[id]);a.deepEqual(result.rows.map(r=>r.label),['作詞','作曲','編曲']);
 a.equal(result.recording.relationId,{S005:'RT0005',S036:'RT0036',S041:'RT0041',S046:'RT0046'}[id]);
 validateSongCreditsBody(doc(result),id,validateSongCreditsData(data,songs));
});
test('unregistered Song has no credit fields or sources; inputs remain unchanged',()=>{const before=JSON.stringify(data),s=song('S001'),original=JSON.stringify(s),d=structuredClone(data);d.songs=d.songs.filter(s=>s.songId!=='S001');a.equal(ui.songCredits(d,s),null);a.equal(ui.songCreditRowsHtml(null),'');a.equal(ui.songCreditSourcesHtml(null),'');a.equal(JSON.stringify(data),before);a.equal(JSON.stringify(s),original);});
for(const [label,change] of [
 ['partial despite display permission',d=>d.songs[0].credits.forEach(c=>c.verificationStatus='partial')],
 ['verified without display permission',d=>d.songs[0].credits.forEach(c=>c.publishAllowed=false)]
])test(label+' is hidden',()=>{const d=structuredClone(data);change(d);a.equal(ui.songCredits(d,song('S005')),null);const checked=validateSongCreditsData(d,songs);validateSongCreditsBody(doc(null),'S005',checked);});
for(const [label,change] of [
 ['wrong Relation',d=>d.songs[0].recording.relationId='RT0041'],
 ['wrong version',d=>d.songs[0].recording.songVersion='Solo Mix'],
 ['wrong edition',d=>d.evidence[0].catalogNumber='LACA-2019'],
 ['wrong evidence track',d=>d.evidence[0].track=2],
 ['unverified evidence',d=>d.evidence[0].verificationStatus='partial'],
 ['evidence_only role',d=>d.songs[0].credits[0].role='evidence_only'],
 ['duplicate contributor order',d=>d.songs[0].credits[3].displayOrder=1],
 ['unsafe source URL',d=>d.evidence[0].url='javascript:alert(1)'],
 ['duplicate Song ID',d=>d.songs.push(structuredClone(d.songs[0]))]
])test('reject '+label,()=>{const d=structuredClone(data);change(d);a.equal(ui.songCredits(d,song('S005')),null);a.throws(()=>validateSongCreditsData(d,songs));});
test('3/9-person entries do not inherit or overwrite each other',()=>{const d=structuredClone(data);d.songs=d.songs.filter(s=>s.songId!=='S041');a.equal(ui.songCredits(d,song('S041')),null);a.ok(ui.songCredits(d,song('S046')));});
test('independent serialized validator rejects missing, changed and duplicate fields/sources',()=>{const resolved=ui.songCredits(data,song('S005')),checked=validateSongCreditsData(data,songs),html=`<!doctype html><html><head></head><body><dl id="songInfo"></dl>${ui.songCreditHeroHtml(resolved)}<div id="songCreditSources">${ui.songCreditSourcesHtml(resolved)}</div></body></html>`;
 validateSongCreditsBody(parseSerializedHtml(html),'S005',checked);
 for(const bad of [html.replace('藤末 樹・松坂 康司','別人'),html.replace('</dl>',ui.songCreditRowsHtml(resolved)+'</dl>'),html.replace('<details','<details open'),html.replace('https://akihata.jp/works/music/388/','https://example.test/wrong')])a.throws(()=>validateSongCreditsBody(parseSerializedHtml(bad),'S005',checked));
});
test('text is escaped and absent roles produce no placeholder',()=>{const d=structuredClone(data);d.songs[0].credits=d.songs[0].credits.filter(c=>c.role==='lyricist');d.songs[0].credits[0].creditedName='<script>&"';const result=ui.songCredits(d,song('S005'));a.match(ui.songCreditRowsHtml(result),/&lt;script&gt;&amp;&quot;/);a.equal(result.rows.length,1);});
test('capture fingerprint covers sidecar and modules without executing generation',()=>{const {SONG_RENDERER_FILES}=require('../tools/generate-song-pages.cjs');for(const f of ['data/song-credits.json','assets/js/song-credits.js','tools/song-credits-lib.cjs'])a.ok(SONG_RENDERER_FILES.includes(f),f);});
for(const [label,fetcher]of [['network rejection',()=>Promise.reject(new Error('offline'))],['HTTP failure',()=>Promise.resolve({ok:false})],['invalid JSON',()=>Promise.resolve({ok:true,json:()=>Promise.reject(new Error('invalid JSON'))})]])test('optional loader preserves Song on '+label,async t=>{t.mock.method(globalThis,'fetch',fetcher);const fresh=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(p.join(root,'assets/js/song-credits.js'),'utf8')+'\n// '+label).toString('base64'));a.equal(await fresh.loadSongCredits(song('S005')),null);});

test('117 distinct baseline Songs have all three verified roles without adding Song/Relation IDs',()=>{
 const formal=Object.keys(require('../song/manifest.json').pages).sort();a.equal(data.songs.length,117);a.deepEqual(data.songs.map(s=>s.songId).sort(),formal);
 a.equal(data.songs.flatMap(s=>s.credits).length,353);a.equal(new Set(data.songs.flatMap(s=>s.credits).map(c=>c.creditId)).size,353);
 for(const s of data.songs)for(const role of ['lyricist','composer','arranger'])a.ok(s.credits.some(c=>c.role===role&&c.verificationStatus==='verified'),s.songId+' '+role);
 validateSongCreditsData(data,songs);
});
test('nine user-confirmed original CDs bind exact catalogs and Track1; approved publication retains exact evidence bindings',()=>{
 const wanted={S059:['R0032','RT0059','BEPC-0004'],S075:['R0041','RT0075','LAPP-1054'],S090:['R0052','RT0090','BEPC-0012'],S091:['R0052','RT0091','BEPC-0013'],S092:['R0052','RT0092','BEPC-0011'],S095:['R0054','RT0095','LZM-2126'],S096:['R0055','RT0096','LZM-2127'],S097:['R0056','RT0097','LZM-2128'],S104:['R0060','RT0104','LAPP-1076']};
 for(const [id,values]of Object.entries(wanted)){const s=data.songs.find(s=>s.songId===id),r=s.recording,e=data.evidence.find(e=>e.evidenceId===r.identityEvidenceRefs[0]);a.deepEqual([r.releaseId,r.relationId,r.catalogNumber],values);a.equal(r.disc,1);a.equal(r.track,1);a.equal(e.kind,'user_confirmation');a.equal(Object.hasOwn(e,'url'),false);a.deepEqual(e.confirmation.assertions.tracks.map(t=>[t.track,t.kind]),[[1,'song'],[2,'off_vocal'],...(id==='S104'?[[3,'drama'],[4,'drama'],[5,'drama']]:[])]);a.ok(s.credits.every(c=>c.publishAllowed===true));a.equal(ui.songCredits(data,song(id)).rows.length,3);}
});
test('S011 correction retains former claim; S075 is user adoption; S059 is agency evidence',()=>{
 const c=data.songs.find(s=>s.songId==='S011').credits.find(c=>c.role==='composer');a.equal(c.creditedName,'奥松誠');a.equal(c.verificationStatus,'verified');a.equal(c.publishAllowed,true);a.equal(c.history.at(-1).prior.creditedName,'近藤 昭雄');a.ok(c.history.at(-1).prior.evidenceRefs.every(ref=>data.evidence.some(e=>e.evidenceId===ref)));a.equal(data.evidence.find(e=>e.evidenceId===c.evidenceRefs[0]).confirmation.type,'creator_correction_report');
 const arranger=id=>data.songs.find(s=>s.songId===id).credits.find(c=>c.role==='arranger'),adopt=arranger('S075');a.equal(adopt.creditedName,'前口渉');a.equal(data.evidence.find(e=>e.evidenceId===adopt.evidenceRefs[0]).confirmation.type,'explicit_credit_adoption');a.equal(data.evidence.find(e=>e.evidenceId===arranger('S059').evidenceRefs[0]).kind,'creator_agency_official');
});
const userSource=d=>d.evidence.find(e=>e.evidenceId==='SC-USER-S075-ARRANGER-ADOPTION');
for(const [label,id,change]of [
 ['missing statement','S075',d=>{delete userSource(d).confirmation.statement;}],
 ['fabricated official URL/kind','S075',d=>Object.assign(userSource(d),{kind:'publisher_official',url:'https://example.test/fake'})],
 ['user credit public without separate approval','S075',d=>{delete d.publicationApproval;d.songs.find(s=>s.songId==='S075').credits.find(c=>c.role==='arranger').publishAllowed=true;}],
 ['wrong confirmed credit name','S075',d=>{userSource(d).confirmation.assertions.creditedNames=['別人'];}],
 ['wrong confirmed catalog','S059',d=>{d.evidence.find(e=>e.evidenceId==='SC-USER-S059-IDENTITY').confirmation.assertions.catalogNumber='BEPC-9999';}],
 ['invented second disc','S059',d=>{d.evidence.find(e=>e.evidenceId==='SC-USER-S059-IDENTITY').confirmation.assertions.discCount=2;}],
 ['missing recording confirmation reference','S059',d=>{delete d.songs.find(s=>s.songId==='S059').recording.identityEvidenceRefs;}]
])test('typed user evidence rejects '+label,()=>{const d=structuredClone(data);change(d);a.equal(ui.songCredits(d,song(id)),null);a.throws(()=>validateSongCreditsData(d,songs));});

test('all 117 publication candidates match independent HTML expectations; user evidence is not an invented official link',()=>{
 const checked=validateSongCreditsData(data,songs);
 for(const s of data.songs){a.ok(s.credits.every(c=>c.publishAllowed===true));const result=ui.songCredits(data,song(s.songId));a.equal(result.rows.length,3);validateSongCreditsBody(doc(result),s.songId,checked);if(result.sources.some(e=>e.kind==='user_confirmation')){const html=ui.songCreditSourcesHtml(result);a.match(html,/ユーザー確認資料/);a.doesNotMatch(html,/undefined|physical_item_report|creator_correction_report/);}}
 const result=ui.songCredits(data,song('S075')),html=ui.songCreditSourcesHtml(result);a.throws(()=>validateSongCreditsBody(parseSerializedHtml('<!doctype html><html><body><dl id="songInfo"></dl>'+ui.songCreditHeroHtml(result)+'<div id="songCreditSources">'+html.replace('ユーザー確認資料','<a href="https://example.test/fake">ユーザー確認資料</a>')+'</div></body></html>'),'S075',checked));
});
