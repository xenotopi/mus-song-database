'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),p=require('path');
const root=p.resolve(__dirname,'..'),data=require('../data/song-unit-memberships.json'),{validateSongUnitMemberships,validateSongUnitBody}=require('../tools/song-unit-membership-lib.cjs'),{parseSerializedHtml}=require('../tools/static-html-readonly-lib.cjs');
const mod=import('data:text/javascript;base64,'+fs.readFileSync(p.join(root,'assets/js/song-unit-memberships.js')).toString('base64'));
// Independent UNIT-02 Song-ID oracle. Never derive expected membership from live singers.
const oracle={printemps:['S005','S006','S055','S056','S059','S082','S083','S090','S095','S107','S108'],lily_white:['S009','S010','S050','S051','S085','S086','S091','S097','S110','S111'],bibi:['S007','S008','S052','S053','S087','S088','S092','S096','S112','S113']};
const snapshot=require('../data/current.json').revision,song=id=>require(p.join(root,'data/snapshots',snapshot,'songs',id+'.json')).data;
test('31 explicit Song IDs match UNIT-02; 11/10/10',async()=>{const m=await mod;for(const[k,ids]of Object.entries(oracle)){a.deepEqual(data.memberships.filter(x=>x.unitKey===k).map(x=>x.songId),ids);for(const id of ids){a.equal(m.songUnitMembership(data,id).unitKey,k);a.equal(song(id).songId,id);}}a.equal(validateSongUnitMemberships(data).size,31);});
test('86 missing entries stay unregistered, not nonmember; no name/formation inference',async()=>{const m=await mod;let count=0;for(let i=1;i<=117;i++){const id='S'+String(i).padStart(3,'0');if(!data.memberships.some(x=>x.songId===id)){a.equal(m.songUnitMembership(data,id),null);count++;}}a.equal(count,86);a.equal(m.songUnitMembership(data,'Printemps'),null);a.equal(m.songUnitMembership(data,'SN0007'),null);});
test('explicit public display approval does not promote source matching to verified or audio credit',()=>{a.equal(data.publicReleaseApproved,true);a.ok(data.memberships.every(x=>x.verificationStatus==='source_matched'&&x.displayApproval==='public'));a.equal(data.scope,'song_unit_affiliation_only');a.doesNotMatch(JSON.stringify(data),/recordingId|performanceId|creditedName|reviewedBy|verifiedAt|TEST-/);});
test('lookup keeps all Song source values and actual substitute singer IDs intact',async()=>{const m=await mod,s=song('S007'),before=JSON.stringify(s),d=JSON.stringify(data);m.songUnitMembership(data,s.songId);a.equal(JSON.stringify(s),before);a.equal(JSON.stringify(data),d);a.ok(s.performances.some(x=>x.eventId==='EV0007'&&x.singerId==='SN0045'));});
for(const[name,change]of [
 ['duplicate Song',d=>d.memberships[1].songId=d.memberships[0].songId],
 ['missing row',d=>d.memberships.pop()],
 ['unknown unit',d=>d.memberships[0].unitKey='other_trio'],
 ['other singer reference',d=>d.units.printemps.displayNameRef='SN0045'],
 ['invented verified status',d=>d.memberships[0].verificationStatus='verified'],
 ['unapproved row',d=>d.memberships[0].displayApproval='pending'],
 ['wrong evidence',d=>d.evidence[0].url='https://example.com/'],
 ['recording scope',d=>d.evidence[0].scope='recording_vocal'],
 ['public approval removed',d=>d.publicReleaseApproved=false]
])test('negative rejects '+name,async()=>{const m=await mod,d=structuredClone(data);change(d);a.equal(m.songUnitMembership(d,'S005'),null);a.throws(()=>validateSongUnitMemberships(d));});
test('independent FK validation rejects a nonexistent snapshot Song',()=>{const d=structuredClone(data);d.memberships[0].songId='S999';a.throws(()=>validateSongUnitMemberships(d,new Set(Array.from({length:117},(_,i)=>'S'+String(i+1).padStart(3,'0')))),/unknown Song/);});
const body=value=>'<!doctype html><html><head></head><body><dl id="songInfo">'+value+'</dl></body></html>',field='<dt>所属ユニット</dt><dd>Printemps</dd>';
test('independent DOM validates the registered field and no field for unknown Song',()=>{const map=validateSongUnitMemberships(data);validateSongUnitBody(parseSerializedHtml(body(field)),'S005',map);validateSongUnitBody(parseSerializedHtml(body('')),'S001',map);});
for(const[name,id,text]of [['missing','S005',''],['wrong unit','S005',field.replace('Printemps','BiBi')],['duplicate','S005',field+field],['unregistered','S001',field],['misleading history link','S005',field.replace('Printemps','<a href="singer.html?id=SN0007">Printemps</a>')]])test('DOM negative rejects '+name,()=>a.throws(()=>validateSongUnitBody(parseSerializedHtml(body(text)),id,validateSongUnitMemberships(data))));
test('generation pins the supplemental data, module and independent validation dependency',()=>{const deps=require('../tools/generate-song-pages.cjs').SONG_RENDERER_FILES;for(const n of ['assets/js/song-unit-memberships.js','data/song-unit-memberships.json','tools/song-unit-membership-lib.cjs','tools/static-html-readonly-lib.cjs'])a.ok(deps.includes(n));});
test('independent full-protocol fixture validates affiliation separately from snapshot',()=>{const f=require('./helpers/static-html-validator-fixture.cjs').createFixture(),r=require('../tools/validate-static-html.cjs').validateStaticHtml(f.options);a.equal(r.status,'PASS',JSON.stringify(r.issues));});
