import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const settings = fs.readFileSync(path.join(root, 'src/OrbitCord.App/Scripts/orbitcord-settings.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'src/OrbitCord.App/Scripts/discord-shortcut-actions.js'), 'utf8');

for (const text of ['OrbitCord', 'Shortcut', 'Customisation', 'Aggiungi', 'Imposta tasti', 'Premi i tasti…', 'Nessuna shortcut.', 'Change OrbitCord icon', 'Upload custom icon']) {
  assert.ok(settings.includes(text), `missing Web UI text: ${text}`);
}
for (const preset of ['purple', 'green', 'orange', 'red', 'blue']) assert.ok(settings.includes(`id: '${preset}'`));
assert.ok(settings.includes("accept = 'image/png,.png'"), 'PNG upload accept contract missing');
assert.match(settings,/settingsLifecycleObserver\.observe\(parent, \{ childList: true \}\)/,'settings lifecycle observer must be scoped');
assert.doesNotMatch(settings,/settingsLifecycleObserver\.observe\(document\.(?:body|documentElement)/,'settings must not observe the whole Discord DOM continuously');
assert.doesNotMatch(actions, /setInterval\s*\(/, 'shortcut module discovery must use bounded backoff rather than interval polling');
assert.match(actions, /function clickDiscordVoiceControl\(kind\)/, 'voice DOM fallback missing');
assert.match(actions, /function isExactDeafenAriaLabel\(label\)/, 'strict deafen aria-label guard missing');
assert.match(actions, /return clickDiscordVoiceControl\(kind\);/, 'voice DOM fallback must support mute and strict deafen');
console.log('web-ui-contract: PASS');
