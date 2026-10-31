import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const settings = fs.readFileSync(path.join(root, 'src/OrbitCord.App/Scripts/orbitcord-settings.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');
const storePath = path.join(root, 'src/OrbitCord.App/OptionsStore.cs');

assert.match(settings, /key:\s*['"]options['"]/,
  'OrbitCord settings must expose a dedicated Options category');
assert.match(settings, /Disable self stream preview/i,
  'Options must expose the self stream preview toggle');
assert.match(settings, /orbitcord-options-request/,
  'Options page must request native option state');
assert.match(settings, /orbitcord-options-save/,
  'Options page must persist option changes through the native host');
assert.ok(fs.existsSync(storePath), 'OptionsStore.cs must persist OrbitCord options outside Discord storage');
const store = fs.readFileSync(storePath, 'utf8');
assert.match(store, /Options\.json/,
  'Options must persist under the OrbitCord LocalAppData root');
assert.match(store, /DisableSelfStreamPreview/,
  'native options state must include DisableSelfStreamPreview');
assert.match(main, /AddDocumentStartScriptAsync\(core,\s*["']orbitcord-options\.js["']\)/,
  'self-preview runtime must be installed at document start');
assert.match(main, /case\s+["']orbitcord-options-request["']/,
  'native bridge must answer option state requests');
assert.match(main, /case\s+["']orbitcord-options-save["']/,
  'native bridge must persist option changes');
console.log('options-category-contract: PASS');
