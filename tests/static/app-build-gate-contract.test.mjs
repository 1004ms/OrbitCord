import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const testScript = fs.readFileSync(path.join(root, 'scripts/Test-OrbitCord.ps1'), 'utf8');
if (!testScript.includes('dotnet build src/OrbitCord.App/OrbitCord.App.csproj')) {
  throw new Error('test gate must compile OrbitCord.App before release');
}
console.log('app-build-gate-contract: PASS');
