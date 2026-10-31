import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runner = fs.readFileSync(path.join(root, 'scripts/Test-OrbitCord.ps1'), 'utf8');

assert.doesNotMatch(
  runner,
  /"[^"\r\n]*\$relativeScript:/,
  'PowerShell double-quoted strings must delimit $relativeScript before a colon'
);
assert.match(
  runner,
  /PowerShell parse failed for \$\{relativeScript\}: \$details/,
  'PowerShell parse error must use ${relativeScript}: to avoid the drive/scope parser ambiguity'
);

console.log('powershell-test-runner-interpolation: PASS');
