import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'src/OrbitCord.App/App.xaml.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');
const shellPath = path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs');

assert.ok(fs.existsSync(shellPath), 'Windows shell integration helper must exist');
const shell = fs.readFileSync(shellPath, 'utf8');

const identityCall = app.indexOf('WindowsShellIntegration.InitializeProcessIdentity();');
const splashCreation = app.indexOf('splash = new SplashWindow();');
assert.ok(identityCall >= 0 && identityCall < splashCreation,
  'stable AppUserModelID must be established before the first window is created');

assert.match(shell, /SetCurrentProcessExplicitAppUserModelID/,
  'process must publish an explicit stable AppUserModelID for taskbar grouping');
assert.match(shell, /OrbitCord\.Desktop/,
  'AppUserModelID must remain stable when the visible app name changes');
assert.match(shell, /"User Pinned"\s*,\s*"TaskBar"/,
  'pinned taskbar shortcuts must be included in appearance refresh');
assert.match(shell, /WScript\.Shell/,
  'shortcut metadata must be updated through the Windows shell shortcut API');
assert.match(shell, /IconLocation/,
  'shortcut icon location must follow the selected custom icon');
assert.match(shell, /PkeyAppUserModelId|PKEY_AppUserModel_ID/,
  'shortcuts must carry the same explicit AppUserModelID as the process');
assert.match(shell, /ApplyShortcutAppId/,
  'desktop/start/taskbar shortcuts must be stamped with the stable AppUserModelID');
assert.match(shell, /\.ico/,
  'PNG customisation must be materialized as a shell-compatible ICO');
assert.match(shell, /SHChangeNotify/,
  'Explorer must be notified after shortcut icon/name changes');
assert.match(shell, /Environment\.ProcessPath/,
  'only shortcuts targeting the running OrbitCord executable may be modified');

const syncCalls = main.match(/ApplyShellAppearance\(\);/g) ?? [];
assert.ok(syncCalls.length >= 4,
  'icon selection/upload/delete and app rename must all synchronize Windows shell appearance');

console.log('windows-shell-customisation-contract: PASS');
