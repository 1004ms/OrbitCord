import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const install = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
const update = fs.readFileSync(path.join(root, 'update.ps1'), 'utf8');
const publish = fs.readFileSync(path.join(root, 'PUBLISH-UPDATE.ps1'), 'utf8');
const release = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
for (const needle of ["[string]$Repository = '", '$repo = $Repository', 'api.github.com/repos/$repo', '/releases', 'Get-FileHash', 'SHA256', 'OrbitCord-win-x64.zip', '.backup-', 'Move-Item']) {
  if (!install.includes(needle)) throw new Error(`installer missing ${needle}`);
}
if (!update.includes('install.ps1') || !update.includes('-UpdateOnly')) throw new Error('update.ps1 must reuse tested installer engine');
for (const needle of ['git tag', 'git push', 'Directory.Build.props', 'scripts\\Test-OrbitCord.ps1']) {
  if (!publish.includes(needle)) throw new Error(`publisher missing ${needle}`);
}
const testScript = fs.readFileSync(path.join(root, 'scripts/Test-OrbitCord.ps1'), 'utf8');
for (const needle of ['dotnet test', 'node']) {
  if (!testScript.includes(needle)) throw new Error(`test runner missing ${needle}`);
}
for (const needle of ['workflow_dispatch', 'push:', 'tags:', 'dotnet publish', 'OrbitCord-win-x64.zip', 'Get-FileHash', "'release', 'create'"]) {
  if (!release.includes(needle)) throw new Error(`release workflow missing ${needle}`);
}
for (const needle of ['pull_request:', './scripts/Test-OrbitCord.ps1']) {
  if (!ci.includes(needle)) throw new Error(`CI workflow missing ${needle}`);
}
console.log('powershell-release-contract: PASS');
