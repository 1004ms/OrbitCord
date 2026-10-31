import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const integration = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/WindowsIntegration.cs'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/InstallerEngine.cs'), 'utf8');

assert.match(integration, /FindShortcutTargeting/,
  'installer must detect an existing renamed shortcut that already targets OrbitCord.exe');
assert.match(integration, /CreateStartMenuShortcut[\s\S]*FindShortcutTargeting/,
  'updates must preserve an existing custom-named Start Menu shortcut instead of creating a duplicate');
assert.match(integration, /SetDesktopShortcut[\s\S]*FindShortcutTargeting/,
  'desktop shortcut updates must preserve an existing custom-named link when enabled');
assert.match(integration, /RemoveShortcuts\(string executablePath\)/,
  'uninstall must remove renamed OrbitCord shortcuts by target rather than fixed filename only');
assert.match(engine, /_windows\.RemoveShortcuts\(appExe\)/,
  'uninstall must pass the installed executable path to target-aware shortcut cleanup');

console.log('installer-custom-shortcut-preservation: PASS');
