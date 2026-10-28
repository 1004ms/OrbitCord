import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xaml = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml'), 'utf8');

const required = [
  'Source="Assets/orbitcord-logo.png"',
  'HorizontalAlignment="Center"',
  'Text="Discord, lighter."',
  'x:Name="InstallButton"',
  'Content="Install"',
  'x:Name="UpdateButton"',
  'Content="Update"',
  'x:Name="UninstallButton"',
  'Content="Uninstall"',
  'x:Name="InstallPathBox"',
  'x:Name="BrowseButton"',
  'x:Name="DesktopShortcutCheckBox"',
  'x:Name="LaunchAfterInstallCheckBox"',
  'x:Name="InstallProgress"',
];

for (const token of required) {
  if (!xaml.includes(token)) throw new Error(`minimal installer UI missing ${token}`);
}

for (const forbidden of ['Setup summary', 'SafetyText', 'PrimaryActionButton', 'MaintenanceBadge']) {
  if (xaml.includes(forbidden)) throw new Error(`minimal installer UI still contains ${forbidden}`);
}

console.log('gui-installer-minimal-ui: PASS');
