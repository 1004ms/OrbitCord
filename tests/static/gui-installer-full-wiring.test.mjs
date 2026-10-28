import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xaml = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml'), 'utf8');
const code = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml.cs'), 'utf8');

const names = new Set([...xaml.matchAll(/x:Name="([A-Za-z_][A-Za-z0-9_]*)"/g)].map(match => match[1]));
const requiredNames = [
  'ReadyPanel',
  'VersionText',
  'ActionHost',
  'InstallButton',
  'UpdateButton',
  'OptionsToggleButton',
  'ProgressPanel',
  'InstallProgress',
  'ProgressPercentText',
  'ProgressStatusText',
  'OperationTitleText',
  'OperationSubtitleText',
  'SuccessPanel',
  'SuccessDetailText',
  'StatusText',
  'InstallOptionsPanel',
  'InstallLocationSection',
  'InstallPathBox',
  'BrowseButton',
  'InstallPreferencesSection',
  'DesktopShortcutCheckBox',
  'LaunchAfterInstallCheckBox',
  'UninstallButton',
];

for (const name of requiredNames) {
  if (!names.has(name)) throw new Error(`pixel installer XAML missing x:Name=\"${name}\"`);
  if (!code.includes(`${name}.`) && !['ActionHost'].includes(name)) {
    throw new Error(`pixel installer code-behind no longer references expected control ${name}`);
  }
}

const handlers = new Set([...xaml.matchAll(/(?:Click|MouseLeftButtonDown)="([A-Za-z_][A-Za-z0-9_]*)"/g)].map(match => match[1]));
const methods = new Set([...code.matchAll(/\b(?:private|internal|protected|public)\s+(?:async\s+)?(?:void|Task(?:<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(match => match[1]));
for (const handler of handlers) {
  if (!methods.has(handler)) throw new Error(`XAML handler ${handler} has no matching code-behind method`);
}

for (const token of [
  'Text="Customisation"',
  'Text="Global shortcuts"',
  'Text="Lighter"',
  'Text="Better performance"',
  'Content="Install"',
  'Content="Update"',
  'Text="Download successful"',
]) {
  if (!xaml.includes(token)) throw new Error(`pixel installer contract missing ${token}`);
}

console.log('gui-installer-full-wiring: PASS');
