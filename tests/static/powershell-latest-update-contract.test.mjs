import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const install = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
const update = fs.readFileSync(path.join(root, 'update.ps1'), 'utf8');

assert.match(install, /\/releases\/latest/, 'install/update engine must resolve GitHub latest release directly');
assert.match(install, /OrbitCord-win-x64\.zip/);
assert.match(install, /OrbitCord-win-x64\.zip\.sha256/);
assert.match(install, /Get-FileHash/);
assert.match(install, /SHA256/);
assert.match(install, /UpdateOnly/);
assert.match(install, /HKCU:\\Software\\OrbitCord/, 'PowerShell installs must persist their managed install location outside the removed Setup registry key');
assert.match(install, /InstallLocation/, 'managed install state must include InstallLocation for future updates');
assert.match(install, /rollback/i, 'install engine must contain rollback logic');
assert.doesNotMatch(install, /\$backup\s*=\s*[\"']?\$installDir\.backup-/i, 'persistent sibling backup directories are forbidden');
assert.match(install, /Join-Path \$tempRoot 'rollback'/, 'rollback copy must live inside temporary transaction directory');
assert.match(update, /install\.ps1/);
assert.match(update, /-UpdateOnly/);
assert.match(update, /raw\.githubusercontent\.com/);

console.log('powershell-latest-update-contract: PASS');
