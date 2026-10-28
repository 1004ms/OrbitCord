import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');
let connectionDeaf = false;
const connection = {
  context: 'default',
  getSelfDeaf() { return connectionDeaf; },
  setSelfDeaf(value) { connectionDeaf = !!value; }
};
const engine = { eachConnection(cb) { cb(connection); } };
// Discord's Flux store can lag the native/media-engine connection by a tick.
const mediaStore = {
  getMediaEngine() { return engine; },
  getMode() { return 'VOICE_ACTIVITY'; },
  isSelfDeaf() { return false; }
};
const runtime = {
  findByProps(...props) { return props.includes('getMediaEngine') ? mediaStore : null; },
  captureRequire() { return null; },
  getDiagnostics() { return { mainRequireCaptured: true, cacheSize: 1 }; }
};
const windowObj = {
  __orbitcordDiscordRuntime: runtime,
  chrome: { webview: { addEventListener() {}, postMessage() {} } },
  document: { querySelectorAll() { return []; } }
};
const context = vm.createContext({
  window: windowObj,
  chrome: windowObj.chrome,
  document: windowObj.document,
  console,
  setTimeout,
  clearTimeout,
  queueMicrotask,
  Date,
  Math,
  Object,
  Array,
  Set,
  Map,
  WeakSet,
  Reflect,
  String,
  Number,
  RegExp,
  Symbol,
  JSON
});
vm.runInContext(source, context);

assert.equal(windowObj.__orbitcordShortcutActionsTest.execute('TOGGLE_DEAFEN', true), true,
  'Deafen must verify against the media-engine connection when the Flux store is stale');
assert.equal(connectionDeaf, true, 'the default media-engine connection must actually become deafened');
console.log('shortcut-deafen-stale-store: PASS');
