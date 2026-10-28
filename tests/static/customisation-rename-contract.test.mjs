import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const store = read('src/OrbitCord.App/IconCustomizationStore.cs');
const main = read('src/OrbitCord.App/MainWindow.xaml.cs');
const splash = read('src/OrbitCord.App/SplashWindow.xaml.cs');
const splashXaml = read('src/OrbitCord.App/SplashWindow.xaml');

for (const token of ['CustomAppName', 'DisplayAppName', 'SaveCustomAppName']) {
  if (!store.includes(token)) throw new Error(`store missing ${token}`);
}
if (!store.includes('(OrbitCord)')) throw new Error('display name must always retain OrbitCord branding');
if (!main.includes('orbitcord-app-name-prompt')) throw new Error('MainWindow missing native rename bridge');
if (!main.includes('ApplySelectedAppName')) throw new Error('MainWindow missing app-name application');
if (!splash.includes('DisplayAppName')) throw new Error('SplashWindow must load the persisted display name');
if (!splashXaml.includes('x:Name="BrandNameText"')) throw new Error('Splash brand text must be addressable');
console.log('customisation-rename-contract: PASS');
