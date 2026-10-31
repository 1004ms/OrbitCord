import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.doesNotMatch(shell, /SHCNE_ASSOCCHANGED|ShcneAssocChanged/,
  'customisation must not broadcast a global file-association refresh just to refresh one shortcut');
assert.match(shell, /ShcneUpdateItem|SHCNE_UPDATEITEM/,
  'icon changes must notify only the shortcut item that changed');
assert.match(shell, /ShcneRenameItem|SHCNE_RENAMEITEM/,
  'shortcut renames must be reported as targeted rename events');
assert.match(shell, /ShcnfPathW|SHCNF_PATHW/,
  'targeted shell notifications must carry Unicode shortcut paths');
assert.match(shell, /NotifyShortcutUpdated/,
  'shortcut icon changes need a targeted update helper');
assert.match(shell, /NotifyShortcutRenamed/,
  'shortcut rename needs a targeted rename helper');
assert.match(shell, /shell-v2-/,
  'new icon materialization must use a new cache generation so Windows cannot reuse broken old ICO cache entries');
assert.match(shell, /PngBitmapEncoder/,
  'custom PNGs must be normalized before being embedded into ICO');
assert.match(shell, /ScaleTransform/,
  'oversized custom PNGs must be scaled to shell-compatible icon dimensions');
assert.match(shell, /TryRenameShortcut/,
  'shortcut renaming must be isolated behind a verified/rollback-safe helper');

console.log('windows-shell-customisation-safety: PASS');
