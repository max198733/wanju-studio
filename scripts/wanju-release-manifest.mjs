import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { inspectSignature, requireValidSignature } from '../apps/desktop/scripts/wanju-signing.mjs';

const { values } = parseArgs({ options: {
  directory: { type: 'string' }, version: { type: 'string' }, 'require-signed': { type: 'boolean', default: false },
} });
if (!values.directory || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(values.version || '')) throw new Error('Provide --directory and --version.');
const directory = resolve(values.directory);
const installer = join(directory, `Wanju-Setup-${values.version}-x64.exe`);
const executable = join(directory, 'win-unpacked/Wanju.exe');
const signatures = [executable, installer].map((file) => ({ name: basename(file), ...inspectSignature(file) }));
if (values['require-signed']) {
  for (const signature of signatures) requireValidSignature(signature, process.env.WANJU_SIGN_EXPECTED_SUBJECT);
  const report = JSON.parse(await readFile(new URL('../.local/desktop-release.json', import.meta.url), 'utf8'));
  if (report.version !== values.version || report.unsigned || report.signingProvider !== 'signpath'
    || !report.signedFiles?.some((file) => file.file.endsWith('__uninstaller.exe'))) {
    throw new Error('The complete application/installer/uninstaller signing report is missing.');
  }
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(installer)) hash.update(chunk);
const sha256 = hash.digest('hex');
const manifest = {
  version: values.version, platform: 'windows', arch: 'x64', name: basename(installer),
  bytes: (await stat(installer)).size, sha256, unsigned: signatures.some((s) => s.status !== 'Valid'),
  publication: values['require-signed'] ? 'signed-draft' : 'unsigned-build-only', signatures,
};
await writeFile(join(directory, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(directory, 'SHA256SUMS.txt'), `${sha256}  ${basename(installer)}\n`);
console.log(JSON.stringify(manifest));
