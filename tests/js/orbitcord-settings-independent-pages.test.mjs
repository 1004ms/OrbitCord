import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

function matchesSelector(el, selector) {
  selector = selector.trim();
  if (!selector) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  const cls = selector.match(/^\[class\*="([^"]+)"\]$/);
  if (cls) return String(el.className || '').includes(cls[1]);
  const role = selector.match(/^\[role="([^"]+)"\]$/);
  if (role) return el.getAttribute('role') === role[1];
  const attr = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
  if (attr) return el.getAttribute(attr[1]) === attr[2];
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

class FakeElement {
  constructor(tagName, text = '') {
    this.tagName = String(tagName).toUpperCase(); this._text = text; this.children = []; this.parentElement = null;
    this.style = {}; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.id = ''; this.className = ''; this.tabIndex = -1;
  }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) { for (const node of nodes) { if (!node) continue; node.parentElement = this; this.children.push(node); } }
  insertBefore(node, ref) { node.parentElement = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(node); else this.children.splice(i, 0, node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (!this.parentElement) return; const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); this.parentElement = null; }
  contains(node) { let cur = node; while (cur) { if (cur === this) return true; cur = cur.parentElement; } return false; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(cb); }
  dispatch(type, extra = {}) { const event = { target: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...extra }; let cur = this; while (cur) { for (const cb of cur.listeners.get(type) ?? []) cb(event); cur = cur.parentElement; } }
  closest(selector) { let n = this; while (n) { if (matchesSelector(n, selector)) return n; n = n.parentElement; } return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) { const sels = selector.split(',').map(s => s.trim()); const out = []; const walk = node => { for (const child of node.children) { if (sels.some(sel => matchesSelector(child, sel))) out.push(child); walk(child); } }; walk(this); return out; }
}

const body = new FakeElement('body');
const root = new FakeElement('div'); root.className = 'standardSidebarView_settings';
const sidebarRegion = new FakeElement('div'); sidebarRegion.className = 'sidebarRegion_settings';
const sidebar = new FakeElement('div'); sidebar.className = 'sidebar_settings';
const account = new FakeElement('div', 'Account'); account.setAttribute('role', 'tab'); sidebar.append(account); sidebarRegion.append(sidebar);
const contentRegion = new FakeElement('div'); contentRegion.className = 'contentRegion_settings';
const scroller = new FakeElement('div'); scroller.className = 'contentRegionScroller_settings';
const nativeHeading = new FakeElement('h2', 'Account');
const nativeBody = new FakeElement('div', 'Native Discord settings');
scroller.append(nativeHeading, nativeBody); contentRegion.append(scroller); root.append(sidebarRegion, contentRegion); body.append(root);

const document = {
  body,
  querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), getElementById: id => body.querySelector(`#${id}`),
  createElement: tag => new FakeElement(tag), createTextNode: text => new FakeElement('#text', text), addEventListener() {}
};
const messages = [];
const webview = { postMessage(v) { messages.push(v); }, addEventListener() {} };
const windowObj = { chrome: { webview }, addEventListener() {}, removeEventListener() {} };
class MutationObserver { observe() {} disconnect() {} }
const context = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, MutationObserver, crypto: { randomUUID: () => 'x' }, setTimeout, clearTimeout, console, String, Number, Array, Object, Math, Date, Set, Map, JSON });
vm.runInContext(source, context);
await new Promise(r => setTimeout(r, 60));

const shortcut = document.getElementById('orbitcord-shortcut-tab');
const custom = document.getElementById('orbitcord-customisation-tab');
assert.ok(shortcut && custom, 'both OrbitCord entries must exist');
assert.notEqual(shortcut.id, custom.id, 'entries must have unique ids');
assert.equal(shortcut.getAttribute('aria-controls'), 'orbitcord-shortcut-page', 'Shortcut must control only its own panel');
assert.equal(custom.getAttribute('aria-controls'), 'orbitcord-customisation-page', 'Customisation must control only its own panel');

shortcut.dispatch('click');
assert.ok(document.getElementById('orbitcord-shortcut-page'), 'Shortcut must open its own panel');
assert.equal(nativeHeading.style.display ?? '', '', 'opening OrbitCord must not overwrite/hide Discord native nodes');
assert.equal(nativeBody.style.display ?? '', '', 'opening OrbitCord must not overwrite/hide Discord native nodes');
assert.ok(messages.some(m => m?.type === 'orbitcord-shortcuts-request'), 'Shortcut must request only shortcut state');

custom.dispatch('click');
assert.ok(document.getElementById('orbitcord-customisation-page'), 'Customisation must open its own panel');
assert.equal(document.getElementById('orbitcord-shortcut-page'), null, 'only the active OrbitCord panel is rendered');
assert.equal(nativeHeading.style.display ?? '', '', 'switching OrbitCord pages must not mutate native Discord nodes');
assert.ok(messages.some(m => m?.type === 'orbitcord-customisation-request'), 'Customisation must request only customisation state');

console.log('orbitcord-settings-independent-pages: PASS');
