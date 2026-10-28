import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const settings = read('src/OrbitCord.App/Scripts/orbitcord-settings.js');
const shortcuts = read('src/OrbitCord.App/Scripts/discord-shortcut-actions.js');
const runtime = read('src/OrbitCord.App/Scripts/discord-runtime.js');

assert.match(settings,/settingsLifecycleObserver\.observe\(parent, \{ childList: true \}\)/,'settings observer must be scoped to the concrete Settings parent');
assert.doesNotMatch(settings,/settingsLifecycleObserver\.observe\(document\.(?:body|documentElement)/,'settings integration must not observe the whole Discord DOM');
assert.match(settings,/const delays = \[0, 180, 420, 900\]/,'settings remount burst must stay bounded while covering delayed React mounts');
assert.doesNotMatch(settings,/scheduleActivePageRetry|attempt >= 40|setTimeout\(tryMount, 50\)/,'opening an OrbitCord tab must not start a long retry loop');
assert.match(settings,/function isSettingsNavigationTarget\(target\)/,'mount rescans must be gated by a targeted Settings-navigation predicate');
assert.match(settings,/if \(isSettingsNavigationTarget\(target\)\) scheduleMountBurst\(\);/,'ordinary Discord clicks must not trigger Settings DOM scans');
assert.doesNotMatch(shortcuts,/setInterval\s*\(|setTimeout\s*\(/,'shortcut runtime must do zero background polling');
assert.doesNotMatch(shortcuts,/actionRegistry|KEYBINDS_REGISTER_GLOBAL_KEYBIND_ACTIONS|WEB_ACTION_LABELS/,'shortcut runtime must not scan generic keybind registries');
assert.doesNotMatch(runtime,/setInterval\s*\(|setTimeout\s*\(/,'shared Discord runtime must stay event-driven');
console.log('performance-event-budget: PASS');
