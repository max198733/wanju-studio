import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { cloudPathAllowed } from './cloud-client.mjs';
export { cloudPathAllowed } from './cloud-client.mjs';

const GIB = 1024 ** 3;
export const MAX_BLOB_BYTES = 512 * 1024 ** 2;
export const DEFAULT_CLOUD_PRICES = Object.freeze({ enabled: false, imagePoints: 5, videoPoints: 1 });
export const CLOUD_CLEANUP_GRACE_MS = 24 * 3600000;
export const CLOUD_UPLOAD_CHUNK_BYTES = 8 * 1024 ** 2;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const checksum = async (file) => {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
};
export const validBlobHash = (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash);

export function createCloudStore({ db, transaction, addEntry, user, fail }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_objects (
      user_id TEXT NOT NULL REFERENCES users(id), hash TEXT NOT NULL, size INTEGER NOT NULL,
      created INTEGER NOT NULL, PRIMARY KEY(user_id, hash)
    );
    CREATE TABLE IF NOT EXISTS cloud_projects (
      user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, title TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, PRIMARY KEY(user_id,id)
    );
    CREATE TABLE IF NOT EXISTS cloud_versions (
      user_id TEXT NOT NULL, project_id TEXT NOT NULL, revision INTEGER NOT NULL,
      request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, manifest TEXT NOT NULL, created INTEGER NOT NULL,
      PRIMARY KEY(user_id,project_id,revision), UNIQUE(user_id,project_id,request_key),
      FOREIGN KEY(user_id,project_id) REFERENCES cloud_projects(user_id,id)
    );
    CREATE TABLE IF NOT EXISTS cloud_receipts (
      user_id TEXT NOT NULL REFERENCES users(id), task_id TEXT NOT NULL, project_id TEXT NOT NULL,
      kind TEXT NOT NULL, hash TEXT NOT NULL, charged INTEGER NOT NULL,
      price_version TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(user_id,task_id)
    );
    CREATE TABLE IF NOT EXISTS cloud_consents (
      user_id TEXT PRIMARY KEY REFERENCES users(id), price_version TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cloud_options (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_project_trash (
      user_id TEXT NOT NULL, project_id TEXT NOT NULL, token TEXT NOT NULL, deleted INTEGER NOT NULL,
      PRIMARY KEY(user_id,project_id),
      FOREIGN KEY(user_id,project_id) REFERENCES cloud_projects(user_id,id)
    );
    CREATE TABLE IF NOT EXISTS cloud_project_tombstones (
      user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL, deleted INTEGER NOT NULL,
      PRIMARY KEY(user_id,project_id)
    );
    CREATE TABLE IF NOT EXISTS cloud_maintenance (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_uploads (
      user_id TEXT NOT NULL REFERENCES users(id), hash TEXT NOT NULL, size INTEGER NOT NULL,
      updated INTEGER NOT NULL, PRIMARY KEY(user_id,hash)
    );
    CREATE INDEX IF NOT EXISTS cloud_upload_updated ON cloud_uploads(updated);
  `);
  const prices = () => {
    const saved = db.prepare("SELECT value FROM cloud_options WHERE id='prices'").get();
    const value = saved ? JSON.parse(saved.value) : { ...DEFAULT_CLOUD_PRICES };
    return { ...value, priceVersion: digest(JSON.stringify(value)), pointsPerYuan: 100 };
  };
  const usage = (id) => db.prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM cloud_objects WHERE user_id=?').get(id).bytes;
  const pendingUsage = (id, except = '') => db.prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM cloud_uploads WHERE user_id=? AND hash<>?').get(id, except).bytes;
  const quota = (id) => {
    const row = db.prepare('SELECT value FROM cloud_options WHERE id=?').get(`quota:${id}`);
    return row ? Number(row.value) : GIB;
  };
  const projectId = (id) => {
    if (typeof id !== 'string' || !/^[\w-]{6,80}$/.test(id)) fail('云项目编号无效。');
    return id;
  };
  const blob = (id, hash) => {
    if (!validBlobHash(hash)) fail('文件校验值无效。');
    return db.prepare('SELECT hash,size FROM cloud_objects WHERE user_id=? AND hash=?').get(id, hash);
  };
  const checkSpace = (id, size, hash = '') => {
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BLOB_BYTES) fail('单个文件大小超出限制。', 413);
    if (usage(id) + pendingUsage(id, hash) + size > quota(id)) fail('云空间不足（包含未完成上传）；本地文件仍保留，请清理空间或扩容后同步。', 413);
  };
  const requireProject = (id, pid, allowTrash = false) => {
    projectId(pid);
    const row = db.prepare('SELECT id,title,revision,updated FROM cloud_projects WHERE user_id=? AND id=?').get(id, pid);
    if (!row) fail('云项目不存在或无权访问。', 404);
    if (!allowTrash && db.prepare('SELECT 1 FROM cloud_project_trash WHERE user_id=? AND project_id=?').get(id, pid))
      fail('项目已移入云端回收站，请先恢复；本地文件仍保留。', 410);
    return row;
  };
  const cleanupPlan = (id) => {
    const files = db.prepare(`SELECT hash,size,created FROM cloud_objects WHERE user_id=? AND created<=?
      AND hash NOT IN (
        SELECT json_extract(f.value,'$.hash') FROM cloud_versions v,json_each(v.manifest,'$.files') f WHERE v.user_id=?
      ) ORDER BY created,hash LIMIT 201`).all(id, Date.now() - CLOUD_CLEANUP_GRACE_MS, id);
    const batch = files.slice(0, 200);
    return { files: batch, token: digest(JSON.stringify([id, batch])), bytes: batch.reduce((sum, f) => sum + f.size, 0),
      more: files.length > 200, graceHours: 24 };
  };
  return {
    prices, usage, quota, blob, checkSpace,
    uploadOwners: () => db.prepare('SELECT id FROM users').all().map((row) => row.id),
    runUploadMaintenance(remove) {
      return transaction(() => {
        if (db.prepare("SELECT 1 FROM cloud_maintenance WHERE id='backup' AND expires>?").get(Date.now())) return false;
        remove();
        return true;
      });
    },
    expiredUploads: (cutoff) => db.prepare('SELECT user_id AS userId,hash,size,updated FROM cloud_uploads WHERE updated<=? ORDER BY updated LIMIT 200').all(cutoff),
    expireUpload(id, hash, cutoff, remove) {
      return transaction(() => {
        if (db.prepare("SELECT 1 FROM cloud_maintenance WHERE id='backup' AND expires>?").get(Date.now())) return false;
        const row = db.prepare('SELECT size,updated FROM cloud_uploads WHERE user_id=? AND hash=?').get(id, hash);
        if (!row || row.updated > cutoff) return false;
        remove();
        db.prepare('DELETE FROM cloud_uploads WHERE user_id=? AND hash=?').run(id, hash);
        return true;
      });
    },
    backupActive: () => Boolean(db.prepare("SELECT 1 FROM cloud_maintenance WHERE id='backup' AND expires>?").get(Date.now())),
    reserveUpload(id, hash, size, recoveredAt = null) {
      if (!validBlobHash(hash) || !Number.isSafeInteger(size) || size < 0 || size > MAX_BLOB_BYTES) fail('上传文件信息无效。', 413);
      return transaction(() => {
        const existing = blob(id, hash);
        if (existing) {
          if (existing.size !== size) fail('文件大小不匹配。', 409);
          return existing;
        }
        const prior = db.prepare('SELECT size FROM cloud_uploads WHERE user_id=? AND hash=?').get(id, hash);
        if (recoveredAt !== null && prior) return prior;
        if (prior && prior.size !== size) fail('同一文件的总大小不能变化。', 409);
        if (recoveredAt === null) {
          checkSpace(id, size, hash);
          if (!prior && db.prepare('SELECT COUNT(*) AS n FROM cloud_uploads WHERE user_id=?').get(id).n >= 256)
            fail('未完成上传过多，请完成现有同步或等待过期临时文件回收。', 429);
        }
        db.prepare(`INSERT INTO cloud_uploads VALUES (?,?,?,?) ON CONFLICT(user_id,hash)
          DO UPDATE SET size=excluded.size,updated=excluded.updated`).run(id, hash, size, recoveredAt ?? Date.now());
        return { hash, size };
      });
    },
    releaseUpload(id, hash) {
      db.prepare('DELETE FROM cloud_uploads WHERE user_id=? AND hash=?').run(id, hash);
    },
    status(id) {
      const p = prices();
      const completedBytes = usage(id), reservedBytes = pendingUsage(id);
      return { usedBytes: completedBytes + reservedBytes, completedBytes, reservedBytes, quotaBytes: quota(id), prices: p,
        authorized: db.prepare('SELECT price_version FROM cloud_consents WHERE user_id=?').get(id)?.price_version === p.priceVersion };
    },
    savePrices(input) {
      if (typeof input.enabled !== 'boolean') fail('收费开关无效。');
      for (const name of ['imagePoints', 'videoPoints']) if (!Number.isSafeInteger(input[name]) || input[name] < 0 || input[name] > 1000000) fail('服务费需为非负整数玩剧点。');
      db.prepare("INSERT INTO cloud_options VALUES ('prices',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value")
        .run(JSON.stringify({ enabled: input.enabled, imagePoints: input.imagePoints, videoPoints: input.videoPoints }));
      return prices();
    },
    setQuota(id, bytes) {
      if (!user(id)) fail('账号不存在。', 404);
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 100 * 1024 * GIB) fail('空间配额无效。');
      db.prepare('INSERT INTO cloud_options VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(`quota:${id}`, String(bytes));
      return this.status(id);
    },
    consent(id, version) {
      if (version !== prices().priceVersion) fail('服务费价格已变化，请刷新后确认。', 409);
      db.prepare('INSERT INTO cloud_consents VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET price_version=excluded.price_version').run(id, version);
      return this.status(id);
    },
    addBlob(id, hash, size) {
      if (!validBlobHash(hash)) fail('文件校验值无效。');
      return transaction(() => {
        const prior = blob(id, hash);
        if (prior) {
          if (prior.size !== size) fail('文件大小与已存对象不一致。', 409);
          db.prepare('DELETE FROM cloud_uploads WHERE user_id=? AND hash=?').run(id, hash);
          return prior;
        }
        checkSpace(id, size, hash);
        db.prepare('INSERT INTO cloud_objects VALUES (?,?,?,?)').run(id, hash, size, Date.now());
        db.prepare('DELETE FROM cloud_uploads WHERE user_id=? AND hash=?').run(id, hash);
        return { hash, size };
      });
    },
    list(id) {
      return db.prepare(`SELECT id,title,revision,updated FROM cloud_projects p WHERE user_id=?
        AND NOT EXISTS (SELECT 1 FROM cloud_project_trash t WHERE t.user_id=p.user_id AND t.project_id=p.id)
        ORDER BY updated DESC,id`).all(id);
    },
    trashList(id) {
      return db.prepare(`SELECT p.id,p.title,p.revision,p.updated,t.token AS trashToken,t.deleted
        FROM cloud_projects p JOIN cloud_project_trash t ON t.user_id=p.user_id AND t.project_id=p.id
        WHERE p.user_id=? ORDER BY t.deleted DESC,p.id`).all(id);
    },
    versions(id, pid, before) {
      requireProject(id, pid);
      if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) fail('历史版本分页参数无效。');
      const rows = db.prepare(`SELECT revision,created,manifest FROM cloud_versions
        WHERE user_id=? AND project_id=? AND revision<? ORDER BY revision DESC LIMIT 101`).all(id, pid, before ?? Number.MAX_SAFE_INTEGER);
      const versions = rows.slice(0, 100).map(({ revision, created, manifest }) => {
        const files = JSON.parse(manifest).files;
        return { revision, created, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) };
      });
      return { versions, nextBefore: rows.length > 100 ? versions.at(-1).revision : null };
    },
    trash(id, pid, input) {
      return transaction(() => {
        const project = requireProject(id, pid, true);
        if (input.revision !== project.revision) fail('项目已有新版本，请刷新后再移入回收站。', 409);
        const prior = db.prepare('SELECT token AS trashToken,deleted FROM cloud_project_trash WHERE user_id=? AND project_id=?').get(id, pid);
        if (prior) return prior;
        const trashToken = randomUUID(), deleted = Date.now();
        db.prepare('INSERT INTO cloud_project_trash VALUES (?,?,?,?)').run(id, pid, trashToken, deleted);
        return { trashToken, deleted };
      });
    },
    restore(id, pid, input) {
      return transaction(() => {
        requireProject(id, pid, true);
        const prior = db.prepare('SELECT token FROM cloud_project_trash WHERE user_id=? AND project_id=?').get(id, pid);
        if (!prior || prior.token !== input.trashToken) fail('回收站状态已变化，请刷新后再恢复。', 409);
        db.prepare('DELETE FROM cloud_project_trash WHERE user_id=? AND project_id=?').run(id, pid);
        return { restored: true };
      });
    },
    purge(id, pid, input) {
      return transaction(() => {
        const project = requireProject(id, pid, true);
        const prior = db.prepare('SELECT token FROM cloud_project_trash WHERE user_id=? AND project_id=?').get(id, pid);
        if (!prior || prior.token !== input.trashToken || input.confirmTitle !== project.title)
          fail('永久删除需输入完整项目名称，并确认最新回收站状态。', 409);
        db.prepare('INSERT INTO cloud_project_tombstones VALUES (?,?,?)').run(id, pid, Date.now());
        db.prepare('DELETE FROM cloud_project_trash WHERE user_id=? AND project_id=?').run(id, pid);
        db.prepare('DELETE FROM cloud_versions WHERE user_id=? AND project_id=?').run(id, pid);
        db.prepare('DELETE FROM cloud_projects WHERE user_id=? AND id=?').run(id, pid);
        return { purged: true, message: '云项目及历史版本已删除。本地副本保留；无引用素材可在空间清理中回收。' };
      });
    },
    cleanupPreview(id) {
      const { files, ...plan } = cleanupPlan(id);
      return { ...plan, objects: files.length };
    },
    cleanup(id, input, remove) {
      return transaction(() => {
        if (db.prepare("SELECT 1 FROM cloud_maintenance WHERE id='backup' AND expires>?").get(Date.now()))
          fail('云端正在备份，请备份完成后再清理空间。', 409);
        const plan = cleanupPlan(id);
        if (input.confirm !== '清理未引用文件' || input.token !== plan.token)
          fail('清理预览已变化，请重新预览并确认。', 409);
        let bytes = 0, objects = 0, skipped = 0;
        // No await between reference validation, file deletion and metadata removal.
        for (const file of plan.files) {
          if (!remove(file.hash)) { skipped++; continue; }
          db.prepare('DELETE FROM cloud_objects WHERE user_id=? AND hash=?').run(id, file.hash);
          bytes += file.size; objects++;
        }
        return { bytes, objects, skipped, usedBytes: usage(id), more: plan.more };
      });
    },
    version(id, pid, revision) {
      const project = requireProject(id, pid);
      const rev = revision ?? project.revision;
      if (!Number.isSafeInteger(rev) || rev < 1) fail('版本号无效。');
      const saved = db.prepare('SELECT manifest,created FROM cloud_versions WHERE user_id=? AND project_id=? AND revision=?').get(id, pid, rev);
      if (!saved) fail('该项目版本不存在。', 404);
      return { ...project, revision: rev, created: saved.created, ...JSON.parse(saved.manifest) };
    },
    commit(id, pid, input) {
      projectId(pid);
      if (!Number.isSafeInteger(input.parentRevision) || input.parentRevision < 0) fail('父版本号无效。');
      if (typeof input.requestKey !== 'string' || !/^[\w-]{6,100}$/.test(input.requestKey)) fail('同步请求编号无效。');
      const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
      if (!title) fail('请填写项目名称。');
      if (!Array.isArray(input.files) || !input.files.length || input.files.length > 10000) fail('项目文件清单无效。');
      const names = new Set();
      const files = input.files.map(({ path, hash, size }) => {
        if (!cloudPathAllowed(path) || names.has(path.toLowerCase())) fail('项目路径无效、重复或包含不应同步的私密文件。');
        names.add(path.toLowerCase());
        if (!validBlobHash(hash) || !Number.isSafeInteger(size) || size < 0 || size > MAX_BLOB_BYTES) fail('项目文件信息无效。');
        return { path, hash, size };
      }).sort((a, b) => a.path.localeCompare(b.path));
      if (!files.some((entry) => entry.path === 'film.html')) fail('项目缺少 film.html，不能恢复为原生工程。');
      const manifest = JSON.stringify({ files });
      const fingerprint = digest(JSON.stringify([input.parentRevision, title, files]));
      return transaction(() => {
        if (db.prepare('SELECT 1 FROM cloud_project_tombstones WHERE user_id=? AND project_id=?').get(id, pid))
          fail('此云项目已永久删除。请另存为新的本地项目后重新上传。', 410);
        if (db.prepare('SELECT 1 FROM cloud_project_trash WHERE user_id=? AND project_id=?').get(id, pid))
          fail('此项目已移入云端回收站，请先恢复后再同步。', 410);
        const prior = db.prepare('SELECT revision,fingerprint FROM cloud_versions WHERE user_id=? AND project_id=? AND request_key=?').get(id, pid, input.requestKey);
        if (prior) {
          if (prior.fingerprint !== fingerprint) fail('同一同步编号不能保存不同内容。', 409);
          return { id: pid, revision: prior.revision, repeated: true };
        }
        const current = db.prepare('SELECT revision FROM cloud_projects WHERE user_id=? AND id=?').get(id, pid);
        if ((current?.revision ?? 0) !== input.parentRevision) fail('另一台电脑已更新此项目。请先下载云端新版本，保留本地副本后再合并。', 409);
        if (usage(id) + pendingUsage(id) > quota(id)) fail('云空间已超出配额，不能提交新版本。', 413);
        for (const file of files) if (blob(id, file.hash)?.size !== file.size) fail('文件尚未完整上传，原云版本未改变。', 409);
        const updated = Date.now(), revision = input.parentRevision + 1;
        db.prepare(`INSERT INTO cloud_projects VALUES (?,?,?,?,?) ON CONFLICT(user_id,id)
          DO UPDATE SET title=excluded.title,revision=excluded.revision,updated=excluded.updated`).run(id, pid, title, revision, updated);
        db.prepare('INSERT INTO cloud_versions VALUES (?,?,?,?,?,?,?)').run(id, pid, revision, input.requestKey, fingerprint, manifest, updated);
        return { id: pid, revision, updated, repeated: false };
      });
    },
    recordSuccess(id, input) {
      projectId(input.projectId);
      if (typeof input.taskId !== 'string' || !/^[\w-]{6,180}$/.test(input.taskId)
        || !['image', 'video'].includes(input.kind) || !validBlobHash(input.hash)) fail('成功任务凭证无效。');
      return transaction(() => {
        const prior = db.prepare('SELECT * FROM cloud_receipts WHERE user_id=? AND task_id=?').get(id, input.taskId);
        if (prior) {
          if (prior.project_id !== input.projectId || prior.kind !== input.kind || prior.hash !== input.hash) fail('同一任务编号不能对应不同的生成结果。', 409);
          return { taskId: input.taskId, charged: prior.charged, repeated: true };
        }
        if (input.status !== 'done') fail('只有检查并保存成功的任务可以结算。');
        const latest = this.version(id, input.projectId);
        const asset = latest.files.find((file) => file.hash === input.hash && file.size > 0 && file.path.startsWith('assets/')
          && (input.kind === 'image' ? /\.(png|jpe?g|webp)$/i : /\.(mp4|mov|webm)$/i).test(file.path));
        if (!asset) fail('生成结果尚未归档到此云项目，不会扣费。', 409);
        const rates = prices();
        const charged = rates.enabled ? rates[`${input.kind}Points`] : 0;
        if (charged && (input.priceVersion !== rates.priceVersion
          || db.prepare('SELECT price_version FROM cloud_consents WHERE user_id=?').get(id)?.price_version !== rates.priceVersion)) fail('请先确认当前图片、视频服务费。', 409);
        if (charged) addEntry(id, 'media-service', -charged, `media:${id}:${input.taskId}`, `${input.kind === 'image' ? '图片' : '视频'}生成成功服务费`);
        db.prepare('INSERT INTO cloud_receipts VALUES (?,?,?,?,?,?,?,?)')
          .run(id, input.taskId, input.projectId, input.kind, input.hash, charged, rates.priceVersion, Date.now());
        return { taskId: input.taskId, charged, repeated: false };
      });
    },
  };
}

/** A first single-server adapter. Its directory MUST be on backed-up persistent storage in production. */
export function createCloudFiles(directory, cloud, fail) {
  const queues = new Map();
  const location = (id, hash) => join(directory, digest(id), hash.slice(0, 2), hash);
  const partial = (id, hash) => `${location(id, hash)}.upload`;
  const partialMeta = (id, hash) => `${partial(id, hash)}.json`;
  const readPartialMeta = async (id, hash) => {
    try {
      const value = JSON.parse(await readFile(partialMeta(id, hash), 'utf8'));
      if (!Number.isSafeInteger(value.total) || value.total < 0 || value.total > MAX_BLOB_BYTES) throw new Error('invalid upload metadata');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      fail('云端临时上传状态损坏，请重新开始同步。', 409);
    }
  };
  const savePartialMeta = async (id, hash, total) => {
    const target = partialMeta(id, hash), temporary = `${target}.${randomUUID()}.next`;
    try {
      await writeFile(temporary, JSON.stringify({ total }) + '\n', { mode: 0o600 });
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
  };
  let legacyReady = false;
  const recoverLegacyUploads = () => {
    if (legacyReady || cloud.backupActive()) return legacyReady;
    // Inventory legacy temporary files once; periodic cleanup only queries expired reservations.
    for (const id of cloud.uploadOwners()) {
      const owner = join(directory, digest(id)), pending = new Map();
      if (!existsSync(owner)) continue;
      for (const prefix of readdirSync(owner, { withFileTypes: true })) {
        if (!prefix.isDirectory() || !/^[a-f0-9]{2}$/.test(prefix.name)) continue;
        for (const file of readdirSync(join(owner, prefix.name), { withFileTypes: true })) {
          const match = /^([a-f0-9]{64})(\.upload(?:\.json)?|\.[\w-]+\.upload|\.upload\.json\.[\w-]+\.next)$/.exec(file.name);
          if (!file.isFile() || !match || !match[1].startsWith(prefix.name)) continue;
          const hash = match[1], path = join(owner, prefix.name, file.name);
          if (![`${hash}.upload`, `${hash}.upload.json`].includes(file.name)) {
            if (!cloud.runUploadMaintenance(() => unlinkSync(path))) return false;
            continue;
          }
          const facts = statSync(path), entry = pending.get(hash) ?? { hash, size: 0, updated: 0, hasMetadata: false };
          entry.updated = Math.max(entry.updated, facts.mtimeMs);
          if (file.name.endsWith('.json') && facts.size <= 4096) {
            try {
              const total = JSON.parse(readFileSync(path, 'utf8')).total;
              if (Number.isSafeInteger(total) && total >= 0 && total <= MAX_BLOB_BYTES) {
                entry.size = total; entry.hasMetadata = true;
              }
            } catch { /* Invalid partials cannot be resumed and are discarded below. */ }
          } else entry.partialBytes = facts.size;
          pending.set(hash, entry);
        }
      }
      for (const entry of pending.values()) {
        if (entry.hasMetadata && (entry.partialBytes ?? 0) <= entry.size) {
          cloud.reserveUpload(id, entry.hash, entry.size, entry.updated);
        } else {
          if (!cloud.runUploadMaintenance(() => {
            for (const path of [partial(id, entry.hash), partialMeta(id, entry.hash)]) {
              try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
          })) return false;
          cloud.releaseUpload(id, entry.hash);
        }
      }
    }
    legacyReady = true;
    return true;
  };
  const sweepUploads = (now = Date.now()) => {
    const result = { files: 0, bytes: 0, reservations: 0 };
    if (!recoverLegacyUploads() || cloud.backupActive()) return { ...result, skipped: true };
    const cutoff = now - CLOUD_CLEANUP_GRACE_MS;
    for (const entry of cloud.expiredUploads(cutoff)) {
      const key = `${entry.userId}:${entry.hash}`;
      if (queues.has(key)) continue;
      const paths = [partial(entry.userId, entry.hash), partialMeta(entry.userId, entry.hash)];
      if (!cloud.blob(entry.userId, entry.hash)) paths.push(location(entry.userId, entry.hash));
      const expired = cloud.expireUpload(entry.userId, entry.hash, cutoff, () => {
        for (const path of paths) {
          try {
            const size = statSync(path).size;
            unlinkSync(path);
            result.files++; result.bytes += size;
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      });
      if (expired) result.reservations++;
    }
    return result;
  };
  sweepUploads();
  const timer = setInterval(() => {
    try { sweepUploads(); }
    catch { console.error('Cloud upload maintenance failed; temporary files retained for retry.'); }
  }, 3600000);
  timer.unref();
  return {
    sweepUploads,
    close() { clearInterval(timer); },
    cleanup(id, input) {
      return cloud.cleanup(id, input, (hash) => {
        if (queues.has(`${id}:${hash}`)) return false;
        try { unlinkSync(location(id, hash)); return true; }
        catch (error) { return error.code === 'ENOENT'; }
      });
    },
    async uploadStatus(id, hash) {
      if (!validBlobHash(hash)) fail('文件校验值无效。');
      if (!recoverLegacyUploads()) fail('云端正在备份，请稍后继续同步。', 503);
      const previous = cloud.blob(id, hash);
      if (previous) return { hash, complete: true, offset: previous.size, size: previous.size };
      const key = `${id}:${hash}`;
      if (queues.has(key)) fail('同一文件正在上传，请稍后重试。', 409);
      queues.set(key, true);
      try {
        const facts = await stat(partial(id, hash)).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
        const metadata = await readPartialMeta(id, hash);
        if (!facts && !metadata) return { hash, complete: false, offset: 0, size: null };
        if (facts && !facts.isFile()) fail('云端临时上传状态无效。', 409);
        if (!metadata || (facts && facts.size > metadata.total)) {
          await rm(partial(id, hash), { force: true }); await rm(partialMeta(id, hash), { force: true });
          cloud.releaseUpload(id, hash);
          return { hash, complete: false, offset: 0, size: null };
        }
        cloud.reserveUpload(id, hash, metadata.total);
        return { hash, complete: false, offset: facts?.size ?? 0, size: metadata.total };
      } finally { queues.delete(key); }
    },
    async upload(id, hash, req) {
      if (!validBlobHash(hash)) fail('文件校验值无效。');
      if (!recoverLegacyUploads()) fail('云端正在备份，请稍后继续同步。', 503);
      const key = `${id}:${hash}`;
      if (queues.has(key)) fail('同一文件正在上传，请稍后重试。', 409);
      queues.set(key, true);
      const path = location(id, hash), temporary = partial(id, hash);
      let handle, keepReservation = false, reserved = false, ordinary = false;
      try {
        const range = req.headers['content-range'];
        if (range !== undefined) {
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(range));
          const length = Number(req.headers['content-length']);
          if (!match || !Number.isSafeInteger(length) || length < 0 || length > CLOUD_UPLOAD_CHUNK_BYTES)
            fail('分片上传范围无效。', 400);
          const start = Number(match[1]), end = Number(match[2]), total = Number(match[3]);
          if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start
            || total < 0 || total > MAX_BLOB_BYTES || end - start + 1 !== length || end >= total)
            fail('分片上传范围无效。', 400);
          const previous = cloud.blob(id, hash);
          if (previous) {
            if (previous.size !== total) fail('文件大小不匹配。', 409);
            return { hash, size: previous.size, offset: previous.size, complete: true };
          }
          await mkdir(join(path, '..'), { recursive: true });
          const metadata = await readPartialMeta(id, hash);
          if (metadata && metadata.total !== total) fail('同一文件的总大小不能变化。', 409);
          if (!metadata && start !== 0) fail('云端没有对应的上传断点，请从第一个分片开始。', 409);
          const current = await stat(partial(id, hash)).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
          const offset = current?.size ?? 0;
          if (offset !== start) fail(`上传断点不匹配，当前应从 ${offset} 字节继续。`, 409);
          cloud.reserveUpload(id, hash, total);
          reserved = true;
          keepReservation = true;
          if (!metadata) await savePartialMeta(id, hash, total);
          const chunks = [];
          let received = 0;
          for await (const chunk of req) {
            received += chunk.length;
            if (received > length) fail('分片大小超过声明范围。', 413);
            chunks.push(chunk);
          }
          if (received !== length) fail('分片上传未完整到达，请重试当前分片。', 408);
          handle = await open(partial(id, hash), 'a', 0o600);
          for (const chunk of chunks) await handle.writeFile(chunk);
          await handle.sync(); await handle.close(); handle = null;
          const nextOffset = start + length;
          if (nextOffset < total) return { hash, size: total, offset: nextOffset, complete: false };
          if (await checksum(partial(id, hash)) !== hash) {
            await rm(partial(id, hash), { force: true }); await rm(partialMeta(id, hash), { force: true });
            keepReservation = false;
            fail('文件校验失败，请重新上传；云端旧版本未改变。', 422);
          }
          await rename(partial(id, hash), path);
          await rm(partialMeta(id, hash), { force: true });
          keepReservation = false;
          try { return { ...cloud.addBlob(id, hash, total), offset: total, complete: true }; }
          catch (error) { await rm(path, { force: true }); throw error; }
        }
        const length = Number(req.headers['content-length']);
        if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BLOB_BYTES) fail('上传需提供有效文件大小。', 413);
        const previous = cloud.blob(id, hash);
        if (previous && previous.size !== length) fail('文件大小不匹配。', 409);
        if (!previous) {
          // A full-file retry replaces its own partial rather than using a second quota.
          cloud.reserveUpload(id, hash, length);
          reserved = true;
          await rm(partial(id, hash), { force: true }); await rm(partialMeta(id, hash), { force: true });
        }
        ordinary = true;
        await mkdir(join(path, '..'), { recursive: true });
        if (!previous) await savePartialMeta(id, hash, length);
        handle = await open(temporary, 'wx', 0o600);
        const checksumHash = createHash('sha256');
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > length || size > MAX_BLOB_BYTES) fail('上传文件超出声明大小。', 413);
          checksumHash.update(chunk);
          await handle.writeFile(chunk);
        }
        await handle.sync(); await handle.close(); handle = null;
        if (size !== length || checksumHash.digest('hex') !== hash) fail('文件校验失败，请重新上传；云端旧版本未改变。', 422);
        await rename(temporary, path);
        try { return cloud.addBlob(id, hash, size); }
        catch (error) { if (!previous) await rm(path, { force: true }); throw error; }
      } finally {
        await handle?.close().catch(() => {});
        try {
          if (ordinary || (reserved && !keepReservation)) {
            await rm(temporary, { force: true });
            await rm(partialMeta(id, hash), { force: true });
          }
          if (reserved && !keepReservation) cloud.releaseUpload(id, hash);
        } finally { queues.delete(key); }
      }
    },
    async download(id, hash, res, range) {
      const entry = cloud.blob(id, hash);
      if (!entry) fail('文件不存在或无权访问。', 404);
      const path = location(id, hash);
      const facts = await stat(path).catch(() => null);
      if (!facts?.isFile() || facts.size !== entry.size) fail('云文件缺失，请保留本地副本并联系维护人员。', 503);
      const headers = { 'content-type': 'application/octet-stream', 'content-length': entry.size,
        'cache-control': 'private, no-store', 'accept-ranges': 'bytes', etag: `"${hash}"` };
      let start = 0;
      if (range !== undefined) {
        const match = /^bytes=(\d+)-$/.exec(range);
        start = match ? Number(match[1]) : NaN;
        if (!Number.isSafeInteger(start) || start < 0 || start >= entry.size) {
          res.writeHead(416, { ...headers, 'content-length': 0, 'content-range': `bytes */${entry.size}` });
          res.end(); return;
        }
        headers['content-length'] = entry.size - start;
        headers['content-range'] = `bytes ${start}-${entry.size - 1}/${entry.size}`;
      }
      res.writeHead(range === undefined ? 200 : 206, headers);
      await pipeline(createReadStream(path, { start }), res);
    },
  };
}
