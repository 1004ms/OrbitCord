import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Compatibility filename: native icon validation was deliberately removed after it became part
// of a startup-crash path. Validation is now managed and cosmetic-only.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');
assert.match(shell, /shell-v5-/,
  'safe icon generation must use a fresh cache generation');
assert.match(shell, /ValidateShellIcon\s*\(/,
  'generated ICOs must still be decoded before shortcuts reference them');
assert.match(shell, /IconBitmapDecoder/,
  'managed validation must decode the ICO');
assert.doesNotMatch(shell, /LoadImage\(|ValidateNativeIconResource|DestroyIcon\(/,
  'customisation must not invoke native icon loader/handle APIs');
console.log('windows-shell-managed-icon-validation: PASS');
