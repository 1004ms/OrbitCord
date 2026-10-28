import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');

let clicked = 0;
const muteButton = {
  textContent: '',
  getAttribute(name) { return name === 'aria-label' ? 'Mute' : null; },
  getBoundingClientRect() { return { left: 20, top: 700, right: 60, bottom: 740, width: 40, height: 40 }; },
  click() { clicked++; }
};
const document = { querySelectorAll(sel) { return sel.includes('button') ? [muteButton] : []; } };
const listeners = [];
const messages = [];
const webview = { addEventListener(type, cb) { if (type === 'message') listeners.push(cb); }, postMessage(p) { messages.push(p); } };
const windowObj = { chrome: { webview }, innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
const context = vm.createContext({ window:windowObj, chrome:windowObj.chrome, document, console, setTimeout, clearTimeout, queueMicrotask, Symbol, Object, Array, Map, Set, JSON, String, Number, Math });
vm.runInContext(source, context);
listeners.forEach(cb => cb({ data: { type:'orbitcord-shortcut-execute', action:'TOGGLE_MUTE', pressed:true } }));
await new Promise(r => setTimeout(r, 10));
assert.equal(clicked, 1, 'mute must have a visible Discord button fallback when webpack internals are unavailable');
assert.ok(messages.some(m => m?.type === 'orbitcord-shortcut-status' && m.action === 'TOGGLE_MUTE' && m.ok === true));
console.log('shortcut-actions-dom-fallback: PASS');
