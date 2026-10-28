import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

function matchOne(el, sel) {
  sel = sel.trim();
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  const role = sel.match(/^\[role="([^"]+)"\]$/); if (role) return el.getAttribute('role') === role[1];
  const cls = sel.match(/^\[class\*="([^"]+)"\]$/); if (cls) return String(el.className || '').includes(cls[1]);
  const attr = sel.match(/^\[([^=\]]+)="([^"]+)"\]$/); if (attr) return el.getAttribute(attr[1]) === attr[2];
  return el.tagName.toLowerCase() === sel.toLowerCase();
}
class E {
  constructor(tag, text = '') { this.tagName=String(tag).toUpperCase(); this._text=text; this.children=[]; this.parentElement=null; this.style={}; this.dataset={}; this.attributes={}; this.listeners=new Map(); this.id=''; this.className=''; this.tabIndex=-1; this.rect={left:0,top:0,right:0,bottom:0,width:0,height:0}; }
  get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('')}
  set textContent(v){this._text=String(v??'');this.children=[]}
  append(...nodes){for(const node of nodes){if(!node)continue;node.parentElement=this;this.children.push(node)}}
  insertBefore(node,ref){node.parentElement=this;const i=this.children.indexOf(ref);if(i<0)this.children.push(node);else this.children.splice(i,0,node)}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes)}
  remove(){if(!this.parentElement)return;const i=this.parentElement.children.indexOf(this);if(i>=0)this.parentElement.children.splice(i,1);this.parentElement=null}
  contains(node){for(let cur=node;cur;cur=cur.parentElement)if(cur===this)return true;return false}
  setAttribute(k,v){this.attributes[k]=String(v)} getAttribute(k){return this.attributes[k]??null}
  addEventListener(t,cb){if(!this.listeners.has(t))this.listeners.set(t,[]);this.listeners.get(t).push(cb)}
  closest(sel){for(let cur=this;cur;cur=cur.parentElement)if(sel.split(',').some(s=>matchOne(cur,s)))return cur;return null}
  querySelector(s){return this.querySelectorAll(s)[0]??null}
  querySelectorAll(s){const sels=s.split(',').map(x=>x.trim()),out=[];const walk=n=>{for(const c of n.children){if(sels.some(sel=>matchOne(c,sel)))out.push(c);walk(c)}};walk(this);return out}
  getBoundingClientRect(){return this.rect}
}

const body = new E('body');
const app = new E('div'); body.append(app);
const docListeners = new Map();
const document = {
  body,
  createElement:t=>new E(t), createTextNode:t=>new E('#text',t),
  getElementById:id=>body.querySelector(`#${id}`), querySelector:s=>body.querySelector(s), querySelectorAll:s=>body.querySelectorAll(s),
  addEventListener(t,cb){if(!docListeners.has(t))docListeners.set(t,[]);docListeners.get(t).push(cb)}
};
const webview={postMessage(){},addEventListener(){}};
const windowObj={chrome:{webview},innerWidth:1200,innerHeight:800,addEventListener(){},removeEventListener(){},dispatchEvent(){}};
const ctx=vm.createContext({window:windowObj,chrome:windowObj.chrome,document,console,crypto:{randomUUID:()=> 'id'},setTimeout,clearTimeout,String,Number,Array,Object,Math,Date,Set,Map,JSON,FileReader:class{},CustomEvent:class{}});
vm.runInContext(source,ctx);

const gear = new E('button'); gear.setAttribute('aria-label','User Settings'); app.append(gear);
for (const cb of docListeners.get('click') || []) cb({target:gear});

await new Promise(r=>setTimeout(r,320));
const root=new E('div');root.className='standardSidebarView_settings';root.rect={left:0,top:0,right:1200,bottom:800,width:1200,height:800};
const sr=new E('div');sr.className='sidebarRegion_settings';const sidebar=new E('div');sidebar.className='sidebar_settings';sidebar.rect={left:0,top:0,right:340,bottom:800,width:340,height:800};
const nativeTab=new E('div','Il mio account');nativeTab.setAttribute('role','tab');sidebar.append(nativeTab);sr.append(sidebar);const content=new E('div');content.className='contentRegion_settings';root.append(sr,content);app.append(root);

await new Promise(r=>setTimeout(r,520));
assert.ok(document.getElementById('orbitcord-settings-section'), 'OrbitCord entries must mount on the first Settings opening even when Discord React mounts after 180 ms');
console.log('orbitcord-settings-first-open: PASS');
