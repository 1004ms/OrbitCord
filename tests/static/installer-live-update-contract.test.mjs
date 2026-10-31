import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const client = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/GitHubReleaseClient.cs'), 'utf8');
const models = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/Models.cs'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/InstallerEngine.cs'), 'utf8');
const windowCode = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml.cs'), 'utf8');

assert.match(client, /GetLatestReleaseAsync/,
  'Setup must expose a live latest-release query');
assert.match(client, /\/releases\/latest/,
  'latest release query must use GitHub releases/latest rather than the Setup build version');
assert.match(models, /ReleaseDescriptor[\s\S]*Version/,
  'release descriptor must expose a normalized release version from its tag');
assert.match(engine, /GetLatestReleaseAsync/,
  'installation must resolve the current GitHub release at operation time');
assert.doesNotMatch(engine, /GetExactReleaseAsync\(InstallerBuildInfo\.Version/,
  'installation must not be pinned to the embedded Setup version');
assert.match(engine, /\.orbitcord-version[\s\S]*release\.Version/,
  'installed version marker must record the version actually downloaded');
assert.match(engine, /RegisterUninstallEntry\(installDirectory,\s*release\.Version/,
  'Apps & Features must record the version actually downloaded');
assert.match(windowCode, /RefreshLatestReleaseAsync/,
  'Setup UI must refresh GitHub latest release on launch');
assert.match(windowCode, /_latestRelease/,
  'Setup UI must keep live release state instead of comparing only against itself');

console.log('installer-live-update-contract: PASS');
