'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {retainSnapshots}=require('../tools/auto-sync/retain-snapshots.cjs'),{sha}=require('../tools/auto-sync/policy.cjs'),f=require('./helpers/auto-sync-fixture.cjs');
function fixture(t){const root=f.folder(t),name='data/snapshots/'+f.target.outputRevision+'/events/EV0356.json',body=Buffer.from('{"public":"same immutable bytes"}\n'),files=Buffer.from(JSON.stringify({schemaVersion:1,files:[{path:name,bytes:body.length,sha256:sha(body)}]})),calls=[];return{root,name,body,files,calls,published:{...f.target,verified:true,release:{filesManifestSha256:sha(files)}},get:async url=>{calls.push(String(url));return{bytes:String(url).endsWith('sync-files.json')?files:body};},siteUrl:'https://mus-song-db.com/'};}
test('public snapshot preservation does not depend on GitHub artifact retention',async t=>{const x=fixture(t),r=await retainSnapshots(x);assert.equal(r.status,'PASS');assert.equal(r.copied,1);assert.ok(fs.readFileSync(path.join(x.root,x.name)).equals(x.body));assert.equal(x.calls.length,2);assert.deepEqual(r.revisions,[f.target.outputRevision]);});
test('matching existing snapshots are verified without individual HTTP re-fetch',async t=>{const x=fixture(t);fs.mkdirSync(path.dirname(path.join(x.root,x.name)),{recursive:true});fs.writeFileSync(path.join(x.root,x.name),x.body);const r=await retainSnapshots(x);assert.equal(r.copied,0);assert.equal(r.verified,1);assert.equal(x.calls.length,1);});
test('different checkout bytes are replaced only with proven published raw bytes',async t=>{const x=fixture(t);fs.mkdirSync(path.dirname(path.join(x.root,x.name)),{recursive:true});fs.writeFileSync(path.join(x.root,x.name),'old checkout representation');const r=await retainSnapshots(x);assert.equal(r.copied,1);assert.ok(fs.readFileSync(path.join(x.root,x.name)).equals(x.body));});
test('partial HTTP body does not overwrite an existing valid file',async t=>{const x=fixture(t),file=path.join(x.root,x.name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'existing');const get=x.get;x.get=async u=>String(u).endsWith('sync-files.json')?get(u):{bytes:Buffer.from('partial')};await assert.rejects(retainSnapshots(x),/Published snapshot bytes/);assert.equal(fs.readFileSync(file,'utf8'),'existing');});
test('wrong published manifest hash blocks all data copying',async t=>{const x=fixture(t);x.published.release.filesManifestSha256='0'.repeat(64);await assert.rejects(retainSnapshots(x));assert.equal(fs.existsSync(path.join(x.root,'data')),false);assert.equal(x.calls.length,1);});
test('missing trusted predecessor is explicitly bootstrap, never a fabricated verification',async t=>{const x=fixture(t);x.published.verified=false;assert.equal((await retainSnapshots(x)).status,'BOOTSTRAP');assert.equal(x.calls.length,0);});
test('source-only capture uses existing official producers and does not call API generator',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../tools/auto-sync/capture-existing.cjs'),'utf8');
  const capture=s.slice(s.indexOf('async function captureExisting'),s.indexOf('const policy='));
  assert.match(capture,/withSnapshotOperation/);assert.match(capture,/generateSongPages/);assert.match(capture,/generateReleasePages/);
  assert.doesNotMatch(capture,/generate-static-snapshot|fetch\(/);
  const cli=fs.readFileSync(path.join(__dirname,'../tools/auto-sync/cli.cjs'),'utf8');
  assert.match(cli,/\.generateVerifiedSnapshot\(\{root,plan:p,published:initial.published,retained,/);
  assert.match(s,/if\(!fs.existsSync\(target\)\)\{\s+const frozen=await freezeSource\(plan\);\s+run\('snapshot',generatorArgs,frozen\)/);
  assert.match(s,/Existing target snapshot is not proven published; refuse overwrite/);
});

function identityManifest() {
  const dataRevision=f.target.dataRevision,outputRevision=f.target.outputRevision;
  const digest='3'.repeat(64),hashes=(prefix,n)=>Object.fromEntries(Array.from({length:n},(_,i)=>[prefix+(i+1),{sha256:digest}]));
  return {revision:outputRevision,outputRevision,dataRevision,counts:{songs:117,releases:114,events:1,memberAnalytics:1},
    hashes:{songs:hashes('S',117),releases:hashes('R',114),events:hashes('EV',1)},
    releaseList:{count:114,sha256:digest},kamiparaDashboard:{sha256:digest},memberAnalytics:{sha256:digest}};
}

test('complete independently generated snapshot can prove identical data despite different envelope timestamps',()=>{
  const {assertSnapshotIdentity}=require('../tools/detail-snapshot-lib.cjs');
  const before=identityManifest(),candidate=structuredClone(before);
  before.generatedAt='old';
  candidate.generatedAt='new';
  candidate.hashes.songs.S1.fileSha256='1'.repeat(64);
  assert.match(assertSnapshotIdentity(before,candidate),/^[a-f0-9]{64}$/);
  candidate.hashes.songs.S1.sha256='4'.repeat(64);
  assert.throws(()=>assertSnapshotIdentity(before,candidate),/differs from the frozen input/);
  delete candidate.hashes.songs.S1.sha256;
  assert.throws(()=>assertSnapshotIdentity(before,candidate),/Missing snapshot data digest/);
});

test('legacy same-revision reuse is selected only after frozen generation proof and original-byte verification',async t=>{
  const {generateVerifiedSnapshot}=require('../tools/auto-sync/capture-existing.cjs');
  const root=f.folder(t),manifestPath=path.join(root,'data/snapshots',f.target.outputRevision,'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath),{recursive:true});
  const original=Buffer.from(JSON.stringify(identityManifest()));
  fs.writeFileSync(manifestPath,original);
  const plan={target:f.target,sourceImageSha256:'5'.repeat(64)},calls=[];
  const opts={root,plan,published:{...f.target,verified:true,release:{snapshotManifestSha256:sha(original)}},
    retained:{revisions:[f.target.outputRevision]},generatorArgs:['generator','--event-transport=batch-v1'],
    freezeSource:async input=>{assert.equal(input,plan);return {token:'trial'};},
    run:(name,args,frozen)=>{
      calls.push(name);
      if(name==='snapshot-proof'){
        assert.deepEqual(args,['generator','--event-transport=batch-v1','--verify-existing-snapshot',f.target.outputRevision]);
        assert.deepEqual(frozen,{token:'trial'});
        return JSON.stringify({status:'VERIFIED_EXISTING_SNAPSHOT',...f.target,dataSha256:'6'.repeat(64),sourceImageSha256:plan.sourceImageSha256});
      }
      assert.deepEqual(args,['tools/auto-sync/capture-existing.cjs',f.target.outputRevision]);
    },
    save:(name,proof)=>{assert.equal(name,'existing-snapshot-proof.json');assert.equal(proof.dataSha256,'6'.repeat(64));}
  };
  await generateVerifiedSnapshot(opts);
  assert.deepEqual(calls,['snapshot-proof','snapshot']);
  await assert.rejects(generateVerifiedSnapshot({...opts,run:()=>{throw Error('Existing snapshot data differs from the frozen input');}}),/differs from the frozen input/);
  await assert.rejects(generateVerifiedSnapshot({...opts,retained:{revisions:[]}}),/not proven published/);
  await assert.rejects(generateVerifiedSnapshot({...opts,published:{...opts.published,release:{...opts.published.release,sourceImageSha256:'7'.repeat(64)}}}),/different frozen input/);
  assert.deepEqual(fs.readFileSync(manifestPath),original);
});
test('same-revision orchestration holds the real shared lease and preserves input bytes',async t=>{const root=f.folder(t),file=path.join(root,'data/snapshots',f.target.outputRevision,'manifest.json');fs.mkdirSync(path.dirname(file),{recursive:true});const bytes=Buffer.from(JSON.stringify({revision:f.target.outputRevision,dataRevision:f.target.dataRevision}));fs.writeFileSync(file,bytes);const vm=require('node:vm'),module={exports:{}},calls=[],lease=require('../tools/snapshot-publication.cjs');function loader(name){if(name==='./policy.cjs')return require('../tools/auto-sync/policy.cjs');if(name==='../snapshot-publication.cjs')return lease;if(name==='../generate-song-pages.cjs')return{generateSongPages:async o=>lease.withSnapshotOperation(root,async()=>{assert.ok(fs.existsSync(path.join(root,'.snapshot-operation.lock')));calls.push(['song',o.revision]);return{count:117};})};if(name==='../generate-release-pages.cjs')return{generateReleasePages:async o=>lease.withSnapshotOperation(root,async()=>{calls.push(['release',o.revision]);return Array.from({length:114});})};return require(name);}vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tools/auto-sync/capture-existing.cjs'),'utf8'),{require:loader,module,console,process:{argv:[]}});const r=await module.exports.captureExisting({root,revision:f.target.outputRevision,expectedDataRevision:f.target.dataRevision});assert.equal(r.capturePages,231);assert.equal(r.reusedPublishedSnapshotBytes,true);assert.deepEqual(calls,[['song',f.target.outputRevision],['release',f.target.outputRevision]]);assert.ok(fs.readFileSync(file).equals(bytes));assert.equal(fs.existsSync(path.join(root,'.snapshot-operation.lock')),false);await assert.rejects(module.exports.captureExisting({root,revision:f.target.outputRevision,expectedDataRevision:f.old.dataRevision}));assert.equal(calls.length,2);});
