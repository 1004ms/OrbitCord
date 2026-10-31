import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.doesNotMatch(shell, /\[DllImport\(|SHChangeNotify|LoadImage\(|SendMessage\(|DestroyIcon\(|PropVariant|IPropertyStore/,
  'shortcut cosmetics must not cross a native bridge that can crash the app');
assert.match(shell, /shell-v5-/,
  'new icon materialization must use a fresh cache namespace');
assert.match(shell, /PngBitmapEncoder/,
  'custom PNGs must be normalized before being embedded into ICO');
assert.match(shell, /RenderTargetBitmap/,
  'custom PNGs must be rendered into square shell icon frames');
assert.match(shell, /ValidateShellIcon/,
  'ICO must be validated before a shortcut is changed');
assert.match(shell, /CreateRenamedShortcut/,
  'shortcut renaming must remain create-verify-delete');

console.log('windows-shell-customisation-safety: PASS');
