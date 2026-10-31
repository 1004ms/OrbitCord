import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');

let deaf = false;
let audioCalls = 0;
let mediaSetterCalls = 0;
let domClicks = 0;
const statuses = [];

const connection = {
  context: 'default',
  getSelfDeaf() { return deaf; },
  setSelfDeaf(value) {
    mediaSetterCalls++;
    setTimeout(() => { deaf = !!value; }, 35);
  }
};
const engine = { eachConnection(cb) { cb(connection); } };
const mediaStore = {
  getMediaEngine() { return engine; },
  getMode() { return 'VOICE_ACTIVITY'; },
  isSelfDeaf() { return deaf; }
};
const audioActions = {
  toggleSelfMute() {},
  toggleSelfDeaf() {
    audioCalls++;
    setTimeout(() => { deaf = !deaf; }, 25);
  }
};
const runtime = {
  findByProps(...props) {
    if (props.includes('toggleSelfMute') && props.includes('toggleSelfDeaf')) return audioActions;
    if (props.includes('getMediaEngine') && props.includes('getMode')) return mediaStore;
    return null;
  },
  captureRequire() { return null; },
  getDiagnostics() { return { mainRequireCaptured: true, cacheSize: 12 }; }
};
const deafenButton = {
  textContent: '',
  getAttribute(name) { return name === 'aria-label' ? 'Deafen' : null; },
  getBoundingClientRect() { return { left: 10, top: 700, right: 60, bottom: 750, width: 50, height: 50 }; },
  click() { domClicks++; },
  closest() { return null; }
};
const document = { querySelectorAll() { return [deafenButton]; } };
const webview = {
  addEventListener() {},
  postMessage(payload) { statuses.push(payload); }
};
const windowObj = {
  __orbitcordDiscordRuntime: runtime,
  chrome: { webview },
  document
};
const context = vm.createContext({
  window: windowObj,
  chrome: windowObj.chrome,
  document,
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

const result = await windowObj.__orbitcordShortcutActionsTest.execute('TOGGLE_DEAFEN', true);
await new Promise(resolve => setTimeout(resolve, 80));

assert.equal(result, true, 'Deafen should wait briefly for Discord to publish the real MediaEngine state change');
assert.equal(deaf, true, 'Deafen must end in the requested toggled state');
assert.equal(audioCalls, 1, 'the Discord audio action should be invoked once');
assert.equal(mediaSetterCalls, 0, 'do not cascade into a second media-engine mutation while the first action is still propagating');
assert.equal(domClicks, 0, 'Deafen must never fall through to a generic DOM click');
assert.ok(statuses.some(x => x?.action === 'TOGGLE_DEAFEN' && x.ok === true), 'verified success status should be posted');
console.log('shortcut-deafen-async-verification: PASS');
