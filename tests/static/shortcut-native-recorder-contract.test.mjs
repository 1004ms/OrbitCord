import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const service = fs.readFileSync(path.join(root, 'src/OrbitCord.App/NativeShortcutService.cs'), 'utf8');

for (const token of [
  'BeginRecording(Guid bindingId)',
  'CancelRecording()',
  'RecordingCompleted',
  'RecordingPreview',
  'IsRecording',
  '_recordingKeys',
]) {
  assert.ok(service.includes(token), `native shortcut recorder missing ${token}`);
}

assert.doesNotMatch(service, /public bool IsSuspended/, 'recording must not be modeled as generic service suspension');

console.log('shortcut-native-recorder-contract: PASS');
