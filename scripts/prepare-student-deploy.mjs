import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const target = join(dirname(repository), '老师后台部署包');
const service = join(repository, 'apps/wanju-service');
const files = [
  ['server.mjs', join(service, 'server.mjs')],
  ['store.mjs', join(service, 'store.mjs')],
  ['chat-diagnostics.mjs', join(service, 'chat-diagnostics.mjs')],
  ['manual-enrollment.mjs', join(service, 'manual-enrollment.mjs')],
  ...['cloud.mjs', 'cloud-client.mjs', 'pricing.mjs', 'media-config.mjs', 'media-profiles.mjs', 'media-relay.mjs', 'chat-tiers.mjs']
    .map((name) => [name, join(service, name)]),
  ['package.json', join(service, 'package.json')],
  ['Dockerfile', join(service, 'Dockerfile')],
  ['.dockerignore', join(service, '.dockerignore')],
  ['.railwayignore', join(service, '.railwayignore')],
  ['.gitignore', join(service, '.gitignore')],
  ['.env.example', join(service, '.env.example')],
  ['compose.yaml', join(service, 'compose.yaml')],
  ['Caddyfile', join(service, 'Caddyfile')],
  ['ops/backup.mjs', join(service, 'ops/backup.mjs')],
  ['ops/backup.sh', join(service, 'ops/backup.sh')],
  ['ops/wanju-backup.service', join(service, 'ops/wanju-backup.service')],
  ['ops/wanju-backup.timer', join(service, 'ops/wanju-backup.timer')],
  ['public/admin.html', join(service, 'public/admin.html')],
  ['public/admin.js', join(service, 'public/admin.js')],
  ['public/media-admin.js', join(service, 'public/media-admin.js')],
  ['public/admin.css', join(service, 'public/admin.css')],
  ...['download.html', 'download.css', 'download.js', 'downloads.json', 'wanju.png', 'student-guide.html', 'teacher-guide.html', 'account.html', 'account.js', 'account.css', 'enrollment.js', 'preview.html', 'preview.js']
    .map((name) => [`public/${name}`, join(service, 'public', name)]),
  ['LICENSE', join(repository, 'LICENSE')],
  ['OPENFILM-TRADEMARK.md', join(repository, 'packages/openfilm/TRADEMARK.md')],
  ['部署说明.md', join(service, 'DEPLOY-RAILWAY.md')],
  ['轻量云部署.md', join(service, 'DEPLOY-LINUX.md')],
];
const allowed = new Set([...files.map(([name]) => name), 'bundle-manifest.json']);
const list = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const name = `${prefix}${entry.name}`;
  if (entry.isSymbolicLink()) throw new Error(`Deployment folder contains a link: ${name}`);
  return entry.isDirectory() ? list(join(dir, entry.name), `${name}/`) : [name];
});
if (existsSync(target)) {
  const unexpected = list(target).filter((name) => !allowed.has(name));
  if (unexpected.length) throw new Error('Deployment folder has additional files. Inspect them before rebuilding; nothing was deleted.');
}
for (const [, from] of files) if (!existsSync(from)) throw new Error('A required deployment source is missing.');
mkdirSync(target, { recursive: true });
for (const [name, from] of files) {
  mkdirSync(dirname(join(target, name)), { recursive: true });
  cpSync(from, join(target, name));
}
const manifest = {
  preparedAt: new Date().toISOString(),
  uploaded: false,
  includesPrivateConfig: false,
  includesDatabase: false,
  files: files.map(([name]) => ({
    name,
    sha256: createHash('sha256').update(readFileSync(join(target, name))).digest('hex'),
  })),
};
writeFileSync(join(target, 'bundle-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ target, files: manifest.files.length + 1, uploaded: false, includesPrivateConfig: false }));
