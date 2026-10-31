import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');
const webviewListeners = [];
const windowListeners = new Map();
const posts = [];

function element(tag = 'div') {
  const listeners = new Map();
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], parentElement: null,
    append(...xs) { for (const x of xs) { if (x && typeof x === 'object') x.parentElement = this; this.children.push(x); } },
    appendChild(x) { this.append(x); return x; },
    replaceChildren(...xs) { this.children = []; this.append(...xs); },
    addEventListener(type, cb) { listeners.set(type, cb); },
    click() { listeners.get('click')?.({ preventDefault(){}, stopPropagation(){} }); },
    remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, matches() { return false; }, contains() { return false; },
    getBoundingClientRect() { return {left:0,right:800,top:0,bottom:600,width:800,height:600}; },
    set textContent(v) { this._text = String(v ?? ''); }, get textContent() { return this._text || ''; }
  };
}

const page = element('div'); page.id = 'orbitcord-shortcut-page';
const panelHost = element('div'); panelHost.id = 'orbitcord-settings-panel-host'; panelHost.append(page);
const body = element('body'); body.append(panelHost);
const document = {
  body,
  createElement: element,
  createTextNode: text => ({ textContent: String(text), parentElement: null }),
  getElementById(id) { if (id === page.id) return page; if (id === panelHost.id) return panelHost; return null; },
  querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}
};
const webview = {
  postMessage(payload) { posts.push(payload); },
  addEventListener(type, cb) { if (type === 'message') webviewListeners.push(cb); }
};
const windowObj = {
  chrome: { webview }, document, innerWidth: 1000, innerHeight: 700,
  addEventListener(type, cb) { windowListeners.set(type, cb); }, dispatchEvent() {},
};
const context = vm.createContext({ window: windowObj, document, chrome: windowObj.chrome, console, setTimeout, clearTimeout, crypto: { randomUUID: () => 'draft-id' }, Date, Math, Object, Array, Set, Map, String, Number, RegExp, Symbol, JSON, CustomEvent: function(){} });
vm.runInContext(source, context);

webviewListeners.forEach(cb => cb({ data: {
  type: 'orbitcord-shortcuts-state', hookRunning: true,
  actions: [{ id:'TOGGLE_DEAFEN', name:'Deafen', description:'', isHold:false }],
  bindings: [{ id:'saved-id', action:'TOGGLE_DEAFEN', virtualKeys:[17,18,68], enabled:true, chord:'Ctrl + Alt + D' }]
}}));

windowObj.__orbitcordSettingsTest.startRecordingForTest('saved-id');
const keydown = windowListeners.get('keydown');
assert.equal(typeof keydown, 'function');
keydown({
  code:'KeyN', keyCode:78, which:78,
  ctrlKey:false, shiftKey:false, altKey:false, metaKey:false,
  preventDefault(){}, stopPropagation(){}, stopImmediatePropagation(){}
});

const bindings = windowObj.__orbitcordSettingsTest.getBindingsForTest();
const binding = bindings.find(b => b.id === 'saved-id');
assert.ok(binding, 'existing binding must remain present after an unsafe replacement attempt');
assert.deepEqual(Array.from(binding.virtualKeys), [17,18,68], 'unsafe replacement must preserve the previous chord');
assert.equal(posts.some(p => p?.type === 'orbitcord-shortcuts-save' && p.bindings?.some(b => b.id === 'saved-id' && b.virtualKeys?.length === 1 && b.virtualKeys[0] === 78)), false,
  'unsafe typing chord must never be sent to the native store');
console.log('shortcut-recording-unsafe-preserves-binding: PASS');
