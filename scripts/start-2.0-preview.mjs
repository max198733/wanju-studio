#!/usr/bin/env node
/**
 * 玩剧 2.0 · 本地预览启动器
 *
 * 干三件事：
 *   1. 用独立数据库启动服务（不碰线上的 0.1.12，也不碰正式学员数据）
 *   2. 预置一个可用的学员账号、复制本机已有的媒体供应商配置、开启图片按次计费
 *   3. 打印测试台和老师后台地址
 *
 * 只监听 127.0.0.1，不对外。
 */
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createStudentService } from '../apps/wanju-service/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataDir = join(root, '.local', 'preview-2.0');
const database = join(dataDir, 'preview.sqlite');

// 服务端要求后台密码至少 32 位；这串只用于本机预览库，不用于任何线上环境
const ADMIN_PASSWORD = 'wanju-2.0-preview-admin-2026-local';
const STUDENT = { username: 'demo', password: 'demo-password-123' };
const PORT = Number(process.env.WANJU_PREVIEW_PORT) || 4900;

const line = (text = '') => console.log(text);

async function seed(store) {
  // 学员账号：已存在就复用，保留上次试跑的数据
  let userId;
  let reused = false;
  try {
    const session = store.login(STUDENT);
    userId = session.user.id;
    reused = true;
  } catch {
    const [code] = store.createCodes({ kind: 'activation', count: 1, points: 1000, days: 365, label: '2.0 预览' });
    const activated = store.activate({ ...STUDENT, code: code.code });
    userId = activated.user.id;
  }

  // 开通登记置为已确认，避免学员端一直停在"等待老师开通"
  const draft = store.adminEnrollment(userId);
  store.saveEnrollment(userId, {
    ...draft,
    state: 'ready',
    channels: draft.channels.map((channel) => ({
      ...channel,
      credentialMode: 'shared',
      state: channel.id === 'chat' ? 'ready' : 'unavailable',
    })),
  });

  // 复制本机已有的媒体供应商（含密钥），只写进预览库
  const source = join(root, '..', 'DebugWorkspace', 'data', 'providers', 'media-profiles.json');
  let channels = [];
  if (existsSync(source)) {
    const catalog = JSON.parse(await readFile(source, 'utf8'));
    const profiles = (catalog.profiles ?? []).map((item) => ({ ...item }));
    const safe = profiles.map(({ key, ...rest }) => rest);
    const saved = store.media.saveCatalog({
      base: store.media.catalog().revision,
      profiles: safe,
      defaults: { image: catalog.selection?.image ?? null, video: catalog.selection?.video ?? null, audio: null },
    });
    // 二次启动时账号已有密钥记录，必须带它当前的版本号，否则会被判为并发修改
    const current = store.media.adminAssignment(userId);
    store.media.saveAssignment(userId, {
      catalogRevision: saved.revision,
      base: current.revision,
      keys: profiles.filter((item) => item.key).map((item) => ({ id: item.id, key: item.key })),
    });
    channels = saved.profiles;
  }

  // 图片开 5 点一张；视频先不开，避免误点一次几十点
  store.saveMediaPrices({
    image: { points: 5, enabled: true },
    video: { points: 60, enabled: false },
    audio: { points: 10, enabled: false },
  });

  return { userId, reused, channels };
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  // 打开访问日志：出问题时能看到请求到底有没有到达服务端
  process.env.WANJU_ACCESS_LOG = '1';
  const { server, store } = createStudentService({ database, adminSecret: ADMIN_PASSWORD, cloudDirectory: '', enablePreview: true });
  const seeded = await seed(store);

  let port = PORT;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      server.listen(port, '127.0.0.1');
      await once(server, 'listening');
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      port += 1;
    }
  }
  if (!server.listening) throw new Error('端口被占用，请设置 WANJU_PREVIEW_PORT 换一个。');

  const base = `http://127.0.0.1:${port}`;
  const balance = store.wallet(seeded.userId).user.balance;
  const prices = store.mediaPrices();

  line('');
  line('─'.repeat(58));
  line('  玩剧 2.0 · 本地预览已启动');
  line('─'.repeat(58));
  line('');
  line(`  测试台      ${base}/preview`);
  line(`  老师后台    ${base}/admin`);
  line('');
  line(`  学员账号    ${STUDENT.username} / ${STUDENT.password}`);
  line(`  后台密码    ${ADMIN_PASSWORD}`);
  line('');
  line(`  当前余额    ${balance} 点`);
  line(`  图片计价    ${prices.image.enabled ? `${prices.image.points} 点 / 张（已开启）` : '未开启'}`);
  line(`  视频计价    ${prices.video.enabled ? `${prices.video.points} 点 / 段` : '未开启（避免误点）'}`);
  line('');
  if (seeded.channels.length) {
    line(`  已接入通道  ${seeded.channels.map((item) => `${item.name}（${item.category}）`).join('、')}`);
  } else {
    line('  未找到媒体配置：DebugWorkspace/data/providers/media-profiles.json', '');
    line('  测试台可进但无法生成，需先去老师后台配一个图片供应商。');
  }
  if (seeded.reused) line('  （复用上次的预览数据，余额与流水保留）');
  line('');
  line(`  数据目录    ${dataDir}`);
  line('  与线上 0.1.12 完全隔离，关掉窗口即停止服务。');
  line('');
  line('  这个黑窗口就是服务本体：别关它。页面打开后如果出现');
  line('  “Failed to fetch” 或“本地预览服务已停止”，就是窗口被关过了，');
  line('  重新双击「打开玩剧2.0测试版.cmd」，再刷新页面即可。');
  line('');
  line('─'.repeat(58));
  line('');

  // 双击 cmd 启动时自动打开测试台；设 WANJU_PREVIEW_NO_OPEN=1 可关掉
  if (process.platform === 'win32' && process.env.WANJU_PREVIEW_NO_OPEN !== '1') {
    const { exec } = await import('node:child_process');
    exec(`start "" "${base}/preview"`);
  }
}

main().catch((error) => {
  console.error('');
  console.error('启动失败：', error.message);
  console.error('');
  process.exit(1);
});
