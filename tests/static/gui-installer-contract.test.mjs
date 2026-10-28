import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
};

for (const required of [
  'src/OrbitCord.Installer/OrbitCord.Installer.csproj',
  'src/OrbitCord.Installer/MainWindow.xaml',
  'src/OrbitCord.Installer/MainWindow.xaml.cs',
  'src/OrbitCord.Installer/InstallerEngine.cs',
  'src/OrbitCord.Installer/GitHubReleaseClient.cs',
  'src/OrbitCord.Installer/WindowsIntegration.cs',
]) {
  if (!exists(required)) throw new Error(`GUI installer contract: missing ${required}`);
}



for (const file of [
  'src/OrbitCord.Installer/InstallerEngine.cs',
  'src/OrbitCord.Installer/WindowsIntegration.cs',
  'src/OrbitCord.Installer/MainWindow.xaml.cs',
  'src/OrbitCord.Installer/GitHubReleaseClient.cs',
]) {
  requireText(read(file), 'using System.IO;', `${file} namespace imports`);
}
requireText(read('src/OrbitCord.Installer/GitHubReleaseClient.cs'), 'using System.Net.Http;', 'release client namespace imports');

const csproj = read('src/OrbitCord.Installer/OrbitCord.Installer.csproj');
requireText(csproj, '<UseWPF>true</UseWPF>', 'installer project');
requireText(csproj, '<AssemblyName>OrbitCord-Setup</AssemblyName>', 'installer project');
requireText(csproj, 'orbitcord.ico', 'installer project');
requireText(csproj, 'orbitcord-logo.png', 'installer project');

const xaml = read('src/OrbitCord.Installer/MainWindow.xaml');
for (const token of [
  'x:Name="InstallPathBox"',
  'x:Name="BrowseButton"',
  'x:Name="DesktopShortcutCheckBox"',
  'x:Name="LaunchAfterInstallCheckBox"',
  'IsChecked="False"',
  'x:Name="InstallProgress"',
  'x:Name="PrimaryActionButton"',
  'x:Name="UninstallButton"',
]) requireText(xaml, token, 'installer UI');

const engine = read('src/OrbitCord.Installer/InstallerEngine.cs');
for (const token of [
  'VerifySha256Async',
  'OrbitCord-win-x64.zip',
  'OrbitCord-win-x64.zip.sha256',
  'OrbitCord.exe',
  'backup',
  'StopOrbitCordProcesses',
  'RegisterUninstallEntry',
]) requireText(engine, token, 'installer engine');

requireText(engine, '.orbitcord-version', 'legacy PowerShell install migration');
requireText(engine, 'ReadLegacyInstallMarker', 'legacy PowerShell install migration');
requireText(engine, 'previousRegisteredInstall', 'rollback must distinguish registered installs from legacy PowerShell installs');
requireText(engine, 'CopyDirectory', 'custom install drive support');
if (engine.includes('Directory.Move(payloadPath, installDirectory)')) throw new Error('installer must support install folders on a different drive than the temp directory');

const integration = read('src/OrbitCord.Installer/WindowsIntegration.cs');
for (const token of [
  'Microsoft\\Windows\\Start Menu\\Programs',
  'DesktopDirectory',
  'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OrbitCord',
  '--uninstall',
]) requireText(integration, token, 'Windows integration');

const client = read('src/OrbitCord.Installer/GitHubReleaseClient.cs');
requireText(client, 'releases/tags/', 'release client');
requireText(client, 'DefaultRequestHeaders.UserAgent', 'release client');

const tests = read('scripts/Test-OrbitCord.ps1');
requireText(tests, 'OrbitCord.Installer/OrbitCord.Installer.csproj', 'test gate');

const release = read('.github/workflows/release.yml');
for (const token of [
  'Publish installer',
  'OrbitCord.Installer/OrbitCord.Installer.csproj',
  'OrbitCord-Setup.exe',
  'OrbitCord-Setup.exe.sha256',
]) requireText(release, token, 'release workflow');

const solution = read('OrbitCord.sln');
requireText(solution, 'OrbitCord.Installer', 'solution');

const readme = read('README.md');
requireText(readme, 'OrbitCord-Setup.exe', 'README');
requireText(readme, 'PowerShell', 'README fallback');

console.log('gui-installer-contract: PASS');
