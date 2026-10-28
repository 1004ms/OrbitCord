import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

function matchOne(el, selector) {
  selector = selector.trim();
  if (!selector) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  const role = selector.match(/^\[role="([^"]+)"\]$/);
  if (role) return el.getAttribute('role') === role[1];
  const cls = selector.match(/^\[class\*="([^"]+)"\]$/);
  if (cls) return String(el.className || '').includes(cls[1]);
  const attr = selector.match(/^\[([^=\]]+)="([^"]+)"\]$/);
  if (attr) return el.getAttribute(attr[1]) === attr[2];
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

class El {
  constructor(tag, text = '') {
    this.tagName = String(tag).toUpperCase();
    this._text = text;
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.id = '';
    this.className = '';
    this.tabIndex = -1;
    this.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) { for (const n of nodes) { if (!n) continue; n.parentElement = this; this.children.push(n); } }
  appendChild(n) { this.append(n); return n; }
  insertBefore(n, ref) { n.parentElement = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (!this.parentElement) return; const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); this.parentElement = null; }
  contains(n) { for (let cur = n; cur; cur = cur.parentElement) if (cur === this) return true; return false; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(cb); }
  dispatch(type, extra = {}) {
    const ev = { target: this, currentTarget: this, key: '', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...extra };
    for (let cur = this; cur; cur = cur.parentElement) for (const cb of cur.listeners.get(type) ?? []) cb(ev);
  }
  closest(selector) { for (let cur = this; cur; cur = cur.parentElement) if (selector.split(',').some(s => matchOne(cur, s))) return cur; return null; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const selectors = sel.split(',').map(s => s.trim());
    const out = [];
    const walk = node => { for (const c of node.children) { if (selectors.some(s => matchOne(c, s))) out.push(c); walk(c); } };
    walk(this); return out;
  }
  getBoundingClientRect() { return this.rect; }
}

const body = new El('body');
const shell = new El('div'); shell.rect = { left:0, top:0, right:1200, bottom:800, width:1200, height:800 };
const sidebar = new El('div'); sidebar.rect = { left:0, top:0, right:340, bottom:800, width:340, height:800 };
const nativeContent = new El('div', 'Account settings native Discord content'); nativeContent.rect = { left:340, top:0, right:1120, bottom:800, width:780, height:800 };

function group(title, items) {
  const g = new El('div');
  if (title) g.append(new El('div', title));
  for (const item of items) g.append(new El('div', item));
  sidebar.append(g); return g;
}
const account = group('', ['Account', 'Dati e privacy', 'Permessi dei messaggi', 'Notifiche']);
group('Fatturazione', ['Nitro', 'Potenziamento server', 'Abbonamenti']);
group('Esperienza', ['Voce e video', 'Aspetto', 'Accessibilità', 'Sistema', 'Lingua e orario']);
group('Giochi e app', ['Privacy attività']);
shell.append(sidebar, nativeContent); body.append(shell);

const document = {
  body,
  createElement: tag => new El(tag),
  createTextNode: text => new El('#text', text),
  getElementById: id => body.querySelector(`#${id}`),
  querySelector: sel => body.querySelector(sel),
  querySelectorAll: sel => body.querySelectorAll(sel),
  addEventListener() {}
};
const posted = [];
const webview = { postMessage: p => posted.push(p), addEventListener() {} };
const windowObj = {
  chrome: { webview }, innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: cb => setTimeout(cb, 0)
};
const ctx = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, console, crypto:{randomUUID:()=> 'id'}, setTimeout, clearTimeout, String, Number, Array, Object, Math, Date, Set, Map, JSON, FileReader: class {} });
vm.runInContext(source, ctx);
await new Promise(r => setTimeout(r, 140));

const shortcut = document.getElementById('orbitcord-shortcut-tab');
assert.ok(shortcut, 'Shortcut entry must be mounted as soon as Discord settings are present');
shortcut.dispatch('click');
await new Promise(r => setTimeout(r, 30));

const host = document.getElementById('orbitcord-settings-panel-host');
assert.ok(host, 'clicking Shortcut must create the Web portal panel immediately');
assert.equal(host.parentElement, body, 'portal must not depend on Discord content-region internals');
assert.equal(host.style.position, 'fixed');
assert.equal(host.style.left, '340px', 'portal starts at the real sidebar edge');
assert.ok(document.getElementById('orbitcord-shortcut-page'));
assert.equal(nativeContent.style.display ?? '', '', 'native Discord content must remain untouched behind the portal');

const custom = document.getElementById('orbitcord-customisation-tab');
custom.dispatch('click');
await new Promise(r => setTimeout(r, 10));
assert.ok(document.getElementById('orbitcord-customisation-page'));
assert.equal(document.getElementById('orbitcord-shortcut-page'), null, 'switching page replaces only OrbitCord portal content');

account.children[0].dispatch('click');
assert.equal(document.getElementById('orbitcord-settings-panel-host'), null, 'clicking native Discord settings closes OrbitCord portal');

assert.match(source,/new MutationObserver/,'Web settings integration needs a scoped lifecycle observer');
assert.doesNotMatch(source,/settingsLifecycleObserver\.observe\(document\.(?:body|documentElement)/,'settings lifecycle observer must never watch the whole document');
console.log('orbitcord-settings-web-portal: PASS');
