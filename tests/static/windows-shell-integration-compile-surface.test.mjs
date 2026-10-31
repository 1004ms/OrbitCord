import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.match(source, /^using System\.IO;/m,
  'WindowsShellIntegration must import System.IO for File/Path/Directory/stream APIs');
assert.doesNotMatch(source, /\)\[\.\.16\]\.ToLowerInvariant\(\)/,
  'icon hash should avoid range-expression ambiguity in Windows compiler');
assert.match(source, /\.Substring\(0,\s*16\)\.ToLowerInvariant\(\)/,
  'icon hash should use an explicit string Substring before ToLowerInvariant');

console.log('windows-shell-integration-compile-surface: PASS');
