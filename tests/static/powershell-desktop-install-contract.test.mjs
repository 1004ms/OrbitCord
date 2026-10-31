import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const install = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
const uninstall = fs.readFileSync(path.join(root, 'uninstall.ps1'), 'utf8');

assert.match(install, /GetFolderPath\('DesktopDirectory'\)/, 'fresh installs must resolve the Windows Desktop folder');
assert.match(install, /Join-Path \$desktopDirectory 'OrbitCord'/, 'fresh installs must target Desktop\\OrbitCord');
assert.match(install, /legacyDefaultInstallDir/, 'installer must still detect the historical LocalAppData install path');
assert.match(install, /migrationSourceInstallDir/, 'normal install must migrate an older non-Desktop install');
assert.match(install, /Remove-Item -LiteralPath \$migrationSourceInstallDir -Recurse -Force/, 'old install directory must only be removed after the Desktop install succeeds');
assert.match(uninstall, /GetFolderPath\('DesktopDirectory'\)/, 'uninstaller must know the new Desktop install location');
assert.match(uninstall, /legacyDefaultInstallDir/, 'uninstaller must still purge the historical LocalAppData install location');

console.log('powershell-desktop-install-contract: PASS');
