import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Compatibility guard for workspaces upgraded in-place from OrbitCord 1.1.3/1.1.4.
// This filename intentionally remains so extracting a newer source ZIP over an older
// checkout replaces the obsolete v3 assertion instead of leaving a stale failing test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.doesNotMatch(shell, /shell-v3-/, 'runtime must not keep generating the superseded v3 icon-cache namespace');
assert.match(shell, /shell-v4-/, 'upgraded workspaces must use the v4 shell icon cache');
assert.match(shell, /ValidateShellIcon/, 'v4 shell icons must be validated before shortcuts use them');

console.log('windows-shell-icon-v3-upgrade-compat: PASS');
