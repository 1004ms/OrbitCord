import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xaml = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml'), 'utf8');

const duplicateBackground = /<([A-Za-z][A-Za-z0-9.]*)\b[^>]*\bBackground="[^"]*"[^>]*>[\s\S]*?<\1\.Background>/m;
if (duplicateBackground.test(xaml)) {
  throw new Error('installer XAML assigns Background both as an attribute and as a property element');
}

console.log('gui-installer-xaml-property-safety: PASS');
