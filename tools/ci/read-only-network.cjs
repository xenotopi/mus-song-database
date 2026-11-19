'use strict';
const fs=require('node:fs'),path=require('node:path');
const allowed=new Set(['revision','releaseList','rankings','kamiparaDashboard','song','release','eventHistory','venueHistory','event','discover','singerList','eventBatch']);
function classify(status,code){if(status===403||status===401)return'ACCESS_DENIED';if(status===429)return'RATE_LIMIT';if(status>=500)return'UPSTREAM_SERVER';if(status>=400)return'HTTP_CLIENT';return code==='ENOTFOUND'||code==='EAI_AGAIN'?'DNS':'NETWORK_OR_PAYLOAD';}
function needsGeneration(current,remote){return current.dataRevision!==remote.dataRevision||current.outputRevision!==remote.outputRevision;}
function semantic(value){if(Array.isArray(value))return value.map(semantic);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).filter(k=>k!=='_cache').sort().map(k=>[k,semantic(value[k])]));}
function validateRequest(input,init={}){const u=new URL(typeof input==='string'||input instanceof URL?input:input.url),method=String(init.method||input.method||'GET').toUpperCase();if(method!=='GET')throw Error('DRY_RUN_WRITE_REQUEST_REJECTED');if(['127.0.0.1','localhost'].includes(u.hostname))return u;if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!allowed.has(u.searchParams.get('action')))throw Error('DRY_RUN_EXTERNAL_REQUEST_REJECTED');return u;}
function validateTrialRequest(input,init,mode='online'){const url=validateRequest(input,init);if(mode==='offline'&&!['127.0.0.1','localhost'].includes(url.hostname))throw Object.assign(Error('OFFLINE_EXTERNAL_REQUEST_REJECTED'),{category:'OFFLINE_BLOCKED'});return url;}
function install(){
 if(process.env.AUTO_SYNC_NETWORK_ENFORCE!=='1')return;
 const mode=process.env.AUTO_SYNC_NETWORK_MODE||'online',original=global.fetch;
 const deadline=process.env.AUTO_SYNC_DEADLINE_MS?Number(process.env.AUTO_SYNC_DEADLINE_MS):Infinity;
 const allowRetry=process.env.AUTO_SYNC_ALLOW_TIMEOUT_RETRY==='1';
 if(allowRetry&&!Number.isFinite(deadline))throw Error('Bounded retry requires a trial deadline');
 const {createReadOnlyFetch}=require('./request-policy.cjs');
 const guarded=createReadOnlyFetch({fetch:original,classify,record,deadline,allowRetry,validateRequest(input,init){
  return validateTrialRequest(input,init,mode);
 },expectedDataRevision:process.env.AUTO_SYNC_EXPECTED_DATA_REVISION,expectedOutputRevision:process.env.AUTO_SYNC_EXPECTED_OUTPUT_REVISION});
 global.fetch=async(...args)=>{try{return await guarded(...args);}catch(e){console.error('DRY_RUN_NETWORK_STOP '+e.message);process.exit(72);}};
 if(mode==='offline'){
  const {chromium}=require(path.resolve(__dirname,'../../tests/node_modules/playwright'));
  require('./offline-browser-network.cjs').installBrowserGuard(chromium,record);
 }
}
function record(row){if(process.env.AUTO_SYNC_NETWORK_LOG)fs.appendFileSync(process.env.AUTO_SYNC_NETWORK_LOG,JSON.stringify({...row,at:new Date().toISOString(),pid:process.pid})+'\n');}
module.exports={classify,needsGeneration,semantic,validateRequest,validateTrialRequest};
install();
