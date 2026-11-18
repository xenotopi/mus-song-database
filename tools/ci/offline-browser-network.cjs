'use strict';
const local=url=>['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname);
function protectRoute(route,record){return new Proxy(route,{get(target,key){
 if(key==='continue')return options=>{const url=options?.url||target.request().url();if(!local(url)){record({url,category:'OFFLINE_BROWSER_BLOCKED',networkSent:false});return target.abort('blockedbyclient');}return target.continue(options);};
 const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
}});}
function installBrowserGuard(chromium,record){
 const marker=Symbol.for('musdb.offline.browser.guard');if(chromium[marker])return;chromium[marker]=true;
 const contexts=new WeakSet(),pages=new WeakSet();
 function protectRegistration(object){const original=object.route.bind(object);object.route=(pattern,handler,...rest)=>original(pattern,(route,request)=>handler(protectRoute(route,record),request),...rest);return original;}
 function pageGuard(page){if(!pages.has(page)){pages.add(page);protectRegistration(page);}return page;}
 async function contextGuard(context){if(contexts.has(context))return context;contexts.add(context);const route=protectRegistration(context);await route('**/*',r=>protectRoute(r,record).continue());const create=context.newPage.bind(context);context.newPage=async(...args)=>pageGuard(await create(...args));return context;}
 const launch=chromium.launch.bind(chromium);chromium.launch=async(...args)=>{const browser=await launch(...args),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);browser.newContext=async(...opts)=>contextGuard(await newContext(...opts));browser.newPage=async(...opts)=>{const page=await newPage(...opts);await contextGuard(page.context());return pageGuard(page);};return browser;};
}
module.exports={protectRoute,installBrowserGuard};
