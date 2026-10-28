import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName, text = '') {
    this.tagName = String(tagName).toUpperCase(); this._text = text; this.children = []; this.parentElement = null;
    this.style = {}; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.id = ''; this.className = '';
    this.type = ''; this.accept = ''; this.files = []; this.src = ''; this.alt = ''; this.tabIndex = 0; this.disabled = false;
  }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (!this.parentElement) return; const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); this.parentElement = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(cb); }
  dispatch(type, event = {}) { for (const cb of this.listeners.get(type) || []) cb({ target: this, clientX: 120, clientY: 140, preventDefault() {}, stopPropagation() {}, ...event }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  contains(target) { let n = target; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
  closest(selector) { let n = this; while (n) { if (selector.startsWith('#') && n.id === selector.slice(1)) return n; n = n.parentElement; } return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(s => s.trim());
    const matches = (el, sel) => {
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      const cls = sel.match(/^\[class\*="([^"]+)"\]$/); if (cls) return String(el.className || '').includes(cls[1]);
      const role = sel.match(/^\[role="([^"]+)"\]$/); if (role) return el.getAttribute('role') === role[1];
      const attr = sel.match(/^\[([^=]+)="([^"]+)"\]$/); if (attr) return el.getAttribute(attr[1]) === attr[2];
      return el.tagName.toLowerCase() === sel.toLowerCase();
    };
    const out = []; const walk = node => { for (const child of node.children) { if (selectors.some(sel => matches(child, sel))) out.push(child); walk(child); } }; walk(this); return out;
  }
}

const body = new FakeElement('body');
const root = new FakeElement('div'); root.className = 'standardSidebarView_settings';
const sidebarRegion = new FakeElement('div'); sidebarRegion.className = 'sidebarRegion_settings';
const sidebar = new FakeElement('div'); sidebar.className = 'sidebar_settings';
const account = new FakeElement('div', 'Il mio account'); account.setAttribute('role', 'tab'); sidebar.append(account); sidebarRegion.append(sidebar);
const contentRegion = new FakeElement('div'); contentRegion.className = 'contentRegion_settings';
const scroller = new FakeElement('div'); scroller.className = 'contentRegionScroller_settings'; contentRegion.append(scroller);
root.append(sidebarRegion, contentRegion); body.append(root);

const documentListeners = new Map();
const document = {
  body,
  querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), getElementById: id => body.querySelector(`#${id}`),
  createElement: tag => new FakeElement(tag), createTextNode: text => new FakeElement('#text', text),
  addEventListener(type, cb) { if (!documentListeners.has(type)) documentListeners.set(type, []); documentListeners.get(type).push(cb); },
  removeEventListener() {}
};
const messages = [];
const webview = { postMessage(payload) { messages.push(payload); }, addEventListener(type, cb) { this.messageCb = cb; } };
const windowObj = { chrome: { webview }, innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
class MutationObserver { observe() {} disconnect() {} }
class FileReader { readAsDataURL(file) { this.result = file.dataUrl; this.onload?.(); } }
const context = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, MutationObserver, FileReader, crypto: { randomUUID: () => 'id' }, setTimeout, clearTimeout, console, String, Number, Array, Object, Math, Date, Set, Map, JSON });
vm.runInContext(source, context);
await new Promise(r => setTimeout(r, 60));

document.getElementById('orbitcord-customisation-tab').click();
webview.messageCb?.({ data: {
  type: 'orbitcord-customisation-state',
  selectedIcon: 'purple',
  presets: ['purple', 'green', 'orange'].map(id => ({ id, dataUrl: `data:image/png;base64,${id}` })),
  customIconDataUrl: '',
  error: ''
} });

const green = document.getElementById('orbitcord-icon-preset-green');
green.dispatch('contextmenu', { clientX: 200, clientY: 180 });
const menu = document.getElementById('orbitcord-icon-context-menu');
assert.ok(menu, 'right click on an icon should open the OrbitCord icon context menu');
assert.match(menu.textContent, /Elimina/);
const deleteButton = menu.querySelector('button');
assert.ok(deleteButton, 'context menu should contain a delete action');
deleteButton.click();
assert.ok(messages.some(m => m.type === 'orbitcord-icon-delete' && m.icon === 'green'), 'delete action should ask the native store to remove the chosen icon');

// With only one icon left the context menu must still open, but deletion must be unavailable.
webview.messageCb?.({ data: {
  type: 'orbitcord-customisation-state',
  selectedIcon: 'purple',
  presets: [{ id: 'purple', dataUrl: 'data:image/png;base64,purple' }],
  customIconDataUrl: '',
  error: ''
} });
const purple = document.getElementById('orbitcord-icon-preset-purple');
purple.dispatch('contextmenu', { clientX: 200, clientY: 180 });
const singleMenu = document.getElementById('orbitcord-icon-context-menu');
assert.ok(singleMenu, 'context menu should still explain why the final icon cannot be deleted');
assert.match(singleMenu.textContent, /almeno 1 icona/i);
const before = messages.filter(m => m.type === 'orbitcord-icon-delete').length;
singleMenu.querySelector('button')?.click();
const after = messages.filter(m => m.type === 'orbitcord-icon-delete').length;
assert.equal(after, before, 'the last remaining icon must never be deletable');

console.log('orbitcord-customisation-delete: PASS');
