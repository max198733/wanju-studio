import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

const MAX_FILE = 512 * 1024 ** 2;
const UPLOAD_CHUNK_BYTES = 8 * 1024 ** 2;
const jobs = new Set();
export function cloudPathAllowed(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || value !== value.normalize('NFC')
    || /[\\:\u0000-\u001f\u007f]/.test(value)) return false;
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part)
    || /[<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return false;
  if (parts.some((part) => /^(node_modules|\.git|\.local|\.ssh|\.codex|providers|credentials)$/i.test(part)
    || /^\.env(?:\.|$)/i.test(part) || /(?:_config\.json|student-session|admin\.key|authorized_keys)$/i.test(part)
    || /^(media-profiles\.json|media-task-profiles|byok-keys|providers\.json)$/i.test(part))) return false;
  if (parts[0].toLowerCase() === '.film') return !/^(?:cache|logs|chat|cloud|wanju-image-results)(?:\/|$)/i.test(parts.slice(1).join('/'))
    && !/^wanju-cloud/i.test(parts[1] ?? '');
  return !parts[0].startsWith('.');
}
const checksum = async (file) => {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(file)) digest.update(bytes);
  return digest.digest('hex');
};
const writeState = async (root, value) => {
  const file = join(root, '.film/wanju-cloud.json'), temporary = `${file}.${randomUUID()}.next`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, file);
};
async function stateOf(root) {
  try {
    const value = JSON.parse(await readFile(join(root, '.film/wanju-cloud.json'), 'utf8'));
    if (!value || value.version !== 1 || typeof value.origin !== 'string' || typeof value.owner !== 'string'
      || typeof value.projectId !== 'string' || !/^[\w-]{6,80}$/.test(value.projectId)
      || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !Array.isArray(value.baseline) || !Array.isArray(value.receipts)
      || [...value.baseline, ...value.receipts].some((id) => typeof id !== 'string' || !id)
      || (value.pending && (typeof value.pending.requestKey !== 'string' || !value.pending.requestKey
        || !Number.isSafeInteger(value.pending.parentRevision) || value.pending.parentRevision < 0
        || !/^[a-f0-9]{64}$/.test(value.pending.fingerprint)))) throw new Error('invalid sync record');
    return value;
  }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw Object.assign(new Error('本地云同步记录无法读取，已停止同步以免重复计费。'), { status: 409 });
  }
}
async function tasksOf(root) {
  try {
    const tasks = JSON.parse(await readFile(join(root, '.film/wanju-tasks.json'), 'utf8'));
    if (!Array.isArray(tasks)) throw new Error('invalid tasks');
    return tasks;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error('任务记录无法读取，已停止同步；没有重新生成素材。');
  }
}
async function inventory(root, hashContents = true) {
  const files = [];
  const walk = async (part = '') => {
    const entries = await readdir(join(root, part), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = part ? `${part}/${entry.name}` : entry.name;
      if (!cloudPathAllowed(path)) continue;
      if (entry.isSymbolicLink()) throw new Error('项目中包含文件链接，请将真实素材复制到项目后再同步。');
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.isFile()) continue;
      const file = join(root, path), before = await stat(file);
      if (before.size > MAX_FILE) throw new Error(`文件超过首版单文件 512 MB 限制：${path}`);
      const hash = hashContents ? await checksum(file) : undefined, after = await stat(file);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('项目仍在修改，请待本次创作完成后同步。');
      files.push({ path, hash, size: after.size, mtime: after.mtimeMs, ctime: after.ctimeMs });
      if (files.length > 10000) throw new Error('项目文件超过首版 10000 个文件限制。');
    }
  };
  await walk();
  if (!files.some((file) => file.path === 'film.html')) throw new Error('这个文件夹不是原生玩剧项目，缺少 film.html。');
  const names = files.map((file) => file.path.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('项目存在 Windows 下重名的文件，不能跨电脑恢复。');
  return files;
}

export async function cloudLocalSnapshot(root, title) {
  const files = await inventory(root, false);
  return createHash('sha256').update(JSON.stringify([title, files])).digest('hex');
}

async function downloadDirectory(root, relative = '') {
  let path = root;
  for (const part of ['', ...relative.split('/').filter(Boolean)]) {
    if (part) path = join(path, part);
    await mkdir(path).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    const facts = await lstat(path);
    if (!facts.isDirectory() || facts.isSymbolicLink()) throw new Error('下载临时目录包含文件链接，已停止恢复。');
  }
  return path;
}
async function downloadFileFacts(path) {
  try {
    const facts = await lstat(path);
    if (!facts.isFile() || facts.isSymbolicLink()) throw new Error('下载临时文件包含链接或异常类型，已停止恢复。');
    return facts;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function verifyDownloadTree(root, files, relative = '') {
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('下载临时目录包含文件链接，已停止恢复。');
    if (entry.isDirectory() && files.some((file) => file.path.startsWith(`${path}/`))) {
      await verifyDownloadTree(root, files, path);
    } else if (!entry.isFile() || !files.some((file) => file.path === path)) {
      throw new Error('下载临时目录包含清单外文件，已停止恢复。');
    }
  }
}
function interruptedDownload() {
  return Object.assign(new Error('云下载连接中断，已保留进度；再次下载同一版本可继续。'), { resumableCloudDownload: true });
}
async function downloadObject({ file, dest, partial, request }) {
  const existing = await downloadFileFacts(dest);
  if (existing) {
    if (existing.size === file.size && await checksum(dest) === file.hash) return;
    await rm(dest);
  }
  let offset = (await downloadFileFacts(partial))?.size ?? 0;
  if (offset > file.size) { await rm(partial); offset = 0; }
  if (offset !== file.size || !await downloadFileFacts(partial)) {
    let response;
    try {
      response = await request(`/api/cloud/objects/${file.hash}`, offset ? { headers: { range: `bytes=${offset}-` } } : {});
    } catch { throw interruptedDownload(); }
    if ([408, 429].includes(response.status) || response.status >= 500) {
      await response.body?.cancel().catch(() => {});
      throw interruptedDownload();
    }
    if (![200, 206].includes(response.status) || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error('素材下载失败，已有本地项目未改变。');
    }
    if (response.status === 206 && response.headers.get('content-range') !== `bytes ${offset}-${file.size - 1}/${file.size}`) {
      await response.body.cancel().catch(() => {});
      throw new Error('云下载续传范围无效，未打开不完整工程。');
    }
    // Older servers may ignore Range: restart this file, never append the entire response.
    if (response.status === 200) offset = 0;
    const handle = await open(partial, offset ? 'a' : 'w', 0o600);
    const iterator = response.body[Symbol.asyncIterator]();
    let size = offset;
    try {
      while (true) {
        let item;
        try { item = await iterator.next(); } catch { throw interruptedDownload(); }
        if (item.done) break;
        size += item.value.length;
        if (size > file.size) throw new Error('下载文件超过清单大小。');
        await handle.writeFile(item.value);
      }
      await handle.sync();
      if (size !== file.size) throw interruptedDownload();
    } finally {
      await handle.close();
      await iterator.return?.().catch(() => {});
    }
  }
  if (await checksum(partial) !== file.hash) throw new Error('下载文件校验失败，未打开不完整工程。');
  await rename(partial, dest);
}

/** request returns a Response; it is supplied by the protected desktop account, never by the renderer. */
export function createCloudSync({ origin, userId, request, onProgress = () => {} }) {
  const readResult = async (response, message = '云项目请求失败。') => {
    const result = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(result?.error?.message || message), { status: response.status });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw Object.assign(new Error('云项目服务返回无效结果，已停止本次同步。'), { status: 502 });
    }
    return result;
  };
  const json = async (path, value) => {
    const response = await request(path, value === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    return readResult(response);
  };
  const owned = (state) => state?.owner === userId && state?.origin === origin;
  const exclusive = async (root, action) => {
    if (jobs.has(root)) throw new Error('这个项目正在同步，请等待完成。');
    jobs.add(root);
    try { return await action(); } finally { jobs.delete(root); }
  };
  return {
    list: () => json('/api/cloud/projects'),
    trashList: () => json('/api/cloud/trash'),
    versions: ({ projectId, before }) => json(`/api/cloud/projects/${encodeURIComponent(projectId)}/versions${before === undefined ? '' : `?before=${encodeURIComponent(before)}`}`),
    trash: ({ projectId, revision }) => json(`/api/cloud/projects/${encodeURIComponent(projectId)}/trash`, { revision }),
    restore: ({ projectId, trashToken }) => json(`/api/cloud/projects/${encodeURIComponent(projectId)}/restore`, { trashToken }),
    purge: ({ projectId, trashToken, confirmTitle }) => json(`/api/cloud/projects/${encodeURIComponent(projectId)}/purge`, { trashToken, confirmTitle }),
    cleanupPreview: () => json('/api/cloud/storage/preview'),
    cleanup: ({ token, confirm }) => json('/api/cloud/storage/cleanup', { token, confirm }),
    status: () => json('/api/cloud/status'),
    consent: (priceVersion) => json('/api/cloud/consent', { priceVersion }),
    async binding({ root }) {
      const state = await stateOf(await realpath(root));
      return { owned: owned(state), revision: owned(state) ? state.revision : 0, pending: owned(state) && Boolean(state.pending) };
    },
    async push({ root, title, expectedPriceVersion }) {
      root = await realpath(root);
      return exclusive(root, async () => {
        const cloudStatus = await json('/api/cloud/status');
        const uploadProtocol = cloudStatus.capabilities?.resumableUpload;
        const chunkedUpload = uploadProtocol?.version === 1;
        const chunkBytes = chunkedUpload ? uploadProtocol.chunkBytes : UPLOAD_CHUNK_BYTES;
        if (chunkedUpload && (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1)) {
          throw Object.assign(new Error('云端上传协议配置无效，已停止同步。'), { status: 422 });
        }
        if (expectedPriceVersion !== undefined && (cloudStatus.prices.priceVersion !== expectedPriceVersion
          || (cloudStatus.prices.enabled && !cloudStatus.authorized))) {
          throw Object.assign(new Error('服务费价格或授权已变化，自动保存已暂停，请重新确认后开启。'), { status: 409 });
        }
        let state = await stateOf(root);
        if (state && !owned(state)) throw Object.assign(new Error('此本地项目已绑定其他账号或服务。请用原账号同步，或先另存为新项目。'), { status: 409 });
        if (state?.revision > 0 && !state.pending) {
          const current = await json(`/api/cloud/projects/${state.projectId}`);
          if (current.revision !== state.revision) throw Object.assign(new Error('另一台电脑已更新此项目，请先下载最新副本后再合并。本地文件仍保留。'), { status: 409 });
        }
        if (!state) {
          const tasks = await tasksOf(root);
          state = { version: 1, origin, owner: userId, projectId: randomUUID(), revision: 0,
            baseline: tasks.map((task) => task.id), receipts: [] };
          await writeState(root, state);
        }
        onProgress({ phase: 'scanning', completed: 0 });
        const files = await inventory(root);
        const publicFiles = files.map(({ path, hash, size }) => ({ path, hash, size }));
        const { present } = await json('/api/cloud/objects/check', { hashes: [...new Set(files.map((file) => file.hash))] });
        const known = new Set(present);
        let uploaded = 0;
        for (const file of files) {
          if (known.has(file.hash)) continue;
          onProgress({ phase: 'uploading', completed: uploaded, total: files.length, path: file.path });
          // Old servers expose only whole-file PUT; never infer support from a failed object request.
          const status = chunkedUpload ? await json(`/api/cloud/objects/${file.hash}/upload`) : null;
          if (status?.complete) { known.add(file.hash); uploaded++; continue; }
          if (!chunkedUpload || file.size === 0) {
            const stream = createReadStream(join(root, file.path));
            let response;
            try {
              response = await request(`/api/cloud/objects/${file.hash}`, {
                method: 'PUT', headers: { 'content-type': 'application/octet-stream', 'content-length': String(file.size) },
                body: stream, duplex: 'half',
              });
            } finally { stream.destroy(); }
            const result = await readResult(response, '文件上传失败，本地素材已保留。');
            if (result.hash !== file.hash || result.size !== file.size) {
              throw Object.assign(new Error('云端返回了无效的上传回执，已停止同步。'), { status: 502 });
            }
            known.add(file.hash); uploaded++;
            continue;
          }
          let offset = status.offset;
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size
            || (status.size !== null && status.size !== file.size)) throw new Error('云端上传断点与本地文件不一致，请重新同步。');
          while (offset < file.size) {
            const end = Math.min(offset + Math.min(chunkBytes, UPLOAD_CHUNK_BYTES), file.size) - 1;
            const stream = createReadStream(join(root, file.path), { start: offset, end });
            let response;
            try {
              response = await request(`/api/cloud/objects/${file.hash}`, {
                method: 'PUT',
                headers: {
                  'content-type': 'application/octet-stream',
                  'content-length': String(end - offset + 1),
                  'content-range': `bytes ${offset}-${end}/${file.size}`,
                },
                body: stream, duplex: 'half',
              });
            } finally { stream.destroy(); }
            const result = await readResult(response, '文件上传失败，本地素材已保留。');
            if (!Number.isSafeInteger(result.offset) || result.offset <= offset || result.offset > file.size)
              throw Object.assign(new Error('云端返回了无效的上传断点，已停止同步。'), { status: 502 });
            offset = result.offset;
          }
          known.add(file.hash); uploaded++;
        }
        const latest = await inventory(root);
        if (JSON.stringify(latest.map(({ path, hash, size }) => ({ path, hash, size }))) !== JSON.stringify(publicFiles)) {
          throw new Error('同步期间项目发生改变，本次未覆盖云版本。请稍后再同步。');
        }
        const content = JSON.stringify([title, publicFiles]);
        const fingerprint = createHash('sha256').update(content).digest('hex');
        if (state.fingerprint !== fingerprint || state.pending) {
          if (!state.pending || state.pending.fingerprint !== fingerprint) {
            state.pending = { requestKey: randomUUID(), parentRevision: state.revision, fingerprint };
            await writeState(root, state);
          }
          const result = await json(`/api/cloud/projects/${state.projectId}`, {
            title, parentRevision: state.pending.parentRevision, requestKey: state.pending.requestKey, files: publicFiles,
          });
          state.revision = result.revision; state.fingerprint = fingerprint;
          delete state.pending;
          await writeState(root, state);
        }
        const billingWarnings = [];
        let charged = 0;
        for (const task of await tasksOf(root)) {
          if (task.status !== 'done' || state.baseline.includes(task.id) || state.receipts.includes(task.id)) continue;
          const artifact = files.find((file) => file.path === task.path);
          if (!artifact || !/^assets\//.test(artifact.path)) continue;
          const kind = /\.(png|jpe?g|webp)$/i.test(artifact.path) ? 'image' : /\.(mp4|mov|webm)$/i.test(artifact.path) ? 'video' : null;
          if (!kind) continue;
          try {
            const receipt = await json('/api/cloud/generations/success', {
              projectId: state.projectId, taskId: task.id, hash: artifact.hash, kind, status: 'done',
              priceVersion: cloudStatus.prices.priceVersion,
            });
            state.receipts.push(task.id); charged += receipt.repeated ? 0 : receipt.charged;
            await writeState(root, state);
          } catch (error) { billingWarnings.push({ taskId: task.id, message: error.message }); }
        }
        state.syncedAt = Date.now(); await writeState(root, state);
        onProgress({ phase: 'done', completed: files.length, total: files.length });
        return { id: state.projectId, revision: state.revision, files: files.length, uploaded, charged, billingWarnings, syncedAt: state.syncedAt };
      });
    },
    async pull({ projectId, parent, revision }) {
      if (!/^[\w-]{6,80}$/.test(projectId)) throw new Error('云项目编号无效。');
      parent = await realpath(parent);
      return exclusive(`${parent}:${projectId}`, async () => {
        const manifest = await json(`/api/cloud/projects/${projectId}${revision === undefined ? '' : `?revision=${Number(revision)}`}`);
        if (!Array.isArray(manifest.files) || manifest.files.length > 10000) throw new Error('云端项目清单无效。');
        const seen = new Set();
        for (const file of manifest.files) {
          if (!cloudPathAllowed(file.path) || seen.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.hash)
            || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE) throw new Error('云端项目包含不安全或无效的文件路径。');
          seen.add(file.path.toLowerCase());
        }
        if (!Number.isSafeInteger(manifest.revision) || manifest.revision < 1) throw new Error('云端项目版本无效。');
        const identity = createHash('sha256').update(JSON.stringify([origin, userId, projectId, manifest.revision, manifest.files])).digest('hex');
        const stage = join(parent, `.wanju-download-${identity}`);
        await downloadDirectory(stage);
        // Separate partial objects from project paths so filenames cannot collide with recovery data.
        const content = await downloadDirectory(stage, 'files');
        const partials = await downloadDirectory(stage, 'partials');
        try {
          let completed = 0;
          for (const file of manifest.files) {
            const dest = resolve(content, ...file.path.split('/'));
            if (!dest.startsWith(content + sep)) throw new Error('云端项目路径越界。');
            await downloadDirectory(content, file.path.split('/').slice(0, -1).join('/'));
            await downloadObject({ file, dest, partial: join(partials, file.hash), request });
            onProgress({ phase: 'downloading', completed: ++completed, total: manifest.files.length });
          }
          if (!seen.has('film.html')) throw new Error('云项目缺少 film.html，无法恢复。');
          await verifyDownloadTree(content, manifest.files);
          await downloadDirectory(content, '.film');
          await writeState(content, { version: 1, origin, owner: userId, projectId, revision: manifest.revision,
            baseline: (await tasksOf(content)).map((task) => task.id), receipts: [], syncedAt: Date.now() });
          const clean = String(manifest.title).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/, '').slice(0, 60) || '云项目';
          // Always a fresh directory; never overwrite an existing project or a partially downloaded copy.
          const target = join(parent, `${clean}-云端-${randomUUID().slice(0, 8)}`);
          await rename(content, target);
          await rm(stage, { recursive: true, force: true });
          return { path: target, id: projectId, revision: manifest.revision };
        } catch (error) {
          if (!error.resumableCloudDownload) await rm(stage, { recursive: true, force: true });
          throw error;
        }
      });
    },
  };
}
