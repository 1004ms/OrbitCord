import fs from 'node:fs';
import assert from 'node:assert/strict';

const main = fs.readFileSync(new URL('../../src/OrbitCord.App/MainWindow.xaml.cs', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');

assert.match(main, /case "orbitcord-shortcut-test"/);
assert.match(main, /TestShortcutAction\(root, core\)/);
assert.match(main, /FindByDiscordId\(actionId\)/);
assert.match(main, /DispatchShortcutActionAsync\(core, info, true, reportNativeTestResult: true\)/);
assert.match(main, /if \(info\.IsHold\)/);
assert.match(main, /DispatchShortcutActionAsync\(core, info, false\)/);
assert.match(main, /orbitcord-shortcut-test-result/);
assert.match(ui, /type: 'orbitcord-shortcut-test'/);
assert.match(ui, /type === 'orbitcord-shortcut-test-result'/);
console.log('shortcut-test-bridge: PASS');
