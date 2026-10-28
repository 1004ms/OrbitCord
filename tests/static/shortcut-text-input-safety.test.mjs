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
  'keys.All(IsModifier)',
  'vk is >= 0x41 and <= 0x5A',
  'vk is >= 0x30 and <= 0x39',
  'NativeKeyCode.Control',
  'NativeKeyCode.Alt',
  'NativeKeyCode.LeftWindows',
  'NativeKeyCode.RightWindows',
]) {
  if (!policy.includes(token)) throw new Error(`shortcut safety policy missing ${token}`);
}

const safeChordSection = policy.slice(policy.indexOf('return keys.Any(vk =>'), policy.indexOf('private static bool IsModifier'));
if (safeChordSection.includes('NativeKeyCode.Shift')) {
  throw new Error('Shift alone must not make a printable shortcut safe');
}

if (!store.includes('ShortcutBindingPolicy.IsSafe(keys)')) {
  throw new Error('ShortcutStore must discard unsafe persisted bindings');
}

if (!service.includes('ShortcutBindingPolicy.IsSafe(x.VirtualKeys)')) {
  throw new Error('NativeShortcutService must reject unsafe bindings as defense in depth');
}

console.log('shortcut-text-input-safety: PASS');
