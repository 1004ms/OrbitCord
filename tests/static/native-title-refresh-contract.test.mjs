import fs from 'node:fs';
import assert from 'node:assert/strict';
const styling = fs.readFileSync(new URL('../../src/OrbitCord.App/NativeWindowStyling.cs', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../src/OrbitCord.App/MainWindow.xaml.cs', import.meta.url), 'utf8');
assert.match(styling, /SetWindowText/, 'native title helper must force the Windows caption text');
assert.match(main, /ApplySelectedAppName\(\)[\s\S]*NativeWindowStyling\.[A-Za-z]*WindowTitle/, 'ApplySelectedAppName must force-refresh the native caption');
console.log('native-title-refresh-contract: PASS');
