import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');
const observers = new Set();

function matchOne(el, sel) {
  sel = sel.trim();
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  const role = sel.match(/^\[role="([^"]+)"\]$/); if (role) return el.getAttribute('role') === role[1];
  const cls = sel.match(/^\[class\*="([^"]+)"\]$/); if (cls) return String(el.className || '').includes(cls[1]);
  const attr = sel.match(/^\[([^=\]]+)="([^"]+)"\]$/); if (attr) return el.getAttribute(attr[1]) === attr[2];
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

class E {
  constructor(tag, text = '') { this.tagName = String(tag).toUpperCase(); this._text = text; this.children = []; this.parentElement = null; this.style = {}; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.id = ''; this.className = ''; this.tabIndex = -1; this.rect = {left:0,top:0,right:0,bottom:0,width:0,height:0}; }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) { for (const node of nodes) { if (!node) continue; node.parentElement = this; this.children.push(node); } }
  insertBefore(node, ref) { node.parentElement = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(node); else this.children.splice(i, 0, node); }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() { const parent = this.parentElement; if (!parent) return; const i = parent.children.indexOf(this); if (i >= 0) parent.children.splice(i, 1); this.parentElement = null; for (const observer of [...observers]) observer._notify(parent); }
  contains(node) { for (let cur = node; cur; cur = cur.parentElement) if (cur === this) return true; return false; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(t, cb) { if (!this.listeners.has(t)) this.listeners.set(t, []); this.listeners.get(t).push(cb); }
  closest(sel) { for (let cur = this; cur; cur = cur.parentElement) if (sel.split(',').some(s => matchOne(cur, s))) return cur; return null; }
  querySelector(s) { return this.querySelectorAll(s)[0] ?? null; }
  querySelectorAll(s) { const sels = s.split(',').map(x => x.trim()); const out = []; const walk = node => { for (const child of node.children) { if (sels.some(sel => matchOne(child, sel))) out.push(child); walk(child); } }; walk(this); return out; }
  getBoundingClientRect() { return this.rect; }
}

class ScopedMutationObserver {
  constructor(cb) { this.cb = cb; this.target = null; this.disconnected = false; observers.add(this); }
  observe(target) { this.target = target; this.disconnected = false; }
  disconnect() { this.disconnected = true; this.target = null; }
  _notify(changedParent) { if (!this.disconnected && this.target === changedParent) this.cb([{type:'childList', target: changedParent}], this); }
}

const body = new E('body');
const shell = new E('div'); shell.id = 'app-mount'; body.append(shell);
const root = new E('div'); root.className = 'standardSidebarView_settings'; root.rect = {left:0,top:0,right:1200,bottom:800,width:1200,height:800};
const sidebarRegion = new E('div'); sidebarRegion.className = 'sidebarRegion_settings';
const sidebar = new E('div'); sidebar.className = 'sidebar_settings'; sidebar.rect = {left:0,top:0,right:340,bottom:800,width:340,height:800};
const nativeTab = new E('div', 'Il mio account'); nativeTab.setAttribute('role', 'tab'); sidebar.append(nativeTab); sidebarRegion.append(sidebar);
const content = new E('div'); content.className = 'contentRegion_settings'; root.append(sidebarRegion, content); shell.append(root);

const docListeners = new Map();
const document = {
  body,
  createElement: tag => new E(tag),
  createTextNode: text => new E('#text', text),
  getElementById: id => body.querySelector(`#${id}`),
  querySelector: sel => body.querySelector(sel),
  querySelectorAll: sel => body.querySelectorAll(sel),
  addEventListener(type, cb) { if (!docListeners.has(type)) docListeners.set(type, []); docListeners.get(type).push(cb); }
};
const webview = { postMessage() {}, addEventListener() {} };
const windowObj = { chrome: { webview }, innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
const ctx = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, MutationObserver: ScopedMutationObserver, console, crypto:{randomUUID:()=> 'id'}, setTimeout, clearTimeout, String, Number, Array, Object, Math, Date, Set, Map, JSON, FileReader: class {} });
vm.runInContext(source, ctx);
await new Promise(r => setTimeout(r, 80));

document.getElementById('orbitcord-shortcut-tab').listeners.get('click')[0]({preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
await new Promise(r => setTimeout(r, 20));
assert.ok(document.getElementById('orbitcord-settings-panel-host'), 'precondition: OrbitCord portal must be mounted');
assert.ok(observers.size > 0, 'an active OrbitCord page must track the concrete Settings shell lifecycle');

root.remove();
assert.equal(document.getElementById('orbitcord-settings-panel-host'), null, 'removing Discord Settings must synchronously remove the OrbitCord portal without relying on a close-button selector');
assert.equal([...observers].filter(observer => !observer.disconnected).length, 0, 'closing Settings must disconnect the scoped lifecycle observer');

// Reopen Settings with a fresh Discord shell and prove OrbitCord remounts cleanly
// instead of reusing the detached root/portal from the previous session.
const reopenedRoot = new E('div'); reopenedRoot.className = 'standardSidebarView_settings'; reopenedRoot.rect = root.rect;
const reopenedSidebarRegion = new E('div'); reopenedSidebarRegion.className = 'sidebarRegion_settings';
const reopenedSidebar = new E('div'); reopenedSidebar.className = 'sidebar_settings'; reopenedSidebar.rect = sidebar.rect;
const reopenedNativeTab = new E('div', 'Il mio account'); reopenedNativeTab.setAttribute('role', 'tab'); reopenedSidebar.append(reopenedNativeTab); reopenedSidebarRegion.append(reopenedSidebar);
const reopenedContent = new E('div'); reopenedContent.className = 'contentRegion_settings'; reopenedRoot.append(reopenedSidebarRegion, reopenedContent); shell.append(reopenedRoot);
windowObj.__orbitcordSettingsTest.mount();
const reopenedShortcutTab = document.getElementById('orbitcord-shortcut-tab');
assert.ok(reopenedShortcutTab, 'reopening Discord Settings must mount a fresh OrbitCord section');
reopenedShortcutTab.listeners.get('click')[0]({preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
await new Promise(r => setTimeout(r, 20));
assert.ok(document.getElementById('orbitcord-settings-panel-host'), 'reopened Settings must mount a fresh OrbitCord portal');
assert.equal([...observers].filter(observer => !observer.disconnected).length, 1, 'exactly one scoped lifecycle observer may be active after remount');

console.log('orbitcord-settings-lifecycle-removal: PASS');
