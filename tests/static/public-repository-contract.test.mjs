import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const mustExist = [
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/CONTRIBUTING.md',
  '.github/SECURITY.md',
  'docs/THIRD_PARTY.md',
  'install.ps1',
  'update.ps1',
  'uninstall.ps1',
  'PUBLISH-UPDATE.ps1',
  'Directory.Build.props'
];

for (const rel of mustExist) {
  if (!fs.existsSync(path.join(root, rel))) {
    throw new Error(`missing public repository file: ${rel}`);
  }
}

if (fs.existsSync(path.join(root, 'docs', 'superpowers'))) {
  throw new Error('internal superpowers docs must not ship publicly');
}

if (fs.existsSync(path.join(root, 'src', 'OrbitCord.App', 'NativeCaptureProbe.cs'))) {
  throw new Error('debug-only NativeCaptureProbe must not ship publicly');
}

const main = fs.readFileSync(path.join(root, 'src', 'OrbitCord.App', 'MainWindow.xaml.cs'), 'utf8');
if (
  main.includes('NativeCaptureProbe') ||
  main.includes('ToggleNativeCaptureProbeAsync') ||
  main.includes('_nativeCaptureProbe')
) {
  throw new Error('MainWindow still references NativeCaptureProbe');
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const installUrl = readme.match(/raw\.githubusercontent\.com\/([^\s]+)\/main\/install\.ps1/);
const updateUrl = readme.match(/raw\.githubusercontent\.com\/([^\s]+)\/main\/update\.ps1/);

if (!installUrl || !updateUrl) {
  throw new Error('README missing install/update PowerShell URLs');
}

if (installUrl[1] !== updateUrl[1]) {
  throw new Error('README install/update repository slugs do not match');
}

if (!readme.includes('.\\PUBLISH-UPDATE.ps1 -Version')) {
  throw new Error('README missing publish update command');
}

console.log('public-repository-contract: PASS');
