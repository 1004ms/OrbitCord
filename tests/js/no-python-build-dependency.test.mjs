import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const scripts = [
  'scripts/Run-Dev.ps1',
  'scripts/Test-OrbitCord.ps1',
  'scripts/Build-OrbitCord.ps1',
  'PUBLISH-UPDATE.ps1'
];

for (const rel of scripts) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8').toLowerCase();
  if (source.includes('python')) {
    throw new Error(`${rel} still references Python`);
  }
}

console.log('no-python-build-dependency: PASS');
