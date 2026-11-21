'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=path.resolve(__dirname,'../..'),out=path.join(process.env.AUTO_SYNC_OUTPUT,'offline'),copy=path.join(path.dirname(process.env.AUTO_SYNC_OUTPUT),'auto-sync-07-offline-repo');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
const result={status:'RUNNING',mode:'saved-snapshot-offline',freshApiGeneration:false,steps:[],browser:{pass:0,fail:0,notRun:4}},started=Date.now();
fs.mkdirSync(out,{recursive:true});const save=()=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
const tests=['event-batch-client','capture-canonical','ci-canonical-comparison','ci-batch-trial','auto-sync-dry-run','ci-request-policy','snapshot-publication','detail-snapshot','static-html-validator','member-analytics-source-counts','capture-provenance','member-analytics-snapshot','gap-rankings','event-static-ui','event-related-releases-ui'].map(x=>'tests/'+x+'.test.cjs');
const git=args=>cp.execFileSync('git',['--no-optional-locks','-C',source,...args],{encoding:'utf8',maxBuffer:32*1024*1024});
(async()=>{
 assert.equal(process.env.AUTO_SYNC_CI,'1');assert.equal(git(['diff','--name-only']),'');assert.equal(git(['diff','--cached','--name-only']),'');
 result.head=git(['rev-parse','HEAD']).trim();assert.equal(fs.existsSync(copy),false,'Refuse to overwrite an offline copy');fs.mkdirSync(copy);
 const tracked=git(['ls-files','-z']).split('\0').filter(Boolean),sourceHashes=new Map();
 for(const file of tracked){const bytes=fs.readFileSync(path.join(source,file));sourceHashes.set(file,hash(bytes));const target=path.join(copy,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 fs.cpSync(path.join(source,'tests/node_modules'),path.join(copy,'tests/node_modules'),{recursive:true});
 const current=read(path.join(copy,'data/current.json')),revision=current.outputRevision,snapshotRoot=path.join(copy,'data/snapshots',revision);
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
 const inputs=new Map(walk(snapshotRoot).map(f=>[f,hash(fs.readFileSync(f))]));result.revision=revision;result.inputFiles=inputs.size;
 const {childEnvironment}=require(path.join(copy,'tools/ci/test-environment.cjs'));
 process.env.AUTO_SYNC_NETWORK_MODE='offline';process.env.AUTO_SYNC_NETWORK_ENFORCE='1';process.env.AUTO_SYNC_NETWORK_LOG=path.join(out,'network.jsonl');process.env.AUTO_SYNC_OUTPUT=out;
 require(path.join(copy,'tools/ci/read-only-network.cjs'));
 function run(name,args){const begin=Date.now(),stdout=fs.openSync(path.join(out,name+'.stdout.log'),'w'),stderr=fs.openSync(path.join(out,name+'.stderr.log'),'w');let r;
  try{r=cp.spawnSync(process.execPath,args,{cwd:copy,stdio:['ignore',stdout,stderr],env:childEnvironment(name,{outputDirectory:out,guardPath:path.join(copy,'tools/ci/read-only-network.cjs')}),timeout:20*60*1000});}
  finally{fs.closeSync(stdout);fs.closeSync(stderr);}result.steps.push({name,exit:r.status,error:r.error?.message,seconds:(Date.now()-begin)/1000});save();assert.ok(!r.error&&r.status===0,name+' failed; no retry');return fs.readFileSync(path.join(out,name+'.stdout.log'),'utf8');}
 // Tests run first. Recapture is local rendering of validated saved inputs, not
 // an API rebuild and never a backfilled historical capture receipt.
 const log=run('related-tests',['--test','--test-concurrency=1','--test-reporter=tap',...tests]);result.tests={};for(const k of ['tests','pass','fail','skipped','cancelled']){const m=log.match(new RegExp('^# '+k+' (\\d+)','m'));assert.ok(m);result.tests[k]=Number(m[1]);}assert.equal(result.tests.fail,0);assert.equal(result.tests.cancelled,0);
 run('offline-capture',['tools/ci/offline-capture.cjs']);
 const v=JSON.parse(run('validator',['tools/validate-static-html.cjs','--revision',revision]));assert.equal(v.status,'PASS');assert.equal(v.integrity,'PASS');assert.equal(v.provenance,'VERIFIED');result.validator=v;
 result.browser=await require(path.join(copy,'tools/ci/event-browser-qa.cjs')).run({root:copy,out});assert.equal(result.browser.pass,4);assert.equal(result.browser.fail,0);
 for(const[f,digest]of inputs)assert.equal(hash(fs.readFileSync(f)),digest,'Saved snapshot changed');
 for(const[file,digest]of sourceHashes)assert.equal(hash(fs.readFileSync(path.join(source,file))),digest,'Original checkout changed');
 assert.equal(git(['diff','--name-only']),'');assert.equal(git(['diff','--cached','--name-only']),'');
 result.sourceUnchanged=true;result.liveGasRequests=0;result.status='OFFLINE_PASS_NOT_FRESH_API_GENERATION';
})().catch(e=>{result.status='FAIL';result.error={message:e.message,stack:e.stack};process.exitCode=1;}).finally(()=>{
 try{if(result.revision)for(const relative of ['data/current.json','data/snapshots/'+result.revision,'song','release']){const target=path.join(out,'generated',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(copy,relative),target,{recursive:true});}}
 catch(e){result.artifactError=e.message;result.status='FAIL';process.exitCode=1;}
 result.seconds=(Date.now()-started)/1000;save();console.log(JSON.stringify(result,null,2));
});
