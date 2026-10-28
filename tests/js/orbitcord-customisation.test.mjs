import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName, text = '') {
    this.tagName = String(tagName).toUpperCase(); this._text = text; this.children = []; this.parentElement = null;
    this.style = {}; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.id = ''; this.className = '';
    this.type = ''; this.accept = ''; this.files = []; this.src = ''; this.alt = ''; this.tabIndex = 0;
  }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (!this.parentElement) return; const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); this.parentElement = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(cb); }
  dispatch(type, event = {}) { for (const cb of this.listeners.get(type) || []) cb({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  click() { this.dispatch('click'); }
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

const document = {
  body,
  querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), getElementById: id => body.querySelector(`#${id}`),
  createElement: tag => new FakeElement(tag), createTextNode: text => new FakeElement('#text', text), addEventListener() {}
};
const messages = [];
const webview = { postMessage(payload) { messages.push(payload); }, addEventListener(type, cb) { this.messageCb = cb; } };
const windowObj = { chrome: { webview }, addEventListener() {}, removeEventListener() {} };
class MutationObserver { observe() {} disconnect() {} }
class FileReader {
  readAsDataURL(file) { this.result = file.dataUrl; this.onload?.(); }
}
const context = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, MutationObserver, FileReader, crypto: { randomUUID: () => 'id' }, setTimeout, clearTimeout, console, String, Number, Array, Object, Math, Date, Set, Map, JSON });
vm.runInContext(source, context);
await new Promise(r => setTimeout(r, 60));

const customTab = document.getElementById('orbitcord-customisation-tab');
assert.ok(customTab, 'Customisation tab should be present under OrbitCord');
customTab.click();

const page = document.getElementById('orbitcord-customisation-page');
assert.ok(page, 'Customisation page should open');
assert.match(page.textContent, /Customisation/);
assert.match(page.textContent, /Change OrbitCord icon/);
assert.match(page.textContent, /Upload custom icon/);

webview.messageCb?.({ data: {
  type: 'orbitcord-customisation-state',
  selectedIcon: 'purple',
  presets: ['purple', 'green', 'orange', 'red', 'blue'].map(id => ({ id, dataUrl: `data:image/png;base64,${id}` })),
  customIconDataUrl: '',
  error: ''
} });

for (const preset of ['purple', 'green', 'orange', 'red', 'blue']) {
  assert.ok(document.getElementById(`orbitcord-icon-preset-${preset}`), `missing ${preset} preset`);
}

document.getElementById('orbitcord-icon-preset-green').click();
assert.ok(messages.some(m => m.type === 'orbitcord-icon-select' && m.icon === 'green'));

const input = document.getElementById('orbitcord-icon-upload-input');
assert.equal(input.accept, 'image/png,.png');
input.files = [{ name: 'mine.png', type: 'image/png', size: 1234, dataUrl: 'data:image/png;base64,AAAA' }];
input.dispatch('change');
assert.ok(messages.some(m => m.type === 'orbitcord-icon-upload' && m.fileName === 'mine.png' && m.dataUrl.startsWith('data:image/png;base64,')));

const shortcutTab = document.getElementById('orbitcord-shortcut-tab');
shortcutTab.click();
assert.equal(document.getElementById('orbitcord-customisation-page'), null, 'Customisation page should close when Shortcut opens');
assert.ok(document.getElementById('orbitcord-shortcut-page'), 'Shortcut page should open after switching back');

console.log('orbitcord-customisation: PASS');
