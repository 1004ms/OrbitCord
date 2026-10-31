import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');
assert.match(main, /Deactivated\s*\+=\s*\(_, _\)\s*=>\s*\{[\s\S]*?_nativeShortcuts\.IsRecording[\s\S]*?_nativeShortcuts\.CancelRecording\(\)[\s\S]*?UpdateWebViewActivityState\(\)/,
  'losing app focus must cancel native recording before leaving the shortcut hook in capture mode');
console.log('shortcut-recording-deactivation-safety: PASS');
