import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

assert.doesNotMatch(shell, /SHGetPropertyStoreForWindow/,
  'startup must not use a manual COM window property-store bridge; a bad PROPVARIANT ABI can terminate the process');
assert.doesNotMatch(shell, /PkeyAppUserModelRelaunch(?:Command|IconResource|DisplayNameResource)/,
  'live taskbar appearance must not depend on relaunch properties with manual PROPVARIANT marshalling');
assert.match(shell, /WM_SETICON|WmSetIcon/,
  'running-window icon must still be refreshed natively with WM_SETICON');
assert.match(shell, /SetCurrentProcessExplicitAppUserModelID/,
  'process must keep a stable explicit AppUserModelID for taskbar grouping');
assert.match(shell, /"User Pinned"\s*,\s*"TaskBar"/,
  'pinned taskbar shortcut metadata must still be refreshed through its .lnk');
assert.match(shell, /ApplyWindowAppearance\s*\(/,
  'shell integration must expose one safe live window-appearance refresh');
assert.match(main, /WindowsShellIntegration\.ApplyWindowAppearance\s*\(/,
  'MainWindow must refresh the native window icon after customisation');

console.log('windows-shell-taskbar-native-identity: PASS');
