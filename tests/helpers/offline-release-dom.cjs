'use strict';
// Structural DOM adapter for the source relocation tests only. No layout,
// navigation, events or browser claims; backed by the existing strict parser.
const {parseSerializedHtml,descendants,textContent}=require('../../tools/static-html-readonly-lib.cjs');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const serialize=n=>typeof n==='string'?esc(n):'<'+n.tag+Object.entries(n.attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('')+'>'+(voids.has(n.tag)?'':n.children.map(serialize).join('')+'</'+n.tag+'>');
const attr=k=>'data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
function simple(n,s){if(!n?.tag)return false;const id=/#([\w-]+)/.exec(s);if(id&&n.attrs.id!==id[1])return false;for(const m of s.matchAll(/\.([\w-]+)/g))if(!(n.attrs.class||'').split(/\s+/).includes(m[1]))return false;for(const m of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(!Object.hasOwn(n.attrs,m[1])||m[2]!==undefined&&n.attrs[m[1]]!==m[2])return false;const tag=/^[a-z][\w-]*/i.exec(s);return !tag||n.tag===tag[0];}
function matches(n,selector){const parts=selector.trim().split(/\s+/);let i=parts.length-1;if(!simple(n,parts[i--]))return false;for(let p=n.parent;i>=0;p=p?.parent){if(!p)return false;if(simple(p,parts[i]))i--;}return true;}
function offlineDocument(html){const parsed=parseSerializedHtml(html),cache=new WeakMap();
 function wrap(n){if(!n)return null;if(cache.has(n))return cache.get(n);const el={
  get id(){return n.attrs.id||'';},set id(v){n.attrs.id=String(v);},get className(){return n.attrs.class||'';},set className(v){n.attrs.class=String(v);},
  get textContent(){return textContent(n);},set textContent(v){n.children=[String(v)];},
  get innerHTML(){return n.children.map(serialize).join('');},set innerHTML(v){const d=parseSerializedHtml('<!doctype html><html><head></head><body>'+v+'</body></html>'),body=d.nodes.find(x=>x.tag==='body');n.children=body.children;for(const c of n.children)if(typeof c!=='string')c.parent=n;},
  get outerHTML(){return serialize(n);},get parentElement(){return n.parent?.attrs?wrap(n.parent):null;},get firstElementChild(){return this.children[0]||null;},get children(){return n.children.filter(x=>typeof x!=='string').map(wrap);},
  get previousElementSibling(){const siblings=n.parent?.children.filter(x=>typeof x!=='string')||[];return wrap(siblings[siblings.indexOf(n)-1]);},get nextElementSibling(){const siblings=n.parent?.children.filter(x=>typeof x!=='string')||[];return wrap(siblings[siblings.indexOf(n)+1]);},
  get isConnected(){let p=n;while(p.parent)p=p.parent;return p===parsed.document;},
  querySelectorAll(s){return descendants(n,c=>matches(c,s)).map(wrap);},querySelector(s){return this.querySelectorAll(s)[0]||null;},
  setAttribute(k,v){n.attrs[k]=String(v);},getAttribute(k){return n.attrs[k]??null;},
  remove(){if(n.parent){n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=null;}},
  append(...nodes){for(const c of nodes){if(typeof c==='string'){n.children.push(c);continue;}c.remove();c._node.parent=n;n.children.push(c._node);}},
  prepend(c){c.remove();c._node.parent=n;n.children.unshift(c._node);},
  after(c){c.remove();const p=n.parent;c._node.parent=p;p.children.splice(p.children.indexOf(n)+1,0,c._node);},
  replaceWith(c){this.after(c);this.remove();},cloneNode(){const d=offlineDocument('<!doctype html><html><head></head><body>'+serialize(n)+'</body></html>');return d.querySelector('body').firstElementChild;},
  _node:n
 };el.dataset=new Proxy({}, {get:(_,k)=>n.attrs[attr(k)],set:(_,k,v)=>(n.attrs[attr(k)]=String(v),true)});el.classList={contains:k=>(n.attrs.class||'').split(/\s+/).includes(k),add:k=>n.attrs.class=[...new Set((n.attrs.class||'').split(/\s+/).filter(Boolean).concat(k))].join(' ')};cache.set(n,el);return el;}
 const doc={getElementById:id=>wrap(descendants(parsed.document,n=>n.attrs.id===id)[0]),querySelectorAll:s=>descendants(parsed.document,n=>matches(n,s)).map(wrap),querySelector:s=>doc.querySelectorAll(s)[0]||null,createElement:tag=>wrap({tag,attrs:{},children:[],parent:null}),serialize:()=>'<!doctype html>'+serialize(parsed.html)};return doc;
}
module.exports={offlineDocument};
