import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repository = fileURLToPath(new URL('../', import.meta.url));
const rootFiles = new Set(['.gitattributes', '.gitignore', '.gitleaks.toml', '.npmrc', '.secretlintrc.json',
  'AGENTS.md', 'LICENSE', 'TRADEMARK.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);
const roots = new Set(['apps', 'packages', 'integrations', 'resources', 'skills', 'scripts', 'tools', '.agents', 'docs']);
const excluded = ['docs/wanju/', 'apps/wanju-service/ops/'];

export function publicSourcePath(path) {
  if (!path || path.includes('\\') || isAbsolute(path) || path.split('/').some((p) => p === '..' || p === '.')) return false;
  if (/(^|\/)(node_modules|dist|\.git|\.local|\.codex|\.dev|\.release|outputs|Projects|Exports|Saved|work)(\/|$)/.test(path)) return false;
  if (/(^|\/)\.env(?:\.|$)|\.(pfx|p12|pem|key|sqlite|db|log|tsbuildinfo)$/i.test(path)) return false;
  if (excluded.some((prefix) => path.startsWith(prefix))) return false;
  if (path === 'scripts/prepare-cloud-access.mjs') return false;
  if (path.startsWith('.github/')) return /^\.github\/workflows\/wanju-[\w-]+\.yml$/.test(path);
  return path.includes('/') ? roots.has(path.split('/')[0]) : rootFiles.has(path);
}

const tokenPatterns = [
  ['private-key', /-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['provider-token', /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
];

export function credentialFindings(bytes, knownSecrets = []) {
  const findings = new Set();
  for (const secret of knownSecrets) if (bytes.includes(Buffer.from(secret))) findings.add('known-private-value');
  if (bytes.includes(0)) return [...findings];
  const text = bytes.toString('utf8');
  for (const [name, pattern] of tokenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.add(name);
  }
  return [...findings];
}

export async function initializePublicGitSnapshot(destination, paths) {
  execFileSync('git', ['init', '--initial-branch=main', destination]);
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'add', '--force', '--pathspec-from-file=-', '--pathspec-file-nul'], {
    cwd: destination, input: Buffer.from(`${paths.join('\0')}\0`),
  });
  // Use Git's own text/binary rules so archived bytes match the published checksums.
  const entries = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: destination, encoding: 'utf8' })
    .split('\0').filter(Boolean).map((line) => {
      const tab = line.indexOf('\t');
      return { object: line.slice(0, tab).split(' ')[1], path: line.slice(tab + 1) };
    });
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd: destination, input: `${entries.map((entry) => entry.object).join('\n')}\n`, maxBuffer: 256 * 1024 * 1024,
  });
  let offset = 0;
  for (const entry of entries) {
    const headerEnd = blobs.indexOf(10, offset);
    const [, type, sizeText] = blobs.subarray(offset, headerEnd).toString('ascii').split(' ');
    const size = Number(sizeText);
    if (headerEnd < 0 || type !== 'blob' || !Number.isSafeInteger(size) || size < 0) throw new Error('Invalid public source blob.');
    const end = headerEnd + 1 + size;
    if (end >= blobs.length || blobs[end] !== 10) throw new Error('Incomplete public source blob.');
    const bytes = blobs.subarray(headerEnd + 1, end);
    const file = join(destination, entry.path);
    if (!(await readFile(file)).equals(bytes)) await writeFile(file, bytes);
    offset = end + 1;
  }
}

async function knownPrivateValues() {
  const values = new Set();
  const collect = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
      if (typeof child === 'string' && /^(api[_-]?key|key|secret(?:[_-]?(?:id|key))?|access[_-]?key(?:[_-]?(?:id|secret))?|token|password)$/i.test(name)
        && child.length >= 16 && !/^(https?:|Bearer|Authorization|[A-Z_]+$|\[REDACTED\])/.test(child)) values.add(child);
      else if (child && typeof child === 'object') collect(child);
    }
  };
  const config = join(repository, '.local/config');
  for (const entry of await readdir(config, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    if (entry.isFile() && entry.name.endsWith('.json')) collect(JSON.parse((await readFile(join(config, entry.name), 'utf8')).replace(/^\uFEFF/, '')));
  }
  for (const path of ['.env', '.local/cloud-access/cloud.env', 'apps/wanju-service/.env']) {
    const text = await readFile(join(repository, path), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([\w]+)\s*=\s*(.*)$/.exec(line);
      if (match && /secret|token|password|api_?key/i.test(match[1])) {
        const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
        if (value.length >= 16) values.add(value);
      }
    }
  }
  return [...values];
}

export async function preparePublicSource(output) {
  const destination = resolve(output);
  const rel = relative(repository, destination);
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('The public snapshot must be outside the development repository.');
  try { await lstat(destination); throw new Error('The snapshot directory already exists; refusing to overwrite it.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const paths = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean))].filter(publicSourcePath).sort();
  const privateValues = await knownPrivateValues();
  const findings = [], files = [];
  for (const path of paths) {
    const source = join(repository, path);
    const facts = await lstat(source);
    if (!facts.isFile()) throw new Error(`Only regular files may enter the public snapshot: ${path}`);
    const bytes = await readFile(source);
    for (const kind of credentialFindings(bytes, privateValues)) findings.push({ path, kind });
    files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  const privateReport = join(repository, '.local/open-source-prep');
  await mkdir(privateReport, { recursive: true });
  const history = execFileSync('git', ['log', '--all', '-p', '--no-ext-diff', '--format=commit:%H'], {
    cwd: repository, maxBuffer: 256 * 1024 * 1024,
  });
  const historyFindings = credentialFindings(history, privateValues);
  await writeFile(join(privateReport, 'audit.json'), `${JSON.stringify({
    checkedAt: new Date().toISOString(), scanner: 'known-private-values-and-token-patterns',
    history: { commits: Number(execFileSync('git', ['rev-list', '--count', '--all'], { cwd: repository, encoding: 'utf8' }).trim()),
      categories: historyFindings, includedInSnapshot: false },
    snapshot: { files: files.length, findings }, gitleaks: 'not-run-locally',
  }, null, 2)}\n`);
  if (findings.length) {
    console.log(JSON.stringify({ snapshotFindings: findings }));
    throw new Error('The source snapshot contains potential credentials; no files were exported.');
  }
  await mkdir(destination, { recursive: true });
  for (const { path } of files) {
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repository, path), target);
  }
  const templates = [
    ['docs/opensource/README.public.md', 'README.md'],
    ['docs/opensource/SECURITY.public.md', 'SECURITY.md'],
    ['docs/opensource/CONTRIBUTING.public.md', 'CONTRIBUTING.md'],
  ];
  for (const [from, to] of templates) await copyFile(join(repository, from), join(destination, to));
  await initializePublicGitSnapshot(destination, [...paths, ...templates.map(([, to]) => to)]);
  for (const file of files) {
    const bytes = await readFile(join(destination, file.path));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== file.sha256) Object.assign(file, { sourceSha256: file.sha256, sourceBytes: file.bytes });
    Object.assign(file, { sha256, bytes: bytes.length });
  }
  // Provenance lists content hashes, without exporting operator commit history or local account details.
  await writeFile(join(destination, 'SOURCE-SNAPSHOT.json'), `${JSON.stringify({
    version: '2.1.0', upstream: 'https://github.com/openfilm/openfilm', upstreamCoreVersion: '0.2.6',
    license: 'MIT for source code; see THIRD_PARTY_NOTICES.md for separately licensed content',
    historyIncluded: false, fileHashBasis: 'Git-normalized public source bytes', files,
  }, null, 2)}\n`);
  execFileSync('git', ['add', '--', 'SOURCE-SNAPSHOT.json'], { cwd: destination });
  return { output: destination, files: files.length + 4, credentialFindings: 0, historyIncluded: false,
    historyFindingCategories: historyFindings, gitleaks: 'not-run-locally' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: 'string' } } });
  if (!values.output) throw new Error('Provide --output for a new directory outside the source repository.');
  console.log(JSON.stringify(await preparePublicSource(values.output)));
}
