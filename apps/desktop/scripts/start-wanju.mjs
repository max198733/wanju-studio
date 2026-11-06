import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { prepareWanjuResources, repository } from './wanju-resources.mjs';

const require = createRequire(import.meta.url);
prepareWanjuResources(undefined, { studentEdition: process.env.WANJU_STUDENT_EDITION === '1' });
if (!process.argv.includes('--no-build')) {
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  const build = spawnSync(process.execPath, [vite, 'build', '--config', 'shell/vite.config.ts'], { cwd: join(repository, 'apps/desktop'), stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status || 1);
}
const launcher = join(repository, '.local', 'desktop-launcher');
mkdirSync(launcher, { recursive: true });
writeFileSync(join(launcher, 'package.json'), JSON.stringify({
  name: 'wanju-studio', productName: '玩剧', version: '0.1.0', type: 'module',
  main: join(repository, 'apps/desktop/src/wanju-main.mjs'),
}));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [launcher], { cwd: repository, env, stdio: 'inherit', windowsHide: true });
child.on('exit', (code) => process.exit(code || 0));
child.on('error', (error) => { console.error(error.message); process.exit(1); });
