import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Compatibility filename. The 1.1.6 contract intentionally removes native taskbar identity work.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/OrbitCord.App/App.xaml.cs'), 'utf8');

assert.doesNotMatch(shell, /SHGetPropertyStoreForWindow|SetCurrentProcessExplicitAppUserModelID|WM_SETICON|WmSetIcon|LoadImage\(|SendMessage\(/,
  'taskbar customisation must not use native identity/icon bridges');
assert.doesNotMatch(app, /WindowsShellIntegration\./,
  'startup must be independent from shell customisation');
assert.match(main, /\bIcon\s*=\s*bitmap\s*;/,
  'WPF must own the icon of the running window/taskbar button');
assert.doesNotMatch(main, /ApplyWindowAppearance|QueueShellAppearanceRefresh/,
  'running-window/startup path must not call shell-native helpers');
assert.match(shell, /"User Pinned"\s*,\s*"TaskBar"/,
  'pinned taskbar shortcut metadata must still be updated on explicit customisation');
assert.match(shell, /Description\s*=\s*displayName/,
  'pinned shortcut must receive the custom display name as description');
assert.match(shell, /IconLocation/,
  'pinned shortcut must receive the custom icon');
console.log('windows-shell-taskbar-cosmetic-safety: PASS');
