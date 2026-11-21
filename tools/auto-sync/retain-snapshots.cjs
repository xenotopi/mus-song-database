'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {sha}=require('./policy.cjs');
// Copy only byte-verified, already-public immutable inputs. Never manufacture or
// edit a snapshot/manifest. This also works after GitHub artifact expiry.
async function retainSnapshots({root,published,get,siteUrl,deadline=Infinity}){
 if(!published.verified)return{status:'BOOTSTRAP',copied:0,verified:0,revisions:[]};
 const response=await get(new URL('data/sync-files.json',siteUrl));assert.equal(sha(response.bytes),published.release.filesManifestSha256);const manifest=JSON.parse(response.bytes);assert.equal(manifest.schemaVersion,1);const rows=manifest.files.filter(r=>/^data\/snapshots\/sha256-[a-f0-9]{64}\//.test(r.path));assert.ok(rows.length>0);assert.equal(new Set(rows.map(r=>r.path)).size,rows.length);const revisions=new Set();let copied=0,verified=0,next=0;
 async function worker(){while(next<rows.length){assert.ok(Date.now()<deadline,'Snapshot retention deadline');const row=rows[next++];assert.ok(!row.path.includes('\\')&&!row.path.split('/').includes('..'));assert.ok(row.path.endsWith('.json'));assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0);assert.match(row.sha256,/^[a-f0-9]{64}$/);const file=path.join(root,row.path);revisions.add(row.path.split('/')[2]);let bytes=fs.existsSync(file)?fs.readFileSync(file):null;if(!bytes||bytes.length!==row.bytes||sha(bytes)!==row.sha256){bytes=(await get(new URL(row.path,siteUrl))).bytes;assert.equal(bytes.length,row.bytes,'Published snapshot bytes');assert.equal(sha(bytes),row.sha256,'Published snapshot hash');fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file))assert.ok(!fs.lstatSync(file).isSymbolicLink());fs.writeFileSync(file,bytes);copied++;}verified++;}}
 await Promise.all(Array.from({length:4},()=>worker()));return{status:'PASS',copied,verified,revisions:[...revisions].sort(),source:'Verified deployed public file manifest; no GAS data reads'};
}
module.exports={retainSnapshots};
