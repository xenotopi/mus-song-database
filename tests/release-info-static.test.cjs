'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),p=require('node:path');
const {validateReleaseBody}=require('../tools/validate-static-html.cjs'),{parseSerializedHtml}=require('../tools/static-html-readonly-lib.cjs'),{releaseBody}=require('./helpers/release-body-fixture.cjs');
const pointer=require('../data/current.json'),base=p.resolve(__dirname,'../data/snapshots',pointer.outputRevision),read=f=>JSON.parse(fs.readFileSync(p.join(base,f))).data,list=read('release-list.json'),release=id=>read('releases/'+id+'.json');
const html=id=>'<!doctype html><html><head></head><body>'+releaseBody(release(id),list)+'</body></html>',validate=(id,body)=>validateReleaseBody(parseSerializedHtml(body),release(id),list);
for(const id of ['R0094','R0107','R0097','R0010','R0088','R0052'])test('independent information fields '+id,()=>validate(id,html(id)));
const group=(body,field)=>{const escaped=field.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const result=new RegExp('<div class="release-info-row" data-release-info-field="'+escaped+'"[^>]*>[\\s\\S]*?<\\/div>').exec(body);a.ok(result,'Missing independent fixture field '+field);return result[0];};
for(const [name,id,change,pattern]of [
 ['required same-title official name missing','R0088',s=>s.replace(group(s,'official'),''),/information differs/],
 ['wrong official value','R0107',s=>s.replace(group(s,'official'),group(s,'official').replace(/<dd>[\s\S]*?<\/dd>/,'<dd>WRONG</dd>')),/information differs/],
 ['semantic field mismatch','R0107',s=>s.replace('data-release-info-field="parent"','data-release-info-field="catalog"'),/semantic fields/],
 ['semantic order mismatch','R0107',s=>{const left=group(s,'featured'),right=group(s,'edition');return s.replace(left,'__FIELD_SWAP__').replace(right,left).replace('__FIELD_SWAP__',right);},/semantic fields|information list/],
 ['duplicate information row','R0107',s=>s.replace('</dl>',group(s,'parent')+'</dl>'),/information list/],
 ['incorrect parent URL','R0107',s=>s.replace('href="release/R0088.html"','href="release/R0001.html"'),/information links/],
 ['invalid definition pair','R0107',s=>s.replace('<dt>正式商品名</dt>','<span>正式商品名</span>'),/information list|information differs|dt\/dd/],
 ['unexpected live CV persisted','R0107',s=>s.replace('</body>','<div data-release-cv>CV</div></body>'),/runtime context\/CV/]
])test('reject '+name,()=>{const source=html(id),corrupt=change(source);a.notEqual(corrupt,source);a.throws(()=>validate(id,corrupt),pattern);});
