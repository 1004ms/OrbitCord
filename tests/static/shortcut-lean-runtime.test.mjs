import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/OrbitCord.App/Scripts/discord-shortcut-actions.js'), 'utf8');
for (const forbidden of ['actionRegistry', 'looksLikeRegistry', 'patchDispatcher', 'WEB_ACTION_LABELS', 'invokeRegistry', 'setTimeout(', 'streamerStore', 'userStore']) {
  if (source.includes(forbidden)) throw new Error(`shortcut runtime still contains eager/generic path: ${forbidden}`);
}
if (!source.includes("case 'TOGGLE_MUTE'")) throw new Error('mute action missing');
if (!source.includes("case 'TOGGLE_DEAFEN'")) throw new Error('deafen action missing');
if (!source.includes('verified-state-change')) throw new Error('verified status contract missing');
console.log('shortcut-lean-runtime: PASS');
