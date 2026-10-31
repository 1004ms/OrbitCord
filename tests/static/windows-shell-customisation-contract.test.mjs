import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'src/OrbitCord.App/App.xaml.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.doesNotMatch(app, /WindowsShellIntegration\./,
  'startup must not depend on shell customisation at all');
assert.doesNotMatch(shell, /\[DllImport\(|IPropertyStore|PropVariant|SetCurrentProcessExplicitAppUserModelID|SHChangeNotify/,
  'cosmetic customisation must not use native/manual COM identity bridges');
assert.match(shell, /"User Pinned"\s*,\s*"TaskBar"/,
  'pinned taskbar shortcuts must be included when the user changes appearance');
assert.match(shell, /WScript\.Shell/,
  'shortcut metadata must be updated through Windows shortcut automation');
assert.match(shell, /IconLocation/,
  'shortcut icon location must follow the selected custom icon');
assert.match(shell, /Description\s*=\s*displayName/,
  'shortcut description must follow the selected custom app name');
assert.match(shell, /\.ico/,
  'PNG customisation must still be materialized as a shell-compatible ICO');
assert.match(shell, /Environment\.ProcessPath/,
  'only shortcuts targeting the running OrbitCord executable may be modified');
assert.match(main, /\bIcon\s*=\s*bitmap\s*;/,
  'running window/taskbar icon must use WPF Icon');

const syncCalls = main.match(/ApplyShellAppearance\(\);/g) ?? [];
assert.ok(syncCalls.length >= 4,
  'icon selection/upload/delete and app rename must all synchronize shortcuts on explicit change');

console.log('windows-shell-customisation-contract: PASS');
