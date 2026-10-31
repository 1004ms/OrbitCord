import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');
let deaf = false;
let unfilteredEnumerations = 0;
const connection = {
  context: { type: 'voice' },
  getSelfDeaf() { return deaf; },
  setSelfDeaf(value) { deaf = !!value; }
};
const engine = {
  eachConnection(cb, context) {
    if (context === 'default') return; // modern Discord may accept but match nothing
    unfilteredEnumerations++;
    cb(connection);
  }
};
const mediaStore = { getMediaEngine() { return engine; }, getMode() { return 'VOICE_ACTIVITY'; } };
const audioActions = { toggleSelfMute() {}, toggleSelfDeaf() { deaf = !deaf; } };
const runtime = {
  findByProps(...props) {
    if (props.includes('toggleSelfDeaf')) return audioActions;
    if (props.includes('getMediaEngine')) return mediaStore;
    return null;
  }, captureRequire() { return null; }, getDiagnostics() { return { mainRequireCaptured:true, cacheSize:1 }; }
};
const webview = { addEventListener() {}, postMessage() {} };
const windowObj = { __orbitcordDiscordRuntime: runtime, chrome: { webview }, document: { querySelectorAll() { return []; } } };
const context = vm.createContext({ window:windowObj, chrome:windowObj.chrome, document:windowObj.document, console, setTimeout, clearTimeout, Date, Math, Object, Array, Set, Map, WeakSet, Reflect, String, Number, RegExp, Symbol, JSON, Promise });
vm.runInContext(source, context);

const ok = await windowObj.__orbitcordShortcutActionsTest.execute('TOGGLE_DEAFEN', true);
assert.equal(ok, true, 'Deafen must work even when the literal "default" context visits zero connections');
assert.equal(deaf, true);
assert.ok(unfilteredEnumerations > 0, 'OrbitCord must enumerate connections without assuming the legacy default context string');
console.log('shortcut-deafen-contextless-enumeration: PASS');
