let mediaCatalogValue = null, mediaEditing = '', mediaKeyUser = '', mediaKeyRevision = '', mediaKeyCatalogRevision = '';
const mediaCategories = [['image', '图片'], ['video', '视频'], ['audio', '音频']];
const mediaStatus = (message) => { $('media-status').textContent = message; };
function renderMediaCatalog() {
  const defaults = $('media-defaults'); defaults.replaceChildren();
  for (const [category, name] of mediaCategories) {
    const label = document.createElement('label'), select = document.createElement('select');
    label.textContent = `默认${name}供应商`; select.dataset.category = category;
    select.add(new Option('暂未设置', ''));
    for (const profile of mediaCatalogValue.profiles.filter((p) => p.category === category)) select.add(new Option(profile.name, profile.id));
    select.value = mediaCatalogValue.defaults[category] || '';
    select.onchange = () => { mediaCatalogValue.defaults[category] = select.value || null; };
    label.append(select); defaults.append(label);
  }
  const list = $('media-profile-list'); list.replaceChildren();
  for (const p of mediaCatalogValue.profiles) {
    const row = document.createElement('div'); row.className = 'toolbar';
    const text = document.createElement('span'); text.textContent = `${p.name} · ${p.model || p.adapter}`;
    row.append(text, button('编辑', () => editMediaProfile(p)), button('删除', () => {
      if (!confirm(`从待保存配置中删除“${p.name}”？`)) return;
      mediaCatalogValue.profiles = mediaCatalogValue.profiles.filter((x) => x.id !== p.id);
      for (const [category] of mediaCategories) if (mediaCatalogValue.defaults[category] === p.id) mediaCatalogValue.defaults[category] = null;
      renderMediaCatalog();
    })); list.append(row);
  }
}
async function loadMediaCatalog() {
  mediaCatalogValue = await call('/api/admin/media/config');
  renderMediaCatalog(); mediaStatus('已读取配置。保存后由客户端登录同步。');
}
function editMediaProfile(profile = {}) {
  mediaEditing = profile.id || crypto.randomUUID();
  for (const [id, field, fallback] of [['media-name', 'name', ''], ['media-category', 'category', 'image'],
    ['media-adapter', 'adapter', 'openai-image'], ['media-model', 'model', ''], ['media-url', 'baseUrl', ''],
    ['media-format', 'responseFormat', 'b64_json'], ['media-note', 'note', ''], ['media-auth', 'auth', 'Authorization: Bearer {key}']]) $(id).value = profile[field] || fallback;
  $('media-profile-dialog').showModal();
}
document.querySelector('[data-tab="media"]').addEventListener('click', () => { if (!mediaCatalogValue) void loadMediaCatalog().catch((e) => mediaStatus(e.message)); });
$('media-refresh').onclick = () => void loadMediaCatalog().catch((e) => mediaStatus(e.message));
$('media-add').onclick = () => { if (mediaCatalogValue) editMediaProfile(); };
$('media-profile-cancel').onclick = () => $('media-profile-dialog').close();
$('media-profile-form').onsubmit = (event) => {
  event.preventDefault();
  const profile = { id: mediaEditing, name: $('media-name').value, category: $('media-category').value,
    adapter: $('media-adapter').value, model: $('media-model').value, baseUrl: $('media-url').value,
    responseFormat: $('media-format').value, note: $('media-note').value, auth: $('media-auth').value };
  mediaCatalogValue.profiles = [...mediaCatalogValue.profiles.filter((p) => p.id !== profile.id), profile];
  renderMediaCatalog(); $('media-profile-dialog').close(); mediaStatus('已加入待保存配置，请点击“保存默认配置”。');
};
$('media-save-defaults').onclick = async () => {
  if (!mediaCatalogValue) return;
  $('media-save-defaults').disabled = true;
  try {
    mediaCatalogValue = await call('/api/admin/media/config', { method: 'PUT', data: { ...mediaCatalogValue, base: mediaCatalogValue.revision } });
    renderMediaCatalog(); mediaStatus('默认配置已保存。尚未配置密钥的账号需要单独分配密钥。');
  } catch (e) { mediaStatus(e.message); }
  finally { $('media-save-defaults').disabled = false; }
};
async function openMediaKeys(user) {
  try {
    const value = await call(`/api/admin/users/${encodeURIComponent(user.id)}/media`);
    mediaKeyUser = user.id; mediaKeyRevision = value.revision; mediaKeyCatalogRevision = value.catalogRevision;
    $('media-keys-title').textContent = `${user.username} · 媒体密钥`;
    $('media-keys-status').textContent = '';
    const fields = $('media-keys-fields'); fields.replaceChildren();
    for (const p of value.profiles) {
      const label = document.createElement('label'), input = document.createElement('input');
      label.textContent = `${p.name} · ${p.configured ? '已分配，留空保留' : '未分配'}`;
      input.type = 'password'; input.autocomplete = 'new-password'; input.maxLength = 2000; input.dataset.profile = p.id;
      label.append(input);
      const remove = document.createElement('input'), removeLabel = document.createElement('label');
      remove.type = 'checkbox'; remove.dataset.remove = p.id; removeLabel.className = 'check';
      removeLabel.append(remove, document.createTextNode(`撤销 ${p.name} 的已存密钥`));
      fields.append(label, removeLabel);
    }
    $('media-keys-dialog').showModal();
  } catch (e) { status(e.message, 'error'); }
}
$('media-keys-cancel').onclick = () => { $('media-keys-form').reset(); $('media-keys-dialog').close(); };
$('media-keys-dialog').addEventListener('close', () => $('media-keys-form').reset());
$('media-keys-form').onsubmit = async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
  try {
    const keys = [...$('media-keys-fields').querySelectorAll('[data-profile]')].map((input) => ({
      id: input.dataset.profile, key: input.value,
      remove: [...$('media-keys-fields').querySelectorAll('[data-remove]')].some((box) => box.dataset.remove === input.dataset.profile && box.checked),
    }));
    const value = await call(`/api/admin/users/${encodeURIComponent(mediaKeyUser)}/media`, { method: 'PUT', data: { base: mediaKeyRevision, catalogRevision: mediaKeyCatalogRevision, keys } });
    mediaKeyRevision = value.revision; $('media-keys-form').reset();
    $('media-keys-status').textContent = '密钥已加密保存。客户端下次同步即生效；正在执行的任务保留原凭证。';
  } catch (e) { $('media-keys-status').textContent = e.message; }
  finally { submit.disabled = false; }
};
$('admin-logout').addEventListener('click', () => {
  $('media-keys-form').reset(); $('media-keys-dialog').close(); $('media-profile-dialog').close();
  mediaCatalogValue = null; mediaKeyUser = ''; mediaKeyRevision = ''; mediaKeyCatalogRevision = '';
});
