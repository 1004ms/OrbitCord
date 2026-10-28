import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');
const listeners = [];
let orbitcordClicks = 0;
const calls = [];

const orbitcordButton = {
  textContent: 'Deafen',
  getAttribute(name) { return name === 'aria-label' ? 'Deafen' : null; },
  getBoundingClientRect() { return { left: 350, top: 260, right: 650, bottom: 305, width: 300, height: 45 }; },
  click() { orbitcordClicks++; },
  closest(selector) { return selector.includes('data-orbitcord-owned') || selector.includes('orbitcord-settings-panel-host') ? this : null; }
};
const document = { querySelectorAll(selector) { return selector.includes('button') ? [orbitcordButton] : []; } };

const audio = { toggleSelfDeaf: opts => calls.push(['deafen', opts]), toggleSelfMute() {} };
const modules = { 1: { exports: { default: audio } } };
const req = { c: modules };
const chunk = [];
chunk.push = function(entry) { if (typeof entry[2] === 'function') entry[2](req); return 1; };
const webview = { addEventListener(type, cb) { if (type === 'message') listeners.push(cb); }, postMessage() {} };
const windowObj = { webpackChunkdiscord_app: chunk, chrome: { webview }, addEventListener() {}, removeEventListener() {} };
const context = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, console, setTimeout, clearTimeout, queueMicrotask, Symbol, Object, Array, Map, Set, JSON, String, Number, Math });
vm.runInContext(source, context);
await new Promise(r => setTimeout(r, 20));
listeners.forEach(cb => cb({ data: { type: 'orbitcord-shortcut-execute', action: 'TOGGLE_DEAFEN', pressed: true } }));

assert.equal(orbitcordClicks, 0, 'shortcut execution must never click OrbitCord controls that happen to say Deafen');
assert.ok(calls.some(x => x[0] === 'deafen'), 'real Discord audio action should be used instead');
console.log('shortcut-deafen-orbitcord-ui-safety: PASS');
