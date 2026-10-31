import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shell = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WindowsShellIntegration.cs'), 'utf8');

assert.doesNotMatch(shell, /File\.Delete\(desiredPath\)\s*;\s*}\s*\n\s*File\.Move\(shortcutPath, desiredPath\)/s,
  'renaming must never delete the destination and then move the only shortcut into place');
assert.match(shell, /CreateReplacementShortcut|CreateRenamedShortcut/, 'rename must create and verify a replacement shortcut before deleting the old path');
assert.match(shell, /ShortcutTargetsExecutable/, 'replacement shortcut must be target-verified before old shortcut deletion');
assert.match(shell, /NotifyShortcutDirectoryUpdated/, 'desktop/start shell folder must receive a targeted directory refresh after rename');

console.log('windows-shell-rename-nondestructive: PASS');
