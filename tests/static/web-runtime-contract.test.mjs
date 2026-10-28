import fs from 'node:fs';import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');const main=read('src/OrbitCord.App/MainWindow.xaml.cs');
for(const file of ['discord-runtime.js','discord-shortcut-actions.js','orbitcord-settings.js']) assert.match(main,new RegExp(file.replaceAll('.','\\.')));
for(const file of ['orbitcord-cosmetics-engine.js','orbitcord-premium-engine.js','profile-cosmetics.js','server-layout.js']) assert.doesNotMatch(main,new RegExp(file.replaceAll('.','\\.')));
assert.doesNotMatch(main,/Vencord/i);
console.log('web-runtime-contract: PASS');
