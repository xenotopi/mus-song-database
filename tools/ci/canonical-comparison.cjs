'use strict';
// An explicit versioned serialization migration, not a canonical exclusion.
// Compare complete new bytes with complete expected bytes, including canonical.
const assert=require('assert/strict'),path=require('path');
const {parseSerializedHtml}=require('../static-html-readonly-lib.cjs');
function inspect(html,url,{final=false}={}){
 const doc=parseSerializedHtml(html),nodes=doc.nodes.filter(n=>n.tag==='link'&&(n.attrs.rel||'').toLowerCase().split(/\s+/).includes('canonical'));
 assert.equal(nodes.length,1,'Exactly one canonical required');const n=nodes[0];assert.equal(n.parent.tag,'head');assert.equal(n.attrs.rel,'canonical');assert.equal(n.attrs.href,url,'Canonical URL mismatch');
 const allowed=final?['rel','href']:['rel','href','data-seo-dynamic'];assert.ok(Object.keys(n.attrs).every(k=>allowed.includes(k)),'Unknown canonical attribute');if(Object.hasOwn(n.attrs,'data-seo-dynamic'))assert.equal(n.attrs['data-seo-dynamic'],'true');
 const tags=html.match(/<link\b[^>]*\brel="canonical"[^>]*>/g)||[];assert.equal(tags.length,1);const tag=tags[0],expected=`<link rel="canonical" href="${url}">`;
 if(final){assert.deepEqual(Object.keys(n.attrs),['rel','href'],'Canonical attribute order');assert.equal(tag,expected,'Canonical exact serialization');assert.equal(n.parent.children.at(-1),n,'Canonical must be final head child');assert.ok(html.includes(expected+'</head>'),'Canonical exact head placement');}
 return{tag,index:html.indexOf(tag),expected};
}
function expectedMigration(oldHtml,url){
 const old=inspect(oldHtml,url),suffix=oldHtml.slice(old.index+old.tag.length),end=suffix.indexOf('</head>');assert.ok(end>=0);assert.equal(suffix.indexOf('</head>',end+1),-1);
 const expected=oldHtml.slice(0,old.index)+suffix.slice(0,end)+old.expected+suffix.slice(end);inspect(expected,url,{final:true});return expected;
}
function comparePage(type,id,oldHtml,newHtml){const url=`https://mus-song-db.com/${type}/${id}.html`;inspect(newHtml,url,{final:true});const expected=expectedMigration(oldHtml,url);assert.equal(newHtml,expected,'Full HTML differs from explicit canonical serialization migration');return{type,id,status:'PASS',policy:'canonical-final-head-v1',oldBytes:Buffer.byteLength(oldHtml),newBytes:Buffer.byteLength(newHtml),oldByteIdentical:oldHtml===newHtml,unexplainedDifferences:0};}
module.exports={inspect,expectedMigration,comparePage};
