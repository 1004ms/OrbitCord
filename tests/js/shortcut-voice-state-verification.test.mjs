import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-shortcut-actions.js', import.meta.url), 'utf8');

function boot({ setterWorks = true } = {}) {
  const calls = [];
  let mute = false;
  let deaf = false;
  const connection = {
    context: 'default',
    getSelfMute: () => mute,
    getSelfDeaf: () => deaf,
    setSelfMute(value) { calls.push(['setSelfMute', !!value]); if (setterWorks) mute = !!value; },
    setSelfDeaf(value) { calls.push(['setSelfDeaf', !!value]); if (setterWorks) deaf = !!value; }
  };
  const engine = { eachConnection(cb) { cb(connection); } };
  const mediaStore = {
    getMediaEngine: () => engine,
    getMode: () => 'VOICE_ACTIVITY',
    isSelfMute: () => mute,
    isSelfDeaf: () => deaf
  };
  const dispatcher = { dispatch(payload) { calls.push(['dispatch', payload?.type]); }, subscribe() {} };
  const runtime = {
    findByProps(...props) {
      if (props.includes('getMediaEngine')) return mediaStore;
      if (props.includes('dispatch') && props.includes('subscribe')) return dispatcher;
      return null;
    },
    captureRequire() { return null; },
    getDiagnostics() { return { mainRequireCaptured: true, cacheSize: 10 }; }
  };
  const statuses = [];
  const webview = {
    addEventListener() {},
    postMessage(payload) { statuses.push(payload); }
  };
  const windowObj = {
    chrome: { webview },
    __orbitcordDiscordRuntime: runtime,
    document: { querySelectorAll() { return []; } },
    history: {}
  };
  const context = vm.createContext({
    window: windowObj,
    chrome: windowObj.chrome,
    document: windowObj.document,
    console,
    setTimeout(fn) { fn(); return 1; },
    queueMicrotask(fn) { fn(); },
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
    RegExp
  });
  vm.runInContext(source, context);
  return { api: windowObj.__orbitcordShortcutActionsTest, calls, statuses, state: () => ({ mute, deaf }) };
}

{
  const fx = boot();
  assert.equal(await fx.api.execute('TOGGLE_MUTE', true), true);
  assert.equal(fx.state().mute, true, 'mute must change observable MediaEngine state');
  assert.ok(fx.calls.some(call => call[0] === 'setSelfMute' && call[1] === true), 'must use MediaEngine setter');
}

{
  const fx = boot();
  assert.equal(await fx.api.execute('TOGGLE_DEAFEN', true), true);
  assert.equal(fx.state().deaf, true, 'deafen must change observable MediaEngine state');
  assert.ok(fx.calls.some(call => call[0] === 'setSelfDeaf' && call[1] === true), 'must use MediaEngine setter');
}

{
  const fx = boot({ setterWorks: false });
  assert.equal(await fx.api.execute('TOGGLE_MUTE', true), false, 'must not report success when voice state did not change');
}

console.log('shortcut-voice-state-verification: PASS');
