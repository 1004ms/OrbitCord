import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');
let deaf = false;
const statuses = [];

const audioActions = {
  toggleSelfMute() {},
  toggleSelfDeaf(...args) {
    // Current Discord action is used as a zero-argument toggle. Passing metadata
    // must not be required for OrbitCord to work.
    if (args.length === 0) deaf = !deaf;
  }
};
const mediaStateStore = {
  isSelfMute() { return false; },
  isSelfDeaf() { return deaf; }
};
const engineStore = {
  getMode() { return 'VOICE_ACTIVITY'; },
  getMediaEngine() { return {}; }
};
const runtime = {
  findByProps(...props) {
    if (props.includes('toggleSelfMute') && props.includes('toggleSelfDeaf')) return audioActions;
    if (props.includes('isSelfMute') && props.includes('isSelfDeaf')) return mediaStateStore;
    if (props.includes('getMediaEngine') && props.includes('getMode')) return engineStore;
    return null;
  },
  captureRequire() { return null; },
  getDiagnostics() { return { mainRequireCaptured: true, cacheSize: 3 }; }
};
const webview = {
  addEventListener() {},
  postMessage(message) { statuses.push(message); }
};
const windowObj = {
  __orbitcordDiscordRuntime: runtime,
  chrome: { webview },
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
  JSON,
  Promise
});
vm.runInContext(source, context);

const ok = await windowObj.__orbitcordShortcutActionsTest.execute('TOGGLE_DEAFEN', true);
assert.equal(ok, true, 'Deafen should use Discord\'s zero-argument action and current MediaEngineStore state');
assert.equal(deaf, true, 'Discord deafen state must actually toggle');
assert.equal(statuses.at(-1)?.ok, true, 'host status should report verified success');
console.log('shortcut-deafen-current-media-store: PASS');
