import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

assert.doesNotMatch(main, /\bIcon\s*=\s*null\s*;/,
  'live icon changes must never clear the WPF window icon before installing the replacement');
const sourceInit = main.match(/SourceInitialized \+= \(_, _\) =>\s*\{([\s\S]*?)\n\s*\};/);
assert.ok(sourceInit, 'SourceInitialized handler missing');
assert.doesNotMatch(sourceInit[1], /ApplySelectedWindowIcon|ApplyShellAppearance/,
  'startup must not transiently rewrite window/shell icons inside SourceInitialized');

console.log('windows-shell-no-transient-blank-icon: PASS');
