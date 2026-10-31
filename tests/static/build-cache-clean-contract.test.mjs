import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const script = fs.readFileSync(path.join(root, 'scripts', 'Test-OrbitCord.ps1'), 'utf8');

assert.match(
  script,
  /\[0\/6\] Clean stale build artifacts/,
  'test runner must clean stale build artifacts before restore/build'
);
assert.match(
  script,
  /src\/OrbitCord\.Core\/bin[\s\S]*src\/OrbitCord\.Core\/obj/,
  'test runner must explicitly remove OrbitCord.Core bin/obj caches'
);
assert.match(
  script,
  /src\/OrbitCord\.App\/bin[\s\S]*src\/OrbitCord\.App\/obj/,
  'test runner must explicitly remove OrbitCord.App bin/obj caches'
);
assert.ok(
  script.indexOf('[0/6] Clean stale build artifacts') < script.indexOf('[1/6] Restore'),
  'cache cleanup must happen before restore/build'
);

console.log('build-cache-clean-contract: PASS');
