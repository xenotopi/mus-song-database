
export const API_URL='https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec';
export async function apiGet(action,params={}){
 const u=new URL(API_URL);u.searchParams.set("action",action);
 Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u,{redirect:"follow"});const j=await r.json();
 if(!j.success)throw new Error(j.error?.message||"APIエラー");return j;
}
export const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
export const fmt=v=>v?String(v).replaceAll("-","/"):"—";
