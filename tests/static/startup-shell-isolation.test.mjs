import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'src/OrbitCord.App/App.xaml.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

const tryIndex = app.indexOf('try\n        {');
const mainCtorIndex = app.indexOf('new MainWindow(_logger)');
const mainShowIndex = app.indexOf('main.Show()');
assert.ok(tryIndex >= 0 && mainCtorIndex > tryIndex && mainShowIndex > tryIndex,
  'MainWindow construction and Show must be inside the startup try/catch');

const sourceInit = main.match(/SourceInitialized \+= \(_, _\) =>\s*\{([\s\S]*?)\n\s*\};/);
assert.ok(sourceInit, 'SourceInitialized handler missing');
assert.doesNotMatch(sourceInit[1], /ApplySelectedWindowIcon|ApplyShellAppearance/,
  'SourceInitialized must not regenerate icons or enumerate shell shortcuts during startup');
assert.match(sourceInit[1], /StartNativeShortcuts\(\)/,
  'native shortcut startup should remain in SourceInitialized');

console.log('startup-shell-isolation: PASS');
