import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xaml = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml'), 'utf8');
const project = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/OrbitCord.Installer.csproj'), 'utf8');

const assets = [
  'installer-welcome.png',
  'installer-progress.png',
  'installer-success.png',
  'installer-title-icon.png',
  'feature-customisation.png',
  'feature-shortcuts.png',
  'feature-lighter.png',
  'feature-performance.png',
];

for (const asset of assets) {
  const file = path.join(root, 'src/OrbitCord.Installer/Assets', asset);
  if (!fs.existsSync(file)) throw new Error(`installer art asset missing: ${asset}`);
  const bytes = fs.readFileSync(file);
  const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!png) throw new Error(`installer art asset is not a PNG: ${asset}`);
  if (!xaml.includes(`Assets/${asset}`) && !project.includes(`Assets\\${asset}`)) {
    throw new Error(`installer art asset not wired: ${asset}`);
  }
}

if (xaml.includes('<!-- stars -->') || xaml.includes('<!-- skyline -->') || xaml.includes('<Canvas Height="240">')) {
  throw new Error('legacy hand-drawn WPF hero scene is still present');
}

console.log('gui-installer-real-art-assets: PASS');
