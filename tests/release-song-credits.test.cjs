const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),p=require('path'),{pathToFileURL}=require('url');
const root=p.resolve(__dirname,'..'),data=require('../data/song-credits.json'),current=require('../data/current.json');
const release=id=>require(p.join(root,'data/snapshots',current.revision,'releases',id+'.json')).data;
let resolve;
test.before(async()=>{resolve=(await import(pathToFileURL(p.join(root,'assets/js/release-song-credits.js')).href)).resolveReleaseSongCredits;});
const names=(id,rt)=>resolve(release(id),data).find(r=>r.relationId===rt)?.rows.map(r=>r.value);
test('original Single reuses exact Song names, multiple arranger order and both Relation IDs',()=>{a.deepEqual(names('R0003','RT0005'),['畑 亜貴','藤末 樹','藤末 樹・松坂 康司']);a.equal(resolve(release('R0003'),data).length,2);});
test('START 3/9-person original recordings stay separate',()=>{a.deepEqual(names('R0019','RT0041'),['畑 亜貴','佐々木裕','佐々木裕']);a.deepEqual(names('R0022','RT0046'),['畑 亜貴','佐々木裕','佐々木裕']);});
test('Movie Blu-ray bonus preserves multiple composers and collective arranger',()=>{a.deepEqual(names('R0063','RT0109'),['畑 亜貴','伊藤真澄・ミト','TO-MAS SOUNDSIGHT FLUORESCENT FOREST']);});
test('three independent store CDs use original Relations, not invented disc positions',()=>{const r=release('R0052');a.equal(r.includedSongs.length,3);a.deepEqual(resolve(r,data).map(x=>[x.relationId,x.rows.length]),[['RT0090',3],['RT0091',3],['RT0092',3]]);});
for(const id of ['R0070','R0106','R0082'])test(id+' only shares work roles; album/Solo/Movie Edit arranger is not inferred',()=>{const rows=resolve(release(id),data);a.ok(rows.length);a.ok(rows.every(x=>x.rows.every(r=>r.role!=='arranger')));a.ok(rows.every(x=>x.rows.some(r=>r.role==='lyricist')&&x.rows.some(r=>r.role==='composer')));});
for(const [name,change]of [
 ['different Mix',r=>r.includedSongs[0].variant='Unconfirmed Mix'],
 ['different track',r=>r.includedSongs[0].track=99],
 ['different disc',r=>r.includedSongs[0].disc=9],
 ['different Relation',r=>r.includedSongs[0].relationId='RT9999']
])test('arranger hidden for '+name,()=>{const r=structuredClone(release('R0003'));change(r);const rows=resolve(r,data)[0].rows;a.deepEqual(rows.map(x=>x.role),['lyricist','composer']);});
for(const [name,change]of [
 ['partial',c=>c.verificationStatus='partial'],['not allowed',c=>c.publishAllowed=false]
])test('only verified and allowed roles shown: '+name,()=>{const d=structuredClone(data);d.songs.find(s=>s.songId==='S005').credits.filter(c=>c.role==='arranger').forEach(change);a.deepEqual(resolve(release('R0003'),d)[0].rows.map(r=>r.role),['lyricist','composer']);});
test('malformed source, missing publication approval and duplicates fail closed',()=>{
 const d=structuredClone(data);d.evidence[0].catalogNumber='wrong';a.equal(resolve(release('R0003'),d).some(x=>x.songId==='S005'),false);
 const denied=structuredClone(data);delete denied.publicationApproval;a.equal(resolve(release('R0052'),denied).length,0);
 const r=structuredClone(release('R0003'));r.includedSongs.push(r.includedSongs[0]);a.deepEqual(resolve(r,data),[]);
 const duplicate=structuredClone(data);duplicate.songs.push(duplicate.songs[0]);a.deepEqual(resolve(release('R0003'),duplicate),[]);
});
test('unlinked video/BGM/Off Vocal never creates credits or new Song/Relation IDs',()=>{a.deepEqual(resolve(release('R0086'),data),[]);a.deepEqual(resolve(release('R0075'),data),[]);a.deepEqual(resolve(release('R0003'),null),[]);const d=structuredClone(data);d.songs=d.songs.filter(s=>s.songId!=='S005');a.equal(resolve(release('R0003'),d).length,1);});
test('source JSON, recordings, names, order and original Release data stay immutable',()=>{const d=JSON.stringify(data),r=release('R0071'),before=JSON.stringify(r);resolve(r,data);a.equal(JSON.stringify(data),d);a.equal(JSON.stringify(r),before);});
test('future Release capture pins adapter and sole credit source, without altering Song renderer dependencies',()=>{const g=require('../tools/generate-release-pages.cjs');for(const f of ['assets/js/release-song-credits.js','assets/js/song-credits.js','data/song-credits.json'])a.ok(g.RELEASE_RENDERER_FILES.includes(f));});
test('independent Release credit validator rejects wrong names, duplicate/absent credits and arranger inherited by Movie Edit',()=>{
 const{validateReleaseCreditSources,validateReleaseSongCreditsBody}=require('../tools/song-credits-lib.cjs'),{parseSerializedHtml}=require('../tools/static-html-readonly-lib.cjs');
 const releases=Object.fromEntries(fs.readdirSync(p.join(root,'data/snapshots',current.revision,'releases')).map(f=>[f.slice(0,-5),release(f.slice(0,-5))])),map=validateReleaseCreditSources(data,releases);
 for(const id of ['R0003','R0082']){const r=release(id),expected=resolve(r,data),markup=expected.map(x=>`<a class="release-included-song-row" data-relation-id="${x.relationId}"><span class="release-included-song-copy"><span class="release-included-song-title">title</span><span class="release-recording-vocal">vocal</span><span class="release-song-credits">${x.rows.map(c=>`<span data-release-credit="${c.role}">${c.label}：${c.value}</span>`).join(' ／ ')}</span><span class="release-included-song-meta">Mix</span></span></a>`).join(''),doc=html=>parseSerializedHtml('<!doctype html><html><head></head><body>'+html+'</body></html>');
  validateReleaseSongCreditsBody(doc(markup),r,map,data);
  for(const bad of [markup.replace('畑 亜貴','別人'),markup.replace('class="release-song-credits"','class="missing"'),markup+markup])a.throws(()=>validateReleaseSongCreditsBody(doc(bad),r,map,data));
  if(id==='R0082')a.throws(()=>validateReleaseSongCreditsBody(doc(markup.replace('</span><span class="release-included-song-meta">',' ／ <span data-release-credit="arranger">編曲：推測名義</span></span><span class="release-included-song-meta">')),r,map,data));
 }
});
