import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/discord-runtime.js', import.meta.url), 'utf8');
const windowObj = { location: { hostname: 'discord.com' } };
const ctx = vm.createContext({ window: windowObj, console, Object, Array, Map, Set, WeakMap, WeakSet, Reflect, Function, Date, Math });
vm.runInContext(source, ctx);

vm.runInContext(`
  function discordRequire(id) { return discordRequire.c[id]?.exports; }
  discordRequire.c = {
    1: { loaded: true, exports: { x: { getCurrentUser() { return { id: 'u1' }; } } } },
    2: { loaded: true, exports: { m: { getMediaEngine() { return {}; }, getMode() { return 'VOICE_ACTIVITY'; } } } }
  };
  discordRequire.m = {};
  discordRequire.p = '/assets/';
  window.__discordRequire = discordRequire;
`, ctx);

const runtime = windowObj.__orbitcordDiscordRuntime;
assert.ok(runtime?.installed, 'runtime must install');
assert.equal(runtime.captureRequire(), windowObj.__discordRequire, 'main Discord webpack require must be captured from require.p=/assets/');
assert.equal(runtime.findByProps('getCurrentUser')?.getCurrentUser?.().id, 'u1');
assert.equal(typeof runtime.findByProps('getMediaEngine', 'getMode')?.getMediaEngine, 'function');
assert.equal(runtime.findByProps('getMediaEngine', 'getMode'), runtime.findByProps('getMediaEngine', 'getMode'), 'property lookup should be cached');
console.log('discord-runtime-prepopulated-webpack: PASS');
