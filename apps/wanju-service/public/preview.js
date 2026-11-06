/**
 * 玩剧 2.0 测试台。
 *
 * 只做一件事：让老师亲眼看到"服务端代理生成 + 预占结算"这条链路在动。
 * 请求发到 /api/relay/media，密钥由服务端注入，浏览器里拿不到。
 */

const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('wanju-preview') || '';
let profile = null;

const setStatus = (id, text, kind = '') => {
  const el = $(id);
  el.textContent = text;
  el.dataset.kind = kind;
};

const call = async (path, { method = 'GET', data, idempotencyKey } = {}) => {
  let response;
  try {
    response = await fetch(path, {
      method,
      cache: 'no-store',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'content-type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } catch {
    // 本地预览服务是关窗即停的。页面还能看、但服务没了，浏览器只会给一句 Failed to fetch，
    // 没人看得懂。这里翻成一句能照着做的话。
    throw new Error('本地预览服务已停止。重新双击「打开玩剧2.0测试版.cmd」，再刷新本页即可。');
  }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value?.error?.message || `请求失败（${response.status}）`);
  return value;
};

const money = (points) => `${Number(points).toLocaleString('zh-CN')} 点`;

function step(text, state) {
  const list = $('steps');
  const item = document.createElement('li');
  item.textContent = text;
  if (state) item.className = state;
  list.append(item);
  return item;
}

async function loadAccount() {
  const me = await call('/api/me');
  $('balance').textContent = Number(me.user.balance).toLocaleString('zh-CN');
  $('held').textContent = Number(me.heldPoints || 0).toLocaleString('zh-CN');

  const ledger = $('ledger');
  ledger.replaceChildren();
  $('ledger-empty').hidden = (me.ledger || []).length > 0;
  for (const entry of me.ledger || []) {
    const row = document.createElement('tr');
    const cells = [
      entry.kind === 'reserve' ? '预占' : entry.kind === 'settle' ? '结算' : entry.kind,
      `${entry.delta > 0 ? '+' : ''}${entry.delta}`,
      Number(entry.balance).toLocaleString('zh-CN'),
      entry.title,
      new Date(entry.created).toLocaleString('zh-CN', { hour12: false }),
    ];
    for (const [index, text] of cells.entries()) {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (index === 1 || index === 2) cell.className = 'num';
      row.append(cell);
    }
    ledger.append(row);
  }
  return me;
}

async function loadPrices() {
  const data = await call('/api/media/prices');
  const image = data.prices?.image ?? {};
  const video = data.prices?.video ?? {};
  $('price-image').textContent = image.enabled ? money(image.points) : '未开启';
  $('price-video').textContent = video.enabled ? money(video.points) : '未开启';
  if (image.enabled) {
    $('run-hint').textContent = `预计扣 ${image.points} 点。上游拒绝会全额退回；断网或超时会保留并转待核对，不会自动重发。`;
  }
  return data;
}

async function loadProfile() {
  const config = await call('/api/media/config');
  const id = config.defaults?.image;
  profile = (config.profiles || []).find((item) => item.id === id) || null;
  $('channel-note').textContent = profile
    ? `图片通道：${profile.name}｜模型 ${profile.model}｜${profile.baseUrl}｜密钥仅保存在服务端`
    : '还没有配置可用的图片通道，先去老师后台配一个。';
}

async function login() {
  const button = $('login');
  button.disabled = true;
  setStatus('login-status', '正在验证…');
  try {
    const result = await call('/api/login', {
      method: 'POST',
      data: { username: $('username').value.trim(), password: $('password').value },
    });
    token = result.token;
    sessionStorage.setItem('wanju-preview', token);
    await Promise.all([loadAccount(), loadPrices()]);
    await loadProfile();
    $('account-card').hidden = false;
    $('run-card').hidden = false;
    $('log-card').hidden = false;
    const imageEnabled = !$('price-image').textContent.includes('未开启');
    $('run').disabled = !imageEnabled || !profile;
    setStatus('login-status', imageEnabled ? '已进入，可以试跑了。' : '已进入，但图片计费还没开启。', imageEnabled ? 'ok' : 'warn');
  } catch (error) {
    setStatus('login-status', error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function runOnce() {
  const button = $('run');
  button.disabled = true;
  $('steps').replaceChildren();
  $('shot').style.display = 'none';
  setStatus('run-status', '');

  const before = Number($('balance').textContent.replace(/[^\d]/g, '')) || 0;
  try {
    const payload = {
      model: profile?.model,
      prompt: $('prompt').value.trim(),
      n: 1,
      response_format: profile?.responseFormat || 'url',
    };
    if (!payload.prompt) throw new Error('先写一句提示词。');

    step('提交请求，服务端注入密钥并预占点数', 'done');
    const started = Date.now();
    const result = await call('/api/relay/media', {
      method: 'POST',
      data: { category: $('category').value, payload },
      idempotencyKey: crypto.randomUUID(),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    step(`上游返回成功，用时 ${seconds} 秒`, 'done');
    step(`已按次结算，请求编号 ${String(result.operationId).slice(0, 8)}…`, 'done');

    const item = result.result?.data?.[0] ?? {};
    const image = $('shot');
    if (item.url) {
      image.src = item.url;
      image.style.display = 'block';
    } else if (item.b64_json) {
      image.src = `data:image/png;base64,${item.b64_json}`;
      image.style.display = 'block';
    } else {
      step('上游返回里没有找到图片地址，看下面的原始结构', 'fail');
      const raw = document.createElement('pre');
      raw.textContent = JSON.stringify(result.result, null, 2).slice(0, 1200);
      $('steps').append(raw);
    }

    await loadAccount();
    const after = Number($('balance').textContent.replace(/[^\d]/g, '')) || 0;
    setStatus('run-status', `完成。余额 ${before} → ${after} 点，实扣 ${before - after} 点。`, 'ok');
  } catch (error) {
    step(error.message, 'fail');
    setStatus('run-status', error.message, 'error');
    await loadAccount().catch(() => {});
  } finally {
    button.disabled = false;
  }
}

$('login').addEventListener('click', () => void login());
$('password').addEventListener('keydown', (event) => { if (event.key === 'Enter') void login(); });
$('run').addEventListener('click', () => void runOnce());
$('refresh').addEventListener('click', () => {
  void loadAccount().then(() => setStatus('run-status', '余额已刷新。', 'ok')).catch((error) => setStatus('run-status', error.message, 'error'));
});

// 已登录过就直接进
if (token) {
  void Promise.all([loadAccount(), loadPrices()])
    .then(() => loadProfile())
    .then(() => {
      $('account-card').hidden = false;
      $('run-card').hidden = false;
      $('log-card').hidden = false;
      $('run').disabled = $('price-image').textContent.includes('未开启') || !profile;
      setStatus('login-status', '已恢复上次登录。', 'ok');
    })
    .catch(() => {
      token = '';
      sessionStorage.removeItem('wanju-preview');
    });
}
