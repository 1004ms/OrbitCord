import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const runtimeSource = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-runtime.js', import.meta.url), 'utf8');
const shortcutSource = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');
const listeners = [];
const statuses = [];
const calls = [];
const registryCalls = [];
const windowObj = {
  location: { hostname: 'discord.com' },
  chrome: { webview: {
    addEventListener(type, cb) { if (type === 'message') listeners.push(cb); },
    postMessage(value) { statuses.push(value); }
  }},
  addEventListener() {}, removeEventListener() {},
  history: { back() {}, forward() {} }
};
const ctx = vm.createContext({ window: windowObj, chrome: windowObj.chrome, console, Object, Array, Map, Set, WeakMap, WeakSet, Reflect, Symbol, JSON, setTimeout, clearTimeout, queueMicrotask });
vm.runInContext(runtimeSource, ctx);
vm.runInContext(shortcutSource, ctx);

windowObj.__fixture = { calls, registryCalls };
vm.runInContext(`
  function discordRequire(id) { return discordRequire.c[id]?.exports; }
  let selfMute = false;
  let selfDeaf = false;
  const connection = {
    context: 'default',
    getSelfMute() { return selfMute; },
    getSelfDeaf() { return selfDeaf; },
    setSelfMute(value) { selfMute = !!value; window.__fixture.calls.push(['setSelfMute', selfMute]); },
    setSelfDeaf(value) { selfDeaf = !!value; window.__fixture.calls.push(['setSelfDeaf', selfDeaf]); }
  };
  discordRequire.c = {
    audio: { loaded: true, exports: { x: {
      toggleSelfMute(opts) { selfMute = !selfMute; window.__fixture.calls.push(['mute', opts]); },
      toggleSelfDeaf(opts) { selfDeaf = !selfDeaf; window.__fixture.calls.push(['deafen', opts]); }
    } } },
    media: { loaded: true, exports: { m: {
      getMediaEngine() { return { eachConnection(cb) { cb(connection); } }; },
      getMode() { return 'VOICE_ACTIVITY'; },
      isSelfMute() { return selfMute; },
      isSelfDeaf() { return selfDeaf; }
    } } },
    dispatch: { loaded: true, exports: { y: {
      dispatch(payload) { window.__fixture.calls.push(['dispatch', payload]); },
      subscribe() {}
    } } },
    registry: { loaded: true, exports: { z: {
      TOGGLE_CAMERA: { onTrigger(pressed) { window.__fixture.registryCalls.push(['camera', pressed]); } }
    } } }
  };
  discordRequire.m = {};
  discordRequire.p = '/assets/';
  window.__discordRequire = discordRequire;
`, ctx);

const send = data => listeners.forEach(cb => cb({ data }));
send({ type: 'orbitcord-shortcut-execute', action: 'TOGGLE_DEAFEN', pressed: true });
assert.ok(calls.some(x => x[0] === 'setSelfDeaf' || x[0] === 'deafen'), 'deafen must resolve from captured main webpack cache');
assert.equal(statuses.at(-1)?.ok, true);


console.log('shortcut-actions-prepopulated-runtime: PASS');
