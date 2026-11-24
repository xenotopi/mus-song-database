'use strict';

const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');
const {sha} = require('./policy.cjs');
const {publicationFence} = require('./publication-fence.cjs');
const config = require('./config.json');

async function freezeSource(plan, {fence=publicationFence}={}) {
  assert.match(plan.sourceImageSha256,/^[a-f0-9]{64}$/,'A new stamped, completed update is required');
  const token = randomBytes(32).toString('hex');
  await fence('open-source',{payload:{
    target:plan.target, sourceImageSha256:plan.sourceImageSha256, completionSha256:plan.completionSha256,
    sourceSha:plan.sourceSha, monitorRunId:String(plan.monitorRunId),
    notice:plan.completionNotice, tokenSha256:sha(token)
  }});
  return {token,stamp:plan.sourceImageSha256,completionSha256:plan.completionSha256};
}

function frozenTransport({token,stamp,completionSha256,fetch,httpUrl=config.apiUrl}){
  assert.match(token,/^[a-f0-9]{64}$/);
  assert.match(stamp,/^[a-f0-9]{64}$/);
  assert.equal(httpUrl,config.apiUrl);
  assert.match(completionSha256,/^[a-f0-9]{64}$/);
  const endpoint=new URL(httpUrl);
  assert.equal(endpoint.origin,'https://script.google.com');
  assert.match(endpoint.pathname,/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/);
  assert.ok(!endpoint.search&&!endpoint.hash&&!endpoint.username&&!endpoint.password);
  return async (input,init={})=>{
    const request=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(['127.0.0.1','localhost'].includes(request.hostname))return fetch(input,init);
    assert.equal(request.origin+request.pathname,httpUrl);
    assert.equal(String(init.method||'GET').toUpperCase(),'GET');
    const action=request.searchParams.get('action');
    const parameters=Object.fromEntries([...request.searchParams].filter(([key])=>key!=='action'));
    const options={redirect:'manual',referrerPolicy:'no-referrer',signal:init.signal};
    try{
      let response=await fetch(endpoint,{...options,method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify([token,stamp,action,parameters])});
      if([302,303].includes(response.status)){
        const location=new URL(response.headers.get('location'));
        assert.equal(location.origin,'https://script.googleusercontent.com');
        assert.equal(location.pathname,'/macros/echo');
        assert.ok(location.search && !location.hash && !location.username && !location.password);
        response=await fetch(location,{...options,method:'GET'});
      }
      // Preserve HTTP failure handling without recording a sensitive redirect URL.
      if(!response.ok)return new Response(null,{status:response.status});
      assert.match(response.headers.get('content-type')||'',/^application\/json\b/i);
      const payload=await response.json();
      assert.equal(payload?.success,true);
      assert.equal(payload.sourceImageSha256,stamp);
      assert.equal(payload.sourceCompletionSha256,completionSha256);
      return Response.json(payload);
    }catch(error){
      // Allow only explicit timeout handling in the existing read-only policy. Never log body or URL.
      if(init.signal?.aborted)throw init.signal.reason;
      throw Error('FROZEN_SOURCE_UNAVAILABLE');
    }
  };
}

module.exports={freezeSource,frozenTransport};
