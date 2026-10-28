import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const settings = read('src/OrbitCord.App/Scripts/orbitcord-settings.js');
const main = read('src/OrbitCord.App/MainWindow.xaml.cs');
const catalog = read('src/OrbitCord.App/ShortcutCatalog.cs');

for (const forbidden of ['Premium Features', 'Server Copier', 'orbitcord-premium-', 'orbitcord-server-layout-', 'orbitcord-profile-cosmetics-']) {
  if (settings.includes(forbidden)) throw new Error(`settings still contains removed surface: ${forbidden}`);
}
for (const forbidden of ['orbitcord-premium-engine.js', 'profile-cosmetics.js', 'server-layout.js', 'PremiumFeaturesStore', 'ProfileCosmeticsStore', 'DiscordServerLayoutImporter']) {
  if (main.includes(forbidden)) throw new Error(`host still ships removed runtime: ${forbidden}`);
}
if (!settings.includes("{ key: 'shortcut', title: 'Shortcut'")) throw new Error('Shortcut settings entry missing');
if (!settings.includes("{ key: 'customisation', title: 'Customisation'")) throw new Error('Customisation settings entry missing');
if (!settings.includes("const CORE_ACTION_IDS = new Set(['TOGGLE_MUTE', 'TOGGLE_DEAFEN'])")) throw new Error('core shortcut whitelist missing');
if (!/filter\(item => item\.id && CORE_ACTION_IDS\.has\(item\.id\)\)/.test(settings)) throw new Error('host action whitelist missing');
const actionIds = [...catalog.matchAll(/\"(TOGGLE_[A-Z_]+)\"/g)].map(m => m[1]);
if (JSON.stringify(actionIds) !== JSON.stringify(['TOGGLE_MUTE', 'TOGGLE_DEAFEN'])) {
  throw new Error(`unexpected shortcut catalog: ${actionIds.join(',')}`);
}
console.log('lean-runtime-surface: PASS');
