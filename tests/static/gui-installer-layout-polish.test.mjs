import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xaml = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml'), 'utf8');
const code = fs.readFileSync(path.join(root, 'src/OrbitCord.Installer/MainWindow.xaml.cs'), 'utf8');

for (const asset of [
  'feature-customisation.png',
  'feature-shortcuts.png',
  'feature-lighter.png',
  'feature-performance.png',
]) {
  if (!xaml.includes(`Source="Assets/${asset}"`)) throw new Error(`feature art not used: ${asset}`);
}

for (const forbidden of ['Text="✦"', 'Text="⌨"', 'Text="↓"', 'Text="⚡"']) {
  if (xaml.includes(forbidden)) throw new Error(`legacy glyph feature icon still present: ${forbidden}`);
}

function openingTag(name) {
  const match = xaml.match(new RegExp(`<[^>]+x:Name="${name}"[^>]*>`, 's'));
  if (!match) throw new Error(`missing x:Name=${name}`);
  return match[0];
}

if (!xaml.includes('x:Name="InstallOptionsOverlay"')) throw new Error('centered options overlay missing');

const optionsPanel = openingTag('InstallOptionsPanel');
for (const token of ['HorizontalAlignment="Center"', 'VerticalAlignment="Center"', 'Width="650"']) {
  if (!optionsPanel.includes(token)) throw new Error(`options panel missing ${token}`);
}

const actionHostMatch = xaml.match(/<Grid[^>]*x:Name="ActionHost"[^>]*>[\s\S]*?<Grid\.ColumnDefinitions>([\s\S]*?)<\/Grid\.ColumnDefinitions>/);
if (!actionHostMatch) throw new Error('main action host or column definitions missing');
const actionColumns = actionHostMatch[1];
if (!/<ColumnDefinition\s+Width="62"\s*\/?>\s*<ColumnDefinition\s+Width="14"\s*\/?>\s*<ColumnDefinition\s+Width="\*"\s*\/?>\s*<ColumnDefinition\s+Width="14"\s*\/?>\s*<ColumnDefinition\s+Width="62"\s*\/?>/.test(actionColumns)) {
  throw new Error('main action host no longer has symmetric side columns');
}

const installButton = openingTag('InstallButton');
if (!installButton.includes('Grid.Column="2"')) throw new Error('Install button is not centered in the symmetric action column');

const statusText = openingTag('StatusText');
if (!statusText.includes('Visibility="Collapsed"')) throw new Error('ready status text should not be visible');

if (!code.includes('InstallOptionsOverlay.Visibility = _optionsExpanded ? Visibility.Visible : Visibility.Collapsed;')) {
  throw new Error('options button does not toggle centered overlay');
}

console.log('gui-installer-layout-polish: PASS');
