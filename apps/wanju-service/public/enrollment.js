let enrollmentUser = null;
const enrollmentFields = [];
let enrollmentFieldIndex = 0;
const enrollmentEl = (id) => document.getElementById(id);

function renderEnrollments(data) {
  const body = enrollmentEl('enrollments');
  body.replaceChildren();
  const waiting = data.users.filter((user) => user.onboardingState === 'pending');
  enrollmentEl('enrollment-count').textContent = `待处理 ${waiting.length} 人 · 已开通 ${data.users.length - waiting.length} 人`;
  for (const user of [...waiting, ...data.users.filter((entry) => entry.onboardingState !== 'pending')]) {
    const row = document.createElement('tr');
    for (const text of [user.username, new Date(user.created).toLocaleString('zh-CN'), user.onboardingState === 'pending' ? '等待老师开通' : '已确认开通']) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    const actions = document.createElement('td');
    actions.append(button('配置与开通', () => void openEnrollment(user)));
    row.append(actions); body.append(row);
  }
  if (!body.children.length) {
    const row = document.createElement('tr'), cell = document.createElement('td');
    cell.colSpan = 4; cell.className = 'muted'; cell.textContent = '暂无注册申请。可将学员注册页发给学员。';
    row.append(cell); body.append(row);
  }
}
function closeEnrollment() {
  enrollmentEl('enrollment-dialog').close(); enrollmentEl('enrollment-channels').replaceChildren();
  enrollmentFields.length = 0; enrollmentUser = null;
}
function enrollmentField(container, label, value, type = 'text', options = null) {
  const wrap = document.createElement('label'), input = document.createElement(options ? 'select' : 'input');
  const caption = document.createElement('span');
  caption.id = `enrollment-field-label-${enrollmentFieldIndex++}`;
  caption.textContent = label; wrap.append(caption); input.setAttribute('aria-labelledby', caption.id);
  if (options) {
    for (const [id, name] of options) { const option = document.createElement('option'); option.value = id; option.textContent = name; input.append(option); }
  } else {
    input.type = type; input.maxLength = type === 'password' ? 2000 : 300;
    if (type === 'password') input.autocomplete = 'new-password';
  }
  input.value = value ?? ''; wrap.append(input); container.append(wrap); return input;
}
async function openEnrollment(user) {
  try {
    const value = await call(`/api/admin/users/${encodeURIComponent(user.id)}/enrollment`);
    enrollmentUser = user; enrollmentFields.length = 0; enrollmentEl('enrollment-channels').replaceChildren();
    enrollmentEl('enrollment-title').textContent = `${user.username} · 人工开通`;
    enrollmentEl('enrollment-contact').textContent = `联系方式：${value.contact || '未填写'}`;
    enrollmentEl('enrollment-student-note').textContent = `学员留言：${value.studentNote || '无'}`;
    enrollmentEl('enrollment-teacher-note').value = value.teacherNote || '';
    enrollmentEl('enrollment-student-message').value = value.studentMessage || '';
    enrollmentEl('enrollment-status').textContent = '';
    for (const channel of value.channels) {
      const section = document.createElement('section'), title = document.createElement('h3'), grid = document.createElement('div');
      section.className = 'enrollment-channel'; title.textContent = channel.label; grid.className = 'form-grid';
      const fields = { id: channel.id };
      fields.state = enrollmentField(grid, '开通情况', channel.state, 'text', [['pending', '等待处理'], ['ready', '已手动配置'], ['unavailable', '暂不开通']]);
      fields.credentialMode = enrollmentField(grid, '渠道使用方式', channel.credentialMode, 'text', [['student', '学员独立账号 / API Key'], ['shared', '使用老师统一渠道']]);
      fields.provider = enrollmentField(grid, '第三方平台', channel.provider);
      fields.accountRef = enrollmentField(grid, '第三方账号标识（不要填密码）', channel.accountRef);
      fields.baseUrl = enrollmentField(grid, 'API 基础地址', channel.baseUrl, 'url');
      fields.model = enrollmentField(grid, '准确模型名称', channel.model);
      fields.protocol = enrollmentField(grid, '接口类型', channel.protocol, 'text', [
        ['pending', '待核实'], ['openai-chat', 'OpenAI 兼容对话'], ['openai-images', 'OpenAI 兼容图片'],
        ['volcengine-video', '火山视频任务'], ['autodl-h3', 'AutoDL H3 任务'], ['suno', 'SUNO 音乐任务'],
      ]);
      fields.key = enrollmentField(grid, 'API 密钥（留空保留）', '', 'password');
      fields.key.placeholder = channel.keyConfigured ? '已有密钥，留空保留' : '尚未登记密钥';
      const clearWrap = document.createElement('label'), clear = document.createElement('input');
      clear.type = 'checkbox'; clearWrap.className = 'check'; clearWrap.append(clear, document.createTextNode('清除已保存密钥')); grid.append(clearWrap); fields.clearKey = clear;
      const visionWrap = document.createElement('label'), vision = document.createElement('input');
      vision.type = 'checkbox'; vision.checked = channel.visionVerified === true; visionWrap.className = 'check';
      visionWrap.append(vision, document.createTextNode('已核实此对话模型支持看图和工具调用'));
      visionWrap.hidden = channel.id !== 'chat'; grid.append(visionWrap); fields.visionVerified = vision;
      const sync = () => {
        const independent = fields.credentialMode.value === 'student' && fields.state.value === 'ready';
        for (const name of ['baseUrl', 'model', 'protocol', 'key']) fields[name].disabled = fields.credentialMode.value !== 'student';
        fields.baseUrl.required = independent; fields.model.required = independent;
        fields.accountRef.required = independent; fields.key.required = independent && !channel.keyConfigured;
      };
      fields.credentialMode.addEventListener('change', sync); fields.state.addEventListener('change', sync); sync();
      section.append(title, grid); enrollmentEl('enrollment-channels').append(section); enrollmentFields.push(fields);
    }
    enrollmentEl('enrollment-dialog').showModal();
  } catch (error) { status(error.message, 'error'); }
}
enrollmentEl('close-enrollment').addEventListener('click', closeEnrollment);
enrollmentEl('enrollment-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closeEnrollment(); });
enrollmentEl('refresh-enrollments').addEventListener('click', () => void reload().then(() => status('申请已刷新', 'success')).catch((error) => status(error.message, 'error')));
enrollmentEl('enrollment-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!enrollmentUser) return;
  const ready = event.submitter?.value === 'ready';
  if (ready && !confirm('确认已逐项处理该学员的服务？暂未接入的生成功能仍不会自动启用。')) return;
  const channels = enrollmentFields.map((fields) => Object.fromEntries(Object.entries(fields).map(([name, input]) => [
    name, name === 'id' ? input : input.type === 'checkbox' ? input.checked : input.value,
  ])));
  enrollmentEl('save-enrollment').disabled = true; enrollmentEl('approve-enrollment').disabled = true;
  try {
    await call(`/api/admin/users/${encodeURIComponent(enrollmentUser.id)}/enrollment`, {
      method: 'PUT', data: { channels, state: ready ? 'ready' : 'pending', teacherNote: enrollmentEl('enrollment-teacher-note').value, studentMessage: enrollmentEl('enrollment-student-message').value },
    });
    await reload(); closeEnrollment(); status(ready ? '已确认开通，学员刷新账户页即可查看。' : '开通进度已保存。', 'success');
  } catch (error) { enrollmentEl('enrollment-status').textContent = error.message; }
  finally { enrollmentEl('save-enrollment').disabled = false; enrollmentEl('approve-enrollment').disabled = false; }
});
