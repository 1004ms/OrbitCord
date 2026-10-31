import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');
const webviewListeners = [];
const windowListenerTypes = [];
const posts = [];

function element(tag = 'div') {
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], parentElement: null,
    append(...xs) { for (const x of xs) { if (x && typeof x === 'object') x.parentElement = this; this.children.push(x); } },
    appendChild(x) { this.append(x); return x; }, replaceChildren(...xs) { this.children = []; this.append(...xs); },
    addEventListener() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, matches() { return false; }, contains() { return false; },
    getBoundingClientRect() { return {left:0,right:800,top:0,bottom:600,width:800,height:600}; },
    set textContent(v) { this._text = String(v ?? ''); }, get textContent() { return this._text || ''; }
  };
}

const page = element('div'); page.id = 'orbitcord-shortcut-page';
const panelHost = element('div'); panelHost.id = 'orbitcord-settings-panel-host'; panelHost.append(page);
const body = element('body'); body.append(panelHost);
const document = {
  body, createElement: element, createTextNode: text => ({ textContent: String(text), parentElement: null }),
  getElementById(id) { if (id === page.id) return page; if (id === panelHost.id) return panelHost; return null; },
  querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}
};
const webview = {
  postMessage(payload) { posts.push(payload); },
  addEventListener(type, cb) { if (type === 'message') webviewListeners.push(cb); }
};
const windowObj = {
  chrome: { webview }, document, innerWidth: 1000, innerHeight: 700,
  addEventListener(type) { windowListenerTypes.push(type); }, dispatchEvent() {}
};
const context = vm.createContext({ window: windowObj, document, chrome: windowObj.chrome, console, setTimeout, clearTimeout, crypto: { randomUUID: () => 'draft-id' }, Date, Math, Object, Array, Set, Map, String, Number, RegExp, Symbol, JSON, CustomEvent: function(){} });
vm.runInContext(source, context);

const send = data => webviewListeners.forEach(cb => cb({ data }));
send({
  type: 'orbitcord-shortcuts-state', hookRunning: true,
  actions: [{ id:'TOGGLE_DEAFEN', name:'Deafen', description:'', isHold:false }],
  bindings: [{ id:'saved-id', action:'TOGGLE_DEAFEN', virtualKeys:[17,18,68], enabled:true, chord:'Ctrl + Alt + D' }]
});

windowObj.__orbitcordSettingsTest.startRecordingForTest('saved-id');
assert.equal(posts.some(p => p?.type === 'orbitcord-shortcut-recording-begin' && p.id === 'saved-id'), true,
  'recording must be started by the native host');
assert.deepEqual(Array.from(windowObj.__orbitcordSettingsTest.getBindingsForTest()[0].virtualKeys), [17,18,68],
  'starting recording must not mutate the previous chord');

send({ type:'orbitcord-shortcut-recording-state', active:true, id:'saved-id' });
send({ type:'orbitcord-shortcut-recording-preview', id:'saved-id', virtualKeys:[78], chord:'N' });
assert.deepEqual(Array.from(windowObj.__orbitcordSettingsTest.getBindingsForTest()[0].virtualKeys), [17,18,68],
  'native preview must not commit the binding');

windowObj.__orbitcordSettingsTest.cancelRecordingForTest();
assert.equal(posts.some(p => p?.type === 'orbitcord-shortcut-recording-cancel'), true,
  'cancel must be explicit and native');
assert.deepEqual(Array.from(windowObj.__orbitcordSettingsTest.getBindingsForTest()[0].virtualKeys), [17,18,68],
  'cancel must preserve the old binding');

send({
  type: 'orbitcord-shortcuts-state', hookRunning: true,
  actions: [{ id:'TOGGLE_DEAFEN', name:'Deafen', description:'', isHold:false }],
  bindings: [{ id:'saved-id', action:'TOGGLE_DEAFEN', virtualKeys:[78], enabled:true, chord:'N' }]
});
assert.deepEqual(Array.from(windowObj.__orbitcordSettingsTest.getBindingsForTest()[0].virtualKeys), [78],
  'only canonical native state commits the recorded chord');

assert.equal(posts.some(p => p?.type === 'orbitcord-shortcuts-save'), false, 'WebView must never replace the full shortcut list');
assert.equal(windowListenerTypes.includes('keydown'), false, 'WebView must not capture shortcut keydown');
assert.equal(windowListenerTypes.includes('keyup'), false, 'WebView must not capture shortcut keyup');
console.log('shortcut-recording-native-flow: PASS');
