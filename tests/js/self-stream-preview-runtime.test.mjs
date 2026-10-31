import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sourceUrl = new URL('../../src/OrbitCord.App/Scripts/orbitcord-options.js', import.meta.url);
assert.ok(fs.existsSync(sourceUrl), 'orbitcord-options.js must exist');
const source = fs.readFileSync(sourceUrl, 'utf8');

let trackStopCalls = 0;
const displayTrack = {
  kind: 'video',
  readyState: 'live',
  getSettings() { return { displaySurface: 'monitor' }; },
  stop() { trackStopCalls++; },
  addEventListener() {}
};
const stream = {
  getTracks() { return [displayTrack]; },
  getVideoTracks() { return [displayTrack]; }
};

let pauseCalls = 0;
let playCalls = 0;
const video = {
  srcObject: stream,
  paused: false,
  style: {
    visibility: '', opacity: '', pointerEvents: '', contentVisibility: ''
  },
  pause() { this.paused = true; pauseCalls++; },
  play() { this.paused = false; playCalls++; return Promise.resolve(); },
  isConnected: true
};

const webviewListeners = [];
const posted = [];
const webview = {
  addEventListener(type, listener) { if (type === 'message') webviewListeners.push(listener); },
  postMessage(message) { posted.push(message); }
};
const document = {
  body: {},
  querySelectorAll(selector) { return selector === 'video' ? [video] : []; },
  addEventListener() {}
};
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() {}
}
const navigator = {
  mediaDevices: {
    async getDisplayMedia() { return stream; }
  }
};
const windowObj = { chrome: { webview }, navigator, document };

const context = vm.createContext({
  window: windowObj,
  chrome: windowObj.chrome,
  navigator,
  document,
  MutationObserver: FakeMutationObserver,
  console,
  Promise,
  Set,
  WeakMap,
  WeakSet,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Symbol,
  Date,
  Math,
  setTimeout,
  clearTimeout
});

vm.runInContext(source, context);
assert.ok(posted.some(message => message?.type === 'orbitcord-options-request'),
  'runtime must request persisted options');

await navigator.mediaDevices.getDisplayMedia({ video: true });
for (const listener of webviewListeners) {
  listener({ data: { type: 'orbitcord-options-state', disableSelfStreamPreview: true } });
}

assert.equal(pauseCalls, 1, 'local screen-share preview should be paused when the option is enabled');
assert.equal(video.style.visibility, 'hidden', 'local screen-share preview should be hidden');
assert.equal(video.style.pointerEvents, 'none', 'hidden preview must not intercept input');
assert.equal(trackStopCalls, 0, 'outgoing screen-share tracks must never be stopped');

for (const listener of webviewListeners) {
  listener({ data: { type: 'orbitcord-options-state', disableSelfStreamPreview: false } });
}

assert.equal(video.style.visibility, '', 'disabling the option should restore the preview visibility');
assert.equal(video.style.pointerEvents, '', 'disabling the option should restore preview input behavior');
assert.equal(playCalls, 1, 'a preview that was playing before suppression should resume when restored');
assert.equal(trackStopCalls, 0, 'restoring the preview must not touch the outgoing track');
console.log('self-stream-preview-runtime: PASS');
