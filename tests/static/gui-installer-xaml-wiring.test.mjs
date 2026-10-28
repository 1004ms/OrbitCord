import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xaml = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml'), 'utf8');
const code = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml.cs'), 'utf8');

const names = new Set([...xaml.matchAll(/x:Name="([A-Za-z_][A-Za-z0-9_]*)"/g)].map(m => m[1]));
const handlers = new Set([...xaml.matchAll(/(?:Click|MouseLeftButtonDown)="([A-Za-z_][A-Za-z0-9_]*)"/g)].map(m => m[1]));
const methods = new Set([...code.matchAll(/\b(?:private|internal|protected|public)\s+(?:async\s+)?(?:void|Task(?:<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]));

for (const handler of handlers) {
  if (!methods.has(handler)) throw new Error(`XAML handler ${handler} has no matching code-behind method`);
}

for (const control of ['InstallButton', 'UpdateButton', 'UninstallButton', 'BrowseButton', 'InstallPathBox', 'InstallOptionsPanel', 'StatusText', 'InstallProgress']) {
  if (code.includes(`${control}.`) && !names.has(control)) {
    throw new Error(`code-behind references ${control}, but XAML does not define x:Name=\"${control}\"`);
  }
}

console.log('gui-installer-xaml-wiring: PASS');
