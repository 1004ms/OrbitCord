import fs from 'node:fs';
const main=fs.readFileSync(new URL('../../src/OrbitCord.App/MainWindow.xaml.cs',import.meta.url),'utf8');
const block=main.slice(main.indexOf('private void ApplySelectedWindowIcon()'),main.indexOf('private void HandleShortcutStatus'));
if (!block.includes('File.OpenRead')) throw new Error('live icon refresh must decode from a file stream to bypass WPF URI image cache');
if (block.includes('UriSource = new Uri(path')) throw new Error('live icon refresh must not use cached UriSource');
console.log('icon-live-refresh-contract: PASS');
