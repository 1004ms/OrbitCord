import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');

const listeners = [];
const dispatched = [];
let clicked = 0;

const dispatcher = {
  dispatch(payload) { dispatched.push(payload); },
  subscribe() {},
  unsubscribe() {}
};

const req = { c: { 1: { exports: { dispatcher } } } };
const chunk = [];
chunk.push = function(entry) {
  if (typeof entry[2] === 'function') entry[2](req);
  return 1;
};

const deafenButton = {
  textContent: '',
  getAttribute(name) { return name === 'aria-label' ? 'Deafen' : null; },
  getBoundingClientRect() { return { left: 70, top: 700, right: 110, bottom: 740, width: 40, height: 40 }; },
  click() { clicked++; }
};

const document = {
  querySelectorAll(selector) { return selector.includes('button') ? [deafenButton] : []; }
};

const statuses = [];
const webview = {
  addEventListener(type, cb) { if (type === 'message') listeners.push(cb); },
  postMessage(payload) { statuses.push(payload); }
};

const windowObj = {
  webpackChunkdiscord_app: chunk,
  chrome: { webview },
  addEventListener() {},
  removeEventListener() {}
};

const context = vm.createContext({
  window: windowObj,
  chrome: windowObj.chrome,
  document,
  console,
  setTimeout,
  clearTimeout,
  queueMicrotask,
  Symbol,
  Object,
  Array,
  Map,
  Set,
  JSON,
  String,
  Number,
  Math
});

vm.runInContext(source, context);
await new Promise(resolve => setTimeout(resolve, 25));

listeners.forEach(cb => cb({ data: { type: 'orbitcord-shortcut-execute', action: 'TOGGLE_DEAFEN', pressed: true } }));
await new Promise(resolve => setTimeout(resolve, 10));

assert.equal(clicked, 1, 'Deafen must use the exact visible Discord Deafen control when internal action modules are unavailable');
assert.ok(statuses.some(x => x?.type === 'orbitcord-shortcut-status' && x.action === 'TOGGLE_DEAFEN' && x.ok === true), 'exact Discord Deafen fallback should report success');
console.log('shortcut-deafen-runtime-fallback: PASS');
