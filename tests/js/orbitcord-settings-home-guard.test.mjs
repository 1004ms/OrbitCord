import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName, text = '') {
    this.tagName = String(tagName).toUpperCase();
    this._text = text;
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.id = '';
    this.className = '';
  }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  remove() { if (!this.parentElement) return; const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); this.parentElement = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(cb); }
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
    const out = [];
    const walk = node => { for (const child of node.children) { if (selectors.some(sel => matches(child, sel))) out.push(child); walk(child); } };
    walk(this);
    return out;
  }
}

const body = new FakeElement('body');
const friends = new FakeElement('div');
const friendsTabs = new FakeElement('nav'); friendsTabs.setAttribute('role', 'tablist'); friendsTabs.setAttribute('aria-label', 'Amici');
for (const name of ['Amici', 'Online', 'Tutti', 'In attesa', 'Aggiungi amico']) {
  const tab = new FakeElement('div', name); tab.setAttribute('role', 'tab'); friendsTabs.append(tab);
}
const main = new FakeElement('main', 'Trova o avvia una conversazione');
friends.append(friendsTabs, main); body.append(friends);

const document = {
  body,
  querySelector: selector => body.querySelector(selector),
  querySelectorAll: selector => body.querySelectorAll(selector),
  getElementById(id) { return body.querySelector(`#${id}`); },
  createElement: tag => new FakeElement(tag),
  createTextNode: text => new FakeElement('#text', text),
  addEventListener() {}
};
const webview = { postMessage() {}, addEventListener() {} };
const windowObj = { chrome: { webview }, addEventListener() {}, removeEventListener() {} };
class MutationObserver { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} }
const context = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, MutationObserver, crypto: { randomUUID: () => 'x' }, setTimeout, clearTimeout, console, String, Number, Array, Object, Math, Date, Set, Map, JSON });
vm.runInContext(source, context);
await new Promise(r => setTimeout(r, 80));

assert.equal(document.getElementById('orbitcord-settings-section'), null, 'OrbitCord must never mount in Friends/Home tabs');

const settingsRoot = new FakeElement('div'); settingsRoot.className = 'standardSidebarView_realsettings';
const settingsSidebarRegion = new FakeElement('div'); settingsSidebarRegion.className = 'sidebarRegion_realsettings';
const settingsSidebar = new FakeElement('div'); settingsSidebar.className = 'sidebar_realsettings';
const accountTab = new FakeElement('div', 'Il mio account'); accountTab.setAttribute('role', 'tab');
settingsSidebar.append(accountTab); settingsSidebarRegion.append(settingsSidebar);
const contentRegion = new FakeElement('div'); contentRegion.className = 'contentRegion_realsettings';
settingsRoot.append(settingsSidebarRegion, contentRegion); body.append(settingsRoot);
windowObj.__orbitcordSettingsTest.mount();

const settingsSection = document.getElementById('orbitcord-settings-section');
assert.ok(settingsSection, 'OrbitCord must mount after Discord settings opens');
assert.equal(settingsSection.parentElement, settingsSidebar, 'OrbitCord must mount in the settings sidebar, not the Friends tabs');
assert.equal(friendsTabs.querySelector('#orbitcord-settings-section'), null, 'Friends tabs must stay untouched while settings is open');

settingsRoot.remove();
windowObj.__orbitcordSettingsTest.mount();
assert.equal(document.getElementById('orbitcord-settings-section'), null, 'OrbitCord settings entry must disappear after settings closes');

console.log('orbitcord-settings-home-guard: PASS');
