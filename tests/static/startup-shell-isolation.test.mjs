import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'src/OrbitCord.App/App.xaml.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

// Keep this contract independent from the checkout line ending. OrbitCord intentionally
// checks out C# sources as CRLF on Windows runners, while local/source ZIPs may use LF.
const startupTry = app.match(/try\s*\{([\s\S]*?)\}\s*catch\s*\(Exception\s+ex\)/);
assert.ok(startupTry, 'startup try/catch guard missing');
assert.match(startupTry[1], /new MainWindow\(_logger\)/,
  'MainWindow construction must be inside the startup try/catch');
assert.match(startupTry[1], /main\.Show\(\)/,
  'MainWindow Show must be inside the startup try/catch');

const sourceInit = main.match(/SourceInitialized \+= \(_, _\) =>\s*\{([\s\S]*?)\r?\n\s*\};/);
assert.ok(sourceInit, 'SourceInitialized handler missing');
assert.doesNotMatch(sourceInit[1], /ApplySelectedWindowIcon|ApplyShellAppearance/,
  'SourceInitialized must not regenerate icons or enumerate shell shortcuts during startup');
assert.match(sourceInit[1], /StartNativeShortcuts\(\)/,
  'native shortcut startup should remain in SourceInitialized');

console.log('startup-shell-isolation: PASS');
