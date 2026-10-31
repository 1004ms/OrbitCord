import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = fs.readFileSync(path.join(root, 'src/OrbitCord.App/ShortcutBindingPolicy.cs'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src/OrbitCord.App/ShortcutStore.cs'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/OrbitCord.App/NativeShortcutService.cs'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/OrbitCord.App/Scripts/orbitcord-settings.js'), 'utf8');

assert.match(policy, /IsAllowed\s*\(/, 'native policy must validate persisted chords');
assert.doesNotMatch(service, /CanTriggerInForeground\(binding\.VirtualKeys\)/, 'foreground window must not silently disable valid saved shortcuts');
assert.match(policy, /!keys\.All\(NativeKeyCode\.IsModifier\)/, 'normal non-modifier keys must be valid without Ctrl/Alt/Win');
assert.doesNotMatch(store, /IsSafe\s*\(/, 'store must not delete normal typing keys');
assert.match(service, /BeginRecording\(Guid bindingId\)/, 'native service must own recording');
assert.match(service, /_recordingKeys\.Add\(NativeKeyCode\.Normalize\(rawVk\)\)/, 'native recorder must capture arbitrary virtual keys');
assert.doesNotMatch(settings, /isAllowedShortcutChord/, 'WebView must not validate/capture keyboard chords');
assert.doesNotMatch(settings, /codeToVk\(/, 'WebView must not translate DOM keyboard codes');
assert.match(settings, /orbitcord-shortcut-recording-begin/, 'WebView only asks native host to begin recording');
console.log('shortcut-flexible-chords: PASS');
