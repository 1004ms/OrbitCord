import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const service = fs.readFileSync(path.join(root, 'src/OrbitCord.App/NativeShortcutService.cs'), 'utf8');

assert.doesNotMatch(
  service,
  /CanTriggerInForeground\(binding\.VirtualKeys\)/,
  'a valid saved shortcut must still execute while OrbitCord is the foreground window'
);
assert.match(
  service,
  /Where\(binding => ChordEquals\(binding\.VirtualKeys, current\)\)/,
  'native hook must match saved chords directly instead of silently rejecting letters/numbers in foreground'
);

console.log('shortcut-foreground-execution-contract: PASS');
