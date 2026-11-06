/**
 * 玩剧 · 老师后台
 *
 * 结构：基础工具 → 各区块渲染 → 事件绑定。
 * 跨脚本共用：call / status / button / reload（enrollment.js、media-admin.js 会用到），
 * 改名会直接让那两个脚本报错。
 */

/* ── 基础工具 ────────────────────────────────────── */

const $ = (id) => document.getElementById(id);

let token = sessionStorage.getItem('wanju-admin') || '';
let settings = null;
let chatTier = 'base';
let lastCodes = [];
let reviewPage = 1;
let reviewPages = 1;
let reviewBusy = false;

/** 最近一次总览数据，搜索时直接在这份数据上过滤，不再请求服务端。 */
let overview = null;
let userQuery = '';
let codeQuery = '';

const status = (text, kind = '') => {
  const el = $('status');
  el.textContent = text;
  el.dataset.kind = kind;
};

const call = async (path, { method = 'GET', data } = {}) => {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'content-type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value?.error?.message || `请求失败（${response.status}）`);
  return value;
};

const date = (n) => new Date(n).toLocaleString('zh-CN', { hour12: false });

const button = (text, handler, extra = '') => {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `small-button ${extra}`;
  element.textContent = text;
  element.onclick = handler;
  return element;
};

/** 表格空态：一行跨列提示，避免表格塌成一条线。 */
const emptyRow = (columns, text) => {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columns;
  cell.className = 'muted';
  cell.textContent = text;
  row.append(cell);
  return row;
};

const cell = (text) => {
  const element = document.createElement('td');
  element.textContent = text;
  return element;
};

/* ── 渲染：总览 ──────────────────────────────────── */

function renderTotals(data) {
  const totals = $('totals');
  totals.replaceChildren();
  const rows = [
    ['学员', data.totals.users],
    ['已充值余额（点）', data.totals.balance],
    ['已结算（点）', data.totals.charged],
    ['待核对预留（点）', data.totals.held],
  ];
  for (const [name, value] of rows) {
    const wrap = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = name;
    dd.textContent = Number(value).toLocaleString('zh-CN');
    wrap.append(dt, dd);
    totals.append(wrap);
  }
}

/** 账号搜索：本地过滤，不触发请求。 */
const matchUser = (user) => !userQuery || String(user.username).toLowerCase().includes(userQuery);

function renderUsers() {
  const body = $('users');
  body.replaceChildren();
  const list = (overview?.users ?? []).filter(matchUser);
  if (!list.length) {
    body.append(emptyRow(5, overview?.users?.length ? '没有匹配的账号' : '还没有学员账号'));
    return;
  }
  for (const user of list) {
    const row = document.createElement('tr');
    row.append(
      cell(user.username),
      cell(`${user.balance}点`),
      cell(date(user.created)),
      cell(user.status === 'active' ? '正常' : '已暂停'),
    );
    const actions = document.createElement('td');
    actions.append(button(user.status === 'active' ? '暂停账户' : '恢复账户', async () => {
      try {
        await call(`/api/admin/users/${encodeURIComponent(user.id)}`, {
          method: 'PATCH', data: { status: user.status === 'active' ? 'suspended' : 'active' },
        });
        await reload();
      } catch (error) { status(error.message, 'error'); }
    }));
    actions.append(button('重设密码', async () => {
      const password = prompt(`设置 ${user.username} 的新密码（至少10位）`);
      if (password === null) return;
      try {
        await call(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', data: { password } });
        await reload();
        status('密码已重置，旧登录凭证已撤销。', 'success');
      } catch (error) { status(error.message, 'error'); }
    }));
    actions.append(button('媒体密钥', () => void openMediaKeys(user)));
    row.append(actions);
    body.append(row);
  }
}

function renderCloudUsers() {
  const body = $('cloud-users');
  body.replaceChildren();
  const list = (overview?.users ?? []).filter(matchUser);
  if (!list.length) { body.append(emptyRow(4, '没有匹配的账号')); return; }
  for (const user of list) {
    const row = document.createElement('tr');
    row.append(
      cell(user.username),
      cell(`${((user.cloud?.usedBytes || 0) / 1024 ** 3).toFixed(2)} GB`),
      cell(`${((user.cloud?.quotaBytes || 0) / 1024 ** 3).toFixed(2)} GB`),
    );
    const actions = document.createElement('td');
    actions.append(button('设置配额', async () => {
      const value = prompt(`设置 ${user.username} 的云空间配额（GB，不会自动购买磁盘）`, String((user.cloud?.quotaBytes || 0) / 1024 ** 3));
      if (value === null) return;
      if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) {
        status('请输入有效的非负配额。', 'error');
        return;
      }
      try {
        await call(`/api/admin/users/${encodeURIComponent(user.id)}/cloud-quota`, {
          method: 'PUT', data: { bytes: Math.round(Number(value) * 1024 ** 3) },
        });
        await reload();
        status('云空间配额已更新。', 'success');
      } catch (error) { status(error.message, 'error'); }
    }));
    row.append(actions);
    body.append(row);
  }
}

/* ── 渲染：卡密 ──────────────────────────────────── */

const CODE_STATUS = { unused: '未使用', redeemed: '已使用', void: '已作废' };
const matchCode = (item) => !codeQuery
  || String(item.last4).toLowerCase().includes(codeQuery)
  || String(item.label ?? '').toLowerCase().includes(codeQuery);

function renderCodes() {
  const body = $('codes');
  body.replaceChildren();
  const list = (overview?.codes ?? []).filter(matchCode);
  if (!list.length) {
    body.append(emptyRow(6, overview?.codes?.length ? '没有匹配的卡密' : '还没有生成过卡密'));
    return;
  }
  for (const item of list) {
    const row = document.createElement('tr');
    row.append(
      cell(item.kind === 'activation' ? '激活码' : '充值卡'),
      cell(`…${item.last4}`),
      cell(item.points),
      cell(item.label || '—'),
      cell(CODE_STATUS[item.status] || item.status),
    );
    const actions = document.createElement('td');
    if (item.status === 'unused') {
      actions.append(button('作废', async () => {
        if (!confirm(`作废尾号 ${item.last4} 的卡？`)) return;
        try {
          await call(`/api/admin/codes/${encodeURIComponent(item.id)}/void`, { method: 'POST', data: {} });
          await reload();
          status('卡密已作废。', 'success');
        } catch (error) { status(error.message, 'error'); }
      }));
    }
    row.append(actions);
    body.append(row);
  }
}

/* ── 渲染：待核对队列 ────────────────────────────── */

function updateReviewButtons() {
  $('review-prev').disabled = reviewBusy || reviewPage <= 1;
  $('review-next').disabled = reviewBusy || reviewPage >= reviewPages;
}

async function lookupOperation(id) {
  const result = $('operation-result');
  result.hidden = true;
  $('operation-status').textContent = '正在查询…';
  try {
    const item = await call(`/api/admin/operations/${encodeURIComponent(id)}`);
    const states = { submitted: '处理中', review: '待核对', settled: '已结算', released: '已退回' };
    const phases = { connecting: '连接上游', headers: '接收响应头', json: '读取结果', stream: '接收流式回答', usage: '核对用量' };
    const rows = [
      ['请求编号', item.id], ['账号', item.username], ['时间', date(item.created)],
      ['账单状态', `${states[item.status] || item.status} · 预留 ${item.reserved} 点 · 已结算 ${item.charged ?? 0} 点`],
      ['处理备注', item.note || '—'],
    ];
    const detail = item.diagnostic;
    if (detail) rows.push(
      ['诊断', detail.summary], ['模型', detail.model || '—'], ['供应商', detail.host || '—'],
      ['协议 / 阶段', `${detail.protocol === 'responses' ? 'Responses' : 'Chat Completions'} / ${phases[detail.phase] || detail.phase}`],
      ['上游状态 / 错误码', `${detail.upstreamStatus || '未收到 HTTP 状态'} / ${detail.errorCode || detail.category}`],
      ['耗时 / 接收量', `${detail.elapsedMs === null ? '—' : `${(detail.elapsedMs / 1000).toFixed(1)} 秒`} / ${detail.receivedBytes ?? 0} 字节`],
    );
    result.replaceChildren();
    for (const [name, value] of rows) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = name;
      dd.textContent = value;
      result.append(dt, dd);
    }
    result.hidden = false;
    $('operation-status').textContent = detail ? '' : '此请求没有详细诊断记录，请根据处理备注和供应商账单核对。';
  } catch (error) { $('operation-status').textContent = error.message; }
}

$('operation-lookup').addEventListener('submit', (event) => {
  event.preventDefault();
  void lookupOperation($('operation-id').value.trim());
});

function renderReviewQueue(queue) {
  reviewPage = queue.page;
  reviewPages = queue.pages;
  $('review-page').textContent = `第 ${reviewPage} / ${reviewPages} 页`;
  $('review-summary').textContent = `共 ${queue.total} 条待核对 · 预留 ${queue.heldPoints} 点`
    + (queue.oldestCreated ? ` · 最早 ${date(queue.oldestCreated)}` : '');
  updateReviewButtons();

  const body = $('operations');
  body.replaceChildren();
  if (!queue.items.length) { body.append(emptyRow(4, '没有待核对的请求')); return; }

  for (const item of queue.items) {
    const row = document.createElement('tr');
    const actions = document.createElement('td');
    actions.append(button('查看诊断', () => {
      $('operation-id').value = item.id;
      void lookupOperation(item.id);
      $('operation-lookup').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    actions.append(button('核账并结算', async () => {
      const raw = prompt(`核对供应商账单后输入实际结算点数（0–${item.reserved}）`);
      if (raw === null) return;
      const points = Number(raw);
      const reason = prompt('输入核账依据（至少4字，例如供应商账单记录号）');
      if (reason === null) return;
      try {
        await call(`/api/admin/operations/${encodeURIComponent(item.id)}/settle`, {
          method: 'POST', data: { points, reason },
        });
        await reload();
        status('结算完成。', 'success');
      } catch (error) { status(error.message, 'error'); }
    }));
    row.append(
      cell(item.username),
      cell(`${item.reserved}点`),
      cell(`${item.id.slice(0, 8)} · ${item.note}`),
      actions,
    );
    body.append(row);
  }
}

async function loadReviewPage(page) {
  if (reviewBusy) return;
  reviewBusy = true;
  updateReviewButtons();
  try {
    renderReviewQueue(await call(`/api/admin/operations/review?page=${page}`));
  } catch (error) {
    status(error.message, 'error');
  } finally {
    reviewBusy = false;
    updateReviewButtons();
  }
}

/* ── 渲染入口 ────────────────────────────────────── */

function render(data) {
  overview = data;
  renderEnrollments(data);
  renderTotals(data);
  renderUsers();
  renderCloudUsers();
  renderCodes();
  renderReviewQueue(data.reviewQueue);
}

async function reload() {
  render(await call('/api/admin/overview'));
}

/* ── 登录态 ──────────────────────────────────────── */

function updateChatBilling() {
  const included = $('chat-billing').value === 'included';
  for (const id of ['chat-input-price', 'chat-output-price', 'chat-reserve']) {
    $(id).disabled = included;
    $(id).required = !included;
  }
  for (const id of ['chat-cache-read-price', 'chat-cache-write-price']) $(id).disabled = included;
}

async function enter() {
  const data = await call('/api/admin/overview');
  $('login').hidden = true;
  $('dashboard').hidden = false;
  $('admin-logout').hidden = false;
  $('admin-secret').value = '';
  render(data);

  settings = await call('/api/admin/settings');
  $('chat-default-tier').value = settings.defaultTier || 'base';
  renderChatTier();

  const cloudPrices = await call('/api/admin/cloud/prices');
  $('cloud-image-price').value = (cloudPrices.imagePoints / 100).toFixed(2);
  $('cloud-video-price').value = (cloudPrices.videoPoints / 100).toFixed(2);
  $('cloud-fees-enabled').checked = cloudPrices.enabled;

  const mediaPrices = await call('/api/admin/media-prices');
  $('media-price-image').value = mediaPrices.image?.points ?? 5;
  $('media-price-image-on').checked = mediaPrices.image?.enabled === true;
  $('media-price-video').value = mediaPrices.video?.points ?? 60;
  $('media-price-video-on').checked = mediaPrices.video?.enabled === true;
  status('后台已连接', 'success');
}

function renderChatTier() {
  const profile = settings.tiers?.[chatTier] || settings;
  $('chat-tier').value = chatTier;
  $('chat-url').value = profile.baseUrl || '';
  $('chat-model').value = profile.model || 'claude-opus-5-5';
  $('chat-name').value = profile.displayName || '玩剧创作助手';
  $('chat-format').value = profile.format || 'chat';
  $('chat-billing').value = profile.billingMode || 'wallet';
  $('chat-daily-limit').value = profile.dailyRequestLimit || 200;
  updateChatBilling();
  $('chat-key').value = '';
  $('chat-input-price').value = profile.inputPointsPerMillion ?? '';
  $('chat-output-price').value = profile.outputPointsPerMillion ?? '';
  $('chat-cache-read-price').value = profile.cachedInputPointsPerMillion ?? '';
  $('chat-cache-write-price').value = profile.cacheWritePointsPerMillion ?? '';
  $('chat-context').value = profile.context || 32000;
  $('chat-max-output').value = profile.maxOutputTokens || 4096;
  $('chat-reserve').value = profile.reservePoints || 0;
  $('chat-vision').checked = profile.visionVerified === true;
  $('chat-enabled').checked = profile.enabled === true;
  $('chat-key-status').textContent = profile.keyConfigured ? '已保存密钥；留空可保留' : '尚未设置密钥';
}

async function login(event) {
  event.preventDefault();
  const password = $('admin-secret').value;
  if (!password) return;
  const submit = $('login-form').querySelector('button');
  submit.disabled = true;
  try {
    const result = await call('/api/admin/login', { method: 'POST', data: { password } });
    token = result.token;
    sessionStorage.setItem('wanju-admin', token);
    $('admin-secret').value = '';
    await enter();
  } catch (error) {
    sessionStorage.removeItem('wanju-admin');
    token = '';
    $('login-status').textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

/* ── 事件绑定 ────────────────────────────────────── */

$('chat-billing').addEventListener('change', updateChatBilling);
$('chat-tier').addEventListener('change', () => {
  chatTier = $('chat-tier').value;
  renderChatTier();
});
$('chat-use-prices').addEventListener('click', () => {
  const prices = settings?.priceDrafts?.[chatTier];
  if (!prices) return;
  $('chat-billing').value = 'wallet';
  $('chat-model').value = 'claude-opus-5-5';
  for (const [id, field] of [['chat-input-price', 'inputPointsPerMillion'], ['chat-output-price', 'outputPointsPerMillion'],
    ['chat-cache-read-price', 'cachedInputPointsPerMillion'], ['chat-cache-write-price', 'cacheWritePointsPerMillion']]) $(id).value = prices[field];
  $('chat-reserve').value = Math.ceil((Number($('chat-context').value) * Math.max(prices.inputPointsPerMillion,
    prices.cachedInputPointsPerMillion, prices.cacheWritePointsPerMillion)
    + Number($('chat-max-output').value) * prices.outputPointsPerMillion) / 1000000);
  updateChatBilling();
  status('已填入此档位的双倍售价，请核对对应的供应商分组后保存。');
});
$('login-form').addEventListener('submit', login);
$('review-prev').addEventListener('click', () => void loadReviewPage(reviewPage - 1));
$('review-next').addEventListener('click', () => void loadReviewPage(reviewPage + 1));

$('refresh').addEventListener('click', () => {
  void reload().then(() => status('已刷新', 'success')).catch((error) => status(error.message, 'error'));
});

$('admin-logout').addEventListener('click', async () => {
  try { await call('/api/admin/logout', { method: 'POST', data: {} }); } finally {
    closeEnrollment();
    token = '';
    sessionStorage.removeItem('wanju-admin');
    lastCodes = [];
    $('code-list').replaceChildren();
    $('created-codes').hidden = true;
    $('chat-key').value = '';
    $('dashboard').hidden = true;
    $('login').hidden = false;
    $('admin-logout').hidden = true;
  }
});

// 搜索框：输入即过滤，只在已加载数据上做，不发请求
$('user-search').addEventListener('input', (event) => {
  userQuery = event.target.value.trim().toLowerCase();
  renderUsers();
  renderCloudUsers();
});
$('code-search').addEventListener('input', (event) => {
  codeQuery = event.target.value.trim().toLowerCase();
  renderCodes();
});

document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === tab));
  document.querySelectorAll('[data-pane]').forEach((pane) => { pane.hidden = pane.dataset.pane !== tab.dataset.tab; });
}));

/* ── 卡密生成与导出 ──────────────────────────────── */

$('card-kind').addEventListener('change', () => {
  const activation = $('card-kind').value === 'activation';
  $('card-points').min = activation ? '0' : '1';
  if (activation && Number($('card-points').value) === 9900) $('card-points').value = '0';
  if (!activation && Number($('card-points').value) === 0) $('card-points').value = '9900';
});

$('cards-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await call('/api/admin/codes', {
      method: 'POST',
      data: {
        kind: $('card-kind').value,
        count: Number($('card-count').value),
        points: Number($('card-points').value),
        days: Number($('card-days').value),
        label: $('card-label').value,
      },
    });
    lastCodes = data.codes;
    $('code-list').replaceChildren(...lastCodes.map((item) => {
      const line = document.createElement('div');
      line.className = 'code-line';
      const code = document.createElement('code');
      code.textContent = item.code;
      const copy = button('复制', async () => {
        await navigator.clipboard.writeText(item.code);
        copy.textContent = '已复制';
        setTimeout(() => { copy.textContent = '复制'; }, 1600);
      });
      line.append(code, copy);
      return line;
    }));
    $('created-codes').hidden = false;
    await reload();
    status(`已生成 ${lastCodes.length} 张卡。立即下载并保存；完整卡密不会再次显示。`, 'success');
  } catch (error) { status(error.message, 'error'); }
});

/** CSV 导出：以 = + - @ 开头的值前置单引号，避免在 Excel 里被当成公式执行。 */
const csvCell = (value) => {
  const text = String(value);
  return `"${(/^[\s]*[=+\-@]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

$('download-codes').addEventListener('click', () => {
  if (!lastCodes.length) return;
  const rows = ['类型,卡密,点数,批次备注', ...lastCodes.map((item) => [
    item.kind === 'activation' ? '激活码' : '充值卡', item.code, item.points, item.label,
  ].map(csvCell).join(','))];
  const url = URL.createObjectURL(new Blob([`\ufeff${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `玩剧卡密-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

/* ── 售价测算 ────────────────────────────────────── */

$('pricing-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = $('pricing-result');
  const submit = event.currentTarget.querySelector('button');
  submit.disabled = true;
  try {
    const quote = await call('/api/admin/pricing/quote', {
      method: 'POST',
      data: {
        unit: $('pricing-unit').value,
        costYuan: $('pricing-cost').value,
        multiplier: $('pricing-multiplier').value,
        quantity: Number($('pricing-quantity').value),
      },
    });
    result.textContent = `建议每单位 ${quote.unitPoints} 点（¥${quote.unitSaleYuan}）；共 ${quote.totalPoints} 点，`
      + `采购成本 ¥${quote.totalCostYuan}，账面毛利 ¥${quote.grossProfitYuan}（${quote.grossMarginPercent}%）。尚未更改售价。`;
  } catch (error) { result.textContent = error.message; }
  finally { submit.disabled = false; }
});

/* ── 创作助手与云服务费设置 ──────────────────────── */

$('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const next = {
    tier: chatTier,
    defaultTier: $('chat-default-tier').value,
    baseUrl: $('chat-url').value.trim(),
    model: $('chat-model').value.trim(),
    key: $('chat-key').value,
    displayName: $('chat-name').value.trim(),
    format: $('chat-format').value,
    billingMode: $('chat-billing').value,
    dailyRequestLimit: Number($('chat-daily-limit').value),
    inputPointsPerMillion: Number($('chat-input-price').value),
    outputPointsPerMillion: Number($('chat-output-price').value),
    cachedInputPointsPerMillion: $('chat-cache-read-price').value === '' ? null : Number($('chat-cache-read-price').value),
    cacheWritePointsPerMillion: $('chat-cache-write-price').value === '' ? null : Number($('chat-cache-write-price').value),
    context: Number($('chat-context').value),
    maxOutputTokens: Number($('chat-max-output').value),
    reservePoints: Number($('chat-reserve').value),
    visionVerified: $('chat-vision').checked,
    enabled: $('chat-enabled').checked,
  };
  try {
    settings = await call('/api/admin/settings', { method: 'PUT', data: next });
    $('chat-key').value = '';
    $('chat-key-status').textContent = settings.tiers?.[chatTier]?.keyConfigured ? '密钥已加密保存' : '尚未设置密钥';
    status(next.billingMode === 'included'
      ? '内部默认助手设置已保存，不扣用户钱包。'
      : next.enabled
        ? '设置已保存。登录用户可直接使用并按实际用量扣点。'
        : '设置已保存。当前档位不可用，用户不会被自动切换到其他档位。', 'success');
  } catch (error) { status(error.message, 'error'); }
});

$('chat-check').addEventListener('click', async () => {
  const submit = $('chat-check');
  const result = $('chat-check-status');
  submit.disabled = true;
  result.textContent = '正在检查已保存线路…';
  result.dataset.kind = '';
  try {
    const checked = await call('/api/admin/chat/check', { method: 'POST', data: { tier: chatTier } });
    result.textContent = checked.message
      + (checked.status ? `（HTTP ${checked.status}）` : '')
      + (checked.errorCode ? ` [${checked.errorCode}]` : '');
    result.dataset.kind = checked.ok ? 'success' : 'error';
  } catch (error) {
    result.textContent = error.message;
    result.dataset.kind = 'error';
  } finally {
    submit.disabled = false;
  }
});

$('media-prices-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button');
  submit.disabled = true;
  try {
    const value = await call('/api/admin/media-prices', {
      method: 'PUT',
      data: {
        image: { points: Number($('media-price-image').value), enabled: $('media-price-image-on').checked },
        video: { points: Number($('media-price-video').value), enabled: $('media-price-video-on').checked },
      },
    });
    $('media-prices-status').textContent = value.image?.enabled || value.video?.enabled
      ? '已保存。学员通过代理生成时会按次扣点，密钥不出服务端。'
      : '已保存，两类都关闭，学员无法走代理生成。';
  } catch (error) { $('media-prices-status').textContent = error.message; }
  finally { submit.disabled = false; }
});

$('cloud-prices-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button');
  submit.disabled = true;
  try {
    const value = await call('/api/admin/cloud/prices', {
      method: 'PUT',
      data: {
        enabled: $('cloud-fees-enabled').checked,
        imagePoints: Math.round(Number($('cloud-image-price').value) * 100),
        videoPoints: Math.round(Number($('cloud-video-price').value) * 100),
      },
    });
    $('cloud-prices-status').textContent = value.enabled
      ? '云项目生成服务费已启用。用户需单独确认此项服务费，未确认不会扣费。'
      : '服务费已关闭，不会扣款。';
  } catch (error) { $('cloud-prices-status').textContent = error.message; }
  finally { submit.disabled = false; }
});

/* ── 启动 ────────────────────────────────────────── */

if (token) {
  void enter().catch((error) => {
    token = '';
    sessionStorage.removeItem('wanju-admin');
    $('login').hidden = false;
    $('dashboard').hidden = true;
    $('login-status').textContent = error.message;
  });
}
