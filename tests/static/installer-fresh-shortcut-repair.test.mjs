import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const integration = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/WindowsIntegration.cs'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/InstallerEngine.cs'), 'utf8');

assert.match(integration, /RepairShortcutAppearance\s*\(/,
  'installer needs a helper that rewrites a stale OrbitCord shortcut icon back to the installed EXE');
assert.match(integration, /IconLocation\s*=\s*\$"\{executablePath\},0"/,
  'fresh-install shortcut repair must restore the executable icon instead of preserving a broken custom ICO path');
assert.match(engine, /freshInstall\s*=\s*previousInstall\s+is\s+null/,
  'installer must distinguish a clean install/reinstall from an in-place update');
assert.match(engine, /RepairShortcutAppearance\(installedExe, freshInstall\)/,
  'a clean install/reinstall must repair stale desktop/start/taskbar shortcuts before creating new ones');

console.log('installer-fresh-shortcut-repair: PASS');
