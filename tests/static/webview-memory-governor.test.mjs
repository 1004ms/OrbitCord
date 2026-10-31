import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = fs.readFileSync(path.join(root, 'src/OrbitCord.Core/MemoryPolicy.cs'), 'utf8');
const tuning = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WebViewProcessTuning.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

assert.match(policy, /SoftCleanupFloorBytes\s*=\s*128L\s*\*\s*1024\s*\*\s*1024/,
  'adaptive cleanup must have a 128 MiB absolute floor');
assert.match(policy, /CleanupGrowthBudgetBytes\s*=\s*48L\s*\*\s*1024\s*\*\s*1024/,
  'adaptive cleanup must react after 48 MiB of growth from the last cleanup baseline');
assert.match(policy, /HardTrimThresholdBytes\s*=\s*384L\s*\*\s*1024\s*\*\s*1024/,
  'hard trim must remain a higher-water fallback at 384 MiB');
assert.match(policy, /CleanupCooldown\s*=\s*TimeSpan\.FromSeconds\(45\)/,
  'cleanup must have a 45 second cooldown to avoid pressure thrash');
assert.match(tuning, /EmptyWorkingSet/,
  'high-water fallback must be able to trim WebView2 working sets');
assert.match(tuning, /GetWorkingSetBytes/,
  'governor must measure only the current WebView2 environment before acting');
assert.match(main, /DispatcherTimer/,
  'memory governor must use a low-frequency UI timer instead of a hot polling loop');
assert.match(main, /MemoryPolicy\.ShouldRequestCleanup/,
  'governor must delegate threshold and cooldown decisions to policy');
assert.match(main, /MemoryPolicy\.ShouldHardTrim/,
  'hard trim must be threshold-gated');
console.log('webview-memory-governor: PASS');
