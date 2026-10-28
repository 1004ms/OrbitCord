import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = fs.readFileSync(path.join(root, 'src/OrbitCord.Core/MemoryPolicy.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

assert.match(policy, /UseLowMemoryTarget\s*\(\s*bool isActive,\s*bool startupSettled,\s*bool gamingMode\s*\)/,
  'memory target policy must distinguish bootstrap from settled runtime');
assert.doesNotMatch(policy, /UseLowMemoryTarget\([^)]*\)\s*=>\s*true\s*;/,
  'Low memory target must not be locked during Discord bootstrap');
assert.match(main, /CoreWebView2MemoryUsageTargetLevel\.Normal/,
  'bootstrap or gaming activity must be able to restore the Normal target');
assert.match(main, /HeapProfiler\.collectGarbage/,
  'settled bootstrap should request one bounded V8 garbage collection');
assert.match(main, /Memory\.simulatePressureNotification/,
  'settled bootstrap should send a bounded Chromium memory-pressure hint');
assert.match(main, /NavigationStarting[\s\S]*_startupMemorySettled = false[\s\S]*_memoryGovernorTimer\.Stop\(\)/,
  'top-level Discord reloads must return to bootstrap memory mode');
assert.match(main, /DOMContentLoaded[\s\S]*BeginStartupMemoryStabilizationAsync/,
  'every Discord document load must schedule a bounded memory settle pass');
assert.doesNotMatch(main, /TrySuspendAsync\s*\(/,
  'OrbitCord must not suspend Discord because voice/network activity must continue');
console.log('webview-memory-policy-active: PASS');
