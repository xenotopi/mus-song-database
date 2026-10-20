'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),p=require('node:path');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync(p.join(__dirname,'../assets/js/singer-display.js')).toString('base64'));
for(const [id,name]of [['SN0007','Printemps'],['SN0011','lily white'],['SN0013','BiBi']]){
 test('ID-only display '+id,async()=>{const m=await modulePromise;a.equal(m.singerDisplayName({singerId:id},'元名義'),name);a.equal(m.singerDisplayName({id},'元名義'),name);});
 test('preserve names, IDs, statistics and legacy search '+id,async()=>{const m=await modulePromise,row={singerId:id,displayName:'旧3人名義',rawName:'旧RAW名義',members:[{label:'旧メンバー'}],count:19},before=structuredClone(row);a.ok(m.singerDisplaySearchText(row).includes(name));a.ok(m.singerDisplaySearchText(row).includes(row.displayName));a.ok(m.singerDisplaySearchText(row).includes(row.rawName));a.deepEqual(row,before);});
}
test('do not infer ID from official unit or legacy names',async()=>{const m=await modulePromise;for(const x of [{},{singerId:'SN0028'},{singerId:'SN0012'},{singerId:'SN00130'}])a.equal(m.singerDisplayName(x,'旧3人名義'),'旧3人名義');});
test('membership / song affiliation is never consulted',async()=>{const m=await modulePromise;a.equal(m.singerDisplayName({singerId:'SN0007',songId:'S001',members:[]},'旧名義'),'Printemps');a.equal(m.singerDisplayName({singerId:'SN0028',unit:'Printemps',members:['穂乃果','ことり','花陽']},'代役編成'),'代役編成');});
