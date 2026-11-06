import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../../', import.meta.url));
const resources = app.isPackaged ? join(process.resourcesPath, 'wanju')
  : resolve(process.env.WANJU_RESOURCES_DIR || join(source, '.local', 'desktop-resources'));
const publicServiceFile = join(resources, 'student-service.public.json');
let packagedChannel = 'preview';
if (app.isPackaged) {
  try { packagedChannel = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).wanjuChannel || 'preview'; }
  catch { /* Older packages do not declare their product channel. */ }
}
let studentService = '';
let studentEdition = false;
if (existsSync(publicServiceFile)) {
  try { const publicConfig = JSON.parse(readFileSync(publicServiceFile, 'utf8')); studentService = publicConfig.serviceUrl || ''; studentEdition = publicConfig.studentEdition === true; }
  catch { throw new Error('Invalid public student service configuration.'); }
}
const data = resolve(process.env.WANJU_DATA_DIR || join(app.getPath('appData'), studentEdition ? 'WanjuStudentStudio' : 'WanjuStudio'));
const library = resolve(process.env.WANJU_LIBRARY || (app.isPackaged
  ? join(app.getPath('documents'), 'Wanju', 'Projects') : join(source, 'Projects')));
Object.assign(process.env, {
  WANJU_DESKTOP: '1', WANJU_ROOT: resources, WANJU_DATA_DIR: data, WANJU_LIBRARY: library,
  WANJU_CONNECTION_FILE: join(data, 'wanju-run.json'), WANJU_KEY_FILE: join(data, 'home', 'key'),
  WANJU_CONFIG_DIR: process.env.WANJU_CONFIG_DIR || join(data, 'providers'),
  OPENFILM_SKILLS: join(data, 'Skills'),
  OPENFILM_EXPORTS: process.env.WANJU_EXPORTS || join(app.getPath('documents'), 'Wanju', 'Exports'),
  OPENFILM_NO_UPDATE_CHECK: '1',
  WANJU_STUDENT_SERVICE_URL: process.env.WANJU_STUDENT_SERVICE_URL || studentService,
  WANJU_STUDENT_EDITION: studentEdition ? '1' : '0',
  WANJU_PRODUCT_VERSION: process.env.WANJU_PRODUCT_VERSION || (app.isPackaged ? app.getVersion() : '0.1.13-dev'),
  WANJU_PRODUCT_CHANNEL: process.env.WANJU_PRODUCT_CHANNEL || (app.isPackaged ? packagedChannel : 'source'),
  // Legacy data folders stay intact; creator rights are now the same in every Wanju client.
  WANJU_ACCOUNT_MODE: 'unified',
});
for (const dir of [data, library, process.env.OPENFILM_SKILLS, process.env.OPENFILM_EXPORTS]) mkdirSync(dir, { recursive: true });
const bundledBrowser = app.isPackaged && existsSync(join(process.resourcesPath, 'runtime', 'ms-playwright'));
const edge = join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
if (!bundledBrowser && existsSync(edge)) process.env.OPENFILM_BROWSER_CHANNEL = 'msedge';
// Source runs can reuse the existing local FFmpeg; the installer carries its own.
if (!app.isPackaged) {
  const ffmpeg = join(source, '.local', 'tools', 'ffmpeg', 'ffmpeg-9.0.2-essentials_build', 'bin');
  if (existsSync(join(ffmpeg, 'ffmpeg.exe'))) process.env.PATH = `${ffmpeg};${process.env.PATH}`;
}
await import('./main.mjs');
