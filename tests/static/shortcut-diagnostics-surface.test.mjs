import fs from 'node:fs';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js',import.meta.url),'utf8');
assert.match(source,/lastShortcutStatus\.detail/);
assert.match(source,/Dettaglio:/);
console.log('shortcut-diagnostics-surface: PASS');
