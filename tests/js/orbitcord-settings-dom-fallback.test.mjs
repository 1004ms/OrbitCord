import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

class StyleBag {
  setProperty(name, value) { this[name] = value; }
}

function matchesSelector(el, selector) {
  selector = selector.trim();
  if (!selector) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  const classContains = selector.match(/^\[class\*="([^"]+)"\]$/);
  if (classContains) return String(el.className || '').includes(classContains[1]);
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
    this.style = new StyleBag();
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.id = '';
    this.className = '';
    this.value = '';
    this.checked = false;
    this.type = '';
    this.title = '';
    this.tabIndex = -1;
  }
  get parentNode() { return this.parentElement; }
  get firstChild() { return this.children[0] ?? null; }
  get nextSibling() {
    if (!this.parentElement) return null;
    const i = this.parentElement.children.indexOf(this);
    return i >= 0 ? this.parentElement.children[i + 1] ?? null : null;
  }
  get textContent() { return this._text + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  append(...nodes) {
    for (const node of nodes) {
      if (node == null) continue;
      const child = typeof node === 'string' ? new FakeElement('#text', node) : node;
      child.parentElement = this;
      this.children.push(child);
    }
  }
  prepend(...nodes) {
    const prepared = nodes.map(node => typeof node === 'string' ? new FakeElement('#text', node) : node);
    for (const child of prepared) child.parentElement = this;
    this.children.unshift(...prepared);
  }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  insertBefore(node, reference) {
    node.parentElement = this;
    if (!reference) this.children.push(node);
    else {
      const i = this.children.indexOf(reference);
      if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
    }
    return node;
  }
  remove() {
    if (!this.parentElement) return;
    const i = this.parentElement.children.indexOf(this);
    if (i >= 0) this.parentElement.children.splice(i, 1);
    this.parentElement = null;
  }
  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(cb);
  }
  dispatch(type, extra = {}) {
    const event = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...extra };
    let cur = this;
    while (cur) {
      event.currentTarget = cur;
      for (const cb of cur.listeners.get(type) ?? []) cb(event);
      cur = cur.parentElement;
    }
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(s => s.trim());
    const out = [];
    const walk = node => {
      for (const child of node.children) {
        if (selectors.some(sel => matchesSelector(child, sel))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

const body = new FakeElement('body');
const settingsRoot = new FakeElement('div'); settingsRoot.setAttribute('data-settings-shell', 'true');
const sidebarRegion = new FakeElement('aside');
const sidebar = new FakeElement('nav'); sidebar.setAttribute('role', 'tablist'); sidebar.setAttribute('aria-label', 'User Settings');
const nativeHeader = new FakeElement('div', 'USER SETTINGS');
const nativeTab = new FakeElement('div', 'My Account'); nativeTab.setAttribute('role', 'tab');
sidebar.append(nativeHeader, nativeTab); sidebarRegion.append(sidebar);
const contentRegion = new FakeElement('main');
const scroller = new FakeElement('section'); scroller.setAttribute('data-settings-content', 'true');
const nativeContent = new FakeElement('div', 'Discord native settings content');
scroller.append(nativeContent); contentRegion.append(scroller);
settingsRoot.append(sidebarRegion, contentRegion); body.append(settingsRoot);

const document = {
  body,
  querySelector: selector => body.querySelector(selector),
  querySelectorAll: selector => body.querySelectorAll(selector),
  getElementById(id) { return body.querySelector(`#${id}`); },
  createElement: tag => new FakeElement(tag),
  createTextNode: text => new FakeElement('#text', text),
  addEventListener() {}
};

const posted = [];
const webviewListeners = [];
const windowListeners = new Map();
const webview = {
  postMessage(value) { posted.push(value); },
  addEventListener(type, cb) { if (type === 'message') webviewListeners.push(cb); }
};
const windowObj = {
  chrome: { webview },
  innerWidth: 1280,
  addEventListener(type, cb) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(cb);
  },
  removeEventListener() {}
};

class MutationObserver { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} }

const context = vm.createContext({
  window: windowObj,
  chrome: windowObj.chrome,
  document,
  MutationObserver,
  crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000001' },
  setTimeout,
  clearTimeout,
  console,
  String,
  Number,
  Array,
  Object,
  Math,
  Date,
  Set,
  Map,
  JSON
});
vm.runInContext(source, context);
await new Promise(r => setTimeout(r, 80));

const section = document.getElementById('orbitcord-settings-section');
assert.ok(section, 'OrbitCord section must be injected into Discord settings sidebar');
assert.match(section.textContent, /OrbitCord/);
assert.match(section.textContent, /Shortcut/);
assert.equal(document.querySelectorAll('#orbitcord-settings-section').length, 1, 'OrbitCord section must not duplicate');
assert.ok(!/unsupported browser|associazioni tasti personalizzate|custom keybinds/i.test(source), 'new UI must not target Discord browser keybind page');

const shortcutTab = document.getElementById('orbitcord-shortcut-tab');
assert.ok(shortcutTab, 'Shortcut tab must exist under OrbitCord');
shortcutTab.dispatch('click');

const page = document.getElementById('orbitcord-shortcut-page');
assert.ok(page, 'clicking Shortcut must open OrbitCord-owned settings page');
assert.match(page.textContent, /Shortcut/);
assert.ok(posted.some(m => m?.type === 'orbitcord-shortcuts-request'), 'page must request shortcut state from native host');

for (const cb of webviewListeners) cb({ data: {
  type: 'orbitcord-shortcuts-state',
  hookRunning: true,
  actions: [{ id: 'TOGGLE_MUTE', name: 'Attiva/Disattiva microfono', description: 'mute', isHold: false }],
  bindings: []
}});

assert.doesNotMatch(page.textContent, /Hook globale Windows/i, 'UI copy must stay simple');

function findButtonByText(root, needle) {
  let found = null;
  const walk = node => {
    if (found) return;
    if (node.tagName === 'BUTTON' && (node.textContent || '').includes(needle)) { found = node; return; }
    for (const child of node.children || []) walk(child);
  };
  walk(root);
  return found;
}

const addButton = findButtonByText(page, 'Aggiungi');
assert.ok(addButton, 'custom page must allow adding shortcuts');
addButton.dispatch('click');
const recordButton = findButtonByText(page, 'Imposta tasti');
assert.ok(recordButton, 'new shortcut must expose chord recording');
recordButton.dispatch('click');
assert.ok(posted.some(m => m?.type === 'orbitcord-shortcut-recording' && m.active === true), 'recording must suspend native shortcut hook');

const keydown = (windowListeners.get('keydown') || [])[0];
assert.ok(keydown, 'recording keydown capture handler must exist');
keydown({
  code: 'KeyK', keyCode: 0x4B, which: 0x4B,
  ctrlKey: true, shiftKey: true, altKey: false, metaKey: false,
  preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
});
const save = [...posted].reverse().find(m => m?.type === 'orbitcord-shortcuts-save');
assert.ok(save, 'recorded chord must be persisted through the native host');
assert.ok(save.bindings.some(b => JSON.stringify(b.virtualKeys) === JSON.stringify([0x11, 0x10, 0x4B])), 'Ctrl+Shift+K must be sent as Windows virtual keys');
assert.ok(posted.some(m => m?.type === 'orbitcord-shortcut-recording' && m.active === false), 'recording must resume native hook');

nativeTab.dispatch('click');
assert.equal(document.getElementById('orbitcord-shortcut-page'), null, 'clicking a normal Discord settings tab must leave OrbitCord Shortcut page');

windowObj.__orbitcordSettingsTest.mount();
assert.equal(document.querySelectorAll('#orbitcord-settings-section').length, 1, 'remount must stay idempotent');

console.log('orbitcord-settings-dom-fallback: PASS');
