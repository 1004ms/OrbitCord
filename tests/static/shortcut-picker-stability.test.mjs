import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');
assert.doesNotMatch(ui, /create\('select'/, 'shortcut action picker must not use native select');
assert.match(ui, /orbitcordActionPicker/);
assert.match(ui, /orbitcordActionChoice/);
assert.match(ui, /closest\?\.\(`#\$\{SECTION_ID\}, #\$\{PANEL_HOST_ID\}, \[data-orbitcord-owned=\"true\"\]`\)/, 'OrbitCord controls must not trigger remount bursts');
console.log('shortcut-picker-stability: PASS');
