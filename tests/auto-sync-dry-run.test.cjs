'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {classify,needsGeneration,semantic,validateRequest}=require('../tools/ci/read-only-network.cjs');
const {childEnvironment,preflightBrowser}=require('../tools/ci/test-environment.cjs');
const path=require('node:path');
test('unchanged data and output revisions skip generation',()=>assert.equal(needsGeneration({dataRevision:'a',outputRevision:'b'},{dataRevision:'a',outputRevision:'b'}),false));
test('either changed revision requires generation',()=>{assert.equal(needsGeneration({dataRevision:'a',outputRevision:'b'},{dataRevision:'c',outputRevision:'b'}),true);assert.equal(needsGeneration({dataRevision:'a',outputRevision:'b'},{dataRevision:'a',outputRevision:'c'}),true);});
test('access, rate, upstream and DNS failures stay distinct',()=>{assert.equal(classify(403),'ACCESS_DENIED');assert.equal(classify(429),'RATE_LIMIT');assert.equal(classify(503),'UPSTREAM_SERVER');assert.equal(classify(null,'ENOTFOUND'),'DNS');});
test('read-only guard rejects writes and unknown external endpoints',()=>{assert.throws(()=>validateRequest('https://script.google.com/a?action=revision',{method:'POST'}));assert.throws(()=>validateRequest('https://script.google.com/a?action=update'));assert.throws(()=>validateRequest('https://evil.invalid/?action=revision'));assert.equal(validateRequest('https://script.google.com/a?action=revision').hostname,'script.google.com');});
test('venueHistory is an explicit permitted GET action',()=>{const u=validateRequest('https://script.google.com/macros/s/example/exec?action=venueHistory');assert.equal(u.hostname,'script.google.com');assert.equal(u.searchParams.get('action'),'venueHistory');});
test('unknown, mutation and lookalike actions remain rejected',()=>{for(const action of ['update','updateAll','registerAdminSingingRecords','venueHistoryWrite','VenueHistory','unknown',''])assert.throws(()=>validateRequest('https://script.google.com/macros/s/example/exec?action='+encodeURIComponent(action)),/DRY_RUN_EXTERNAL_REQUEST_REJECTED/);});
test('venueHistory cannot bypass method or host restrictions',()=>{for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>validateRequest('https://script.google.com/a?action=venueHistory',{method}),/DRY_RUN_WRITE_REQUEST_REJECTED/);for(const host of ['evil.invalid','script.google.com.evil.invalid','script.googleusercontent.com'])assert.throws(()=>validateRequest('https://'+host+'/a?action=venueHistory'),/DRY_RUN_EXTERNAL_REQUEST_REJECTED/);assert.throws(()=>validateRequest('http://script.google.com/a?action=venueHistory'),/DRY_RUN_EXTERNAL_REQUEST_REJECTED/);});
test('comparison ignores cache transport metadata but preserves IDs, names and performances',()=>{assert.deepEqual(semantic({songId:'S001',_cache:{hit:true},performances:[{eventId:'EV0357'}]}),semantic({songId:'S001',_cache:{hit:false},performances:[{eventId:'EV0357'}]}));assert.notDeepEqual(semantic({songId:'S001'}),semantic({songId:'S002'}));assert.notDeepEqual(semantic({performances:[{eventId:'EV0357'}]}),semantic({performances:[]}));});

test('formal generation keeps diagnostics and every other stage removes inherited diagnostics',()=>{
 const parentEnv={KEEP:'original',MUSDB_RELEASE_DIAGNOSTIC_DIR:'inherited'},options={parentEnv,outputDirectory:path.resolve('trial-output'),guardPath:path.resolve('guard.cjs')};
 assert.equal(childEnvironment('snapshot',options).MUSDB_RELEASE_DIAGNOSTIC_DIR,path.join(options.outputDirectory,'release-diagnostics'));
 for(const stage of ['related-tests','validator-before-current','switch-local-current','gap','gap-check','share','share-check','sitemap-check','validator-final','unknown']){
  const env=childEnvironment(stage,options);assert.equal(Object.hasOwn(env,'MUSDB_RELEASE_DIAGNOSTIC_DIR'),false,stage);
  assert.equal(env.AUTO_SYNC_NETWORK_ENFORCE,'1');assert.equal(env.AUTO_SYNC_NETWORK_LOG,path.join(options.outputDirectory,'network.jsonl'));assert.equal(env.NODE_OPTIONS,'--require '+options.guardPath);assert.equal(env.KEEP,'original');
 }
 assert.equal(parentEnv.MUSDB_RELEASE_DIAGNOSTIC_DIR,'inherited');
});

function browserFixture({launchFailure=false,text='ready'}={}){
 let launches=0,closed=0,options;const chromium={executablePath:()=>'/fixture/chromium',async launch(o){launches++;options=o;if(launchFailure)throw Error('headless shell missing');return{version:()=> '156.0.0.0',async newPage(){return{async setContent(html){assert.match(html,/id="ready"/);},locator(selector){assert.equal(selector,'#ready');return{textContent:async()=>text};}};},async close(){closed++;}};}};
 return{chromium,stats:()=>({launches,closed,options})};
}
test('preflight starts the default Chromium headless browser and verifies a real DOM operation',async()=>{
 const f=browserFixture();const result=await preflightBrowser({chromium:f.chromium,playwrightVersion:'1.62.1',exists:()=>true});assert.equal(result.status,'PASS');assert.equal(result.browserVersion,'156.0.0.0');assert.deepEqual(f.stats(),{launches:1,closed:1,options:{headless:true}});
});
test('preflight rejects absent Chromium before launching',async()=>{
 const f=browserFixture();await assert.rejects(preflightBrowser({chromium:f.chromium,playwrightVersion:'1.62.1',exists:()=>false}),/executable missing/);assert.equal(f.stats().launches,0);
});
test('preflight rejects a missing headless shell without retry',async()=>{
 const f=browserFixture({launchFailure:true});await assert.rejects(preflightBrowser({chromium:f.chromium,playwrightVersion:'1.62.1',exists:()=>true}),/headless shell missing/);assert.equal(f.stats().launches,1);
});
test('preflight rejects wrong Playwright and DOM failure; closes an opened browser',async()=>{
 const f=browserFixture({text:'not ready'});await assert.rejects(preflightBrowser({chromium:f.chromium,playwrightVersion:'wrong',exists:()=>true}),/Unexpected Playwright/);assert.equal(f.stats().launches,0);await assert.rejects(preflightBrowser({chromium:f.chromium,playwrightVersion:'1.62.1',exists:()=>true}));assert.equal(f.stats().closed,1);
});
