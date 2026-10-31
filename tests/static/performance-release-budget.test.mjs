import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = fs.readFileSync(path.join(root, 'src/OrbitCord.Core/MemoryPolicy.cs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');

assert.match(policy, /SoftCleanupFloorBytes\s*=\s*128L\s*\*\s*1024\s*\*\s*1024/,
  'adaptive governor needs a 128 MiB absolute floor');
assert.match(policy, /CleanupGrowthBudgetBytes\s*=\s*48L\s*\*\s*1024\s*\*\s*1024/,
  'adaptive governor should react to meaningful post-cleanup growth');
assert.match(policy, /HardTrimThresholdBytes\s*=\s*384L\s*\*\s*1024\s*\*\s*1024/,
  'OS working-set trimming must remain a high-water fallback');
assert.match(policy, /CleanupCooldown\s*=\s*TimeSpan\.FromSeconds\(45\)/,
  'adaptive cleanup must use a long cooldown to avoid GC/pressure thrash');
assert.match(policy, /lastCleanupWorkingSetBytes/,
  'cleanup policy must compare against the previous cleanup low-water mark');
assert.match(policy, /UseLowMemoryTarget[\s\S]*=>\s*startupSettled\s*&&\s*!isActive/,
  'active Discord must stay on WebView2 Normal target; Low is for inactive windows');

assert.match(main, /_lastMemoryCleanupWorkingSetBytes/,
  'memory governor must retain the post-cleanup working-set baseline');
assert.match(main, /_lastMemoryCleanupWorkingSetBytes\s*=\s*after/,
  'post-cleanup working set must become the next adaptive baseline');
assert.match(main, /ORBITCORD_PERF_DIAGNOSTICS/,
  'expensive process diagnostics must be opt-in in release builds');
assert.match(main, /if \(PerformanceDiagnosticsEnabled\)\s*\{[\s\S]*?_performanceDiagnosticsTimer\.Start\(\);/,
  'periodic process sampling must not run unless diagnostics are explicitly enabled');
assert.match(main, /if \(!PerformanceDiagnosticsEnabled\) return;/,
  'event-triggered diagnostics must also be no-op by default');

console.log('performance-release-budget: PASS');
