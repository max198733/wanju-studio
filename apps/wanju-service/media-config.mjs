import { createHash, randomUUID } from 'node:crypto';
import { mediaCatalog, mediaKey, shownMediaProfile } from './media-profiles.mjs';

const RELAY_IMAGE_ID = 'wanju-relay-image';
/**
 * 客户端视角：图片改走本站代理。
 * 客户端只拿到自己的登录令牌当密钥，供应商密钥始终留在服务端；
 * 这样学员在桌面端点"生成"时，扣点一定经过服务端，改客户端也绕不过去。
 * 只在 HTTPS 公开域名下启用（内网或本机调试保持原来的直连视图，测试不受影响）。
 */
function clientView({ profiles, defaults }, relay) {
  if (!relay || typeof relay.token !== 'string' || typeof relay.origin !== 'string') return { profiles, defaults };
  const source = profiles.find((p) => p.id === defaults.image && p.category === 'image')
    ?? profiles.find((p) => p.category === 'image');
  if (!source) return { profiles, defaults };
  return {
    profiles: [...profiles.filter((p) => p.category !== 'image'), {
      id: RELAY_IMAGE_ID, category: 'image', adapter: 'openai-image', name: '玩剧云端出图',
      baseUrl: relay.origin, model: source.model, note: '', responseFormat: 'b64_json',
      auth: 'Authorization: Bearer {key}', key: relay.token,
    }],
    defaults: { ...defaults, image: RELAY_IMAGE_ID },
  };
}

const OPERATOR_SETTING = 'media-operator';
export function createMediaConfig({ db, seal, unseal, user, fail }) {
  const validateInput = (read) => {
    try { return read(); }
    catch (error) {
      if (error?.status === 400) fail(error.message, 400);
      throw error;
    }
  };
  db.exec(`CREATE TABLE IF NOT EXISTS media_defaults (id INTEGER PRIMARY KEY CHECK(id=1), revision TEXT NOT NULL, config TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media_assignments (user_id TEXT PRIMARY KEY REFERENCES users(id), revision TEXT NOT NULL, sealed TEXT NOT NULL);`);
  const catalog = () => {
    const row = db.prepare('SELECT revision,config FROM media_defaults WHERE id=1').get();
    return row ? { ...mediaCatalog(JSON.parse(row.config)), revision: row.revision } : { ...mediaCatalog({ profiles: [] }), revision: 'empty' };
  };
  const assignment = (id) => {
    const row = db.prepare('SELECT revision,sealed FROM media_assignments WHERE user_id=?').get(id);
    return row ? { keys: unseal(row.sealed), revision: row.revision } : { keys: {}, revision: 'empty' };
  };
  /**
   * 运营方统一密钥。
   * 服务端代理替学员出图时，用的是这把密钥；学员自己的登录令牌只在客户端出现。
   * 账号级分配仍然优先，方便个别学员用自己的供应商。
   */
  const operatorKeys = () => {
    const row = db.prepare('SELECT sealed FROM settings WHERE id=?').get(OPERATOR_SETTING);
    if (!row) return {};
    try {
      const value = unseal(row.sealed);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  };
  const forUser = (id, relay = null, { operator = false } = {}) => {
    if (!user(id)) fail('账号不存在。', 404);
    const config = catalog(), assigned = assignment(id);
    const shared = operator ? operatorKeys() : {};
    const delivered = clientView({
      profiles: config.profiles.map((p) => {
        const key = assigned.keys[p.id] ?? shared[p.id];
        return key ? { ...p, key } : { ...p };
      }),
      defaults: config.defaults,
    }, relay);
    return { version: 1, profiles: delivered.profiles, defaults: delivered.defaults,
      revision: createHash('sha256').update(`${config.revision}:${assigned.revision}`).digest('hex') };
  };
  return {
    catalog,
    status(id) {
      const value = forUser(id);
      return { available: value.profiles.length > 0, revision: value.revision };
    },
    saveCatalog(input) {
      const previous = catalog();
      if (input.base !== previous.revision) fail('云端供应商配置已变化，请刷新后保存。', 409);
      const value = validateInput(() => mediaCatalog(input));
      const revision = randomUUID();
      const unchangedIds = new Set(value.profiles.filter((profile) => previous.profiles.some((old) =>
        old.id === profile.id && old.category === profile.category && old.adapter === profile.adapter
        && old.baseUrl === profile.baseUrl && old.auth === profile.auth)).map((profile) => profile.id));
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO media_defaults VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,config=excluded.config')
          .run(revision, JSON.stringify(value));
        for (const row of db.prepare('SELECT user_id FROM media_assignments').all()) {
          const current = assignment(row.user_id), keys = Object.fromEntries(Object.entries(current.keys).filter(([id]) => unchangedIds.has(id)));
          if (Object.keys(keys).length !== Object.keys(current.keys).length) {
            db.prepare('UPDATE media_assignments SET revision=?,sealed=? WHERE user_id=?')
              .run(randomUUID(), seal(keys), row.user_id);
          }
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { ...value, revision };
    },
    adminAssignment(id) {
      const value = forUser(id);
      return { revision: assignment(id).revision, catalogRevision: catalog().revision, profiles: value.profiles.map(shownMediaProfile) };
    },
    /** 后台查看：哪些通道已经配了运营方密钥（只回报是否已配，不回报密钥本身）。 */
    operatorStatus() {
      const keys = operatorKeys(), config = catalog();
      return {
        catalogRevision: config.revision,
        profiles: config.profiles.map((p) => ({ id: p.id, category: p.category, name: p.name, configured: Boolean(keys[p.id]) })),
      };
    },
    /**
     * 设置或清除运营方统一密钥。
     * key 传空字符串即清除；只有模板里存在的通道编号才能设置，避免写进孤儿密钥。
     */
    setOperatorKey(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('密钥配置无效。');
      const config = catalog();
      const profile = config.profiles.find((p) => p.id === input.id);
      if (!profile) fail('供应商不存在，请先保存云端供应商模板。');
      const keys = { ...operatorKeys() };
      if (input.key === '' || input.key === null || input.remove === true) delete keys[profile.id];
      else keys[profile.id] = validateInput(() => mediaKey(input.key));
      db.prepare("INSERT INTO settings (id,sealed) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed")
        .run(OPERATOR_SETTING, seal(keys));
      return this.operatorStatus();
    },
    saveAssignment(id, input) {
      if (!user(id)) fail('账号不存在。', 404);
      const current = assignment(id), config = catalog();
      if (input.catalogRevision !== config.revision) fail('默认供应商已变化，请重新打开账号密钥配置。', 409);
      if (input.base !== current.revision) fail('账号供应商配置已变化，请刷新后保存。', 409);
      if (!Array.isArray(input.keys) || input.keys.length > 60) fail('账号密钥配置无效。');
      const keys = { ...current.keys }, seen = new Set();
      for (const item of input.keys) {
        if (!item || seen.has(item.id) || !config.profiles.some((p) => p.id === item.id)) fail('供应商不存在或重复。');
        seen.add(item.id);
        if (item.remove === true) delete keys[item.id];
        else if (item.key) keys[item.id] = validateInput(() => mediaKey(item.key));
      }
      db.prepare('INSERT INTO media_assignments VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,sealed=excluded.sealed')
        .run(id, randomUUID(), seal(keys));
      return this.adminAssignment(id);
    },
    forUser,
  };
}
