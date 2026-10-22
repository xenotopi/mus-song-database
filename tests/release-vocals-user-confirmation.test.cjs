"use strict";
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=p.resolve(__dirname,'..'),data=require('../data/release-vocals.json'),pointer=require('../data/current.json'),base=p.join(root,'data/snapshots',pointer.revision),{validateVocalData,expectedVocals}=require('../tools/validate-release-vocals.cjs');
const sources=Object.fromEntries(fs.readdirSync(p.join(base,'releases')).map(f=>[f.slice(0,-5),JSON.parse(fs.readFileSync(p.join(base,'releases',f))).data]));
const clone=x=>JSON.parse(JSON.stringify(x)),review=data.evidence.userReview04B;
const helper=()=>import(require('node:url').pathToFileURL(p.join(root,'assets/js/release-vocals.js')).href);
test('Published 1308 complete records and all previous singer/CV/evidence definitions unchanged',()=>{
 const old=JSON.parse(cp.execFileSync('git',['show','809f566d9558830c0d980a34c5aeadd1db6c1ddd:data/release-vocals.json'],{cwd:root,encoding:'utf8'}));
 a.equal(old.releases.reduce((n,e)=>n+e.records.length,0),1308);
 for(const e of old.releases)for(const r of e.records)a.deepEqual(data.releases.find(v=>v.releaseId===e.releaseId).records.find(v=>v.relationId===r.relationId),r);
 for(const s of old.singers)a.deepEqual(data.singers.find(v=>v.singerId===s.singerId),s);
 for(const[k,v]of Object.entries(old.evidence))a.deepEqual(data.evidence[k],v);
});
test('77 approvals are pinned to Sheet26 F/N/O and never assert original/BOX audio identity',()=>{
 a.equal(review.sourceContentSha256,'4e812cfcd0434e034324a7befffabcf6eff66360a15dbcad3ac4c895cb6c0bb1');
 a.equal(crypto.createHash('sha256').update(JSON.stringify(review.approvals)).digest('hex'),'7f7e0184f095e3e660cf6067ae5ffea9d068ac61919dfb273126f36769a28e00');
 a.equal(review.approvals.length,77);a.equal(new Set(review.approvals.map(r=>r.sourceRow)).size,77);a.equal(review.kind,'user-confirmed-recording');a.equal(review.recordingIdentity,'vocal-credit-only');validateVocalData(data,sources);
});
test('All 1385 independent/runtime names match, have no track CV, preserve all source inputs',async()=>{
 const {resolveReleaseVocals}=await helper();let count=0;
 for(const source of Object.values(sources)){const old=JSON.stringify(source),actual=resolveReleaseVocals(source,data),expected=expectedVocals(source,data);a.deepEqual(actual,expected);a.equal(JSON.stringify(source),old);a.equal(actual.length,source.includedSongs.length);a.ok(actual.every(r=>!r.text.includes('CV')));count+=actual.length;}
 a.equal(count,1385);for(const r of review.approvals)a.equal(expectedVocals(sources[r.releaseId],data).find(v=>v.relationId===r.relationId).text,'歌唱：'+r.name);
});
test('R0089 all five CD sequences bind 70 confirmed rows including 51 solos',()=>{
 const r=data.releases.find(r=>r.releaseId==='R0089').records;a.equal(r.length,70);a.deepEqual([1,2,3,4,5].map(d=>r.filter(x=>x.disc===d).length),[15,15,15,9,16]);a.equal(r.filter(r=>r.variant).length,51);
 for(const x of r){a.equal(x.basis,'user_confirmed_recording');a.deepEqual(x.evidence,['userReview04B']);a.equal(x.childReleaseId,undefined);}
 a.equal(r.find(r=>r.relationId==='RT1228').singerId,'SN0029');
});
test('Release-only singers cannot be mistaken for official Singer IDs or reordered groups',()=>{
 const custom=data.singers.filter(s=>s.scope==='release-only');a.deepEqual(custom.map(s=>s.singerId),['RVN0001','RVN0002']);a.deepEqual(custom.map(s=>s.name),['西木野真姫＆園田海未＆絢瀬絵里','絢瀬絵里＆西木野真姫＆東條希']);a.ok(custom.every(s=>!/^SN/.test(s.singerId)&&s.cv===null));
 a.equal(data.singers.find(s=>s.singerId==='SN0029').name,'星空凛＆西木野真姫');a.equal(data.singers.find(s=>s.singerId==='SN0044').name,'高坂穂乃果＆南ことり＆園田海未＆星空凛＆小泉花陽＆西木野真姫＆矢澤にこ');
});
const mutations={
 'missing approval':d=>d.evidence.userReview04B.approvals.shift(),
 'duplicate approval':d=>d.evidence.userReview04B.approvals.push(clone(d.evidence.userReview04B.approvals[0])),
 'review name mismatch':d=>d.evidence.userReview04B.approvals[0].name='μ\'s',
 'review tuple mismatch':d=>d.evidence.userReview04B.approvals[0].track=99,
 'review evidence mislabelled official':d=>d.evidence.userReview04B.kind='official-product',
 'invalid source hash':d=>d.evidence.userReview04B.sourceContentSha256='',
 'release-only name order reversed':d=>d.singers.find(s=>s.singerId==='RVN0001').memberSingerIds.reverse(),
 'release-only scope removed':d=>delete d.singers.find(s=>s.singerId==='RVN0001').scope,
 'release-only global ID assigned':d=>d.singers.find(s=>s.singerId==='RVN0001').singerId='SN0099',
 'release-only wrong member':d=>d.singers.find(s=>s.singerId==='RVN0002').memberSingerIds[2]='SN0022',
 'seven-person changed to nine':d=>d.releases.find(e=>e.releaseId==='R0090').records.find(r=>r.relationId==='RT0673').singerId='SN0001',
 'Beat in Angel reverse-ID substituted':d=>d.releases.find(e=>e.releaseId==='R0025').records[0].singerId='SN0046'
};
for(const[name,mutate]of Object.entries(mutations))test('User confirmation negative: '+name,()=>{const d=clone(data);mutate(d);a.throws(()=>validateVocalData(d,sources));});
test('Runtime rejects stale user approval and wrong custom member without modifying tracks',async()=>{
 const {resolveReleaseVocals}=await helper();for(const[mutate,releaseId]of [[mutations['review tuple mismatch'],'R0014'],[mutations['release-only wrong member'],'R0078']]){const d=clone(data);mutate(d);a.throws(()=>resolveReleaseVocals(sources[releaseId],d));}
});
