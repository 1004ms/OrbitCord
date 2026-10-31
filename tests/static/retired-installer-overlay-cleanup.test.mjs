import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'scripts/Test-OrbitCord.ps1'), 'utf8');
const retired = [
  'src/OrbitCord.Installer',
  'gui-installer-contract.test.mjs','gui-installer-full-wiring.test.mjs','gui-installer-layout-polish.test.mjs',
  'gui-installer-minimal-ui.test.mjs','gui-installer-pixel-ui.test.mjs','gui-installer-real-art-assets.test.mjs',
  'gui-installer-xaml-property-safety.test.mjs','gui-installer-xaml-wiring.test.mjs',
  'installer-custom-desktop-detection.test.mjs','installer-custom-shortcut-preservation.test.mjs',
  'installer-fresh-shortcut-repair.test.mjs','installer-live-update-contract.test.mjs','installer-v4-shortcut-recovery.test.mjs'
];
for (const item of retired) assert.ok(source.includes(item), `retired overlay path not purged: ${item}`);
assert.match(source, /\$retiredPaths\s*=\s*@\(/);
assert.match(source, /Remove-Item \$retiredPath -Recurse -Force/);
assert.ok(source.indexOf('$retiredPaths = @(') < source.indexOf("[1/6] Restore"), 'retired overlay purge must run before restore/test discovery');
console.log('retired-installer-overlay-cleanup: PASS');
