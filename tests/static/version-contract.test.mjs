import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const props = read('Directory.Build.props');
const csproj = read('src/OrbitCord.App/OrbitCord.App.csproj');
const publish = read('PUBLISH-UPDATE.ps1');
const release = read('.github/workflows/release.yml');

const version = props.match(/<OrbitCordVersion>([^<]+)<\/OrbitCordVersion>/)?.[1];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('central version is invalid');
if (csproj.includes('<Version>') || csproj.includes('<FileVersion>') || csproj.includes('<AssemblyVersion>')) {
  throw new Error('app csproj must not duplicate centralized version metadata');
}
if (!publish.includes('scripts\\Set-Version.ps1')) throw new Error('publisher must use centralized version updater');
if (!release.includes('Validate tag matches source version')) throw new Error('release workflow must validate tag/source version');
console.log('version-contract: PASS');
