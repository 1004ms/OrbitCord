import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sourceUrl = new URL('../../src/OrbitCord.App/Scripts/orbitcord-options.js', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');

const calls = [];
const audioTrack = {
  kind: 'audio',
  addEventListener() {},
  getSettings() { return {}; },
  async applyConstraints() {}
};
const videoTrack = {
  kind: 'video',
  addEventListener() {},
  getSettings() { return { displaySurface: 'monitor' }; }
};
const stream = {
  getTracks() { return [videoTrack, audioTrack]; },
  getVideoTracks() { return [videoTrack]; },
  getAudioTracks() { return [audioTrack]; }
};

const navigator = {
  mediaDevices: {
    async getDisplayMedia(options) {
      calls.push(options);
      return stream;
    }
  }
};
const webview = { addEventListener() {}, postMessage() {} };
const document = { body: {}, querySelectorAll() { return []; }, addEventListener() {} };
class FakeMutationObserver { observe() {} disconnect() {} }
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
  Object,
  Array,
  String,
  Number,
  Boolean,
  Symbol,
  Date,
  Math,
  queueMicrotask,
  setTimeout,
  clearTimeout
});

vm.runInContext(source, context);

await navigator.mediaDevices.getDisplayMedia({
  video: { frameRate: 60 },
  audio: true,
  systemAudio: 'include'
});
assert.equal(calls[0].audio.restrictOwnAudio, true,
  'audio:true screen shares must exclude OrbitCord/Discord playback from captured system audio');
assert.equal(calls[0].video.frameRate, 60, 'video constraints must be preserved');
assert.equal(calls[0].systemAudio, 'include', 'system-audio availability hint must be preserved');

await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: { echoCancellation: false, noiseSuppression: false }
});
assert.equal(calls[1].audio.restrictOwnAudio, true,
  'object audio constraints must force restrictOwnAudio');
assert.equal(calls[1].audio.echoCancellation, false, 'existing audio constraints must be preserved');
assert.equal(calls[1].audio.noiseSuppression, false, 'existing audio constraints must be preserved');

await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
assert.equal(calls[2].audio, false, 'screen shares without audio must stay audio-disabled');

console.log('screen-share-restrict-own-audio: PASS');
