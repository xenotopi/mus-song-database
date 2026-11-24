'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {sha,revisions}=require('./policy.cjs');
const denied=new Set(['internalNote','sourceResearchNote','rawRows','recordsByEvent','spreadsheetId','access_token','refresh_token','client_secret','credentials','accessToken','refreshToken']);
const publicCardTools = new Set(require('./public-card-tools.json'));
const {fileEntry} = require('./publication-diff.cjs');
function privacy(value){if(Array.isArray(value)){value.forEach(privacy);return;}if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){assert.ok(!denied.has(k),'Nonpublic field '+k);privacy(v);}}
function safeBytes(bytes,name){if(/\.(?:html|js|css|json|txt|xml|webmanifest)$/.test(name)){const s=bytes.toString('utf8');assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bya29\.[A-Za-z0-9_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{30,}|[?&]user_content_key=/.test(s),'Credential in public file '+name);if(/\.json$/.test(name))privacy(JSON.parse(s));}}
function assertPublicBoundary(relative) {
  assert.ok(!/^(?:tools|tests|docs|\.github)(?:\/|$)/i.test(relative) || publicCardTools.has(relative),
    'Nonpublic site path '+relative);
}

function inventory(root) {
  const rows = [];
  function add(file) {
    const relative = path.relative(root,file).replace(/\\/g,'/');
    assert.ok(relative === '.nojekyll' || !relative.split('/').some(part=>part.startsWith('.')), 'Hidden/nonpublic site path '+relative);
    assertPublicBoundary(relative);
    const stat = fs.lstatSync(file);
    assert.equal(stat.isSymbolicLink(),false,'Link in site '+relative);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file)) add(path.join(file,entry));
    } else {
      assert.ok(stat.isFile());
      const bytes = fs.readFileSync(file);
      safeBytes(bytes,relative);
      rows.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});
    }
  }
  for (const directory of ['assets','data','song','release','share']) add(path.join(root,directory));
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if (entry.isFile() && (/\.html$/.test(entry.name) || ['CNAME','robots.txt','sitemap.xml','manifest.webmanifest','.nojekyll'].includes(entry.name))) {
      add(path.join(root,entry.name));
    }
  }
  for (const relative of publicCardTools) {
    const parts = relative.split('/');
    let directory = root;
    for (const part of parts.slice(0,-1)) {
      directory = path.join(directory,part);
      const stat = fs.lstatSync(directory);
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink(),'Invalid card tool directory '+part);
    }
    const file = path.join(directory,parts.at(-1));
    assert.ok(fs.lstatSync(file).isFile(),'Missing or invalid card tool file '+relative);
    add(file);
  }
  return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
function buildSite({root,destination,plan,checks,runId,runNumber,previousPublished=null}){assert.equal(fs.existsSync(destination),false,'Site destination exists');for(const k of ['capture','validator','integrity','provenance','bindings','derived','privacy','regressions','browser'])assert.equal(checks[k],k==='provenance'?'VERIFIED':'PASS');const rows=inventory(root).filter(r=>!['data/sync-release.json','data/sync-files.json'].includes(r.path));assert.ok(rows.reduce((sum,r)=>sum+r.bytes,0)<=900*1024*1024,'Site exceeds conservative 900 MiB budget; retention policy requires review');for(const row of rows){assertPublicBoundary(row.path);const file=path.join(destination,row.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(root,row.path),file);assert.equal(sha(fs.readFileSync(file)),row.sha256);}const files=Buffer.from(JSON.stringify({schemaVersion:1,files:rows},null,2)+'\n'),pair=revisions(plan.target),current=rows.find(r=>r.path==='data/current.json'),manifest=rows.find(r=>r.path==='data/snapshots/'+pair.outputRevision+'/manifest.json');assert.ok(current&&manifest);const release={schemaVersion:1,...pair,planId:plan.planId,sourceSha:plan.sourceSha,fingerprint:plan.fingerprint,...(plan.sourceImageSha256?{sourceImageSha256:plan.sourceImageSha256}:{}),runId,runNumber,runUrl:'https://github.com/'+plan.repository+'/actions/runs/'+runId,generatedAt:new Date().toISOString(),state:'deployed-candidate-requires-run-and-http-verification',previousVerified:previousPublished?.verified?{...revisions(previousPublished),fingerprint:previousPublished.fingerprint,sourceSha:previousPublished.release?.sourceSha||previousPublished.sourceSha,runId:previousPublished.runId,runNumber:previousPublished.runNumber,publishedAt:previousPublished.publishedAt}:null,filesManifestSha256:sha(files),currentSha256:current.sha256,snapshotManifestSha256:manifest.sha256,checks};fs.writeFileSync(path.join(destination,'data/sync-files.json'),files,{flag:'wx'});fs.writeFileSync(path.join(destination,'data/sync-release.json'),JSON.stringify(release,null,2)+'\n',{flag:'wx'});return{release,files:rows};}
function verifySite(directory) {
  const receiptBytes=fs.readFileSync(path.join(directory,'data/sync-release.json'));
  const receipt=JSON.parse(receiptBytes);
  const bytes=fs.readFileSync(path.join(directory,'data/sync-files.json'));
  assert.equal(sha(bytes),receipt.filesManifestSha256);
  const rows=JSON.parse(bytes).files;
  const paths=new Set(rows.map(row=>row.path));
  assert.equal(paths.size,rows.length);
  for (const relative of publicCardTools) assert.ok(paths.has(relative),'Missing card tool file '+relative);
  const all=[];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name);
      assert.equal(fs.lstatSync(file).isSymbolicLink(),false);
      if (entry.isDirectory()) walk(file);
      else all.push(path.relative(directory,file).replace(/\\/g,'/'));
    }
  }
  walk(directory);
  assert.deepEqual(all.sort(),[...paths,'data/sync-release.json','data/sync-files.json'].sort());
  for (const row of rows) {
    assert.ok(!path.isAbsolute(row.path)&&!row.path.split('/').includes('..')&&!row.path.includes('\\')&&!row.path.includes(':'));
    assertPublicBoundary(row.path);
    const file=path.join(directory,row.path);
    assert.ok(fs.lstatSync(file).isFile());
    const content=fs.readFileSync(file);
    assert.equal(content.length,row.bytes);
    assert.equal(sha(content),row.sha256);
    safeBytes(content,row.path);
  }
  return {status:'PASS',files:rows.length,release:receipt,
    rows:[...rows,fileEntry('data/sync-files.json',bytes),fileEntry('data/sync-release.json',receiptBytes)]};
}
module.exports={privacy,safeBytes,inventory,buildSite,verifySite};
