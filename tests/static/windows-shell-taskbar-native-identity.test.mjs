import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

assert.match(shell, /SHGetPropertyStoreForWindow/, 'running-window taskbar identity must use the native window property store');
assert.match(shell, /PkeyAppUserModelRelaunchCommand/, 'window identity must set a relaunch command');
assert.match(shell, /PkeyAppUserModelRelaunchIconResource/, 'window identity must provide the custom taskbar icon resource');
assert.match(shell, /PkeyAppUserModelRelaunchDisplayNameResource/, 'window identity must provide the custom taskbar display name');
assert.match(shell, /WM_SETICON|WmSetIcon/, 'running-window icon must be refreshed with WM_SETICON');
assert.match(shell, /ApplyWindowAppearance\s*\(/, 'shell integration must expose one native window-appearance refresh');
assert.match(main, /WindowsShellIntegration\.ApplyWindowAppearance\s*\(/, 'MainWindow must refresh native window/taskbar identity after customisation');

console.log('windows-shell-taskbar-native-identity: PASS');
