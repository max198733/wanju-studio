import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createManualEnrollment } from './manual-enrollment.mjs';
import { createCloudStore } from './cloud.mjs';
import { createMediaConfig } from './media-config.mjs';
import { CHAT_TIER_DEFINITIONS } from './chat-tiers.mjs';
import { normalizeChatDiagnostic } from './chat-diagnostics.mjs';

export class ServiceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new ServiceError(message, status); };
export const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const now = () => Date.now();
const codeHash = (value) => hash(String(value ?? '').toUpperCase().replace(/[\s-]/g, ''));
export function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label}超出允许范围。`);
  return value;
}
const passwordHash = (password, salt = randomBytes(16).toString('hex')) => {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail('密码需为10至128位。');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
};
const samePassword = (password, saved) => {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, expected] = saved.split(':');
  return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(expected, 'hex'));
};
const usernameOf = (value) => {
  const name = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(name)) fail('账号需为3至32位文字、数字、下划线或短横线。');
  return name;
};
const DEFAULT_CHAT = Object.freeze({
  enabled: false, baseUrl: '', model: 'claude-opus-5-5', key: '', displayName: '玩剧创作助手',
  format: 'chat', billingMode: 'wallet', dailyRequestLimit: 200,
  inputPointsPerMillion: 0, outputPointsPerMillion: 0, reservePoints: 0,
  cachedInputPointsPerMillion: null, cacheWritePointsPerMillion: null,
  context: 32000, maxOutputTokens: 4096, visionVerified: false,
});
const CHAT_TIER_IDS = Object.keys(CHAT_TIER_DEFINITIONS);
const RATE_SCALE = 10000n;
const scaledRate = (value, label) => {
  const text = String(value ?? '');
  if (!/^\d{1,10}(?:\.\d{1,4})?$/.test(text)) fail(`${label}需为最多4位小数的非负点价。`);
  const [whole, fraction = ''] = text.split('.');
  const scaled = BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(4, '0'));
  if (scaled > 1_000_000_000n * RATE_SCALE) fail(`${label}超出允许范围。`);
  return scaled;
};
const cachePricing = (rates) => rates.cachedInputPointsPerMillion != null || rates.cacheWritePointsPerMillion != null;
const cacheCount = (values, label) => {
  const present = values.filter((value) => value !== undefined && value !== null);
  if (!present.length) return { present: false, count: 0 };
  const counts = present.map((value) => integer(value, 0, 100_000_000, label));
  if (counts.some((value) => value !== counts[0])) fail(`${label}存在相互矛盾的明细，请核对上游账单。`);
  return { present: true, count: counts[0] };
};
export const usagePoints = (usage, rates) => {
  const input = integer(usage?.prompt_tokens, 0, 100_000_000, '输入用量');
  const output = integer(usage?.completion_tokens, 0, 100_000_000, '输出用量');
  const inputRate = scaledRate(rates.inputPointsPerMillion, '输入售价');
  const outputRate = scaledRate(rates.outputPointsPerMillion, '输出售价');
  let inputCost = BigInt(input) * inputRate;
  if (cachePricing(rates)) {
    if (rates.cachedInputPointsPerMillion == null || rates.cacheWritePointsPerMillion == null) fail('缓存读写售价需同时配置。');
    const details = usage.prompt_tokens_details ?? usage.input_tokens_details ?? {};
    const read = cacheCount([details.cached_tokens, usage.cache_read_input_tokens, usage.prompt_cache_hit_tokens], '缓存读取用量');
    const fiveMinute = cacheCount([usage.claude_cache_creation_5_m_tokens], '五分钟缓存写入用量');
    const oneHour = cacheCount([usage.claude_cache_creation_1_h_tokens], '一小时缓存写入用量');
    const splitWrites = fiveMinute.present || oneHour.present ? fiveMinute.count + oneHour.count : undefined;
    const write = cacheCount([details.cache_write_tokens, details.cache_creation_tokens, details.cached_creation_tokens, usage.cache_creation_input_tokens,
      usage.cache_write_tokens, splitWrites], '缓存写入用量');
    if (!read.present && !write.present) fail('上游未返回缓存用量明细，请核对上游账单。');
    if (read.count + write.count > input) fail('缓存用量超过总输入，请核对上游计数口径。');
    inputCost = BigInt(input - read.count - write.count) * inputRate
      + BigInt(read.count) * scaledRate(rates.cachedInputPointsPerMillion, '缓存读取售价')
      + BigInt(write.count) * scaledRate(rates.cacheWritePointsPerMillion, '缓存写入售价');
  }
  const divisor = 1000000n * RATE_SCALE;
  return Number((inputCost + BigInt(output) * outputRate + divisor - 1n) / divisor);
};

export function maximumUsagePoints(rates) {
  const maximumInput = [rates.inputPointsPerMillion,
    ...(cachePricing(rates) ? [rates.cachedInputPointsPerMillion, rates.cacheWritePointsPerMillion] : [])]
    .map((value) => scaledRate(value, '输入售价')).reduce((a, b) => a > b ? a : b);
  const divisor = 1000000n * RATE_SCALE;
  return Number((BigInt(rates.context) * maximumInput
    + BigInt(rates.maxOutputTokens) * scaledRate(rates.outputPointsPerMillion, '输出售价') + divisor - 1n) / divisor);
}

function validateChat(input, current, tier) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('创作助手设置无效。');
  const next = Object.fromEntries(Object.keys(DEFAULT_CHAT).map((key) => [key, input[key] ?? current[key]]));
  for (const field of ['cachedInputPointsPerMillion', 'cacheWritePointsPerMillion']) {
    if (Object.hasOwn(input, field)) next[field] = input[field];
  }
  if (input.key === '') next.key = current.key;
  next.enabled = next.enabled === true;
  next.visionVerified = next.visionVerified === true;
  next.displayName = String(next.displayName).slice(0, 80);
  next.baseUrl = String(next.baseUrl).trim().replace(/\/+$/, '');
  next.model = String(next.model).trim().slice(0, 200);
  next.key = String(next.key).trim();
  if (!['chat', 'responses'].includes(next.format)) fail('请选择 Chat Completions 或 Responses 协议。');
  if (!['wallet', 'included'].includes(next.billingMode)) fail('创作助手计费模式无效。');
  integer(next.dailyRequestLimit, 1, 10000, '每日请求上限');
  if (next.billingMode === 'included') {
    next.inputPointsPerMillion = 0; next.outputPointsPerMillion = 0; next.reservePoints = 0;
    next.cachedInputPointsPerMillion = null; next.cacheWritePointsPerMillion = null;
  }
  for (const field of ['inputPointsPerMillion', 'outputPointsPerMillion']) {
    next[field] = Number(scaledRate(next[field], field === 'inputPointsPerMillion' ? '输入售价' : '输出售价')) / Number(RATE_SCALE);
  }
  if (cachePricing(next)) {
    if (next.cachedInputPointsPerMillion == null || next.cacheWritePointsPerMillion == null) fail('缓存读写售价需同时配置。');
    next.cachedInputPointsPerMillion = Number(scaledRate(next.cachedInputPointsPerMillion, '缓存读取售价')) / Number(RATE_SCALE);
    next.cacheWritePointsPerMillion = Number(scaledRate(next.cacheWritePointsPerMillion, '缓存写入售价')) / Number(RATE_SCALE);
  }
  integer(next.reservePoints, 0, 10_000_000, '单次预留');
  integer(next.context, 32000, 2_000_000, '上下文长度');
  integer(next.maxOutputTokens, 16, 32000, '最大输出');
  if (next.baseUrl) {
    let url;
    try { url = new URL(next.baseUrl); } catch { fail('接口地址无效。'); }
    if (url.username || url.password || url.search || url.hash
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) fail('接口地址须使用HTTPS，本机测试可用HTTP。');
  }
  if (next.enabled) {
    if (!next.baseUrl || !next.model || !next.key || !next.visionVerified) fail(`${CHAT_TIER_DEFINITIONS[tier].label}启用前需配置模型、密钥，并确认模型支持看图和工具调用。`);
    if (next.billingMode === 'wallet' && (next.inputPointsPerMillion <= 0 || next.outputPointsPerMillion <= 0)) fail('需先设置已核实的正数售价。');
    const maximum = maximumUsagePoints(next);
    if (next.reservePoints < maximum) fail(`单次预留至少为${maximum}点，以覆盖配置的最大用量。`);
  }
  return next;
}

export function openStore(file, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('WANJU_ADMIN_SECRET must have at least 32 characters.');
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0), created INTEGER NOT NULL,
      consent TEXT NOT NULL DEFAULT '', chat_tier TEXT NOT NULL DEFAULT 'base'
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS codes (
      id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, last4 TEXT NOT NULL, kind TEXT NOT NULL,
      points INTEGER NOT NULL CHECK(points>=0), label TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'unused', user_id TEXT REFERENCES users(id), used INTEGER
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
      delta INTEGER NOT NULL, balance INTEGER NOT NULL, reference TEXT NOT NULL, title TEXT NOT NULL, created INTEGER NOT NULL,
      UNIQUE(reference, kind)
    );
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
      fingerprint TEXT NOT NULL, status TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER,
      rates TEXT NOT NULL, usage TEXT, note TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
      UNIQUE(user_id, request_key)
    );
    CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, sealed TEXT NOT NULL);
    -- 媒体生成按次计价。与对话的 Token 计价分开，因为单位不同（张 / 段）。
    CREATE TABLE IF NOT EXISTS media_prices (
      category TEXT PRIMARY KEY, points INTEGER NOT NULL CHECK(points>=0),
      enabled INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, created);
    CREATE INDEX IF NOT EXISTS operation_user ON operations(user_id, status);
    CREATE INDEX IF NOT EXISTS operation_status ON operations(status);
  `);
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'consent')) {
    db.exec("ALTER TABLE users ADD COLUMN consent TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'chat_tier')) {
    db.exec("ALTER TABLE users ADD COLUMN chat_tier TEXT NOT NULL DEFAULT 'base'");
  }
  // 媒体代理需要记住上游任务号，才能在查询确认后结算而不是提交即扣费。
  for (const [column, type] of [['media_task', 'TEXT'], ['media_category', 'TEXT'], ['media_provider', 'TEXT'], ['diagnostic', 'TEXT']]) {
    if (!db.prepare('PRAGMA table_info(operations)').all().some((c) => c.name === column)) {
      db.exec(`ALTER TABLE operations ADD COLUMN ${column} ${type}`);
    }
  }
  // A crashed request may have reached the supplier. Keep its reservation for reconciliation.
  db.prepare("UPDATE operations SET status='review', note='服务重启，需核对上游账单。' WHERE status='submitted'").run();
  const encryptionKey = createHash('sha256').update(`wanju-settings:${secret}`).digest();
  const seal = (value) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
  };
  const unseal = (text) => {
    const bytes = Buffer.from(text, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
  };
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const user = (id) => db.prepare('SELECT id, username, status, balance, created FROM users WHERE id=?').get(id);
  const enrollment = createManualEnrollment({ db, seal, unseal, user, fail });
  // Explicit column lists protect the accounting path from future schema additions.
  const addEntry = (id, kind, delta, reference, title) => {
    const changed = db.prepare('UPDATE users SET balance=balance+? WHERE id=? AND balance+? >= 0 RETURNING balance').get(delta, id, delta);
    if (!changed) fail('余额不足，请先充值。', 402);
    db.prepare('INSERT INTO ledger (id,user_id,kind,delta,balance,reference,title,created) VALUES (?,?,?,?,?,?,?,?)')
      .run(randomUUID(), id, kind, delta, changed.balance, reference, title, now());
  };
  const cloud = createCloudStore({ db, transaction, addEntry, user, fail });
  const media = createMediaConfig({ db, seal, unseal, user, fail });
  const session = (id) => {
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now());
    const token = `wjs_${randomBytes(32).toString('base64url')}`;
    const expires = now() + 30 * 86400000;
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token), id, expires, now());
    const old = db.prepare('SELECT hash FROM sessions WHERE user_id=? ORDER BY created DESC, rowid DESC LIMIT -1 OFFSET 5').all(id);
    for (const s of old) db.prepare('DELETE FROM sessions WHERE hash=?').run(s.hash);
    return { token, expires };
  };
  const findCode = (value, kind) => {
    if (typeof value !== 'string' || value.length > 160) fail('卡密无效或已过期。');
    const code = db.prepare('SELECT * FROM codes WHERE hash=? AND kind=?').get(codeHash(value), kind);
    if (!code || code.expires < now() || code.status === 'void') fail('卡密无效或已过期。');
    return code;
  };
  const useCode = (code, id) => {
    if (code.status !== 'unused') fail('这张卡密已经使用。', 409);
    db.prepare("UPDATE codes SET status='redeemed',user_id=?,used=? WHERE id=?").run(id, now(), code.id);
    addEntry(id, code.kind, code.points, code.id, code.kind === 'activation' ? '激活赠送' : '充值到账');
  };
  const wallet = (id) => ({
    user: user(id), pointsPerYuan: 100, onboarding: enrollment.publicView(id),
    heldPoints: db.prepare("SELECT COALESCE(SUM(reserved),0) AS n FROM operations WHERE user_id=? AND status IN ('submitted','review')").get(id).n,
    ledger: db.prepare('SELECT id,kind,delta,balance,title,created FROM ledger WHERE user_id=? ORDER BY rowid DESC LIMIT 50').all(id),
    operations: db.prepare('SELECT id,status,reserved,charged,note,created FROM operations WHERE user_id=? ORDER BY rowid DESC LIMIT 20').all(id),
  });
  const legacyChat = () => {
    const row = db.prepare("SELECT sealed FROM settings WHERE id='chat'").get();
    const config = row ? { ...DEFAULT_CHAT, ...unseal(row.sealed) } : { ...DEFAULT_CHAT };
    return config;
  };
  const readChatTiers = () => {
    const row = db.prepare("SELECT sealed FROM settings WHERE id='chat-tiers'").get();
    const saved = row ? unseal(row.sealed) : {};
    const base = saved.tiers?.base ? { ...DEFAULT_CHAT, ...saved.tiers.base } : legacyChat();
    const tiers = { base };
    for (const id of CHAT_TIER_IDS.slice(1)) {
      const definition = CHAT_TIER_DEFINITIONS[id];
      const rates = Object.fromEntries(Object.entries(definition).filter(([key]) => key !== 'label'));
      tiers[id] = saved.tiers?.[id] ? { ...DEFAULT_CHAT, ...saved.tiers[id] } : {
        ...DEFAULT_CHAT, ...rates, displayName: `玩剧创作助手 · ${definition.label}`,
      };
    }
    const defaultTier = CHAT_TIER_IDS.includes(saved.defaultTier) ? saved.defaultTier : 'base';
    return { tiers, defaultTier };
  };
  const selectedChatTier = (config, id, tier) => {
    const selected = tier ?? (id
      ? db.prepare('SELECT chat_tier FROM users WHERE id=?').get(id)?.chat_tier
      : config.defaultTier);
    return CHAT_TIER_IDS.includes(selected) ? selected : config.defaultTier;
  };
  const chatForTier = (config, id, tier) => {
    const override = id ? enrollment.chatOverride(id) : null;
    // Historical individual routes belong to base; pending approval still blocks every tier.
    return { ...config.tiers[tier], ...(tier === 'base' || override?.enabled === false ? override : null) };
  };
  const chat = (id, tier) => {
    const config = readChatTiers();
    return chatForTier(config, id, selectedChatTier(config, id, tier));
  };
  const publicChatFor = (c, tier) => {
    const terms = [c.baseUrl, c.model, c.inputPointsPerMillion, c.outputPointsPerMillion,
      c.reservePoints, c.context, c.maxOutputTokens, c.format, c.billingMode];
    if (tier !== 'base') terms.push(['tier', tier]);
    if (cachePricing(c)) terms.push(['cache', c.cachedInputPointsPerMillion, c.cacheWritePointsPerMillion]);
    const version = hash(JSON.stringify(terms));
    return { id: tier, label: CHAT_TIER_DEFINITIONS[tier].label, enabled: c.enabled, displayName: c.displayName,
      inputPointsPerMillion: c.inputPointsPerMillion, outputPointsPerMillion: c.outputPointsPerMillion,
      reservePoints: c.reservePoints, context: c.context, maxOutputTokens: c.maxOutputTokens,
      model: 'wanju-creative', priceVersion: version, format: c.format, billingMode: c.billingMode,
      dailyRequestLimit: c.dailyRequestLimit,
      ...(cachePricing(c) ? { cachedInputPointsPerMillion: c.cachedInputPointsPerMillion,
        cacheWritePointsPerMillion: c.cacheWritePointsPerMillion, inputTokenAccounting: 'total-includes-cache' } : {}) };
  };
  const publicChat = (id) => {
    const config = readChatTiers();
    const selectedTier = selectedChatTier(config, id);
    const selectedConfig = chatForTier(config, id, selectedTier);
    return { ...publicChatFor(selectedConfig, selectedTier), selectedTier,
      tiers: CHAT_TIER_IDS.map((tier) => publicChatFor(chatForTier(config, id, tier), tier)) };
  };
  const reviewOperations = ({ page = 1, pageSize = 20 } = {}) => {
    integer(page, 1, 1_000_000, '页码');
    integer(pageSize, 1, 100, '每页数量');
    const summary = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(reserved),0) AS heldPoints,
      MIN(created) AS oldestCreated FROM operations WHERE status='review'`).get();
    const pages = Math.max(1, Math.ceil(summary.total / pageSize));
    page = Math.min(page, pages);
    const items = db.prepare(`SELECT o.id,u.username,o.status,o.reserved,o.charged,o.note,o.created,o.diagnostic
      FROM operations o JOIN users u ON u.id=o.user_id WHERE o.status='review'
      ORDER BY o.rowid ASC LIMIT ? OFFSET ?`).all(pageSize, (page - 1) * pageSize).map(withDiagnostic);
    return { ...summary, page, pageSize, pages, items };
  };
  function withDiagnostic(row) {
    if (!row) return null;
    let diagnostic = null;
    try { diagnostic = normalizeChatDiagnostic(JSON.parse(row.diagnostic)); } catch {}
    return { ...row, diagnostic };
  }
  return {
    db, close: () => db.close(), wallet, chat, publicChat, reviewOperations, cloud, media,
    recordChatDiagnostic(id, value) {
      const diagnostic = normalizeChatDiagnostic(value);
      if (!diagnostic) throw new Error('Invalid chat diagnostic.');
      db.prepare('UPDATE operations SET diagnostic=? WHERE id=?').run(JSON.stringify(diagnostic), id);
    },
    operationDiagnostic(id) {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) fail('请求编号无效。');
      const row = db.prepare(`SELECT o.id,u.username,o.status,o.reserved,o.charged,o.note,o.created,o.diagnostic
        FROM operations o JOIN users u ON u.id=o.user_id WHERE o.id=?`).get(id);
      if (!row) fail('请求不存在。', 404);
      return withDiagnostic(row);
    },
    verifyAdminPassword(value) {
      if (typeof value !== 'string' || value.length > 128) return false;
      const saved = db.prepare("SELECT sealed FROM settings WHERE id='admin-login'").get();
      return saved ? samePassword(value, unseal(saved.sealed).password)
        : timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash(secret)));
    },
    setAdminPassword(value) {
      if (typeof value !== 'string' || value.length < 6 || value.length > 128) fail('后台登录密码需为6至128位。');
      const salt = randomBytes(16).toString('hex');
      const password = `${salt}:${scryptSync(value, salt, 32).toString('hex')}`;
      db.prepare("INSERT INTO settings VALUES ('admin-login',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed")
        .run(seal({ password }));
      return { ok: true };
    },
    adminEnrollment: enrollment.adminView,
    saveEnrollment: enrollment.save,
    studentChat(id) {
      const config = publicChat(id);
      // Keep this legacy field for older clients; reserve() enforces wallet access.
      return { ...config, authorized: config.enabled === true };
    },
    selectChatTier(id, tier, version) {
      if (!CHAT_TIER_IDS.includes(tier)) fail('创作助手档位无效。');
      const selected = publicChatFor(chat(id, tier), tier);
      if (!selected.enabled || selected.priceVersion !== version) fail('该档位尚未开通或价格已变化，请刷新后重试。', 409);
      transaction(() => {
        if (db.prepare("SELECT 1 FROM operations WHERE user_id=? AND status='submitted'").get(id)) fail('创作请求正在执行，请结束后再切换档位。', 409);
        db.prepare('UPDATE users SET chat_tier=? WHERE id=?').run(tier, id);
      });
      return { ...wallet(id), chat: this.studentChat(id) };
    },
    assertChatSelection(id, tier, version) {
      const current = publicChat(id);
      if (current.selectedTier !== tier || current.priceVersion !== version) fail('创作档位或价格已变化，请刷新账号后再继续。', 409);
    },
    consent(id, version) {
      if (!publicChat(id).enabled || version !== publicChat(id).priceVersion) fail('服务尚未开通或价格已变化，请刷新后重新确认。', 409);
      db.prepare('UPDATE users SET consent=? WHERE id=?').run(version, id);
      return { ...wallet(id), chat: this.studentChat(id) };
    },
    activate(input, { manual = false } = {}) {
      const username = usernameOf(input.username);
      const password = passwordHash(input.password);
      return transaction(() => {
        const existing = db.prepare('SELECT * FROM users WHERE username=?').get(username);
        if (existing) {
          const used = db.prepare("SELECT user_id FROM codes WHERE hash=? AND kind='activation' AND status='redeemed'").get(codeHash(input.code));
          if (used?.user_id !== existing.id || !samePassword(input.password, existing.password)) fail('账号已存在，请直接登录或更换账号。', 409);
          if (existing.status !== 'active') fail('账号已暂停，请联系老师。', 403);
          return { ...session(existing.id), ...wallet(existing.id), alreadyRegistered: true };
        }
        const code = findCode(input.code, 'activation');
        const id = randomUUID();
        db.prepare('INSERT INTO users (id,username,password,created,chat_tier) VALUES (?,?,?,?,?)')
          .run(id, username, password, now(), readChatTiers().defaultTier);
        useCode(code, id);
        if (manual) enrollment.add(id, input);
        return { ...session(id), ...wallet(id) };
      });
    },
    register(input) {
      const username = usernameOf(input.username);
      const password = passwordHash(input.password);
      return transaction(() => {
        if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) fail('账号已存在，请登录或更换账号。', 409);
        const id = randomUUID();
        db.prepare('INSERT INTO users (id,username,password,created,chat_tier) VALUES (?,?,?,?,?)')
          .run(id, username, password, now(), readChatTiers().defaultTier);
        return { ...session(id), ...wallet(id) };
      });
    },
    login(input) {
      const username = usernameOf(input.username);
      const found = db.prepare('SELECT * FROM users WHERE username=?').get(username);
      // Use the same expensive hash path when the username does not exist.
      const dummy = `00000000000000000000000000000000:${'0'.repeat(64)}`;
      if (!samePassword(input.password, found?.password ?? dummy) || !found) fail('账号或密码不正确。', 401);
      if (found.status !== 'active') fail('账号已暂停，请联系老师。', 403);
      return { ...session(found.id), ...wallet(found.id) };
    },
    authenticate(token) {
      if (typeof token !== 'string' || token.length > 200) fail('请先登录。', 401);
      const found = db.prepare('SELECT u.id,u.username,u.status,u.balance,u.created FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').get(hash(token), now());
      if (!found) fail('登录已过期，请重新登录。', 401);
      if (found.status !== 'active') fail('账号已暂停，请联系老师。', 403);
      return found;
    },
    logout(token) { db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token)); },
    redeem(id, value) {
      return transaction(() => {
        const code = findCode(value, 'recharge');
        if (code.status === 'redeemed' && code.user_id === id) return { ...wallet(id), alreadyRedeemed: true };
        useCode(code, id);
        return wallet(id);
      });
    },
    createCodes(input) {
      const kind = input.kind;
      if (!['activation', 'recharge'].includes(kind)) fail('请选择激活卡或充值卡。');
      const count = integer(input.count, 1, 100, '发卡数量');
      const points = integer(input.points, kind === 'activation' ? 0 : 1, 10_000_000, '卡密点数');
      const days = integer(input.days ?? 365, 1, 3650, '有效期');
      const label = String(input.label ?? '').trim().slice(0, 100);
      return transaction(() => Array.from({ length: count }, () => {
        const text = randomBytes(20).toString('hex').toUpperCase().match(/.{1,8}/g).join('-');
        const code = `${kind === 'activation' ? 'WJA' : 'WJR'}-${text}`;
        const id = randomUUID();
        db.prepare('INSERT INTO codes (id,hash,last4,kind,points,label,created,expires) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, codeHash(code), text.slice(-4), kind, points, label, now(), now() + days * 86400000);
        return { id, code, kind, points, label };
      }));
    },
    voidCode(id) {
      const row = db.prepare("UPDATE codes SET status='void' WHERE id=? AND status='unused' RETURNING id").get(id);
      if (!row) fail('只可作废尚未使用的卡密。', 409);
      return { ok: true };
    },
    overview() {
      return {
        users: db.prepare('SELECT id,username,status,balance,created FROM users ORDER BY rowid DESC LIMIT 500').all()
          .map((entry) => ({ ...entry, onboardingState: enrollment.publicView(entry.id).state,
            cloud: { usedBytes: cloud.usage(entry.id), quotaBytes: cloud.quota(entry.id) } })),
        codes: db.prepare('SELECT id,last4,kind,points,label,status,user_id,created,expires FROM codes ORDER BY rowid DESC LIMIT 500').all(),
        operations: db.prepare('SELECT o.id,u.username,o.status,o.reserved,o.charged,o.note,o.created FROM operations o JOIN users u ON u.id=o.user_id ORDER BY o.rowid DESC LIMIT 100').all(),
        reviewQueue: reviewOperations(),
        totals: {
          users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
          balance: db.prepare('SELECT COALESCE(SUM(balance),0) AS n FROM users').get().n,
          charged: db.prepare("SELECT COALESCE(SUM(charged),0) AS n FROM operations WHERE status='settled'").get().n
            + db.prepare('SELECT COALESCE(SUM(charged),0) AS n FROM cloud_receipts').get().n,
          held: db.prepare("SELECT COALESCE(SUM(reserved),0) AS n FROM operations WHERE status IN ('submitted','review')").get().n,
        },
      };
    },
    changeUser(id, input) {
      if (!user(id)) fail('学员不存在。', 404);
      return transaction(() => {
        if (input.status !== undefined) {
          if (!['active', 'suspended'].includes(input.status)) fail('账号状态无效。');
          db.prepare('UPDATE users SET status=? WHERE id=?').run(input.status, id);
        }
        if (input.password !== undefined) {
          db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(input.password), id);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
        }
        return user(id);
      });
    },
    saveChat(input) {
      const config = readChatTiers();
      if (input.tier !== undefined && !CHAT_TIER_IDS.includes(input.tier)) fail('创作助手档位无效。');
      const tier = input.tier ?? config.defaultTier;
      const next = validateChat(input, config.tiers[tier], tier);
      const defaultTier = input.defaultTier ?? config.defaultTier;
      if (!CHAT_TIER_IDS.includes(defaultTier)) fail('默认创作助手档位无效。');
      config.tiers[tier] = next;
      config.defaultTier = defaultTier;
      if (defaultTier !== readChatTiers().defaultTier && !config.tiers[defaultTier].enabled) fail('默认档位必须先完成配置并启用。');
      transaction(() => {
        db.prepare("INSERT INTO settings VALUES ('chat',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed")
          .run(seal(config.tiers.base));
        db.prepare("INSERT INTO settings VALUES ('chat-tiers',?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed")
          .run(seal(config));
      });
      return this.adminChat();
    },
    adminChat() {
      const config = readChatTiers();
      const selected = config.tiers[config.defaultTier];
      const { key, ...settings } = selected;
      return { ...settings, keyConfigured: Boolean(key), defaultTier: config.defaultTier,
        priceDrafts: Object.fromEntries(CHAT_TIER_IDS.map((tier) => {
          const { label: _label, ...rates } = CHAT_TIER_DEFINITIONS[tier];
          return [tier, { ...rates, reservePoints: maximumUsagePoints({ ...config.tiers[tier], ...rates }) }];
        })),
        tiers: Object.fromEntries(CHAT_TIER_IDS.map((tier) => {
          const { key: tierKey, ...profile } = config.tiers[tier];
          return [tier, { ...profile, keyConfigured: Boolean(tierKey) }];
        })) };
    },
    reserve(id, key, fingerprint) {
      const rates = chat(id);
      if (!rates.enabled) fail('老师尚未开通创作助手。', 503);
      return transaction(() => {
        const previous = db.prepare('SELECT * FROM operations WHERE user_id=? AND request_key=?').get(id, key);
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail('同一请求编号不能提交不同内容。', 409);
          fail(`该请求已经提交，请核对消费记录：${previous.id}`, 409);
        }
        if (db.prepare("SELECT COUNT(*) AS n FROM operations WHERE user_id=? AND status='submitted'").get(id).n >= 2) fail('已有创作请求正在执行，请稍后。', 429);
        if (rates.billingMode === 'included'
          && db.prepare('SELECT COUNT(*) AS n FROM operations WHERE user_id=? AND created>=?')
            .get(id, now() - 86400000).n >= rates.dailyRequestLimit) fail('已达到近24小时创作请求上限，请稍后再试或联系管理员。', 429);
        const operation = { id: randomUUID(), reserved: rates.reservePoints,
          rates: { ...rates, tier: publicChat(id).selectedTier } };
        if (operation.reserved > 0) addEntry(id, 'reserve', -operation.reserved, operation.id, '创作助手费用预留');
        const { key: _secret, ...priceSnapshot } = operation.rates;
        // Supplier address/model do not belong in the accounting snapshot.
        delete priceSnapshot.baseUrl; delete priceSnapshot.model;
        db.prepare('INSERT INTO operations (id,user_id,request_key,fingerprint,status,reserved,rates,created) VALUES (?,?,?,?,?,?,?,?)')
          .run(operation.id, id, key, fingerprint, 'submitted', operation.reserved, JSON.stringify(priceSnapshot), now());
        return operation;
      });
    },
    /**
     * 媒体按次定价。默认全关，避免升级后意外扣费。
     * 与对话不同，这里不需要 Token 预估：一张图、一段视频都是整数点。
     */
    mediaPrices() {
      const rows = db.prepare('SELECT category,points,enabled FROM media_prices').all();
      const defaults = { image: 5, video: 60, audio: 10 };
      return Object.fromEntries(Object.entries(defaults).map(([category, points]) => {
        const row = rows.find((candidate) => candidate.category === category);
        return [category, { points: row ? row.points : points, enabled: row ? row.enabled === 1 : false }];
      }));
    },
    saveMediaPrices(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('媒体定价格式无效。');
      return transaction(() => {
        for (const category of ['image', 'video', 'audio']) {
          const value = input[category];
          if (value === undefined) continue;
          if (!value || typeof value !== 'object') fail('媒体定价格式无效。');
          const points = integer(value.points, 0, 1_000_000, '单次点数');
          const enabled = value.enabled === true ? 1 : 0;
          db.prepare(`INSERT INTO media_prices (category,points,enabled,updated) VALUES (?,?,?,?)
            ON CONFLICT(category) DO UPDATE SET points=excluded.points,enabled=excluded.enabled,updated=excluded.updated`)
            .run(category, points, enabled, now());
        }
        return this.mediaPrices();
      });
    },
    /** 学员能否看到媒体代理入口：至少一类已启用且定价大于 0。 */
    mediaRelayAvailable() {
      const prices = this.mediaPrices();
      return Object.entries(prices).some(([, value]) => value.enabled && value.points > 0);
    },
    /**
     * 媒体生成预占。与对话的 reserve 分开：媒体不按 Token 估算，直接扣固定点数。
     * 幂等键与指纹复用 operations 表，保证同一请求不会重复扣费。
     */
    reserveMedia(id, key, fingerprint, category) {
      const price = this.mediaPrices()[category];
      if (!price || !price.enabled) fail('该类型的媒体生成尚未开放计费通道。', 503);
      if (price.points <= 0) fail('媒体定价未配置，请联系管理员。', 503);
      return transaction(() => {
        if (db.prepare('SELECT COUNT(*) AS n FROM operations WHERE user_id=? AND status=?').get(id, 'submitted').n >= 1) {
          fail('已有一个生成任务正在执行，请等待完成。', 429);
        }
        const previous = db.prepare('SELECT * FROM operations WHERE user_id=? AND request_key=?').get(id, key);
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail('同一请求编号不能提交不同内容。', 409);
          fail(`该请求已经提交，请核对消费记录：${previous.id}`, 409);
        }
        const operation = { id: randomUUID(), reserved: price.points, rates: { kind: 'media', category, points: price.points } };
        addEntry(id, 'reserve', -operation.reserved, operation.id, `媒体生成费用预留（${category}）`);
        db.prepare('INSERT INTO operations (id,user_id,request_key,fingerprint,status,reserved,rates,created) VALUES (?,?,?,?,?,?,?,?)')
          .run(operation.id, id, key, fingerprint, 'submitted', operation.reserved, JSON.stringify(operation.rates), now());
        return operation;
      });
    },
    /** 记录异步媒体的上游任务号，提交时调用；查询确认成功后才结算。 */
    attachMediaTask(id, remoteId, provider) {
      if (typeof remoteId !== 'string' || !remoteId) fail('上游任务编号无效。');
      const changed = db.prepare("UPDATE operations SET media_task=?, media_provider=?, media_category=(SELECT json_extract(rates,'$.category') FROM operations WHERE id=?) WHERE id=? AND status='submitted'")
        .run(remoteId.slice(0, 200), String(provider || '').slice(0, 80), id, id);
      if (!changed.changes) fail('该请求不在待结算状态，无法绑定上游任务。', 409);
      return { ok: true };
    },
    /** 取该账号的媒体任务，用于查询与结算；不返回其他账号的任务。 */
    mediaOperation(userId, id) {
      const row = db.prepare(`SELECT id, status, reserved, media_task, media_category, media_provider
        FROM operations WHERE id=? AND user_id=?`).get(id, userId);
      if (!row) return null;
      return { id: row.id, status: row.status, reserved: row.reserved,
        mediaTaskId: row.media_task || '', mediaCategory: row.media_category || '',
        mediaProvider: row.media_provider || '' };
    },
    settle(id, points, note = '', usage = null, manual = false) {
      return transaction(() => {
        const op = db.prepare('SELECT * FROM operations WHERE id=?').get(id);
        if (!op) fail('请求不存在。', 404);
        integer(points, 0, op.reserved, '结算点数');
        if (['settled', 'released'].includes(op.status)) {
          if (op.charged !== points) fail('该请求已经结算，金额不同。', 409);
          return { ok: true, charged: points };
        }
        if (manual && op.status !== 'review') fail('只可人工处理待核对请求。', 409);
        if (op.reserved > 0) addEntry(op.user_id, 'settle', op.reserved - points, op.id, points ? '创作完成，退回多余预留' : '未计费，退回预留');
        db.prepare('UPDATE operations SET status=?,charged=?,note=?,usage=? WHERE id=?')
          .run(points ? 'settled' : 'released', points, String(note).slice(0, 200), usage ? JSON.stringify(usage) : null, id);
        return { ok: true, charged: points };
      });
    },
    review(id, note) {
      db.prepare("UPDATE operations SET status='review',note=? WHERE id=? AND status='submitted'").run(String(note).slice(0, 200), id);
    },
  };
}
