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

if (!publish.includes('function Invoke-NativeProbe')) {
  throw new Error('publisher must use a PowerShell 5.1-safe native probe helper');
}
if (publish.includes('& git rev-parse $tag *> $null')) {
  throw new Error('publisher must not probe a missing tag with raw git rev-parse under ErrorActionPreference Stop');
}

const tagProbe = "Invoke-NativeProbe -FilePath 'git'";
const setVersion = "scripts\\Set-Version.ps1";
if (!publish.includes(tagProbe)) throw new Error('publisher missing safe tag probe');
if (publish.indexOf(tagProbe) > publish.indexOf(setVersion)) {
  throw new Error('publisher must reject an existing tag before mutating Directory.Build.props');
}
if (!publish.includes('System.Text.UTF8Encoding($false)')) {
  throw new Error('publisher rollback must restore Directory.Build.props as UTF-8 without BOM');
}
if (!publish.includes('git diff --cached --quiet')) {
  throw new Error('publisher must tolerate an already-set release version instead of failing on an empty release commit');
}

const testScript = fs.readFileSync(path.join(root, 'scripts/Test-OrbitCord.ps1'), 'utf8');
for (const needle of ['dotnet test', 'node']) {
  if (!testScript.includes(needle)) throw new Error(`test runner missing ${needle}`);
}

for (const needle of ['workflow_dispatch', 'push:', 'tags:', 'dotnet publish', 'OrbitCord-win-x64.zip', 'Get-FileHash', "'release', 'create'"]) {
  if (!release.includes(needle)) throw new Error(`release workflow missing ${needle}`);
}
const ridRestore = 'dotnet restore src/OrbitCord.App/OrbitCord.App.csproj `';
const publishStep = 'dotnet publish src/OrbitCord.App/OrbitCord.App.csproj `';
if (!release.includes(ridRestore)) throw new Error('release workflow must restore the win-x64 runtime packs before self-contained publish');
if (release.indexOf(ridRestore) > release.indexOf(publishStep)) throw new Error('win-x64 restore must run before publish');
const restoreBlock = release.slice(release.indexOf(ridRestore), release.indexOf(publishStep));
if (!restoreBlock.includes('-r win-x64')) throw new Error('release restore must target win-x64');

for (const needle of ['pull_request:', './scripts/Test-OrbitCord.ps1']) {
  if (!ci.includes(needle)) throw new Error(`CI workflow missing ${needle}`);
}

console.log('powershell-release-contract: PASS');
