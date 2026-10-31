import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const uninstall = fs.readFileSync(path.join(root, 'uninstall.ps1'), 'utf8');

for (const token of [
  'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OrbitCord',
  'HKCU:\\Software\\OrbitCord',
  'InstallLocation',
  "Programs\\OrbitCord",
  "Join-Path $env:LOCALAPPDATA 'OrbitCord'",
  "Join-Path $env:APPDATA 'OrbitCord'",
  'User Pinned',
  'TaskBar',
  'WScript.Shell',
  'OrbitCord.backup-*',
  'OrbitCord-Setup-*',
  'OrbitCord-*',
  'Stop-Process',
  'Remove-Item',
]) {
  assert.ok(uninstall.includes(token), `uninstall must include cleanup token: ${token}`);
}

assert.doesNotMatch(uninstall, /PurgeUserData/, 'full purge must be the default and only uninstall behavior');
assert.match(uninstall, /foreach \(\$registryPath in @\(\$managedStateKey, \$legacyUninstallKey\)\)/, 'uninstall must enumerate both managed and legacy registry keys');
assert.match(uninstall, /Remove-Item -LiteralPath \$registryPath -Recurse -Force/, 'OrbitCord registry keys must be removed');

console.log('uninstall-full-purge-contract: PASS');
