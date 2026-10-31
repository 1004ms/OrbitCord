import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.match(shell, /shell-v4-/,
  'the repaired icon format must use a fresh cache generation so Explorer does not reuse v3');
assert.match(shell, /ValidateNativeIconResource\s*\(/,
  'generated ICOs must be validated through the Windows icon loader before shortcuts use them');
assert.match(shell, /LoadImage\(IntPtr\.Zero, iconPath, ImageIcon, 32, 32, LrLoadFromFile\)/,
  'native validation must prove Windows can load a small taskbar/shortcut frame');
assert.match(shell, /LoadImage\(IntPtr\.Zero, iconPath, ImageIcon, 256, 256, LrLoadFromFile\)/,
  'native validation must prove Windows can load the large icon frame');

console.log('windows-shell-native-icon-validation: PASS');
