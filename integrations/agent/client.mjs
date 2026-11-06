import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const root = process.env.WANJU_ROOT || fileURLToPath(new URL('../../', import.meta.url));
const local = process.env.WANJU_DATA_DIR || join(root, '.local');
const projectId = (id) => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid project or task id.');
  return id;
};

export function localOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || !url.port) {
    throw new Error('The Studio address must be a local 127.0.0.1 origin.');
  }
  return url.origin;
}

async function connection() {
  const run = JSON.parse(await readFile(process.env.WANJU_CONNECTION_FILE || join(local, 'wanju-run.json'), 'utf8'));
  const key = (await readFile(process.env.WANJU_KEY_FILE || join(local, 'home/key'), 'utf8')).trim();
  if (!/^[0-9a-f]{48}$/.test(key)) throw new Error('Invalid local Studio session.');
  return { origin: localOrigin(run.origin), key };
}

export function makeClient({ connect = connection, fetcher = fetch } = {}) {
  return async function request(path, { method = 'GET', body, stream, timeout = 180000 } = {}) {
    if (!/^\/api\/(?:wanju\/|projects(?:\/|$)|open$)/.test(path)) throw new Error('Unsupported Studio API path.');
    const { origin, key } = await connect();
    const response = await fetcher(`${localOrigin(origin)}${path}`, {
      method, headers: { 'x-studio-key': key, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: stream ?? (body !== undefined ? JSON.stringify(body) : undefined),
      ...(stream ? { duplex: 'half' } : {}),
      signal: AbortSignal.timeout(timeout),
      redirect: 'error',
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(typeof data.error === 'string' ? data.error : `Studio returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return data;
  };
}

export const request = makeClient();
let starting;
export async function ensureStudio() {
  try { await request('/api/wanju/status', { timeout: 2000 }); return; } catch { /* start if unavailable */ }
  if (process.env.WANJU_DESKTOP === '1') throw new Error('玩剧桌面服务尚未就绪，请等待窗口加载完成。');
  if (starting) return starting;
  starting = (async () => {
    await mkdir(local, { recursive: true });
    const out = await open(join(local, 'agent-server.log'), 'a');
    const err = await open(join(local, 'agent-server-error.log'), 'a');
    try {
      const child = spawn(process.execPath, [join(root, 'scripts/wanju-start.mjs'), '--no-build'], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', out.fd, err.fd],
      });
      child.on('error', () => {});
      child.unref();
    } finally { await out.close(); await err.close(); }
    for (let i = 0; i < 60; i++) {
      await delay(500);
      try { await request('/api/wanju/status', { timeout: 1000 }); return; } catch { /* wait for the local server */ }
    }
    throw new Error('Studio did not start. Open Start-Wanju.ps1 and inspect .local/agent-server-error.log.');
  })();
  try { await starting; } finally { starting = undefined; }
}

// Signed media URLs and session keys belong to the local browser, not the agent transcript.
export function publicResult(value) {
  if (Array.isArray(value)) return value.map(publicResult);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['folder', 'key', 'url', 'signedUrl'].includes(key))
    .map(([key, child]) => [key, publicResult(child)]));
}

export async function execute(action, input = {}, { api = request, start = ensureStudio } = {}) {
  const allowed = new Set(['status', 'diagnostics', 'list', 'create', 'get', 'save', 'story', 'save_story', 'episode_project', 'import_story', 'read_story_source', 'assets', 'enable_workflow', 'save_assets', 'recover_assets', 'import', 'generate_asset', 'generate_image',
    'generate_video', 'query_task', 'assemble', 'export', 'exports', 'open', 'current']);
  if (!allowed.has(action)) throw new Error(`Unknown action: ${action}`);
  if (['generate_asset', 'generate_image', 'generate_video'].includes(action) && input.confirm_spend !== true) {
    throw new Error('Paid generation requires the user to authorize the service and number of calls first; confirm_spend must be true.');
  }
  if (action === 'generate_video' && input.provider === 'sparkvideo') throw new Error('RunningHub submissions are disabled; choose a configured video service.');
  if (action === 'generate_video' && !['video', 'h3', 'h3_zm_nono', 'seedance'].includes(input.provider ?? 'video')) throw new Error('Unsupported video provider. Use video (configured default), seedance, h3_zm_nono or h3.');
  await start();
  const board = () => `/api/wanju/projects/${projectId(input.project_id)}`;
  const project = () => `/api/projects/${projectId(input.project_id)}`;
  let result;
  switch (action) {
    case 'status':
      result = { ...(await api('/api/wanju/status')), root, paid_calls_require_confirmation: true,
        creative_agent: 'The connected AGI writes the script and storyboard; this service executes local film tools.' };
      break;
    case 'list': result = await api('/api/projects'); break;
    case 'current': {
      const { resolve } = await import('node:path');
      const projects = (await api('/api/projects')).projects;
      const cwd = resolve(process.cwd()).toLowerCase();
      const current = projects.find((p) => typeof p.path === 'string' && resolve(p.path).toLowerCase() === cwd);
      if (!current) throw new Error('当前文件夹不是已登记的玩剧项目，请先在应用中打开项目。');
      result = { project_id: current.id, name: current.name, ...(await api(`/api/wanju/projects/${projectId(current.id)}`)) };
      break;
    }
    case 'create': {
      if (input.workflow !== undefined && !['hedao', 'native'].includes(input.workflow)) throw new Error('Invalid workflow. Use hedao (default) or native.');
      result = await api('/api/wanju/projects', { method: 'POST', body: { name: input.name, ratio: input.ratio ?? '9:16',
        workflow: input.workflow ?? 'hedao', reuseExisting: input.reuse_existing !== false } });
      if (process.env.WANJU_DESKTOP === '1' && result.project?.path) {
        try {
          await api('/api/open', { method: 'POST', body: { path: result.project.path, fallback: 0 } });
          result = { ...result, opened: true };
        } catch {
          result = { ...result, opened: false, warning: '项目已创建，尚未切换界面。请用返回的项目 ID 调用 open；不要再次创建。' };
        }
      }
      break;
    }
    case 'get': result = await api(board()); break;
    case 'story': result = await api(`${board()}/story`); break;
    case 'save_story':
      if (typeof input.revision !== 'string' || !input.revision) throw new Error('Read the story workspace first and supply its revision.');
      result = await api(`${board()}/story`, { method: 'PUT', body: {
        base: input.revision, plan: input.plan, episodes: input.episodes,
      } });
      break;
    case 'episode_project':
      if (typeof input.revision !== 'string' || !input.revision) throw new Error('Read the story workspace first and supply its revision.');
      if (!Number.isSafeInteger(input.episode_number) || input.episode_number < 1) throw new Error('episode_number must be a positive integer.');
      result = await api(`${board()}/story/episodes/${input.episode_number}/project`, {
        method: 'POST', body: { base: input.revision },
      });
      break;
    case 'import_story': {
      const { extname, isAbsolute } = await import('node:path');
      if (typeof input.file !== 'string' || !isAbsolute(input.file)) {
        throw new Error('Story import requires an absolute path to a local TXT or Markdown file.');
      }
      if (!['.txt', '.md'].includes(extname(input.file).toLowerCase())) {
        throw new Error('小说原文目前支持 TXT 和 Markdown 文件。');
      }
      const info = await stat(input.file);
      if (!info.isFile()) throw new Error('Story import requires a local file, not a folder.');
      if (info.size > 20 * 1024 * 1024) throw new Error('小说文件不能超过 20 MiB。');
      if (typeof input.revision !== 'string' || !input.revision) throw new Error('Read the story workspace first and supply its revision.');
      result = await api(`${board()}/story/sources?base=${encodeURIComponent(input.revision)}&name=${encodeURIComponent(basename(input.file))}`, {
        method: 'POST', stream: createReadStream(input.file),
      });
      break;
    }
    case 'read_story_source': {
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 12000;
      result = await api(`${board()}/story/sources/${projectId(input.source_id)}?offset=${offset}&limit=${limit}`);
      break;
    }
    case 'diagnostics': {
      if (input.project_id) result = await api(`${board()}/diagnostics`);
      else {
        const current = await execute('current', {}, { api, start: async () => {} });
        result = await api(`/api/wanju/projects/${projectId(current.project_id)}/diagnostics`);
      }
      break;
    }
    case 'assets': result = await api(`${board()}/assets`); break;
    case 'enable_workflow':
      if (typeof input.revision !== 'string' || !input.revision || !Object.hasOwn(input, 'asset_revision')) throw new Error('Read assets first and supply board revision and asset_revision.');
      result = await api(`${board()}/workflow`, { method: 'POST', body: { base: input.revision, assetBase: input.asset_revision } });
      break;
    case 'save_assets':
      if (typeof input.revision !== 'string' || !input.revision || !Object.hasOwn(input, 'asset_revision')) throw new Error('Read assets first and supply board revision and asset_revision (null for a new catalog).');
      result = await api(`${board()}/assets`, { method: 'PUT', body: {
        base: input.revision, assetBase: input.asset_revision, catalog: input.catalog,
        approveStoryboard: input.approve_storyboard === true, reviewNote: input.review_note,
      } });
      break;
    case 'recover_assets':
      if (typeof input.revision !== 'string' || !input.revision) throw new Error('Read the board first and supply its revision.');
      result = await api(`${board()}/assets/recover`, { method: 'POST', body: { base: input.revision } });
      break;
    case 'save':
      if (typeof input.revision !== 'string' || !input.revision) throw new Error('Read the board first and supply its revision.');
      result = await api(board(), { method: 'PUT', body: { base: input.revision, state: input.state } });
      break;
    case 'import': {
      const { isAbsolute } = await import('node:path');
      if (typeof input.file !== 'string' || !isAbsolute(input.file) || !(await stat(input.file)).isFile()) {
        throw new Error('Import requires an absolute path to a local media file.');
      }
      result = await api(`${board()}/import?name=${encodeURIComponent(basename(input.file))}${input.reference_only === true ? '&reference_only=1' : ''}`, {
        method: 'POST', stream: createReadStream(input.file),
      });
      break;
    }
    case 'generate_asset':
    case 'generate_image':
    case 'generate_video':
      if (typeof input.revision !== 'string' || !input.revision) throw new Error('Read the board first and supply its revision.');
      result = await api(`${board()}/generations`, { method: 'POST', body: {
        base: input.revision, ...(action === 'generate_asset' ? { assetId: projectId(input.asset_id) } : { shot: input.shot_id }),
        provider: action === 'generate_video' ? (input.provider ?? 'video') : 'image',
        ...(input.profile_id ? { profileId: input.profile_id } : {}),
        ...(action === 'generate_video' && input.video_options ? { videoOptions: input.video_options } : {}),
        useReference: input.use_reference === true, confirm: true,
      }, timeout: 240000 });
      break;
    case 'query_task':
      result = await api(`${board()}/generations/${projectId(input.task_id)}/query`, { method: 'POST', body: {} });
      break;
    case 'assemble':
      if (typeof input.revision !== 'string' || !input.revision) throw new Error('Read the board first and supply its revision.');
      result = await api(`${board()}/assemble`, { method: 'POST', body: { base: input.revision } });
      break;
    case 'export': result = await api(`${project()}/exports`, { method: 'POST', body: {
      kind: 'video', codec: 'h264', fps: 25, quality: 'standard', hardware: false,
    } }); break;
    case 'exports': result = await api(`${project()}/exports`); break;
    case 'open': {
      if (process.env.WANJU_DESKTOP === '1') {
        if (!input.project_id) throw new Error('请提供要打开的项目 ID。');
        const projects = (await api('/api/projects')).projects;
        const target = projects.find((p) => p.id === projectId(input.project_id));
        if (!target) throw new Error('项目不存在。');
        await api('/api/open', { method: 'POST', body: { path: target.path, fallback: 0 } });
        result = { opened: true, project_id: target.id, desktop: true };
        break;
      }
      const { origin, key } = await connection();
      const route = input.project_id ? `/projects/${projectId(input.project_id)}` : '/wanju';
      const authenticated = `${origin}${route}?key=${key}`;
      const [command, ...args] = process.platform === 'win32'
        ? ['rundll32.exe', 'url.dll,FileProtocolHandler', authenticated]
        : process.platform === 'darwin' ? ['open', authenticated] : ['xdg-open', authenticated];
      await new Promise((resolve, reject) => {
        const child = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      });
      result = { opened: true, preview: `${origin}${route}` };
      break;
    }
  }
  return publicResult(result);
}
