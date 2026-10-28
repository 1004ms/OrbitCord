import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');

const listeners = [];
const messages = [];
let muteClicks = 0;
let neighbourClicks = 0;
let settingsClicks = 0;

function control(label, left, onClick) {
  return {
    textContent: '',
    parentElement: null,
    getAttribute(name) { return name === 'aria-label' ? label : null; },
    getBoundingClientRect() { return { left, top: 700, right: left + 40, bottom: 740, width: 40, height: 40 }; },
    click: onClick,
    closest() { return null; }
  };
}

const muteButton = control('Mute', 20, () => { muteClicks++; });
// This is intentionally unlabeled. Discord puts device/menu arrows beside the
// mute control too, so guessing by geometry is unsafe and can open the wrong UI.
const adjacentUnknownButton = control('', 68, () => { neighbourClicks++; });
const settingsButton = control('User Settings', 116, () => { settingsClicks++; });

const document = {
  querySelectorAll(selector) {
    return selector.includes('button') ? [muteButton, adjacentUnknownButton, settingsButton] : [];
  }
};

const webview = {
  addEventListener(type, cb) { if (type === 'message') listeners.push(cb); },
  postMessage(value) { messages.push(value); }
};
const windowObj = {
  chrome: { webview },
  webpackChunkdiscord_app: undefined,
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
listeners.forEach(cb => cb({ data: { type: 'orbitcord-shortcut-execute', action: 'TOGGLE_DEAFEN', pressed: true } }));
await new Promise(resolve => setTimeout(resolve, 10));

assert.equal(neighbourClicks, 0, 'Deafen must never guess an unlabeled adjacent control');
assert.equal(muteClicks, 0, 'Deafen must not click Mute');
assert.equal(settingsClicks, 0, 'Deafen must not click User Settings');
assert.ok(messages.some(m => m?.type === 'orbitcord-shortcut-status' && m.action === 'TOGGLE_DEAFEN' && m.ok === false), 'without a real deafen action it should report unavailable instead of clicking a random control');
console.log('shortcut-deafen-neighbour-fallback: PASS');
