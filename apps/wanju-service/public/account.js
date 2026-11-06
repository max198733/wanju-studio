const $ = (id) => document.getElementById(id);
let mode = location.pathname === '/account' ? 'login' : 'register';
let token = sessionStorage.getItem('wanju-student-web') || '';
let busy = false;
let unified = false, connected = false;
const message = (id, text, kind = '') => { $(id).textContent = text; $(id).dataset.kind = kind; };
const call = async (path, data, authenticated = true) => {
  const response = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { ...(authenticated && token ? { authorization: `Bearer ${token}` } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error?.message || '操作失败，请稍后重试。'), { status: response.status });
  return value;
};
const setMode = (next) => {
  mode = next;
  document.querySelectorAll('[data-register]').forEach((label) => { label.hidden = mode !== 'register'; });
  if (unified) for (const id of ['activation-code', 'contact', 'student-note']) $(id).closest('label').hidden = true;
  $('confirm-password').required = mode === 'register';
  $('activation-code').required = !unified && mode === 'register';
  $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('register-tab').setAttribute('aria-selected', String(mode === 'register'));
  $('login-tab').setAttribute('aria-selected', String(mode === 'login'));
  $('submit').textContent = mode === 'register' ? unified ? '注册并登录' : '提交注册申请' : '登录账号';
  $('submit').disabled = !connected || busy;
  $('auth').querySelector('h1').textContent = mode === 'register' ? '注册玩剧账号' : '登录玩剧账号';
  $('password').value = ''; $('confirm-password').value = '';
  message('form-status', '');
};
const render = (data) => {
  $('auth').hidden = true; $('account').hidden = false;
  $('account-name').textContent = data.user.username;
  const enrollment = data.onboarding;
  const ready = enrollment?.state === 'ready';
  $('opening-title').textContent = ready ? '老师已确认账号开通' : '注册成功，等待老师开通';
  $('opening-message').textContent = enrollment?.message || '注册申请已收到，老师会处理服务开通。';
  $('review-step').textContent = ready ? '老师已确认' : '老师开通中';
  $('ready-step').textContent = ready ? '账号可使用' : '等待确认';
  $('review-step').classList.toggle('done', ready);
  $('ready-step').classList.toggle('done', ready);
  $('services').replaceChildren(...(enrollment?.services || []).map((service) => {
    const row = document.createElement('div'), label = document.createElement('span'), state = document.createElement('span');
    row.className = 'service'; label.textContent = service.label;
    state.textContent = ({ pending: '等待老师配置', ready: '账号配置已登记', unavailable: '当前暂不开通' })[service.state] || '等待确认';
    row.append(label, state); return row;
  }));
  $('balance').textContent = Number(data.user.balance).toLocaleString('zh-CN');
  $('balance-yuan').textContent = `显示余额 ¥${(data.user.balance / 100).toFixed(2)}`;
  if (unified) {
    $('enrollment-steps').hidden = true;
    $('opening-title').textContent = '账号已登录';
    $('opening-message').textContent = data.cloud?.available
      ? `云空间已开通：已用 ${(Number(data.cloud.usedBytes || 0) / 1024 ** 3).toFixed(2)} GB / ${(Number(data.cloud.quotaBytes || 0) / 1024 ** 3).toFixed(2)} GB。请在桌面软件内保存、下载云项目。`
      : '云项目当前不可用，本地工程仍可使用。';
    $('services').replaceChildren();
  }
};
const forget = () => {
  token = ''; sessionStorage.removeItem('wanju-student-web');
  $('account').hidden = true; $('auth').hidden = false;
  $('password').value = ''; $('confirm-password').value = '';
};
const refresh = async () => {
  try { render(await call('/api/me')); message('account-status', '账户已更新。'); }
  catch (error) {
    if ([401, 403].includes(error.status)) { forget(); message('form-status', error.message, 'error'); }
    else message('account-status', error.message || '连接失败，请检查网络后重试。', 'error');
  }
};
$('register-tab').addEventListener('click', () => { if (!busy) setMode('register'); });
$('login-tab').addEventListener('click', () => { if (!busy) setMode('login'); });
$('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !connected) return;
  if (mode === 'register' && $('password').value !== $('confirm-password').value) { message('form-status', '两次输入的密码不一致。', 'error'); return; }
  busy = true; $('submit').disabled = true; message('form-status', '正在提交…');
  try {
    const input = { username: $('username').value.trim(), password: $('password').value };
    if (mode === 'register' && !unified) Object.assign(input, { code: $('activation-code').value.trim(), contact: $('contact').value, note: $('student-note').value });
    const result = await call(mode === 'register' ? unified ? '/api/account/register' : '/api/register' : '/api/login', input, false);
    token = result.token; sessionStorage.setItem('wanju-student-web', token);
    $('password').value = ''; $('confirm-password').value = ''; $('activation-code').value = '';
    await refresh();
  } catch (error) {
    message('form-status', error.message || '连接失败。若已提交，请用“已有账号”登录查询，不要重复购买激活码。', 'error');
  } finally { busy = false; $('submit').disabled = false; }
});
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  try { await refresh(); } finally { $('refresh').disabled = false; }
});
$('recharge-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true; $('redeem').disabled = true;
  try {
    await call('/api/redeem', { code: $('recharge-code').value.trim() });
    $('recharge-code').value = '';
    await refresh();
    message('account-status', '充值已到账。');
  } catch (error) { message('account-status', error.message || '充值失败，请稍后重试。', 'error'); }
  finally { busy = false; $('redeem').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try { await call('/api/logout', {}); forget(); setMode('login'); }
  catch { message('account-status', '暂时无法确认退出，请稍后重试。', 'error'); }
  finally { $('logout').disabled = false; }
});
void call('/api/public', undefined, false).then((config) => {
  unified = config.registration?.mode === 'unified_account'; connected = true;
  $('auth-intro').textContent = unified ? '创建账号，登录桌面软件即可使用已开通的创作服务。默认基础档，按实际用量扣玩剧点，作品可保存到云端。' : '提交注册申请，由管理员安排服务开通。';
  document.querySelector('header .brand span').textContent = '账号中心';
  setMode(mode); if (token) void refresh();
}).catch(() => { message('form-status', '账号服务暂不可用，请刷新重试；本地创作不受影响。', 'error'); });
