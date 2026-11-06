import { spawn, spawnSync } from 'node:child_process';
import { closeSync, constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareWanjuResources, repository } from './wanju-resources.mjs';

const require = createRequire(import.meta.url);
const providerNames = [
  'xem8k5_gpt_image_config.json', 'minimax_h3_config.json', 'wan_video_config.json',
  'duomi_grok_video_config.json', 'seedance_video_config.json', 'mxapi_music_config.json', 'cos_config.json',
];

export function prepareDebugWorkspace({ root, sourceData, fallbackConfig } = {}) {
  const workspace = resolve(root);
  const data = join(workspace, 'data');
  const providers = join(data, 'providers');
  for (const path of [data, providers, join(workspace, 'Projects'), join(workspace, 'Exports')]) mkdirSync(path, { recursive: true });
  const copyMissing = (source, target) => {
    if (existsSync(source) && !existsSync(target)) copyFileSync(source, target, constants.COPYFILE_EXCL);
  };
  // Fresh debug accounts use the same prepaid assistant as a new installation.
  for (const name of providerNames) {
    const preferred = join(sourceData, 'providers', name);
    const source = existsSync(preferred) ? preferred : join(fallbackConfig, name);
    copyMissing(source, join(providers, name));
  }
  return { workspace, data, providers };
}

function sourceTime(path) {
  if (!existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return Math.max(stats.mtimeMs, ...readdirSync(path, { withFileTypes: true })
    .filter((entry) => !entry.isSymbolicLink() && !entry.name.endsWith('.test.mjs') && entry.name !== 'dist')
    .map((entry) => sourceTime(join(path, entry.name))));
}

export function debugBuildNeeded(root, stamp) {
  const inputs = ['apps/desktop/shell', 'apps/desktop/chat', 'packages/openfilm/studio/ui/src', 'packages/shared/src',
    'packages/openfilm/studio/ui/vite.config.ts', 'pnpm-lock.yaml'];
  const modified = Math.max(...inputs.map((path) => sourceTime(join(root, path))));
  const output = join(root, 'apps/desktop/shell/dist/index.html');
  let saved;
  try { saved = JSON.parse(readFileSync(stamp, 'utf8')); } catch { return { needed: true, modified }; }
  return { needed: !existsSync(output) || saved.modified !== modified, modified };
}

export function copyDebugProject(source, library) {
  const original = resolve(source);
  const output = resolve(library);
  const rel = relative(original, output);
  if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) throw new Error('The debug library must be outside the source project.');
  if (lstatSync(original).isSymbolicLink() || !statSync(join(original, 'film.html')).isFile()) throw new Error('Select an actual Wanju project folder.');
  mkdirSync(output, { recursive: true });
  let target = join(output, `${basename(original)}-调试副本`);
  for (let i = 2; existsSync(target); i++) target = join(output, `${basename(original)}-调试副本-${i}`);
  const projectState = new Set(['settings.json', 'subtitles.json', 'wanju-assets.json', 'wanju-workflow.json']);
  cpSync(original, target, {
    recursive: true, preserveTimestamps: true, errorOnExist: true, force: false,
    filter(path) {
      if (lstatSync(path).isSymbolicLink()) throw new Error('Linked project files must be imported explicitly.');
      const parts = relative(original, path).split(sep);
      return parts[0] !== '.film' || parts.length === 1 || (parts.length === 2 && projectState.has(parts[1]));
    },
  });
  return target;
}

async function main() {
  const sourceData = join(process.env.APPDATA || join(homedir(), 'AppData/Roaming'), 'WanjuStudio');
  const debug = prepareDebugWorkspace({
    root: process.env.WANJU_DEBUG_ROOT || join(dirname(repository.replace(/[\\/]$/, '')), 'DebugWorkspace'),
    sourceData, fallbackConfig: join(repository, '.local/config'),
  });
  const stamp = join(debug.workspace, 'ui-build.json');
  const build = debugBuildNeeded(repository, stamp);
  if (build.needed) {
    console.log('Preparing the debug interface. No installer is being created.');
    const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
    const result = spawnSync(process.execPath, [vite, 'build', '--config', 'shell/vite.config.ts', '--logLevel', 'warn'], {
      cwd: join(repository, 'apps/desktop'), stdio: 'inherit', windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error('Debug interface build failed. See launch.log.');
    writeFileSync(stamp, JSON.stringify({ modified: build.modified, checkedAt: new Date().toISOString() }));
  }
  const resources = prepareWanjuResources(join(debug.workspace, 'resources'), { studentEdition: false });
  const launcher = join(debug.workspace, 'launcher');
  mkdirSync(launcher, { recursive: true });
  writeFileSync(join(launcher, 'package.json'), JSON.stringify({
    name: 'wanju-debug', productName: '玩剧调试版', version: '0.1.13-dev', type: 'module',
    main: join(repository, 'apps/desktop/src/wanju-main.mjs'),
  }));
  if (process.argv.includes('--prepare-only')) return;
  const env = {
    ...process.env, WANJU_DEBUG: '1', WANJU_DATA_DIR: debug.data, WANJU_LIBRARY: join(debug.workspace, 'Projects'),
    WANJU_CONFIG_DIR: debug.providers, WANJU_EXPORTS: join(debug.workspace, 'Exports'), WANJU_RESOURCES_DIR: resources,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const output = openSync(join(debug.workspace, 'desktop.log'), 'a');
  const errors = openSync(join(debug.workspace, 'desktop-errors.log'), 'a');
  let child;
  try {
    // Only helpers may be hidden. A hidden GUI process can keep its first native window invisible.
    child = spawn(require('electron'), [launcher], {
      cwd: repository, env, stdio: ['ignore', output, errors], detached: true, windowsHide: false,
    });
  } finally {
    closeSync(output);
    closeSync(errors);
  }
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  console.log('Wanju desktop started. This launcher can close without closing the app.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('Debug startup failed. See DebugWorkspace/startup-errors.log and desktop-errors.log.'); process.exitCode = 1; });
}
