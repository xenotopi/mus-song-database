'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),site=require('../tools/auto-sync/site.cjs'),{sha}=require('../tools/auto-sync/policy.cjs'),f=require('./helpers/auto-sync-fixture.cjs');
const publicCardTools=require('../tools/auto-sync/public-card-tools.json');
function input(t){const root=f.folder(t);for(const d of ['assets','data/snapshots/'+f.target.outputRevision,'song','release','share','tools','tests','docs'])fs.mkdirSync(path.join(root,d),{recursive:true});fs.writeFileSync(path.join(root,'index.html'),'<h1>public</h1>');fs.writeFileSync(path.join(root,'.nojekyll'),'');fs.writeFileSync(path.join(root,'data/current.json'),JSON.stringify(f.target));fs.writeFileSync(path.join(root,'data/snapshots',f.target.outputRevision,'manifest.json'),JSON.stringify({revision:f.target.outputRevision,dataRevision:f.target.dataRevision}));fs.writeFileSync(path.join(root,'tools/private-input.json'),'not-public');fs.writeFileSync(path.join(root,'tests/fixture.json'),'not-public');fs.writeFileSync(path.join(root,'docs/internal.md'),'not-public');
  for (const relative of publicCardTools) {
    const file=path.join(root,relative);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,'card-tool fixture '+relative);
  }
  fs.writeFileSync(path.join(root,'tools/today-card/unlisted.js'),'not-public');
  return root;
}
function make(root){return site.buildSite({root,destination:path.join(root,'output'),plan:{target:f.target,planId:'approved-plan',repository:f.config.repository,sourceSha:f.sourceSha,fingerprint:f.fingerprint},checks:f.checks,runId:10,runNumber:5});}
test('site packaging preserves exact card tool paths and prevents unrelated tools/tests/docs from entering',t=>{
  const root=input(t), r=make(root), dest=path.join(root,'output');
  assert.equal(site.verifySite(dest).status,'PASS');
  assert.equal(publicCardTools.length,42);
  assert.equal(publicCardTools.filter(file=>file.endsWith('.html')).length,20);
  assert.deepEqual(r.files.map(row=>row.path).filter(file=>file.startsWith('tools/')).sort(),[...publicCardTools].sort());
  for (const file of ['index.html','.nojekyll',...publicCardTools]) {
    assert.deepEqual(fs.readFileSync(path.join(dest,file)),fs.readFileSync(path.join(root,file)));
  }
  for (const file of ['tools/private-input.json','tools/today-card/unlisted.js','tests','docs']) {
    assert.equal(fs.existsSync(path.join(dest,file)),false,file);
  }
  assert.match(r.release.state,/requires-run-and-http-verification/);
  assert.throws(()=>make(root),/destination exists/);
});

test('a missing or credential-bearing allowlisted card file blocks packaging',t=>{
  const root=input(t), file=path.join(root,'tools/today-card/today-card.js');
  fs.unlinkSync(file);
  assert.throws(()=>make(root),/ENOENT/);
  fs.writeFileSync(file,'const token = "ghp_'+ 'a'.repeat(35)+'";');
  assert.throws(()=>make(root),/Credential in public file/);
  assert.equal(fs.existsSync(path.join(root,'output')),false);
});

test('a rehashed manifest cannot authorize an unrelated card-tool sibling',t=>{
  const root=input(t), r=make(root), dest=path.join(root,'output');
  const relative='tools/today-card/unlisted.js', data=Buffer.from('unlisted');
  fs.writeFileSync(path.join(dest,relative),data);
  const manifest=Buffer.from(JSON.stringify({schemaVersion:1,files:[...r.files,{path:relative,bytes:data.length,sha256:sha(data)}]}));
  fs.writeFileSync(path.join(dest,'data/sync-files.json'),manifest);
  fs.writeFileSync(path.join(dest,'data/sync-release.json'),JSON.stringify({...r.release,filesManifestSha256:sha(manifest)}));
  assert.throws(()=>site.verifySite(dest),/Nonpublic site path/);
});
for(const [name,payload]of [['private JSON','{"internalNote":"private"}'],['credential','{"token":"ghp_'+('a'.repeat(35))+'"}'],['raw HTTP URL','{"url":"https://script.googleusercontent.com/a?user_content_key=private"}']])test(name+' cannot enter a Pages artifact',t=>{const root=input(t);fs.writeFileSync(path.join(root,'data/leak.json'),payload);assert.throws(()=>make(root),/Nonpublic|Credential/);assert.equal(fs.existsSync(path.join(root,'output')),false);});
test('hidden credential paths are rejected even with harmless contents',t=>{const root=input(t);fs.writeFileSync(path.join(root,'assets/.env'),'empty');assert.throws(()=>make(root),/Hidden/);});
test('changed file, missing file or additional file invalidates the exact site manifest',t=>{for(const mode of ['change','missing','extra']){const root=input(t);make(root);const dest=path.join(root,'output'),file=path.join(dest,'index.html');if(mode==='change')fs.writeFileSync(file,'changed');else if(mode==='missing')fs.unlinkSync(file);else fs.writeFileSync(path.join(dest,'unexpected.txt'),'extra');assert.throws(()=>site.verifySite(dest));}});
test('manifest hash and path traversal tampering are rejected',t=>{for(const mode of ['hash','traversal']){const root=input(t);make(root);const dest=path.join(root,'output'),file=path.join(dest,'data/sync-files.json'),m=JSON.parse(fs.readFileSync(file));m.files[0].path='../outside';const bytes=Buffer.from(JSON.stringify(m));fs.writeFileSync(file,bytes);if(mode==='traversal'){const marker=path.join(dest,'data/sync-release.json'),r=JSON.parse(fs.readFileSync(marker));r.filesManifestSha256=sha(bytes);fs.writeFileSync(marker,JSON.stringify(r));}assert.throws(()=>site.verifySite(dest));}});
test('failed capture/provenance cannot be packaged as a successful candidate',t=>{const root=input(t);for(const key of ['capture','provenance'])assert.throws(()=>site.buildSite({root,destination:path.join(root,'output'),plan:{target:f.target},checks:{...f.checks,[key]:'FAIL'},runId:1,runNumber:1}));assert.equal(fs.existsSync(path.join(root,'output')),false);});
test('new release carries only a minimal verified predecessor receipt for recovery',t=>{const root=input(t),r=site.buildSite({root,destination:path.join(root,'output'),plan:{target:f.target,planId:'plan',repository:f.config.repository,sourceSha:f.sourceSha,fingerprint:f.fingerprint},checks:f.checks,runId:10,runNumber:5,previousPublished:{...f.old,verified:true,fingerprint:f.fingerprint,sourceSha:f.sourceSha,runId:9,runNumber:4,publishedAt:'2026-11-01T00:00:00Z',privateField:'must-not-copy'}});assert.deepEqual(r.release.previousVerified,{...f.old,fingerprint:f.fingerprint,sourceSha:f.sourceSha,runId:9,runNumber:4,publishedAt:'2026-11-01T00:00:00Z'});assert.equal(site.verifySite(path.join(root,'output')).status,'PASS');});
