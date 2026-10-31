import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.match(shell, /shell-v4-/, 'custom shell icons must use a fresh v4 cache namespace');
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  assert.match(shell, new RegExp(`\\b${size}\\b`), `multi-resolution shell icon must include ${size}px`);
}
assert.match(shell, /RenderTargetBitmap|DrawingVisual/, 'icon frames must be rendered onto square transparent canvases');
assert.match(shell, /ValidateShellIcon/, 'materialized ICO must be decoded/validated before any shortcut points to it');
assert.match(shell, /IconBitmapDecoder/, 'ICO validation must use the Windows/WPF icon decoder');
assert.match(shell, /\.tmp/, 'icon generation must use an atomic temporary file');

console.log('windows-shell-icon-v4-container: PASS');
