import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Overlay compatibility filename: old workspaces can retain this test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');
assert.doesNotMatch(shell, /shell-v3-|shell-v4-/,
  'runtime must not generate superseded v3/v4 icon cache entries');
assert.match(shell, /shell-v5-/,
  'upgraded workspaces must use the safe v5 icon cache');
assert.match(shell, /ValidateShellIcon/,
  'v5 icon cache must be validated before shortcut use');
console.log('windows-shell-icon-v3-upgrade-compat: PASS');
