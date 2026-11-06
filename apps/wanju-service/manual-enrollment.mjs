const SERVICES = [
  { id: 'chat', label: '剧本与对话', provider: 'XEM', model: '', protocol: 'openai-chat' },
  { id: 'image', label: '图片', provider: 'XEM', model: 'gpt-image-2.5-flare', protocol: 'openai-images' },
  { id: 'video', label: '视频', provider: 'AutoDL / 火山', model: '', protocol: 'pending' },
  { id: 'music', label: '音乐', provider: 'SUNO', model: '', protocol: 'pending' },
];

export function createManualEnrollment({ db, seal, unseal, user, fail }) {
  db.exec(`CREATE TABLE IF NOT EXISTS enrollments (
    user_id TEXT PRIMARY KEY REFERENCES users(id), state TEXT NOT NULL,
    sealed TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL
  )`);
  const text = (value, length = 200) => String(value ?? '').trim().slice(0, length);
  const row = (id) => db.prepare('SELECT * FROM enrollments WHERE user_id=?').get(id);
  const read = (id) => {
    const found = row(id);
    return found ? { ...unseal(found.sealed), state: found.state, updated: found.updated } : null;
  };
  const fresh = () => ({
    contact: '', studentNote: '', teacherNote: '', studentMessage: '',
    channels: SERVICES.map((service) => ({
      ...service, state: 'pending', accountRef: '', credentialMode: 'student',
      baseUrl: '', key: '', visionVerified: false,
    })),
  });
  const publicView = (id) => {
    const record = read(id);
    return {
      mode: 'teacher_manual',
      state: record?.state ?? 'ready',
      message: record?.studentMessage || (record?.state === 'pending'
        ? '注册申请已收到，等待老师完成服务开通。' : '学员账户已开通，AI 功能以老师实际开放情况为准。'),
      services: record?.channels.map(({ id, label, state }) => ({ id, label, state })) ?? [],
      thirdPartyAccountsAutomatic: false,
    };
  };
  const adminView = (id) => {
    if (!user(id)) fail('学员不存在。', 404);
    const record = read(id) ?? { ...fresh(), state: 'ready', updated: 0 };
    return {
      ...record,
      channels: record.channels.map(({ key, ...channel }) => ({ ...channel, keyConfigured: Boolean(key) })),
    };
  };
  const add = (id, input) => {
    const data = { ...fresh(), contact: text(input.contact, 120), studentNote: text(input.note, 300) };
    const at = Date.now();
    db.prepare('INSERT INTO enrollments VALUES (?,?,?,?,?)').run(id, 'pending', seal(data), at, at);
  };
  const save = (id, input) => {
    if (!user(id)) fail('学员不存在。', 404);
    const before = read(id) ?? { ...fresh(), state: 'ready' };
    if (!Array.isArray(input.channels) || input.channels.length !== SERVICES.length
      || new Set(input.channels.map((c) => c.id)).size !== SERVICES.length) fail('需填写四类服务的开通情况。');
    const channels = SERVICES.map((service) => {
      const next = input.channels.find((c) => c.id === service.id);
      const old = before.channels.find((c) => c.id === service.id);
      if (!next || !['pending', 'ready', 'unavailable'].includes(next.state)) fail('服务开通状态无效。');
      if (!['shared', 'student'].includes(next.credentialMode)) fail('请选择共用渠道或学员独立渠道。');
      const key = next.clearKey === true ? '' : text(next.key, 2000) || old.key;
      const baseUrl = text(next.baseUrl, 300).replace(/\/+$/, '');
      if (baseUrl) {
        let url;
        try { url = new URL(baseUrl); } catch { fail('接口地址无效。'); }
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail('接口地址须为不含凭证的 HTTPS 地址。');
      }
      const result = {
        ...service, state: next.state, credentialMode: next.credentialMode, key, baseUrl,
        provider: text(next.provider, 100), model: text(next.model, 200),
        accountRef: text(next.accountRef, 200), protocol: text(next.protocol, 60) || service.protocol,
        visionVerified: next.visionVerified === true,
      };
      if (result.state === 'ready' && result.credentialMode === 'student') {
        if (!result.accountRef) fail(`${service.label}独立渠道需登记第三方账号标识。`);
        if (!result.key || !result.baseUrl || !result.model) fail(`${service.label}独立渠道需填写密钥、接口地址和准确模型名。`);
      }
      return result;
    });
    const state = input.state === 'ready' ? 'ready' : 'pending';
    if (state === 'ready' && (channels.some((c) => c.state === 'pending') || !channels.some((c) => c.state === 'ready'))) {
      fail('请逐项确认四类服务；暂不提供的服务请选择“暂不开通”，并至少完成一类服务。');
    }
    const data = {
      contact: before.contact, studentNote: before.studentNote,
      teacherNote: text(input.teacherNote, 500), studentMessage: text(input.studentMessage, 300), channels,
    };
    const at = Date.now();
    db.prepare(`INSERT INTO enrollments VALUES (?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,sealed=excluded.sealed,updated=excluded.updated`)
      .run(id, state, seal(data), at, at);
    return adminView(id);
  };
  const chatOverride = (id) => {
    const record = read(id);
    if (!record) return null;
    const channel = record.channels.find((c) => c.id === 'chat');
    if (record.state !== 'ready' || channel?.state !== 'ready') return { enabled: false };
    if (channel.credentialMode !== 'student') return null;
    return {
      baseUrl: channel.baseUrl, model: channel.model, key: channel.key, format: 'chat',
      ...(channel.protocol === 'openai-chat' && channel.visionVerified ? {} : { enabled: false }),
    };
  };
  return { add, publicView, adminView, save, chatOverride };
}
