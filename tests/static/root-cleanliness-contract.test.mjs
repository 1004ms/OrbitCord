import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

for (const obsolete of [
  'BOOTSTRAP-GITHUB.ps1',
  'BUILD-WINDOWS.bat',
  'RUN-DEV.bat'
]) {
  if (fs.existsSync(path.join(root, obsolete))) {
    throw new Error(`obsolete root helper returned: ${obsolete}`);
  }
}

for (const required of [
  'README.md',
  'LICENSE',
  'OrbitCord.sln',
  'Directory.Build.props',
  'install.ps1',
  'update.ps1',
  'uninstall.ps1',
  'PUBLISH-UPDATE.ps1',
  '.github/CONTRIBUTING.md',
  '.github/SECURITY.md',
  'docs/THIRD_PARTY.md',
  'scripts/Run-Dev.ps1',
  'scripts/Build-OrbitCord.ps1',
  'scripts/Test-OrbitCord.ps1'
]) {
  if (!fs.existsSync(path.join(root, required))) {
    throw new Error(`root cleanup removed required file: ${required}`);
  }
}

const rootEntries = new Set(fs.readdirSync(root));
for (const banned of [
  'README-HOTFIX.txt',
  'README-CLEANUP.txt',
  'APPLY-INSTALLER-UI-SYNC-HOTFIX.ps1',
  'APPLY-ROOT-CLEANUP.ps1'
]) {
  if (rootEntries.has(banned)) {
    throw new Error(`temporary hotfix file leaked into clean source: ${banned}`);
  }
}

console.log('root-cleanliness-contract: PASS');
