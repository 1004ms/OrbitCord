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

if (!xaml.includes('x:Name="InstallOptionsOverlay"')) throw new Error('centered options overlay missing');
if (!xaml.includes('VerticalAlignment="Center"\n                                Width="650"')) throw new Error('options panel is not centered');
if (!xaml.includes('<ColumnDefinition Width="62" />\n                            <ColumnDefinition Width="14" />\n                            <ColumnDefinition Width="*" />\n                            <ColumnDefinition Width="14" />\n                            <ColumnDefinition Width="62" />')) {
  throw new Error('main action host no longer has symmetric side columns');
}
if (!xaml.includes('x:Name="InstallButton"\n                                Grid.Column="2"')) throw new Error('Install button is not centered in the symmetric action column');
if (!xaml.includes('x:Name="StatusText"\n                                   Visibility="Collapsed"')) throw new Error('ready status text should not be visible');
if (!code.includes('InstallOptionsOverlay.Visibility = _optionsExpanded ? Visibility.Visible : Visibility.Collapsed;')) {
  throw new Error('options button does not toggle centered overlay');
}

console.log('gui-installer-layout-polish: PASS');
