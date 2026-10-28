import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(name) {
  return fs.readFileSync(path.join(root, name));
}

function text(name) {
  return read(name).toString('utf8');
}

function assertNoBom(name) {
  const data = read(name);
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    throw new Error(`${name} must be UTF-8 without BOM because it is piped to Invoke-Expression`);
  }
}

for (const name of ['install.ps1', 'update.ps1']) {
  assertNoBom(name);

  const source = text(name);
  const match = source.match(/\[string\]\$Repository\s*=\s*'([^']+)'/);
  if (!match) {
    throw new Error(`${name} is missing the Repository default`);
  }

  const defaultRepo = match[1];
  if (source.includes(`$repo -eq '${defaultRepo}'`)) {
    throw new Error(`${name} incorrectly treats its configured repository as unconfigured`);
  }

  if (!source.includes("$unconfiguredRepository = '__ORBITCORD_' + 'REPOSITORY__'")) {
    throw new Error(`${name} must use a safe repository sentinel`);
  }
}

const update = text('update.ps1');
if (!update.includes("TrimStart([char]0xFEFF)")) {
  throw new Error('update.ps1 must defensively strip a BOM from downloaded installer source');
}

console.log('powershell-encoding-contract: PASS');
