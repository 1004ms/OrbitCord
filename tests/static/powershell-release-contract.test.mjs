import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const install = read('install.ps1');
const update = read('update.ps1');
const uninstall = read('uninstall.ps1');
const publish = read('PUBLISH-UPDATE.ps1');
const release = read('.github/workflows/release.yml');
const ci = read('.github/workflows/ci.yml');
const tests = read('scripts/Test-OrbitCord.ps1');

for (const needle of [
  "[string]$Repository = '",
  '$repo = $Repository',
  'api.github.com/repos/$repo',
  '/releases/latest',
  'Get-FileHash',
  'SHA256',
  'OrbitCord-win-x64.zip',
  "Join-Path $tempRoot 'rollback'",
]) {
  if (!install.includes(needle)) throw new Error(`PowerShell deploy engine missing ${needle}`);
}
if (!update.includes('install.ps1') || !update.includes('-UpdateOnly')) {
  throw new Error('update.ps1 must reuse the tested PowerShell deploy engine');
}
if (!uninstall.includes('InstallLocation') || !uninstall.includes('OrbitCord.backup-*')) {
  throw new Error('uninstall.ps1 must clean legacy Setup locations and backups');
}

for (const needle of ['git tag', 'git push', 'Directory.Build.props', 'scripts\\Test-OrbitCord.ps1']) {
  if (!publish.includes(needle)) throw new Error(`publisher missing ${needle}`);
}
if (!publish.includes('function Invoke-NativeProbe')) throw new Error('publisher missing safe native probe');
if (!publish.includes('git diff --cached --quiet')) throw new Error('publisher must tolerate already-set version');

if (/dotnet\s+(?:build|test|restore)[^\n]*OrbitCord\.Installer|Build installer/i.test(tests)) throw new Error('test gate must not build removed graphical installer');
if (!tests.includes('src/OrbitCord.Installer')) throw new Error('test gate must purge retired installer leftovers from overlay checkouts');
for (const needle of ['dotnet test', 'node', 'OrbitCord.App/OrbitCord.App.csproj', 'System.Management.Automation.Language.Parser', 'ParseFile']) {
  if (!tests.includes(needle)) throw new Error(`test runner missing ${needle}`);
}

for (const needle of ['workflow_dispatch', 'push:', 'tags:', 'dotnet publish', 'OrbitCord-win-x64.zip', 'Get-FileHash', "'release', 'create'", 'install.ps1', 'update.ps1', 'uninstall.ps1']) {
  if (!release.includes(needle)) throw new Error(`release workflow missing ${needle}`);
}
for (const forbidden of ['OrbitCord-Setup', 'OrbitCord.Installer', 'Publish installer']) {
  if (release.includes(forbidden)) throw new Error(`release workflow still contains removed Setup path: ${forbidden}`);
}
const ridRestore = 'dotnet restore src/OrbitCord.App/OrbitCord.App.csproj `';
const publishStep = 'dotnet publish src/OrbitCord.App/OrbitCord.App.csproj `';
if (!release.includes(ridRestore)) throw new Error('release workflow must restore win-x64 runtime packs');
if (release.indexOf(ridRestore) > release.indexOf(publishStep)) throw new Error('win-x64 restore must run before publish');
const restoreBlock = release.slice(release.indexOf(ridRestore), release.indexOf(publishStep));
if (!restoreBlock.includes('-r win-x64')) throw new Error('release restore must target win-x64');

for (const needle of ['pull_request:', './scripts/Test-OrbitCord.ps1']) {
  if (!ci.includes(needle)) throw new Error(`CI workflow missing ${needle}`);
}

console.log('powershell-release-contract: PASS');
