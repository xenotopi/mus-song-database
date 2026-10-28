'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const {parseSerializedHtml}=require('../tools/static-html-readonly-lib.cjs');
const {validateReleaseBody}=require('../tools/validate-static-html.cjs');
const {releaseBody}=require('./helpers/release-body-fixture.cjs');
const navigationData={schemaVersion:1,scope:'release-navigation-only',groups:[]};
function fixture(kind){
 const count=kind==='details'?2:1;
 const rows=Array.from({length:count},(_,i)=>({songId:'S00'+(i+1),relationId:'RT000'+(i+1),songName:'Fixture Song '+(i+1),displayName:'Fixture Song '+(i+1),disc:i+1,track:1,displayOrder:i+1,variant:null}));
 const release={releaseId:'R9999',releaseName:'Disc heading fixture',releaseDate:'2020-01-01',classification:'CD',releaseType:'アルバム',includedSongs:rows,includedSongsMeta:{status:'complete',publicNote:'',confirmedCount:count,pendingCount:0},debutSongs:[],relatedEvents:[]};
 const list=[release],body=releaseBody(release,list,{navigationData});
 const heading=kind==='details'?'<summary>Disc 11トラック</summary>':'<h3 class="release-disc-heading">Disc 11トラック</h3>';
 a.ok(body.includes(heading),'Fixture must contain the expected direct heading');
 const audio='<details class="song-youtube-disclosure" data-youtube-relation="RT0001"><summary>公式音源を聴く</summary></details>';
 const withAudio=body.replace(/(<a class="release-included-song-row"[\s\S]*?<\/a>)/,'$1'+audio);
 a.notEqual(withAudio,body);
 const validate=html=>validateReleaseBody(parseSerializedHtml('<!doctype html><html><head></head><body>'+html+'</body></html>'),release,list,null,navigationData);
 return {body,heading,withAudio,validate};
}
for(const kind of ['details','section']){
 test(kind+': direct heading with nested audio summary is valid',()=>{const f=fixture(kind);a.doesNotThrow(()=>f.validate(f.withAudio));});
 test(kind+': missing direct heading is rejected',()=>{const f=fixture(kind);a.throws(()=>f.validate(f.body.replace(f.heading,'')),/Release Disc heading missing/);});
 test(kind+': duplicate direct headings are rejected',()=>{const f=fixture(kind);a.throws(()=>f.validate(f.withAudio.replace(f.heading,f.heading+f.heading)),/Release Disc heading missing/);});
 test(kind+': wrong direct heading wording is rejected',()=>{const f=fixture(kind);a.throws(()=>f.validate(f.withAudio.replace(f.heading,f.heading.replace('Disc 11トラック','Disc 99誤記'))),/Release Disc\/heading variant mismatch/);});
 test(kind+': audio summary alone cannot replace Disc heading',()=>{const f=fixture(kind);a.throws(()=>f.validate(f.withAudio.replace(f.heading,'')),/Release Disc heading missing/);});
}
