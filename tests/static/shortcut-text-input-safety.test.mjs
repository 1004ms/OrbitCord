import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = path.join(root, 'src/OrbitCord.App/ShortcutBindingPolicy.cs');

if (!fs.existsSync(policyPath)) throw new Error('ShortcutBindingPolicy.cs is missing');

const policy = fs.readFileSync(policyPath, 'utf8');
const store = fs.readFileSync(path.join(root, 'src/OrbitCord.App/ShortcutStore.cs'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/OrbitCord.App/NativeShortcutService.cs'), 'utf8');

for (const token of [
  'IsAllowed',
  'keys.All(NativeKeyCode.IsModifier)',
]) {
  if (!policy.includes(token)) throw new Error(`shortcut validation policy missing ${token}`);
}

if (!store.includes('ShortcutBindingPolicy.IsAllowed(keys)')) {
  throw new Error('ShortcutStore must keep all valid non-modifier-only user chords');
}

if (!service.includes('ShortcutBindingPolicy.IsAllowed(x.VirtualKeys)')) {
  throw new Error('NativeShortcutService must accept flexible user chords');
}

if (service.includes('CanTriggerInForeground(binding.VirtualKeys)')) {
  throw new Error('valid saved shortcuts must not be silently disabled while OrbitCord is foreground');
}

console.log('shortcut-text-input-safety: PASS');
