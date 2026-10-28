import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const app = path.join(root, 'src', 'OrbitCord.App');
const text = [
  fs.readFileSync(path.join(app, 'MainWindow.xaml.cs'), 'utf8'),
  fs.readFileSync(path.join(app, 'OrbitCord.App.csproj'), 'utf8'),
  ...fs.readdirSync(path.join(app, 'Scripts')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(app, 'Scripts', f), 'utf8'))
].join('\n');

test('runtime has no Vencord dependency', () => {
  assert.doesNotMatch(text, /window\.Vencord|Vencord\.user\.js|AddVencordWebEngineAsync|vencord-ui-suppressor|vencord-premium-bridge|vencord-cosmetics-bridge|vencord-prelude/);
});

test('app project does not package Vencord cache files', () => {
  const csproj = fs.readFileSync(path.join(app, 'OrbitCord.App.csproj'), 'utf8');
  assert.doesNotMatch(csproj, /OrbitCordVencordCacheRoot|Vencord-LICENSE|Vencord\.user\.js/i);
});
