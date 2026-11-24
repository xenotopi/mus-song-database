'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {freezeSource,frozenTransport}=require('../tools/auto-sync/frozen-source.cjs');
const {sha}=require('../tools/auto-sync/policy.cjs');
const {validateRequest}=require('../tools/ci/read-only-network.cjs');
const config=require('../tools/auto-sync/config.json');

const token='1'.repeat(64), stamp='2'.repeat(64), completion='3'.repeat(64);
const target={dataRevision:'sha256-'+'6'.repeat(64),outputRevision:'sha256-'+'7'.repeat(64)};
const url=new URL(config.apiUrl+'?action=song&id=S001');

test('only an authorized completed image opens the source, using a random value held by the generator',async()=>{
  const plan={target,sourceImageSha256:stamp,completionSha256:completion,monitorRunId:25};
  let binding;
  const fence=async(action,options)=>{assert.equal(action,'open-source');binding=options.payload;};
  const frozen=await freezeSource(plan,{fence});
  assert.match(frozen.token,/^[a-f0-9]{64}$/);
  assert.equal(frozen.stamp,stamp);
  assert.deepEqual(binding,{target,sourceImageSha256:stamp,completionSha256:completion,sourceSha:undefined,
    monitorRunId:'25',notice:undefined,tokenSha256:sha(frozen.token)});
  assert.ok(!JSON.stringify(binding).includes(frozen.token));
  await assert.rejects(freezeSource({...plan,sourceImageSha256:undefined},{fence}));
});

test('fixed input transport checks source hash and uses a token-free redirect GET',async()=>{
  const calls=[];
  const fetch=async(input,options)=>{
    calls.push({url:input.toString(),...options});
    return calls.length===1?new Response(null,{status:302,headers:{
      location:'https://script.googleusercontent.com/macros/echo?temporary=1'
    }}):Response.json({success:true,sourceImageSha256:stamp,data:{title:'Completed event'}});
  };
  const result=await frozenTransport({token,stamp,fetch})(url);
  assert.equal((await result.json()).data.title,'Completed event');
  assert.deepEqual(calls.map(i=>i.method),['POST','GET']);
  assert.equal(calls[0].url,config.apiUrl+'/musdb-frozen-read-v1');
  assert.deepEqual(JSON.parse(calls[0].body),[token,stamp,'song',{id:'S001'}]);
  assert.ok(!JSON.stringify(calls[1]).includes(token));
  assert.equal(result.url,'');
  assert.throws(()=>validateRequest(config.apiUrl+'/musdb-frozen-read-v1',{method:'POST'}),/WRITE_REQUEST_REJECTED/);
});

for(const [reason,response] of [
  ['wrong source hash',()=>Response.json({success:true,sourceImageSha256:'0'.repeat(64)})],
  ['missing source hash',()=>Response.json({success:true})],
  ['evicted source',()=>Response.json({success:false})],
  ['unexpected redirect',()=>new Response(null,{status:302,headers:{location:'https://example.org/'}})]
]){
  test(reason+' never falls back to a live Sheets projection',async()=>{
    let requests=0;
    const fetch=async()=>{requests++;return response();};
    await assert.rejects(frozenTransport({token,stamp,fetch})(url),/FROZEN_SOURCE_UNAVAILABLE/);
    assert.equal(requests,1);
  });
}
