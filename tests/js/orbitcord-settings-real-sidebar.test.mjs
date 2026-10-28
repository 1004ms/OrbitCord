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
    this.tabIndex = -1;
  }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) { for (const node of nodes) { if (!node) continue; node.parentElement = this; this.children.push(node); } }
  insertBefore(node, ref) {
    node.parentElement = this;
    const i = this.children.indexOf(ref);
    if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
    return node;
  }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (!this.parentElement) return; const i = this.parentElement.children.indexOf(this); if (i >= 0) this.parentElement.children.splice(i, 1); this.parentElement = null; }
  contains(node) { let cur = node; while (cur) { if (cur === this) return true; cur = cur.parentElement; } return false; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(cb); }
  closest(selector) { let n = this; while (n) { if (matchesSelector(n, selector)) return n; n = n.parentElement; } return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const sels = selector.split(',').map(s => s.trim());
    const out = [];
    const walk = node => {
      for (const child of node.children) {
        if (sels.some(sel => matchesSelector(child, sel))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

const body = new FakeElement('body');
const shell = new FakeElement('section');
const sidebar = new FakeElement('div');
const content = new FakeElement('main', 'Contenuto impostazioni Account');

const addGroup = (title, items) => {
  const group = new FakeElement('div');
  const heading = new FakeElement('div', title);
  group.append(heading);
  for (const item of items) group.append(new FakeElement('div', item));
  sidebar.append(group);
  return group;
};

addGroup('', ['Account', 'Dati e privacy', 'Permessi dei messaggi', 'Notifiche']);
addGroup('Fatturazione', ['Nitro', 'Potenziamento server', 'Abbonamenti', 'Inventario regali', 'Fatturazione']);
addGroup('Esperienza', ['Voce e video', 'Aspetto', 'Accessibilità', 'Sistema', 'Lingua e orario']);
const gamesGroup = addGroup('Giochi e app', ['Privacy attività']);

shell.append(sidebar, content);
body.append(shell);

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

const section = document.getElementById('orbitcord-settings-section');
assert.ok(section, 'OrbitCord must mount in the real text-driven Discord settings sidebar even without role=tablist or hashed class names');
assert.equal(section.parentElement, sidebar, 'OrbitCord must mount in the settings navigation column');
assert.match(section.textContent, /OrbitCord/);
assert.match(section.textContent, /Shortcut/);
assert.match(section.textContent, /Customisation/);
const orbitIndex = sidebar.children.indexOf(section);
const gamesIndex = sidebar.children.indexOf(gamesGroup);
assert.ok(orbitIndex >= 0 && gamesIndex >= 0 && orbitIndex < gamesIndex, 'OrbitCord category should appear before Giochi e app');

console.log('orbitcord-settings-real-sidebar: PASS');
