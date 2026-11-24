'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');const policy=require('./policy.cjs'),{client}=require('./http.cjs'),site=require('./site.cjs'),{validateMonitorRun,dataBindings}=require('./pipeline.cjs'),{monitor,authorizeBuild,confirmPlan}=require('./readiness-client.cjs');
const {completionNotice,validateAutomaticMonitorRun,authorizeAutomaticBuild}=require('./completion-event.cjs');
const {freezeSource}=require('./frozen-source.cjs');
const {publicationFence}=require('./publication-fence.cjs');
const {fileEntry,loadPublishedBaseline,comparePublication,trackedSourceMatches}=require('./publication-diff.cjs');
const {bindPublicationSource,confirmPublishedSnapshot,requirePagesDeployment,validatePublicationSource}=require('./publication-mode.cjs');
const {selectRecoveryTarget,recoveryAssetBinding,verifyRecoveryArchive,verifyRecoveryOrigin,verifyRecoverySite}=require('./recovery-target.cjs');
const root=path.resolve(__dirname,'../..'),config=require('./config.json'),command=process.argv[2],options=Object.fromEntries(process.argv.slice(3).map(a=>{assert.match(a,/^--[a-z-]+=.+$/);const i=a.indexOf('=');return[a.slice(2,i),a.slice(i+1)];}));
const out=path.resolve(options.out||process.env.RUNNER_TEMP&&path.join(process.env.RUNNER_TEMP,'musdb-sync')||path.join(root,'../sync-local-output'));fs.mkdirSync(out,{recursive:true});const records=[],signedChecks=[];
const signingKey=process.env.MUSDB_SYNC_SIGNING_KEY;
delete process.env.MUSDB_SYNC_SIGNING_KEY;
const sourceSigningKey=process.env.MUSDB_DIRECT_SOURCE_KEY;
delete process.env.MUSDB_DIRECT_SOURCE_KEY;
const freezeForBuild=plan=>freezeSource(plan,{fence:(_action,{payload})=>publicationFence('open-source',{
  payload,env:{...process.env,MUSDB_DIRECT_SOURCE_KEY:sourceSigningKey}
})});
const http=client(config,{signingKey,record:r=>records.push(r),recordSigned:r=>signedChecks.push(r)}),read=f=>JSON.parse(fs.readFileSync(f)),save=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n');let state='checking';const status=extra=>{const row={schemaVersion:1,state,at:new Date().toISOString(),runUrl:process.env.GITHUB_RUN_ID?'https://github.com/'+config.repository+'/actions/runs/'+process.env.GITHUB_RUN_ID:null,...extra};save('state.json',row);fs.appendFileSync(path.join(out,'state-history.jsonl'),JSON.stringify(row)+'\n');};
function output(k,v){assert.match(k,/^[a-z_]+$/);assert.ok(!String(v).includes('\n'));if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,k+'='+v+'\n');}
function git(...a){const r=cp.spawnSync('git',['--no-optional-locks','-C',root,...a],{encoding:'utf8',maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
const fingerprint=()=>policy.sourceFingerprint(root),plan=()=>read(path.resolve(options.plan||path.join(out,'plan.json'))),runInfo=()=>({repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,sha:git('rev-parse','HEAD'),runId:Number(process.env.GITHUB_RUN_ID),runNumber:Number(process.env.GITHUB_RUN_NUMBER)});
const completionOptions={maxAgeSeconds:config.maximumReadinessAgeSeconds,stableSeconds:config.minimumStableSeconds};
function superseded(message){throw Object.assign(new Error(message),{code:'SUPERSEDED'});}
async function freshPlan(plan,phase){
 const observed=await confirmPlan({http,plan,phase,getFingerprint:fingerprint,context:runInfo(),completionOptions});
 if(phase!=='post-deploy')confirmPublishedSnapshot(plan,observed.published);
 return observed;
}
const automatic=()=>process.env.GITHUB_EVENT_NAME==='workflow_run';
function eventConfig(){return {...config,repositoryId:Number(config.signedReadiness.repositoryId),monitorWorkflowId:425885956,
  trustedDispatchActorId:Number(process.env.MUSDB_EVENT_ACTOR_ID)};}
function automaticContext(mainSha){return {config:eventConfig(),mainSha,enabled:process.env.MUSDB_EVENT_PUBLICATION_ENABLED==='true',
  invocation:{event:process.env.GITHUB_EVENT_NAME,protected:process.env.MUSDB_RUN_REF_PROTECTED==='true',
    repositoryId:Number(process.env.GITHUB_REPOSITORY_ID),ref:process.env.GITHUB_REF,sha:git('rev-parse','HEAD'),
    runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT)}};}
function noticeInput(retryFailedRunId){
  const value=process.env.MUSDB_COMPLETION_NOTICE;
  if (!value) return null;
  const settings=eventConfig();
  assert.equal(process.env.MUSDB_EVENT_MONITOR_ENABLED,'true','Event monitoring disabled');
  assert.ok(Number.isSafeInteger(settings.trustedDispatchActorId)&&settings.trustedDispatchActorId>0,'Missing trusted actor');
  assert.equal(Number(process.env.GITHUB_ACTOR_ID),settings.trustedDispatchActorId,'Untrusted completion monitor actor');
  assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','Completion monitor reruns require manual handling');
  assert.equal(retryFailedRunId,null,'An automatic notice cannot acknowledge a failed publication');
  assert.ok(value.length<=512,'Invalid notice length');
  let notice;
  try { notice=JSON.parse(value); } catch { throw new Error('Invalid completion notice JSON'); }
  return completionNotice(notice);
}
async function validatePlan(p,{candidate=false}={}) {
  const {planId,...fields}=p;
  assert.equal(policy.sha(JSON.stringify(fields)),planId,'Plan hash mismatch');
  assert.equal(p.schemaVersion,1);
  assert.equal(p.repository,config.repository);
  assert.equal(p.enabled,true);
  assert.ok(Number.isSafeInteger(p.monitorRunId)&&p.monitorRunId>0);
  assert.match(p.sourceSha,/^[a-f0-9]{40}$/);
  assert.match(p.fingerprint,/^[a-f0-9]{64}$/);
  if (candidate) {
    assert.ok(['CHECK','NO_OP'].includes(p.decision));
    assert.ok(!Object.hasOwn(p,'completionSha256')&&!Object.hasOwn(p,'sourceImageSha256')&&!Object.hasOwn(p,'publishedSnapshot'));
    assert.ok(p.retryFailedRunId===null||/^[1-9]\d*$/.test(p.retryFailedRunId));
  } else {
    assert.equal(p.decision,'BUILD');
    assert.match(p.completionSha256,/^[a-f0-9]{64}$/);
    validatePublicationSource(p,process.env);
    assert.equal(p.authorizedRunId,runInfo().runId);
  }
  assert.ok(!Object.hasOwn(p,'completionId'));
  policy.revisions(p.target);
  if(p.sourceSha!==git('rev-parse','HEAD')||p.sourceSha!==await http.mainSha()||p.fingerprint!==fingerprint())superseded('Plan source is no longer latest main');
  return p;
}
function confirmDiffBaseline(published,expected){
  assert.ok(published?.verified && published.runId===expected.runId &&
    published.release.filesManifestSha256===expected.filesManifestSha256 &&
    published.receiptEntry.sha256===expected.receiptSha256,'Verified publication baseline changed');
}
async function requireRecoveryContext(){
  requirePagesDeployment(process.env);
  const env=process.env;
  assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');
  assert.equal(env.GITHUB_REPOSITORY,config.repository);
  assert.equal(env.GITHUB_REPOSITORY_ID,config.signedReadiness.repositoryId);
  assert.equal(env.GITHUB_REF,'refs/heads/'+config.branch);
  assert.equal(env.MUSDB_RUN_REF_PROTECTED,'true');
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
  assert.equal(env.GITHUB_WORKFLOW_REF,config.repository+'/.github/workflows/auto-sync-pages-migration.yml@'+env.GITHUB_REF);
  const sourceSha=git('rev-parse','HEAD');
  assert.equal(env.GITHUB_SHA,sourceSha,'Recovery workflow checkout changed');
  assert.equal(await http.mainSha(),sourceSha,'Recovery workflow source no longer latest main');
}
async function auditPublicationDiff({published,verified,directory,verifiedDerived}){
  let result;
  try {
    const baseline=await loadPublishedBaseline(published,{get:http.get,siteUrl:config.siteUrl});
    const snapshotManifest=read(path.join(directory,'data/snapshots',verified.release.outputRevision,'manifest.json'));
    const candidate={release:verified.release,rows:verified.rows,snapshotManifest,
      readFile:relative=>fs.readFileSync(path.join(directory,relative))};
    const rendererProofs=new Map();
    const rendererChanged=paths=>{
      const before=baseline.release.sourceSha,after=candidate.release.sourceSha;
      if(before===after)return false;
      const key=paths.join('|');
      if(!rendererProofs.has(key))rendererProofs.set(key,(async()=>{
        const readGit=async(file,ref)=>(await http.gh('/contents/'+file+'?ref='+ref)).json();
        for(const file of paths){
          const [oldItem,newItem]=await Promise.all([readGit(file,before),readGit(file,after)]);
          for(const item of [oldItem,newItem]){
            assert.equal(item.type,'file');assert.equal(item.path,file);assert.match(item.sha,/^[a-f0-9]{40}$/);
          }
          if(oldItem.sha!==newItem.sha)return true;
        }
        return false;
      })());
      return rendererProofs.get(key);
    };
    result=await comparePublication({baseline,candidate,verifiedDerived,rendererChanged,proveSource:async(relative,before,after)=>
      await trackedSourceMatches(http,relative,after,candidate.release.sourceSha) &&
      (!before||await trackedSourceMatches(http,relative,before,baseline.release.sourceSha))});
  } catch(error) {
    save('publication-diff.json',{status:'FAIL',reason:error.message});
    throw error;
  }
  save('publication-diff.json',result);
  assert.notEqual(result.status,'FAIL','Unexplained publication file differences');
  return result;
}
async function guard(p,checks,baseline){
  const fresh=await freshPlan(p,'pre-deploy');
  confirmDiffBaseline(fresh.published,baseline);
  return policy.deploymentGate({config,enabledVariable:process.env.MUSDB_AUTO_SYNC_ENABLED,plan:p,...fresh,checks});
}
function run(name,args,frozen){const {childEnvironment}=require('../ci/test-environment.cjs'),deadline=Number(process.env.AUTO_SYNC_DEADLINE_MS),env=childEnvironment(name,{outputDirectory:out,guardPath:path.join(root,'tools/ci/read-only-network.cjs')});delete env.AUTO_SYNC_CAPTURE_LOG;delete env.MUSDB_DIRECT_FENCE_KEY;delete env.MUSDB_FROZEN_SOURCE_TOKEN;delete env.MUSDB_FROZEN_SOURCE_STAMP;delete env.MUSDB_FROZEN_SOURCE_COMPLETION;if(frozen){env.MUSDB_FROZEN_SOURCE_TOKEN=frozen.token;env.MUSDB_FROZEN_SOURCE_STAMP=frozen.stamp;env.MUSDB_FROZEN_SOURCE_COMPLETION=frozen.completionSha256;}if(['snapshot','switch-local-current'].includes(name)){env.AUTO_SYNC_CAPTURE_LOG=path.join(out,'capture.jsonl');env.NODE_OPTIONS+=' --require '+path.join(root,'tools/ci/batch-trial-contract.cjs');}if(name==='related-tests'){env.AUTO_SYNC_NETWORK_MODE='offline';delete env.AUTO_SYNC_ALLOW_TIMEOUT_RETRY;}const a=fs.openSync(path.join(out,name+'.stdout.log'),'wx'),b=fs.openSync(path.join(out,name+'.stderr.log'),'wx'),begin=Date.now();let r;try{r=cp.spawnSync(process.execPath,args,{cwd:root,env,stdio:['ignore',a,b],timeout:Math.max(1,deadline-Date.now())});}finally{fs.closeSync(a);fs.closeSync(b);}const row={name,seconds:(Date.now()-begin)/1000,exit:r.status};fs.appendFileSync(path.join(out,'steps.jsonl'),JSON.stringify(row)+'\n');assert.ok(!r.error&&r.status===0,name+' failed; no unconditional retry');return fs.readFileSync(path.join(out,name+'.stdout.log'),'utf8');}
async function build(){const p=await validatePlan(plan());assert.equal(config.enabled,true,'Activation file remains disabled');assert.equal(process.env.MUSDB_AUTO_SYNC_ENABLED,'true');assert.equal(p.decision,'BUILD');const current=read(path.join(root,'data/current.json')),baseline=read(path.join(root,'data/snapshots',current.outputRevision,'manifest.json'));const initial=await freshPlan(p,'build-start');if(initial.published?.verified&&policy.same(initial.published,p.target)&&initial.published.fingerprint===p.fingerprint&&initial.published.release.sourceImageSha256===p.sourceImageSha256){state='published';status({decision:'NO_OP',reason:'Queued duplicate already verified'});output('validated','false');return;}assert.equal(initial.published?.verified,true,'A verified public release is required before generation');assert.equal(git('status','--porcelain=v2'),'');assert.equal(process.version,'v24.19.0');assert.equal(require('../../tests/node_modules/playwright/package.json').version,'1.62.1');const probe=await require('../../tests/node_modules/playwright').chromium.launch({channel:'chrome',headless:true});const chrome=probe.version();await probe.close();assert.equal(chrome,'158.0.8127.36');save('environment.json',{node:process.version,chrome,playwright:'1.62.1'});process.env.AUTO_SYNC_EXPECTED_DATA_REVISION=p.target.dataRevision;process.env.AUTO_SYNC_EXPECTED_OUTPUT_REVISION=p.target.outputRevision;process.env.AUTO_SYNC_DEADLINE_MS=String(Date.now()+config.buildBudgetMinutes*60000);
 const tests=['event-batch-client','capture-canonical','ci-canonical-comparison','ci-batch-trial','auto-sync-dry-run','ci-request-policy','snapshot-publication','detail-snapshot','static-html-validator','member-analytics-source-counts','capture-provenance','member-analytics-snapshot','gap-rankings','event-static-ui','event-related-releases-ui','auto-sync-publication-diff','auto-sync-policy','auto-sync-pipeline','auto-sync-signed-readiness','auto-sync-site','auto-sync-retention'].map(n=>'tests/'+n+'.test.cjs');state='validating-code';status();const testLog=run('related-tests',['--test','--test-concurrency=1','--test-reporter=tap',...tests]);assert.match(testLog,/^# fail 0$/m);assert.match(testLog,/^# cancelled 0$/m);
 state='generating';status();const contract=require('../ci/batch-trial-contract.cjs'),retained=await require('./retain-snapshots.cjs').retainSnapshots({root,published:initial.published,get:http.get,siteUrl:config.siteUrl,deadline:Number(process.env.AUTO_SYNC_DEADLINE_MS)});save('retained-snapshots.json',retained);await require('./capture-existing.cjs').generateVerifiedSnapshot({root,plan:p,published:initial.published,retained,generatorArgs:contract.generatorArgs,freezeSource:freezeForBuild,run,save});contract.verifyCaptures(contract.captureRows(path.join(out,'capture.jsonl')));const validate=name=>{const v=JSON.parse(run(name,['tools/validate-static-html.cjs','--revision',p.target.outputRevision]));assert.equal(v.status,'PASS');assert.equal(v.integrity,'PASS');assert.equal(v.provenance,'VERIFIED');return v;};state='validating';status();validate('validator-before-current');const manifests=['song','release'].map(t=>policy.sha(fs.readFileSync(path.join(root,t,'manifest.json'))));const sw=run('switch-local-current',['tools/generate-static-snapshot.cjs','--switch-current',p.target.outputRevision,'--reuse-verified-html']);assert.match(sw,/"reusedHtml":true/);assert.match(sw,/"capturePages":0/);assert.equal(contract.captureRows(path.join(out,'capture.jsonl')).length,231);assert.deepEqual(['song','release'].map(t=>policy.sha(fs.readFileSync(path.join(root,t,'manifest.json')))),manifests);
 for(const [name,args]of [['gap',['tools/generate-gap-rankings.cjs']],['gap-check',['tools/generate-gap-rankings.cjs','--check']],['share',['tools/generate-share-pages.cjs','--all']],['share-check',['tools/generate-share-pages.cjs','--all','--check']],['sitemap',['tools/generate-sitemap.cjs','--snapshot']],['sitemap-check',['tools/generate-sitemap.cjs','--snapshot','--check']]])run(name,args);
 const renderedSnapshot=read(path.join(root,'data/snapshots',p.target.outputRevision,'manifest.json'));
 const derivedPaths=['data/gap-rankings.json','sitemap.xml',...['song','event'].flatMap(type=>Object.keys(renderedSnapshot.hashes[type+'s']).map(id=>'share/'+type+'/'+id+'.html'))];
 const verifiedDerived=Object.fromEntries(derivedPaths.map(relative=>[relative,fileEntry(relative,fs.readFileSync(path.join(root,relative)))]));
 const validator=validate('validator-final'),bindings=dataBindings(root,p.target.outputRevision,initial.published.verified?read(path.join(root,'data/snapshots',initial.published.outputRevision,'manifest.json')):baseline),{inspect}=require('../ci/canonical-comparison.cjs');for(const type of ['song','release'])for(const id of Object.keys(read(path.join(root,type,'manifest.json')).pages))inspect(fs.readFileSync(path.join(root,type,id+'.html'),'utf8'),'https://mus-song-db.com/'+type+'/'+id+'.html',{final:true});
 const browser=await require('../ci/event-browser-qa.cjs').run({root,out});assert.equal(browser.pass,4);assert.equal(browser.fail,0);assert.equal(fingerprint(),p.fingerprint,'Unexpected source mutation');await freshPlan(p,'build-end');const checks={capture:'PASS',validator:'PASS',integrity:'PASS',provenance:'VERIFIED',bindings:'PASS',derived:'PASS',privacy:'PASS',regressions:'PASS',browser:'PASS'};const destination=path.join(out,'site');const packaged=site.buildSite({root,destination,plan:p,checks,...runInfo(),previousPublished:initial.published?.verified?initial.published:initial.published?.lastVerified});const verifiedSite=site.verifySite(destination);
 const publicationDiff=await auditPublicationDiff({published:initial.published,verified:verifiedSite,directory:destination,verifiedDerived});
 if(publicationDiff.status==='NO_OP'){state='published';status({decision:'NO_OP',reason:'NO_PUBLIC_PAYLOAD_DIFF'});output('validated','false');return;}
 save('build.json',{status:'PASS',plan:p,checks,bindings,validator,browser,capture:231,switchCapture:0,release:packaged.release,files:packaged.files.length,publicationDiff,verifiedDerived});state='validated';status();output('site',destination);output('validated','true');
}
(async()=>{status();
 if(['monitor','validate-monitor','validate-plan','authorize-plan','build','predeploy','verify'].includes(command)&&
    (!config.enabled||process.env.MUSDB_AUTO_SYNC_ENABLED!=='true')){
   state='blocked';status({reason:'ACTIVATION_DISABLED'});output('decision','BLOCKED');output('validated','false');output('allowed','false');return;
 }
 if(command==='monitor'){
   const sourceSha=git('rev-parse','HEAD'), retryFailedRunId=options['retry-failed-run']==='none'?null:options['retry-failed-run']||null;
   assert.ok(retryFailedRunId===null||/^[1-9]\d*$/.test(retryFailedRunId));
   const notice=noticeInput(retryFailedRunId);
   const d=await monitor({http,sourceSha,fingerprint:fingerprint()});
   if(notice&&!policy.same(notice,d.target)){
     state='blocked';status({decision:'BLOCKED',reason:'NOTICE_REVISION_SUPERSEDED'});output('decision','BLOCKED');return;
   }
   const p={schemaVersion:1,repository:config.repository,sourceSha,monitorRunId:runInfo().runId,createdAt:new Date().toISOString(),...d,enabled:config.enabled,retryFailedRunId,...(notice?{completionNotice:notice}:{})};
   p.planId=policy.sha(JSON.stringify(p));save('plan.json',p);
   state=p.decision==='NO_OP'?'published':'waiting';status({decision:p.decision,reason:p.reason});output('decision',p.decision);
 }
 else if(command==='validate-monitor'){
   const id=Number(options['run-id']);assert.ok(Number.isSafeInteger(id)&&id>0);
   const r=(await http.gh('/actions/runs/'+id)).json();assert.equal(r.id,id);validateMonitorRun(r,config);
   const mainSha=await http.mainSha();
   if(r.head_sha!==mainSha)superseded('Monitor superseded by a newer main');
   if(automatic()){
     validateAutomaticMonitorRun({run:r,...automaticContext(mainSha)});
     const response=(await http.gh('/actions/runs/'+id+'/artifacts?per_page=100')).json();
     assert.ok(Array.isArray(response.artifacts)&&response.total_count===response.artifacts.length,'Incomplete monitor artifact inventory');
     const artifacts=response.artifacts.filter(item=>item.name==='sync-monitor-plan'&&item.expired===false);
     if(artifacts.length===0){state='blocked';status({reason:'MONITOR_HAS_NO_CANDIDATE'});output('decision','BLOCKED');return;}
     assert.equal(artifacts.length,1,'Ambiguous monitor artifact');
   }
   save('monitor-run.json',{id:r.id,head:r.head_sha});output('run_id',r.id);
 }
 else if(command==='validate-plan'){
   const p=await validatePlan(plan(),{candidate:true}), m=read(path.join(out,'monitor-run.json'));
   assert.equal(p.monitorRunId,m.id);assert.equal(p.sourceSha,m.head);
   if(automatic()&&p.decision==='CHECK')completionNotice(p.completionNotice);
   output('decision',p.decision);save('candidate-plan.json',p);
 }
 else if(command==='authorize-plan'){
   const candidate=await validatePlan(plan(),{candidate:true});
    const result=automatic()
     ? await authorizeAutomaticBuild({http,candidate,run:(await http.gh('/actions/runs/'+candidate.monitorRunId)).json(),
         ...automaticContext(await http.mainSha()),completionOptions})
     : await authorizeBuild({http,candidate,completionOptions});
    const approvedNotice=candidate.completionNotice?completionNotice(candidate.completionNotice):null;
    if(approvedNotice&&result.decision==='BUILD'&&(approvedNotice.completionIdSha256!==result.completionSha256||
        approvedNotice.sourceImageSha256!==result.sourceImageSha256)){
     state='blocked';status({decision:'BLOCKED',reason:'NOTICE_GENERATION_SUPERSEDED'});output('decision','BLOCKED');return;
   }
    const published=result.decision==='BUILD'&&!Object.hasOwn(result,'sourceImageSha256')?await http.published():null;
    const authorized=bindPublicationSource(result,published,process.env);
    if(authorized.decision==='BUILD')validatePublicationSource(authorized,process.env);
   if(authorized.decision==='BUILD'){
     const {planId:observationId,...observed}=candidate;
     const accepted={...observed,...authorized,observationId,authorizedRunId:runInfo().runId};
     accepted.planId=policy.sha(JSON.stringify(accepted));save('accepted-plan.json',accepted);
   }
   state=authorized.decision==='BUILD'?'waiting':authorized.decision==='NO_OP'?'published':'blocked';
   status({decision:authorized.decision,reason:authorized.reason});output('decision',authorized.decision);
 }
 else if(command==='build')await build();
 else if(command==='recovery-select'){
  requirePagesDeployment(process.env);
  const target=selectRecoveryTarget(options.target);
  const binding=recoveryAssetBinding(target);
  await requireRecoveryContext();
  await verifyRecoveryOrigin({http,target});
  output('asset_id',binding.assetId);
 }
 else if(command==='recovery-archive'){
  requirePagesDeployment(process.env);
  const target=selectRecoveryTarget(options.target);
  verifyRecoveryArchive(target,fs.readFileSync(path.resolve(options.archive)));
 }
 else if(command==='recovery-diff'){
  requirePagesDeployment(process.env);
  const target=selectRecoveryTarget(options.target);
  const directory=path.resolve(options.site);
  for(const name of ['data/sync-release.json','data/sync-files.json']){
    assert.ok(fs.existsSync(path.join(directory,name)),'Recovery bundle has no verified publication receipt or inventory');
  }
  const verified=verifyRecoverySite(target,directory);
  const binding=recoveryAssetBinding(target);
  await requireRecoveryContext();
  const published=await http.published();
  const diff=await auditPublicationDiff({published,verified,directory});
  if(diff.status==='NO_OP'){
    state='published';status({decision:'NO_OP',reason:'Selected recovery content is already verified'});
    output('allowed','false');return;
  }
  assert.equal(diff.status,'PASS');
  output('run_id',diff.baseline.runId);output('receipt_sha256',diff.baseline.receiptSha256);
  output('inventory_sha256',diff.baseline.filesManifestSha256);output('target_sha256',target.targetSha256);
  output('release_id',binding.releaseId);output('asset_id',binding.assetId);output('allowed','true');
 }
 else if(command==='recheck-recovery'){
  requirePagesDeployment(process.env);
  const target=selectRecoveryTarget(options.target);
  const binding=recoveryAssetBinding(target);
  assert.equal(options['release-id'],String(binding.releaseId),'Recovery Release changed after preparation');
  assert.equal(options['asset-id'],String(binding.assetId),'Recovery Asset changed after preparation');
  await requireRecoveryContext();
  assert.equal(options['target-sha256'],target.targetSha256,'Recovery target changed after preparation');
  await verifyRecoveryOrigin({http,target});
  const baseline={runId:Number(options['run-id']),receiptSha256:options['receipt-sha256'],filesManifestSha256:options['inventory-sha256']};
  assert.ok(Number.isSafeInteger(baseline.runId)&&baseline.runId>0);
  for(const hash of [baseline.receiptSha256,baseline.filesManifestSha256])assert.match(hash,/^[a-f0-9]{64}$/);
  confirmDiffBaseline(await http.published(),baseline);output('allowed','true');
 }
 else if(command==='predeploy'){requirePagesDeployment(process.env);const p=await validatePlan(plan()),v=site.verifySite(path.resolve(options.site)),b=read(path.resolve(options.build));assert.equal(b.status,'PASS');assert.equal(v.release.planId,p.planId);assert.equal(v.release.sourceImageSha256,p.sourceImageSha256);assert.equal(v.release.runId,Number(process.env.GITHUB_RUN_ID));assert.deepEqual(v.release,b.release);const settings=(await http.gh('/pages')).json();assert.equal(settings.build_type,'workflow','Pages source must be deliberately switched before activation');
  assert.equal(b.publicationDiff?.status,'PASS','A build-time publication diff is required');
  const published=await http.published();
  confirmDiffBaseline(published,b.publicationDiff.baseline);
  const publicationDiff=await auditPublicationDiff({published,verified:v,directory:path.resolve(options.site),verifiedDerived:b.verifiedDerived});
  assert.equal(publicationDiff.status,'PASS','No public payload change to deploy');
  assert.deepEqual(publicationDiff,b.publicationDiff,'Publication diff changed after the build');
  await guard(p,b.checks,publicationDiff.baseline);state='deploying';status();output('legacy',String(Object.hasOwn(p,'publishedSnapshot')));output('allowed','true');console.log('DEPLOY_GATE_PASS');}
 else if(command==='verify'){const p=await validatePlan(plan()),local=site.verifySite(path.resolve(options.site)),release=(await http.get(new URL('data/sync-release.json',config.siteUrl))).json(),current=(await http.get(new URL('data/current.json',config.siteUrl))).json(),manifest=(await http.get(new URL('data/snapshots/'+p.target.outputRevision+'/manifest.json',config.siteUrl))).bytes,remoteFiles=(await http.get(new URL('data/sync-files.json',config.siteUrl))).bytes;assert.deepEqual(release,local.release);assert.equal(policy.sha(remoteFiles),release.filesManifestSha256);const rows=JSON.parse(remoteFiles).files,paths=['index.html','event.html','member-analytics.html','song/S001.html','release/R0036.html','assets/js/common.js','data/song-youtube.json'];const events=Object.keys(read(path.join(path.resolve(options.site),'data/snapshots',p.target.outputRevision,'manifest.json')).hashes.events).slice(-2);paths.push(...events.map(id=>'data/snapshots/'+p.target.outputRevision+'/events/'+id+'.json'));paths.push(...require('./public-card-tools.json'));for(const name of paths){const expected=rows.find(r=>r.path===name);assert.ok(expected,name);const b=(await http.get(new URL(name,config.siteUrl),{maxBytes:16*1024*1024})).bytes;assert.equal(b.length,expected.bytes);assert.equal(policy.sha(b),expected.sha256,'Public bytes mismatch '+name);}const fresh=await freshPlan(p,'post-deploy');const verified=policy.verifiedDeployment({plan:p,release,current,manifestBytes:manifest,expectedManifestSha:release.snapshotManifestSha256,deployConclusion:process.env.PAGES_DEPLOY_CONCLUSION,latest:fresh.latest,readiness:fresh.readiness,fingerprint:fresh.fingerprint});assert.equal(p.sourceSha,await http.mainSha());state='published';status({verification:verified});save('verification.json',{status:'VERIFIED',runId:Number(process.env.GITHUB_RUN_ID),checks:paths.length+4,target:p.target,at:new Date().toISOString()});console.log('PAGES_AND_HTTP_VERIFIED');}
 else if(command==='evidence'){const target=path.resolve(options.destination),staging=target+'-input';assert.equal(fs.existsSync(staging),false);fs.mkdirSync(staging);for(const name of fs.readdirSync(out))if(name!=='site')fs.cpSync(path.join(out,name),path.join(staging,name),{recursive:true});require('../ci/batch-trial-contract.cjs').packageArtifact(staging,target);console.log('SANITIZED_EVIDENCE_READY');}
 else throw Error('Unknown command');
})().catch(e=>{if(policy.failureDisposition(command,e).exitCode===0){state='superseded';status({reason:e.message});output('validated','false');output('allowed','false');output('decision','BLOCKED');console.log('SUPERSEDED_NO_DEPLOY');}else{state='failed';status({error:e.message});console.error(e.stack);process.exitCode=1;}}).finally(()=>save('http-summary-'+command+'.json',{reads:records,signedChecks,contentWrites:0,rawHttpBodiesSaved:false,retries:0}));
