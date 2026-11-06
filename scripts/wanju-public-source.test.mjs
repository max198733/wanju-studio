import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credentialFindings, initializePublicGitSnapshot, publicSourcePath } from './wanju-public-source.mjs';

test('source export excludes operator history, generated output and sensitive files', () => {
  for (const path of ['.local/config/providers.json', '.codex/config.toml', 'outputs/result.json', 'Projects/film.html',
    'apps/wanju-service/ops/deploy.sh', 'docs/wanju/backup.md', 'apps/desktop/dist/app.js', 'cert.pfx',
    'apps/desktop/cert.key', 'apps/wanju-service/.env.production', '../outside.txt', 'apps/../secret.txt',
    '.github/workflows/release.yml', 'Copy-WanjuServerAccess.ps1', 'scripts/prepare-cloud-access.mjs']) {
    assert.equal(publicSourcePath(path), false, path);
  }
  for (const path of ['LICENSE', 'pnpm-lock.yaml', 'apps/desktop/src/wanju-main.mjs',
    '.github/workflows/wanju-windows.yml', 'docs/opensource/README.public.md', '.agents/skills/wanju-creator/SKILL.md']) {
    assert.equal(publicSourcePath(path), true, path);
  }
});

test('credential reports identify categories without returning secret values', () => {
  const secret = ['fixture', 'private', 'value', '12345'].join('-');
  assert.deepEqual(credentialFindings(Buffer.from(secret), [secret]), ['known-private-value']);
  const finding = credentialFindings(Buffer.from(['-----BEGIN ', 'PRIVATE KEY-----'].join('')));
  assert.deepEqual(finding, ['private-key']);
  assert.equal(JSON.stringify(finding).includes('BEGIN'), false);
  assert.deepEqual(credentialFindings(Buffer.from('process.env.API_KEY')), []);
});

test('a fresh public index normalizes text without changing binary files or importing history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-public-git-'));
  try {
    const binary = Buffer.from([0, 13, 10, 255]);
    await writeFile(join(directory, '.gitattributes'), '* text=auto eol=lf\n*.bin binary\n');
    await writeFile(join(directory, 'notice.txt'), 'Copyright fixture\r\nPreserve this notice.\r\n');
    await writeFile(join(directory, 'sample.bin'), binary);
    await initializePublicGitSnapshot(directory, ['.gitattributes', 'notice.txt', 'sample.bin']);
    assert.equal(await readFile(join(directory, 'notice.txt'), 'utf8'), 'Copyright fixture\nPreserve this notice.\n');
    assert.deepEqual(await readFile(join(directory, 'sample.bin')), binary);
    assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: directory, encoding: 'utf8' }).trim(), 'main');
    assert.throws(() => execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: directory, stdio: 'pipe' }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
