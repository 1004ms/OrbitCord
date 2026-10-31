import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const integration = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/WindowsIntegration.cs'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/InstallerEngine.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml.cs'), 'utf8');

assert.match(integration, /HasDesktopShortcut\(string executablePath\)/,
  'desktop shortcut state must be detected by target, not by a fixed filename');
assert.match(integration, /HasDesktopShortcut[\s\S]*FindShortcutTargeting/,
  'custom-named desktop shortcuts must count as enabled');
assert.match(engine, /HasDesktopShortcut\(string executablePath\)/,
  'installer engine must expose target-aware desktop shortcut detection to the UI');
assert.match(main, /_engine\.HasDesktopShortcut/,
  'Setup checkbox must preserve a custom-named desktop shortcut during update');
assert.doesNotMatch(main, /Path\.Combine\(desktop,\s*"OrbitCord\.lnk"\)/,
  'Setup UI must not infer desktop shortcut state from OrbitCord.lnk only');

console.log('installer-custom-desktop-detection: PASS');
