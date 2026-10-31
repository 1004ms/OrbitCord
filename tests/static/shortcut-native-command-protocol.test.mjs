import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

for (const message of [
  'orbitcord-shortcut-create',
  'orbitcord-shortcut-delete',
  'orbitcord-shortcut-action',
  'orbitcord-shortcut-enabled',
  'orbitcord-shortcut-recording-begin',
  'orbitcord-shortcut-recording-cancel',
]) {
  assert.ok(main.includes(`case "${message}"`), `missing native-authoritative command ${message}`);
}

for (const handler of [
  'CreateShortcut(', 'DeleteShortcut(', 'SetShortcutAction(', 'SetShortcutEnabled(',
  'BeginShortcutRecording(', 'OnNativeShortcutRecordingCompleted(',
]) {
  assert.ok(main.includes(handler), `missing shortcut handler ${handler}`);
}

assert.ok(main.includes('_nativeShortcuts.RecordingCompleted += OnNativeShortcutRecordingCompleted'), 'native recorder completion must be wired');
assert.ok(main.includes('orbitcord-shortcut-recording-state'), 'host must publish recording state');
assert.ok(main.includes('orbitcord-shortcut-recording-preview'), 'host must publish recording preview');
assert.doesNotMatch(main, /case "orbitcord-shortcuts-save"/, 'full-list replacement protocol must be removed');
assert.doesNotMatch(main, /ApplyShortcutState\(/, 'legacy full-list apply method must be removed');

console.log('shortcut-native-command-protocol: PASS');
