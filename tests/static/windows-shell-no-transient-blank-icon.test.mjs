import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

assert.doesNotMatch(main, /\bIcon\s*=\s*null\s*;/,
  'live icon changes must never clear the WPF window icon before installing the replacement');
assert.match(main, /ApplySelectedWindowIcon\(\);[\s\S]{0,220}ApplyShellAppearance\(\);/,
  'source-initialized appearance refresh must apply the live window icon before shell shortcuts');

console.log('windows-shell-no-transient-blank-icon: PASS');
