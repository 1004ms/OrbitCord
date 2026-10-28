import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');
const listeners = [];
let deaf = false;
let setCalls = 0;
const connection = {
  context: 'default',
  getSelfDeaf() { return deaf; },
  setSelfDeaf(value) { deaf = !!value; setCalls++; }
};
const mediaStore = {
  getMode() { return 'VOICE_ACTIVITY'; },
  getMediaEngine() { return { eachConnection(cb) { cb(connection); } }; }
};
const req = { c: { 1: { exports: { mediaStore } } } };
const chunk = [];
chunk.push = function(entry) { if (typeof entry[2] === 'function') entry[2](req); return 1; };
const webview = { addEventListener(type, cb) { if (type === 'message') listeners.push(cb); }, postMessage() {} };
const windowObj = { webpackChunkdiscord_app: chunk, chrome: { webview }, addEventListener() {}, removeEventListener() {} };
const document = { querySelectorAll() { return []; } };
const context = vm.createContext({ window: windowObj, chrome: windowObj.chrome, document, console, setTimeout, clearTimeout, queueMicrotask, Symbol, Object, Array, Map, Set, JSON, String, Number, Math });
vm.runInContext(source, context);
await new Promise(r => setTimeout(r, 25));
listeners.forEach(cb => cb({ data: { type: 'orbitcord-shortcut-execute', action: 'TOGGLE_DEAFEN', pressed: true } }));
await new Promise(r => setTimeout(r, 10));
assert.equal(setCalls, 1, 'Deafen should fall back to the current media-engine connection when no DOM/audio action is available');
assert.equal(deaf, true);
console.log('shortcut-deafen-media-engine: PASS');
