import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

assert.equal(exists('src/OrbitCord.Installer'), false, 'graphical installer source must be removed');
assert.doesNotMatch(read('OrbitCord.sln'), /OrbitCord\.Installer/, 'solution must not reference graphical installer');
const gate = read('scripts/Test-OrbitCord.ps1');
assert.doesNotMatch(gate, /dotnet\s+(?:build|test|restore)[^\n]*OrbitCord\.Installer|Build installer/i, 'test runner must not build graphical installer');
assert.match(gate, /src\/OrbitCord\.Installer/, 'test runner should purge retired installer leftovers from overlay checkouts');

const release = read('.github/workflows/release.yml');
assert.doesNotMatch(release, /OrbitCord-Setup|OrbitCord\.Installer|Publish installer/i, 'release must not build or publish Setup.exe');
assert.match(release, /OrbitCord-win-x64\.zip/);
assert.match(release, /OrbitCord-win-x64\.zip\.sha256/);

console.log('powershell-only-distribution-contract: PASS');
