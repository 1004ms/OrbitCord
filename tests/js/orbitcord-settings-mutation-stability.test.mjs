import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

function matchesSelector(el, selector) {
  selector = selector.trim();
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  const cls = selector.match(/^\[class\*="([^"]+)"\]$/); if (cls) return String(el.className || '').includes(cls[1]);
  const role = selector.match(/^\[role="([^"]+)"\]$/); if (role) return el.getAttribute('role') === role[1];
  const attr = selector.match(/^\[([^=]+)="([^"]+)"\]$/); if (attr) return el.getAttribute(attr[1]) === attr[2];
  return el.tagName.toLowerCase() === selector.toLowerCase();
}
class FakeElement {
  constructor(tag, text='') { this.tagName=String(tag).toUpperCase(); this._text=text; this.children=[]; this.parentElement=null; this.style={}; this.dataset={}; this.attributes={}; this.listeners=new Map(); this.id=''; this.className=''; this.tabIndex=-1; }
  get textContent(){ return this._text + this.children.map(c=>c.textContent||'').join(''); }
  set textContent(v){ this._text=String(v??''); this.children=[]; }
  append(...nodes){ for(const n of nodes){ if(!n) continue; n.parentElement=this; this.children.push(n); } }
  replaceChildren(...nodes){ this.children=[]; this._text=''; this.append(...nodes); }
  remove(){ if(!this.parentElement) return; const i=this.parentElement.children.indexOf(this); if(i>=0)this.parentElement.children.splice(i,1); this.parentElement=null; }
  contains(node){ let n=node; while(n){ if(n===this)return true; n=n.parentElement; } return false; }
  setAttribute(k,v){ this.attributes[k]=String(v); } getAttribute(k){ return this.attributes[k]??null; }
  addEventListener(t,cb){ if(!this.listeners.has(t))this.listeners.set(t,[]); this.listeners.get(t).push(cb); }
  dispatch(t,extra={}){ const e={target:this,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra}; let n=this; while(n){ for(const cb of n.listeners.get(t)||[])cb(e); n=n.parentElement; } }
  closest(sel){ let n=this; while(n){ if(matchesSelector(n,sel))return n; n=n.parentElement; } return null; }
  querySelector(sel){ return this.querySelectorAll(sel)[0]??null; }
  querySelectorAll(sel){ const sels=sel.split(',').map(s=>s.trim()); const out=[]; const walk=n=>{for(const c of n.children){if(sels.some(s=>matchesSelector(c,s)))out.push(c);walk(c);}}; walk(this); return out; }
}

const body=new FakeElement('body');
const root=new FakeElement('div'); root.className='standardSidebarView_x';
const sideRegion=new FakeElement('div'); sideRegion.className='sidebarRegion_x';
const sidebar=new FakeElement('div'); sidebar.className='sidebar_x';
const account=new FakeElement('div','Account'); account.setAttribute('role','tab'); sidebar.append(account); sideRegion.append(sidebar);
const contentRegion=new FakeElement('div'); contentRegion.className='contentRegion_x';
const scroller=new FakeElement('div'); scroller.className='contentRegionScroller_x'; contentRegion.append(scroller);
root.append(sideRegion,contentRegion); body.append(root);

const document={ body, querySelector:s=>body.querySelector(s), querySelectorAll:s=>body.querySelectorAll(s), getElementById:id=>body.querySelector(`#${id}`), createElement:t=>new FakeElement(t), createTextNode:t=>new FakeElement('#text',t), addEventListener(){} };
const webview={postMessage(){},addEventListener(){}};
const windowObj={chrome:{webview},addEventListener(){},removeEventListener(){}};
let observerCallback=null;
class MutationObserver { constructor(cb){ observerCallback=cb; } observe(){} disconnect(){} }
const context=vm.createContext({window:windowObj,chrome:windowObj.chrome,document,MutationObserver,crypto:{randomUUID:()=> 'x'},setTimeout,clearTimeout,console,String,Number,Array,Object,Math,Date,Set,Map,JSON});
vm.runInContext(source,context);
await new Promise(r=>setTimeout(r,60));

document.getElementById('orbitcord-shortcut-tab').dispatch('click');
const page=document.getElementById('orbitcord-shortcut-page');
assert.ok(page);
const sentinel=new FakeElement('div','sentinel'); sentinel.id='orbitcord-test-sentinel'; page.append(sentinel);
observerCallback?.([{ target: page, type: 'childList' }]);
await new Promise(r=>setTimeout(r,80));
assert.equal(document.getElementById('orbitcord-test-sentinel'), sentinel, 'OrbitCord-owned mutations must not trigger a destructive remount');
console.log('orbitcord-settings-mutation-stability: PASS');
