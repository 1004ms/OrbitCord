import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const integration = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/WindowsIntegration.cs'), 'utf8');
assert.match(integration, /shell-v4-/,
  '1.1.6 installer must recognize 1.1.5-era v4 custom icon paths');
const repair = integration.slice(integration.indexOf('private static void RepairShortcutFolder'), integration.indexOf('private static bool PathsEqual'));
assert.doesNotMatch(repair, /shortcut\.Description\s*=\s*"OrbitCord"/,
  'repairing a stale icon must preserve the custom shortcut name/description');
console.log('installer-v4-shortcut-recovery: PASS');
