import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = process.env.WANJU_DATA_DIR || join(root, '.local');
for (const path of [local, process.env.OPENFILM_LIBRARY || join(root, 'Projects'), process.env.OPENFILM_EXPORTS || join(root, 'Exports')]) mkdirSync(path, { recursive: true });
const ffmpegRoot = join(root, '.local', 'tools', 'ffmpeg');
const ffmpeg = existsSync(ffmpegRoot)
  ? readdirSync(ffmpegRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(ffmpegRoot, entry.name, 'bin')).find((path) => existsSync(join(path, 'ffmpeg.exe')))
  : null;
process.env.PATH = [dirname(process.execPath), ...(ffmpeg ? [ffmpeg] : []), process.env.PATH].join(delimiter);
process.env.OPENFILM_HOME ??= join(local, 'home');
process.env.OPENFILM_SHARED_HOME ??= process.env.OPENFILM_HOME;
process.env.OPENFILM_LIBRARY ??= join(root, 'Projects');
process.env.OPENFILM_EXPORTS ??= join(root, 'Exports');
process.env.OPENFILM_SAVED ??= join(root, 'Saved');
process.env.PLAYWRIGHT_BROWSERS_PATH = join(local, 'browsers');
// An installed Edge also works offline when the optional Chromium download is unavailable.
if (process.platform === 'win32' && existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')) {
  process.env.OPENFILM_BROWSER_CHANNEL ??= 'msedge';
}
process.env.WANJU_CONFIG_DIR ??= join(local, 'config');
process.env.WANJU_ROOT = root;

if (!process.argv.includes('--no-build')) {
  const result = spawnSync(process.execPath, [
    join(root, 'packages/openfilm/node_modules/vite/bin/vite.js'), 'build', '--config', 'studio/ui/vite.config.ts',
  ], { cwd: join(root, 'packages/openfilm'), env: process.env, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('UI build failed. See .local/server.log.');
}

const { startStudio } = await import('../packages/openfilm/studio/server/server.mjs');
const { studioKey } = await import('../packages/openfilm/studio/server/projects.mjs');
const key = studioKey();
let studio;
for (let port = 4848; port < 4880; port += 2) {
  try { studio = await startStudio({ port, key, advertise: true }); break; }
  catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
}
if (!studio) throw new Error('No free local port between 4848 and 4879.');
const url = `${studio.origin}/wanju?key=${key}`;
writeFileSync(join(local, 'wanju-run.json'), JSON.stringify({ pid: process.pid, origin: studio.origin, url }, null, 2), { mode: 0o600 });
console.log(`Wanju Studio ready at ${studio.origin}/wanju`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await studio.close();
  try {
    const run = JSON.parse(readFileSync(join(local, 'wanju-run.json'), 'utf8'));
    if (run.pid === process.pid) writeFileSync(join(local, 'wanju-run.json'), '{}');
  } catch { /* already stopped */ }
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
