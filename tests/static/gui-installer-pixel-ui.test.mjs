import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xaml = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml'), 'utf8');
const code = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml.cs'), 'utf8');

for (const token of [
  'FontFamily="Consolas"',
  'Text="Customisation"',
  'Text="Global shortcuts"',
  'Text="Lighter"',
  'Text="Better performance"',
  'x:Name="ActionHost"',
  'x:Name="ProgressPanel"',
  'x:Name="SuccessPanel"',
  'Text="Download successful"',
  'x:Name="OptionsToggleButton"',
]) {
  if (!xaml.includes(token)) throw new Error(`pixel installer UI missing ${token}`);
}

for (const token of [
  'ShowProgressState',
  'ShowSuccessState',
  'OptionsToggleButton_OnClick',
  'ProgressPercentText.Text',
]) {
  if (!code.includes(token)) throw new Error(`pixel installer behavior missing ${token}`);
}

console.log('gui-installer-pixel-ui: PASS');
