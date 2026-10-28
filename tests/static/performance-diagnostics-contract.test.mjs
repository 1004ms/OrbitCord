import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = fs.readFileSync(path.join(root, 'src/OrbitCord.App/MainWindow.xaml.cs'), 'utf8');
const tuning = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WebViewProcessTuning.cs'), 'utf8');
const coreFile = path.join(root, 'src/OrbitCord.Core/PerformanceDiagnostics.cs');

assert.ok(fs.existsSync(coreFile), 'performance diagnostics formatter must exist in OrbitCord.Core');
const diagnostics = fs.readFileSync(coreFile, 'utf8');

assert.match(diagnostics, /PerformanceDiagnosticsReport/, 'core must expose a report formatter');
assert.match(diagnostics, /PrivateMemoryBytes/, 'samples must include private memory');
assert.match(diagnostics, /CpuTimeMilliseconds/, 'samples must include cumulative CPU time');
assert.match(diagnostics, /ThreadCount/, 'samples must include thread count');
assert.match(diagnostics, /Peak WebView working set/, 'report must identify the peak WebView working set');
assert.match(diagnostics, /Peak by process kind/, 'report must summarize peaks by process kind');
assert.match(main, /performance-session-/, 'close report must use a dedicated performance-session filename');
assert.match(main, /CapturePerformanceDiagnostics\("window-close"\)/, 'window close must capture one final sample');
assert.match(main, /WritePerformanceDiagnosticsReport/, 'window close must write the report before disposal');
assert.match(main, /TimeSpan\.FromSeconds\(1\)/, 'startup diagnostics must sample at 1 second cadence');
assert.match(main, /TimeSpan\.FromSeconds\(5\)/, 'steady diagnostics must back off to 5 second cadence');
assert.match(main, /MaxPerformanceDiagnosticSamples/, 'diagnostic samples must be bounded');
assert.match(tuning, /CaptureProcessMemoryDetails/, 'WebView tuning must expose detailed process sampling');
console.log('performance-diagnostics-contract: PASS');
