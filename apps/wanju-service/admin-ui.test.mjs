/**
 * 后台脚本冒烟测试。
 *
 * 没有真实浏览器，所以用最小 DOM 替身跑一遍：
 *   1. 脚本能否加载不报错
 *   2. 跨脚本共用的全局函数是否还在（enrollment.js / media-admin.js 依赖它们）
 *   3. 登录后 render() 能否把总览、学员、卡密、待核对全部渲出来
 *   4. 账号与卡密搜索是否真的改变行数
 *
 * 这不能替代真人点界面，但能挡住"改完后台直接白屏"这类事故。
 * 注意：admin.js 用 const 声明工具函数，必须用同一个 vm context 求值才取得到。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'public', 'admin.html'), 'utf8');
const script = readFileSync(join(here, 'public', 'admin.js'), 'utf8');
const htmlIds = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);

function element(id) {
  const node = {
    id, textContent: '', value: '', disabled: false, required: false, checked: false,
    hidden: false, className: '', dataset: {}, min: '', type: '',
    children: [],
    append(...items) { node.children.push(...items); },
    replaceChildren(...items) { node.children = items; },
    appendChild(item) { node.children.push(item); },
    addEventListener() {},
    querySelector() { return element('button'); },
    classList: { toggle() {}, add() {}, remove() {} },
  };
  return node;
}

const overviewData = {
  totals: { users: 2, balance: 1500, charged: 300, held: 50 },
  users: [
    { id: 'u1', username: '小明', balance: 900, created: 1729000000000, status: 'active', cloud: { usedBytes: 1024 ** 3, quotaBytes: 5 * 1024 ** 3 } },
    { id: 'u2', username: '小红', balance: 600, created: 1729100000000, status: 'suspended', cloud: { usedBytes: 0, quotaBytes: 0 } },
  ],
  codes: [
    { id: 'c1', kind: 'activation', last4: 'ABCD', points: 1000, label: '10月班', status: 'unused' },
    { id: 'c2', kind: 'recharge', last4: 'EFGH', points: 500, label: '', status: 'redeemed' },
  ],
  reviewQueue: { page: 1, pages: 1, total: 0, heldPoints: 0, oldestCreated: null, items: [] },
};
const chatData = { baseUrl: 'https://x.example', model: 'm', format: 'chat', billingMode: 'wallet',
  dailyRequestLimit: 200, displayName: '玩剧创作助手', inputPointsPerMillion: 100, outputPointsPerMillion: 200,
  context: 32000, maxOutputTokens: 4096, reservePoints: 0, visionVerified: false, enabled: false, keyConfigured: true };
const cloudData = { imagePoints: 5, videoPoints: 1, enabled: false };
const mediaPriceData = { image: { points: 5, enabled: true }, video: { points: 60, enabled: false }, audio: { points: 10, enabled: false } };

function boot() {
  const nodes = new Map(htmlIds.map((id) => [id, element(id)]));
  const sandbox = {
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      querySelectorAll: () => [],
      createElement: (tag) => element(tag),
    },
    sessionStorage: { getItem: () => 'test-token', setItem() {}, removeItem() {} },
    fetch: async (path) => {
      const route = String(path).split('?')[0];
      const payload = route === '/api/admin/overview' ? overviewData
        : route === '/api/admin/settings' ? chatData
          : route === '/api/admin/cloud/prices' ? cloudData
            : route === '/api/admin/media-prices' ? mediaPriceData
            : route.startsWith('/api/admin/operations/review') ? overviewData.reviewQueue
              : {};
      return { ok: true, status: 200, json: async () => payload };
    },
    navigator: { clipboard: { writeText: async () => {} } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class {}, prompt: () => null, confirm: () => false, setTimeout, clearTimeout, console,
    // 这两个由 enrollment.js / media-admin.js 提供，冒烟时补空实现
    renderEnrollments() {}, openMediaKeys() {}, closeEnrollment() {},
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(script, context, { filename: 'admin.js' });
  return { context, nodes };
}

test('脚本加载后跨脚本共用的全局都还在', () => {
  const { context } = boot();
  for (const name of ['call', 'status', 'button', 'reload', 'render', 'enter', 'login']) {
    assert.equal(typeof vm.runInContext(name, context), 'function', `全局 ${name} 必须存在，其他脚本依赖它`);
  }
});

test('登录后总览、学员、卡密全部渲染出来', async () => {
  const { context, nodes } = boot();
  await vm.runInContext('enter()', context);
  assert.equal(nodes.get('dashboard').hidden, false, '进入后台后面板应显示');
  assert.equal(nodes.get('totals').children.length, 4, '四项总额都要有');
  assert.equal(nodes.get('users').children.length, 2, '两个学员各一行');
  assert.equal(nodes.get('codes').children.length, 2, '两张卡各一行');
  assert.equal(nodes.get('chat-key-status').textContent, '已保存密钥；留空可保留');
});

test('账号搜索能过滤，清空后恢复全部', async () => {
  const { context, nodes } = boot();
  await vm.runInContext('enter()', context);
  const users = nodes.get('users');
  assert.equal(users.children.length, 2);
  vm.runInContext('userQuery = "小明"; renderUsers()', context);
  assert.equal(users.children.length, 1, '筛选后只剩一行');
  vm.runInContext('userQuery = ""; renderUsers()', context);
  assert.equal(users.children.length, 2, '清空后恢复');
});

test('卡密搜索按尾号过滤', async () => {
  const { context, nodes } = boot();
  await vm.runInContext('enter()', context);
  const codes = nodes.get('codes');
  assert.equal(codes.children.length, 2);
  vm.runInContext('codeQuery = "abcd"; renderCodes()', context);
  assert.equal(codes.children.length, 1);
});

test('待核对为空时给出空态提示而不是空白表格', async () => {
  const { context, nodes } = boot();
  await vm.runInContext('enter()', context);
  assert.equal(nodes.get('operations').children.length, 1, '应只有一行空态');
  assert.match(nodes.get('review-summary').textContent, /共 0 条待核对/);
});

test('HTML 里每个 id 都存在，搜索框已就位', () => {
  const { nodes } = boot();
  for (const id of htmlIds) assert.ok(nodes.get(id), `缺少元素 #${id}`);
  assert.ok(nodes.has('user-search') && nodes.has('code-search'), '搜索框必须存在');
});
