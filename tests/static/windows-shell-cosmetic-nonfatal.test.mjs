import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'src/OrbitCord.App/App.xaml.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.doesNotMatch(app, /InitializeProcessIdentity|QueueShellAppearanceRefresh/,
  'startup must never touch Windows shell customisation or native taskbar identity');
assert.doesNotMatch(main, /WindowsShellIntegration\.ApplyWindowAppearance|QueueShellAppearanceRefresh/,
  'running-window customisation must stay on the WPF icon/title path only');
assert.match(main, /\bIcon\s*=\s*bitmap\s*;/,
  'WPF Icon must own the running-window/taskbar icon');

for (const dangerous of [
  /\[DllImport\(/,
  /IPropertyStore/,
  /PropVariant/,
  /SHGetPropertyStore/,
  /SetCurrentProcessExplicitAppUserModelID/,
  /SHChangeNotify/,
  /LoadImage\(/,
  /SendMessage\(/,
  /DestroyIcon\(/
]) {
  assert.doesNotMatch(shell, dangerous,
    `cosmetic shortcut customisation must not use fragile native bridge ${dangerous}`);
}

assert.match(shell, /WScript\.Shell/,
  'shortcut customisation should use the ordinary Windows shortcut automation API');
assert.match(shell, /"User Pinned"\s*,\s*"TaskBar"/,
  'pinned taskbar shortcut must still receive icon/description changes');
assert.match(shell, /IconLocation/,
  'custom icon must still be persisted into shortcuts');
assert.match(shell, /Description\s*=\s*displayName/,
  'custom display name must still be persisted into shortcuts');
assert.match(shell, /CreateRenamedShortcut/,
  'desktop/start rename must remain create-verify-delete, never destructive move-first');

const sourceInit = main.match(/SourceInitialized \+= \(_, _\) =>\s*\{([\s\S]*?)\r?\n\s*\};/);
assert.ok(sourceInit, 'SourceInitialized handler missing');
assert.doesNotMatch(sourceInit[1], /ApplyShellAppearance|ApplySelectedWindowIcon/,
  'startup source initialization must stay free of cosmetic shell work');

console.log('windows-shell-cosmetic-nonfatal: PASS');
