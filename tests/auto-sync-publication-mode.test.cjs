'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {sha} = require('../tools/auto-sync/policy.cjs');
const {authorizeBuild, confirmPlan} = require('../tools/auto-sync/readiness-client.cjs');
const {bindPublicationSource,confirmPublishedSnapshot,requirePagesDeployment,validatePublicationSource} = require('../tools/auto-sync/publication-mode.cjs');
const {generateVerifiedSnapshot} = require('../tools/auto-sync/capture-existing.cjs');
const f = require('./helpers/auto-sync-fixture.cjs');

const root = path.resolve(__dirname, '..');
const cli = path.join(root,'tools/auto-sync/cli.cjs');
const env = {GITHUB_EVENT_NAME:'workflow_dispatch',MUSDB_RUN_REF_PROTECTED:'true',MUSDB_LEGACY_MANUAL_ENABLED:'true'};
const manifest = Buffer.from(JSON.stringify({revision:f.target.outputRevision,...f.target}));
const published = {...f.target,verified:true,runId:2,fingerprint:'d'.repeat(64),
  receiptEntry:{path:'data/sync-release.json',sha256:'c'.repeat(64)},
  release:{runId:2,filesManifestSha256:'b'.repeat(64),snapshotManifestSha256:sha(manifest)}};
const build = {decision:'BUILD',target:f.target,completionSha256:sha(f.readiness().completionId)};

test('v66 READY can authorize a manual web rebuild from the already-verified public snapshot',async t=>{
  let ready=f.readiness();
  const http={latest:async()=>f.target,published:async()=>published,mainSha:async()=>f.sourceSha,
    readReadiness:async()=>ready,lastFailure:async()=>null};
  const observation={decision:'CHECK',target:f.target,sourceSha:f.sourceSha,fingerprint:f.fingerprint};
  const authorized=await authorizeBuild({http,candidate:observation});
  assert.equal(authorized.completionSha256,build.completionSha256);
  assert.equal(authorized.sourceImageSha256,undefined);
  const plan={...authorized,...bindPublicationSource(authorized,published,env),sourceSha:f.sourceSha};
  assert.ok(validatePublicationSource(plan,env));
  const dir=f.folder(t),target=path.join(dir,'data/snapshots',f.target.outputRevision,'manifest.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,manifest);
  const calls=[];
  await generateVerifiedSnapshot({root:dir,plan,published,retained:{revisions:[f.target.outputRevision]},
    run:(...args)=>calls.push(args),freezeSource:()=>{throw Error('Unexpected live generation');}});
  assert.deepEqual(calls,[['snapshot',['tools/auto-sync/capture-existing.cjs',f.target.outputRevision]]]);
  assert.deepEqual(fs.readFileSync(target),manifest);
  const check={http,plan,phase:'pre-deploy',getFingerprint:()=>f.fingerprint,context:{sha:f.sourceSha}};
  await confirmPlan(check);
  ready={...ready,completionId:'a-new-generation'};
  await assert.rejects(confirmPlan(check),/Completion generation superseded/);
  assert.throws(()=>confirmPublishedSnapshot(plan,{...published,
    receiptEntry:{...published.receiptEntry,sha256:'1'.repeat(64)}}),/snapshot changed/);
});

test('v66 compatibility refuses changed revisions, unverified bundles, automatic events, and missing opt-in',()=>{
  for(const current of [{...published,...f.old},{...published,verified:false},null]){
    assert.equal(bindPublicationSource(build,current,env).decision,'BLOCKED');
  }
  for(const flags of [{MUSDB_LEGACY_MANUAL_ENABLED:undefined},{MUSDB_RUN_REF_PROTECTED:'false'},
    {GITHUB_EVENT_NAME:'workflow_run'},{MUSDB_EVENT_PUBLICATION_ENABLED:'true'},{MUSDB_EVENT_MONITOR_ENABLED:'true'},
    {MUSDB_PUBLICATION_FENCE_ENABLED:'true'}]){
    assert.equal(bindPublicationSource(build,published,{...env,...flags}).decision,'BLOCKED');
  }
  const legacy=bindPublicationSource(build,published,env);
  assert.throws(()=>validatePublicationSource({...legacy,completionNotice:{}},env),/cannot carry/);
  assert.throws(()=>validatePublicationSource(legacy,{...env,GITHUB_EVENT_NAME:'workflow_run'}),/manual only/);
});

test('stamped completions must use the coordinated route, even when manual compatibility is enabled',()=>{
  const plan={...build,sourceImageSha256:'d'.repeat(64)};
  assert.equal(bindPublicationSource(plan,published,env).decision,'BLOCKED');
  for(const event of ['workflow_dispatch','workflow_run']){
    const coordinated={...env,GITHUB_EVENT_NAME:event,MUSDB_PUBLICATION_FENCE_ENABLED:'true'};
    assert.deepEqual(bindPublicationSource(plan,published,coordinated),plan);
    assert.equal(validatePublicationSource(plan,coordinated),false);
  }
  assert.equal(bindPublicationSource({decision:'NO_OP'},published,env).decision,'NO_OP');
});

test('legacy verification never manufactures a missing archived snapshot',async t=>{
  const plan=bindPublicationSource(build,published,env);
  const dir=f.folder(t);
  await assert.rejects(generateVerifiedSnapshot({root:dir,plan,published,retained:{revisions:[]},
    run:()=>assert.fail('Missing snapshot must stop'),freezeSource:()=>assert.fail('Live generation is disallowed')}),
  /not proven published/);
  assert.deepEqual(fs.readdirSync(dir),[]);
});

test('OFF stops predeploy and recovery before reading a bundle or making a network request',t=>{
  const dir=f.folder(t),denyNetwork=path.join(dir,'deny-network.cjs');
  fs.writeFileSync(denyNetwork,"global.fetch=()=>{process.exit(49);};\n");
  for(const value of [undefined,'false','TRUE']) assert.throws(()=>requirePagesDeployment({MUSDB_PAGES_DEPLOY_ENABLED:value}),/Pages deployment disabled/);
  for(const command of ['predeploy','recovery-select','recovery-archive','recovery-diff','recheck-recovery']){
    const run=spawnSync(process.execPath,['--require',denyNetwork,cli,command,'--out='+path.join(dir,command)],{
      encoding:'utf8',env:{...process.env,MUSDB_AUTO_SYNC_ENABLED:'true',MUSDB_PAGES_DEPLOY_ENABLED:'false'}});
    assert.equal(run.status,1);
    assert.match(run.stderr,/Pages deployment disabled/);
  }
  const run=spawnSync(process.execPath,['--require',denyNetwork,cli,'recovery-diff','--target=pages-44928928159','--site='+dir,'--out='+path.join(dir,'unverified')],{
    encoding:'utf8',env:{...process.env,MUSDB_PAGES_DEPLOY_ENABLED:'true'}});
  assert.equal(run.status,1);
  assert.match(run.stderr,/no verified publication receipt or inventory/);
});

test('legacy recovery keeps both the publication diff and one-time approval ahead of Pages',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/auto-sync-pages-migration.yml'),'utf8');
  assert.match(workflow,/inputs\.deploy == true && inputs\.recovery_target != 'none' && inputs\.recovery_ticket != ''/);
  assert.match(workflow,/if: vars\.MUSDB_PAGES_DEPLOY_ENABLED == 'true' && steps\.diff\.outputs\.allowed == 'true'/);
  assert.match(workflow,/needs\.prepare\.outputs\.allowed == 'true' && inputs\.deploy == true && inputs\.recovery_target != 'none' &&\s+inputs\.recovery_ticket != ''/);
  assert.match(workflow,/run: node tools\/auto-sync\/publication-fence\.cjs baseline-begin/);
  assert.match(workflow,/if: vars\.MUSDB_PAGES_DEPLOY_ENABLED == 'true' && steps\.baseline\.outputs\.allowed == 'true' && steps\.recovery\.outputs\.allowed == 'true'\s+uses: actions\/deploy-pages@/);
  const code=fs.readFileSync(cli,'utf8');
  assert.match(code,/const diff=await auditPublicationDiff\(\{published,verified,directory\}\);\s+if\(diff\.status==='NO_OP'\)\{/);
});
