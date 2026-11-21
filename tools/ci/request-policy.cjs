'use strict';
const {setTimeout:sleep}=require('node:timers/promises');
const error=(message,category)=>Object.assign(new Error(message),{category});
function createReadOnlyFetch({fetch,validateRequest,classify,record,deadline=Infinity,allowRetry=false,expectedDataRevision,expectedOutputRevision,now=Date.now,wait=sleep,random=Math.random}){
 let retryBudget=3,sequence=0;
 return async(input,init={})=>{
  const started=now(),requestId=process.pid+'-'+(++sequence);let url;
  try{url=validateRequest(input,init);}catch(e){record({requestId,url:String(input),attempt:0,category:e.category||'REQUEST_REJECTED',error:e.message,retry:false,elapsedMs:now()-started});throw e;}
  // Loopback fixtures retain their own signals and are never retried.
  if(['127.0.0.1','localhost'].includes(url.hostname)){
   try{const r=await fetch(input,init);record({requestId,url:String(url),finalUrl:r.url||String(url),status:r.status,attempt:1,phase:'complete',ms:now()-started,elapsedMs:now()-started,retry:false});return r;}
   catch(e){record({requestId,url:String(url),attempt:1,phase:'fetch',category:classify(e.httpStatus,e.cause?.code||e.code),error:e.message,ms:now()-started,elapsedMs:now()-started,retry:false});throw e;}
  }
  for(let attempt=1;attempt<=2;attempt++){
   const attemptStart=now();let phase='fetch',response,finalUrl=null;
   if(now()>=deadline){record({requestId,url:String(url),attempt,category:'DEADLINE',error:'Trial deadline exceeded',retry:false,elapsedMs:now()-started});throw error('Trial deadline exceeded','DEADLINE');}
   const signals=[AbortSignal.timeout(90000)];
   if(Number.isFinite(deadline))signals.push(AbortSignal.timeout(Math.max(1,Math.min(2147483647,deadline-now()))));
   // A timed-out caller signal must not poison the one permitted retry.
   // Explicit caller cancellation is always honored and never retried.
   if(init.signal&&!(attempt>1&&init.signal.aborted&&init.signal.reason?.name==='TimeoutError'))signals.push(init.signal);
   const signal=AbortSignal.any(signals);
   try{
    response=await fetch(input,{...init,signal});finalUrl=response.url||String(url);
    if(!['script.google.com','script.googleusercontent.com'].includes(new URL(finalUrl).hostname))throw error('Unexpected response host','RESPONSE_HOST_REJECTED');
    if(!response.ok)throw Object.assign(error('HTTP '+response.status,classify(response.status)),{httpStatus:response.status});
    phase='body';const payload=await response.clone().json();phase='payload';
    if(payload?.success!==true)throw error('API_PAYLOAD_FAILURE','API_PAYLOAD_FAILURE');
    const data=payload.data;
    if(expectedDataRevision&&data?._cache?.revision!==undefined&&data._cache.revision!==expectedDataRevision)throw error('API data revision mismatch','REVISION_MISMATCH');
    if(url.searchParams.get('action')==='revision'&&((expectedDataRevision&&data?.dataRevision!==expectedDataRevision)||(expectedOutputRevision&&data?.outputRevision!==expectedOutputRevision)))throw error('API revision pair mismatch','REVISION_MISMATCH');
    if(now()>=deadline)throw error('Trial deadline exceeded','DEADLINE');
    record({requestId,url:String(url),finalUrl,status:response.status,attempt,phase:'complete',ms:now()-attemptStart,elapsedMs:now()-started,retry:false});return response;
   }catch(e){
    const cancelled=init.signal?.aborted&&init.signal.reason?.name!=='TimeoutError';
    const timeout=(e.name==='TimeoutError'||(e.name==='AbortError'&&signal.aborted&&signal.reason?.name==='TimeoutError'))&&(phase==='fetch'||phase==='body')&&!cancelled&&!e.httpStatus;
    const category=now()>=deadline?'DEADLINE':cancelled?'CANCELLED':e.category||(timeout?'TIMEOUT':classify(e.httpStatus,e.cause?.code||e.code));
    const retry=allowRetry&&timeout&&category==='TIMEOUT'&&attempt===1&&retryBudget>0&&now()+91500<deadline;
    const delay=retry?1000+Math.floor(random()*500):0;
    record({requestId,url:String(url),finalUrl,status:e.httpStatus??response?.status,attempt,phase,category,error:e.message,ms:now()-attemptStart,elapsedMs:now()-started,retry,retryDelayMs:delay,retriesRemaining:retryBudget-(retry?1:0)});
    if(!retry)throw e;retryBudget--;await wait(delay);
   }
  }
 };
}
module.exports={createReadOnlyFetch};
