import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/OrbitCord.App/WebViewProcessTuning.cs'), 'utf8');
if (!source.includes('_lastAppliedPriority')) throw new Error('priority cache missing');
if (!source.includes('_lastProcessIds')) throw new Error('process-id cache missing');
if (!/SetEquals\(_lastProcessIds\)/.test(source)) throw new Error('process set equality guard missing');
if (!/return;\s*}\s*\n\s*foreach/s.test(source)) throw new Error('idempotent early return missing');
console.log('webview-process-tuning-idempotent: PASS');
