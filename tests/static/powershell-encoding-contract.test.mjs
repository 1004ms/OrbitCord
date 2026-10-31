import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => fs.readFileSync(path.join(root, name));
const text = (name) => read(name).toString('utf8');

function assertNoBom(name) {
  const data = read(name);
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    throw new Error(`${name} must be UTF-8 without BOM because it may be piped to Invoke-Expression`);
  }
}

for (const name of ['install.ps1', 'update.ps1', 'uninstall.ps1']) assertNoBom(name);

for (const name of ['install.ps1', 'update.ps1']) {
  const source = text(name);
  const match = source.match(/\[string\]\$Repository\s*=\s*'([^']+)'/);
  if (!match) throw new Error(`${name} is missing the Repository default`);
  const defaultRepo = match[1];
  if (source.includes(`$repo -eq '${defaultRepo}'`)) throw new Error(`${name} treats configured repository as unconfigured`);
  if (!source.includes("$unconfiguredRepository = '__ORBITCORD_' + 'REPOSITORY__'")) throw new Error(`${name} missing safe repository sentinel`);
}

if (!text('update.ps1').includes('TrimStart([char]0xFEFF)')) {
  throw new Error('update.ps1 must strip a BOM from downloaded install.ps1 source');
}

console.log('powershell-encoding-contract: PASS');
