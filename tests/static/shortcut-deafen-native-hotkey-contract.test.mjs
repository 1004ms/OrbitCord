import fs from 'node:fs';
import assert from 'node:assert/strict';

const main = fs.readFileSync(new URL('../../src/OrbitCord.App/MainWindow.xaml.cs', import.meta.url), 'utf8');

assert.match(main, /TryDispatchDiscordBuiltinShortcutAsync/, 'native Discord hotkey bridge missing');
assert.match(main, /ShortcutAction\.ToggleDeafen/, 'deafen must have a dedicated native path');
assert.match(main, /Input\.dispatchKeyEvent/, 'WebView2 CDP keyboard dispatch missing');
assert.match(main, /ControlLeft/, 'Ctrl keydown must be dispatched explicitly');
assert.match(main, /ShiftLeft/, 'Shift keydown must be dispatched explicitly');
assert.match(main, /KeyD/, 'Discord official deafen key must be D');
assert.match(main, /\"D\", \"KeyD\", 0x44, 10/, 'Ctrl+Shift modifier bitmask must be used for D');
assert.match(main, /DispatchShortcutActionAsync/, 'test and native shortcut paths must share one dispatcher');
assert.match(main, /SendShortcutActionToWeb\(core, info, pressed\)/, 'existing JS action path must remain as fallback');

console.log('shortcut-deafen-native-hotkey-contract: PASS');
