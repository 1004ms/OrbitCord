import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const script = fs.readFileSync(path.join(root, 'BOOTSTRAP-GITHUB.ps1'), 'utf8');

if (!script.includes('function Invoke-NativeProbe')) {
  throw new Error('bootstrap must centralize expected native-command failures in Invoke-NativeProbe');
}
if (script.includes('git rev-parse --verify HEAD *> $null')) {
  throw new Error('bootstrap must not probe unborn HEAD with rev-parse under ErrorActionPreference=Stop');
}
if (script.includes('gh repo view $Repository *> $null')) {
  throw new Error('bootstrap must not probe a missing GitHub repository with direct native stderr');
}
if (script.includes('git rev-parse $tag *> $null')) {
  throw new Error('bootstrap must not probe a missing tag with direct native stderr');
}
for (const expected of [
  "Invoke-NativeProbe -FilePath 'git' -Arguments @('show-ref','--head','--verify','--quiet','HEAD')",
  "Invoke-NativeProbe -FilePath 'gh' -Arguments @('repo','view',$Repository,'--json','name')",
  "Invoke-NativeProbe -FilePath 'git' -Arguments @('show-ref','--tags','--verify','--quiet',\"refs/tags/$tag\")"
]) {
  if (!script.includes(expected)) throw new Error(`bootstrap missing safe native probe: ${expected}`);
}
console.log('bootstrap-native-probes: PASS');
