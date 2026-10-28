import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/OrbitCord.App/Scripts/discord-runtime.js'), 'utf8');
for (const forbidden of ['addFactoryInterceptor', 'factoryInterceptors', 'findStore', 'getSelectedGuildId', 'getGuildChannels', 'getGuild(id)']) {
  if (source.includes(forbidden)) throw new Error(`runtime still contains removed generic/server path: ${forbidden}`);
}
for (const required of ['captureRequire', 'findByProps', 'getDiagnostics']) {
  if (!source.includes(required)) throw new Error(`runtime missing required API: ${required}`);
}
console.log('discord-runtime-lean-contract: PASS');
