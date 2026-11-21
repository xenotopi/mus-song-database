'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

function childEnvironment(stage,{outputDirectory,guardPath,parentEnv=process.env}){
 const env={...parentEnv,AUTO_SYNC_NETWORK_ENFORCE:'1',AUTO_SYNC_NETWORK_LOG:path.join(outputDirectory,'network.jsonl'),NODE_OPTIONS:'--require '+guardPath};
 // Never let an inherited diagnostic setting leak into mocks or browser tests.
 delete env.MUSDB_RELEASE_DIAGNOSTIC_DIR;
 if(['snapshot','offline-capture'].includes(stage))env.MUSDB_RELEASE_DIAGNOSTIC_DIR=path.join(outputDirectory,'release-diagnostics');
 delete env.AUTO_SYNC_ALLOW_TIMEOUT_RETRY;
 if(stage==='snapshot'&&env.AUTO_SYNC_NETWORK_MODE!=='offline')env.AUTO_SYNC_ALLOW_TIMEOUT_RETRY='1';
 return env;
}

async function preflightBrowser({chromium,playwrightVersion,exists=fs.existsSync}){
 assert.equal(playwrightVersion,'1.62.1','Unexpected Playwright version');
 const executable=chromium.executablePath();
 assert.ok(exists(executable),'Playwright Chromium executable missing');
 const start=performance.now();let browser;
 try{
  // No channel/executable override: exercise the same default headless-shell
  // required by the existing tests, independently of formal capture's Chrome.
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.setContent('<!doctype html><title>Chromium preflight</title><p id="ready">ready</p>');
  assert.equal(await page.locator('#ready').textContent(),'ready');
  return{status:'PASS',playwrightVersion,executable,browserVersion:browser.version(),seconds:(performance.now()-start)/1000};
 }finally{await browser?.close();}
}

module.exports={childEnvironment,preflightBrowser};
if(require.main===module){
 (async()=>{
  assert.equal(process.argv[2],'--preflight');
  assert.equal(process.env.AUTO_SYNC_CI,'1','Run the browser preflight on the isolated CI runner');
  const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.AUTO_SYNC_OUTPUT);
  fs.mkdirSync(out,{recursive:true});
  let result;
  try{
   const {chromium}=require(path.join(root,'tests/node_modules/playwright'));
   const {version}=require(path.join(root,'tests/node_modules/playwright/package.json'));
   result=await preflightBrowser({chromium,playwrightVersion:version});
  }catch(error){result={status:'FAIL',error:{message:error.message,stack:error.stack}};process.exitCode=1;}
  fs.writeFileSync(path.join(out,'chromium-preflight.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result));
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
