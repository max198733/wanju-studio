#!/usr/bin/env node
/**
 * 玩剧 · 发布前一致性检查
 *
 * 发布最容易出的三类事故：
 *   1. 版本号对不上——下载页写 0.1.12，安装包其实是 rc.3，学员装完一脸问号
 *   2. 包里混进了密钥——.local 的密码或 admin.key 被打进安装包
 *   3. 磁盘被旧产物吃满——打包到一半失败，产物还残缺
 *
 * 这个脚本只读不写、不删任何文件，只出结论。
 *
 * 用法：
 *   node scripts/precheck-release.mjs
 *   node scripts/precheck-release.mjs --json
 */
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statfs } from 'node:fs/promises';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const packagesDir = join(root, '..', '安装包');
const asJson = process.argv.includes('--json');

const rows = [];
const add = (level, item, detail, fix = '') => rows.push({ level, item, detail, fix });

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

async function dirSize(path) {
  let total = 0;
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += await dirSize(child);
    else total += (await stat(child).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

async function main() {
  // ── 1. 版本号一致性 ────────────────────────────────
  const desktopPkg = await readJson(join(root, 'apps', 'desktop', 'package.json'));
  const servicePkg = await readJson(join(root, 'apps', 'wanju-service', 'package.json'));
  const release = await readJson(join(root, '.local', 'desktop-release.json'));

  // 桌面端 package.json 记的是 OpenFilm 编辑核心版本，与玩剧产品版本本来就分开，不参与一致性比较。
  const coreVersion = desktopPkg?.version ?? '未知';
  const productVersion = release?.version ?? null;
  const serviceVersion = servicePkg?.version ?? '未知';
  if (productVersion) {
    add('ok', '版本号分工',
      `玩剧产品 ${productVersion}｜服务端 ${serviceVersion}｜OpenFilm 核心 ${coreVersion}（三者独立，属正常）`);
    // 真正要核的是"记录的版本"与"磁盘上产物的版本"是否同一个
    const artifactVersion = /Wanju-Setup-(.+)-x64\.exe$/.exec(basename(release?.artifacts?.find((path) => path.endsWith('.exe')) ?? ''))?.[1];
    if (artifactVersion && artifactVersion !== productVersion) {
      add('warn', '候选版记录与产物不符', `记录 ${productVersion}，产物 ${artifactVersion}`,
        '改了版本号却复用旧产物，是对外发布最常见的错版事故');
    } else if (artifactVersion) {
      add('ok', '候选版记录与产物一致', `都是 ${artifactVersion}`);
    }
  } else {
    add('warn', '本地候选版记录', '没有 .local/desktop-release.json',
      '先跑一次候选版构建，否则不知道当前候选包是哪个版本');
  }

  // ── 2. 发布产物 ────────────────────────────────────
  if (!(await exists(packagesDir))) {
    add('warn', '安装包目录', `未找到 ${packagesDir}`, '确认发布产物位置');
  } else {
    const entries = await readdir(packagesDir, { withFileTypes: true });
    const setups = [];
    for (const entry of entries) {
      if (entry.isDirectory() && /桌面版|^win-unpacked$/.test(entry.name)) {
        for (const file of await readdir(join(packagesDir, entry.name))) {
          if (/^Wanju-Setup-.*\.exe$/.test(file)) setups.push(join(packagesDir, entry.name, file));
        }
      } else if (/^Wanju-Setup-.*\.exe$/.test(entry.name)) {
        setups.push(join(packagesDir, entry.name));
      }
    }
    if (!setups.length) add('warn', '安装包', '没有找到任何 Setup exe', '先跑打包，再发下载页');
    for (const file of setups) {
      const info = await stat(file);
      const version = /Wanju-Setup-(.+)-x64\.exe$/.exec(basename(file))?.[1] ?? '未知';
      const digest = await sha256(file);
      add('ok', `安装包 ${version}`, `${mb(info.size)}｜SHA-256 ${digest.slice(0, 16)}…`,
        `完整校验值：${digest}`);
    }

    // 候选版产物指向了哪里，是否还在
    if (release?.artifacts?.length) {
      for (const artifact of release.artifacts) {
        const present = await exists(artifact);
        add(present ? 'ok' : 'warn', `候选产物 ${basename(artifact)}`,
          present ? '存在' : '记录里有，磁盘上已不存在',
          present ? '' : '候选包可能已被移动或清理，不要拿这份记录对外宣称可下载');
      }
    }
  }

  // ── 3. 敏感文件是否可能被打包 ───────────────────────
  const sensitive = [
    ['.local/cloud-admin-login.password', join(root, '.local', 'cloud-admin-login.password')],
    ['.local/student-service/admin.key', join(root, '.local', 'student-service', 'admin.key')],
    ['.local/cloud-access/cloud.env', join(root, '.local', 'cloud-access', 'cloud.env')],
    ['.local 内媒体密钥', join(root, '.local', 'config', 'media-profiles.json')],
  ];
  for (const [label, path] of sensitive) {
    if (await exists(path)) {
      add('warn', `敏感文件存在：${label}`, '文件在本机', '确认打包配置排除了 .local，发布前跑 verify-package-secrets.mjs');
    }
  }
  if (!rows.some((row) => row.item.startsWith('敏感文件存在'))) {
    add('ok', '敏感文件', '.local 下未发现已知密钥文件');
  }

  // ── 4. 安装包是否已签名 ─────────────────────────────
  if (release?.unsigned === true) {
    add('warn', '安装包签名', '当前候选版未签名',
      '未签名会被 360/Defender 拦。对外分发前建议买代码签名证书，并在教程里写明来源核对方式');
  } else if (release) {
    add('ok', '安装包签名', '记录显示已签名');
  }

  // ── 5. 磁盘 ────────────────────────────────────────
  try {
    const fsStat = await statfs(root);
    const free = fsStat.bavail * fsStat.bsize, total = fsStat.blocks * fsStat.bsize;
    const usedPercent = Math.round((1 - free / total) * 100);
    add(usedPercent > 92 ? 'warn' : 'ok', '磁盘空间',
      `${mb(free)} 可用 / 共 ${(total / 1024 / 1024 / 1024).toFixed(0)} GB（已用 ${usedPercent}%）`,
      usedPercent > 92 ? '打包 200MB 级安装包前先腾出至少 5GB' : '');
    if (await exists(packagesDir)) {
      let junk = 0;
      const details = [];
      for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // 只有解包目录可以回收。桌面版-x.x.x/ 里的 Setup exe 是要分发的，必须留。
        if (entry.name === 'win-unpacked') {
          const size = await dirSize(join(packagesDir, entry.name));
          if (size > 50 * 1024 * 1024) { junk += size; details.push(`${entry.name} ${mb(size)}`); }
        } else if (entry.name.startsWith('桌面版')) {
          const unpacked = join(packagesDir, entry.name, 'win-unpacked');
          if (await exists(unpacked)) {
            const size = await dirSize(unpacked);
            if (size > 50 * 1024 * 1024) { junk += size; details.push(`${entry.name}/win-unpacked ${mb(size)}`); }
          }
        }
      }
      if (junk) add('warn', '可回收的旧产物', `${details.join('，')}，合计 ${mb(junk)}`,
        '只移走 win-unpacked 解包目录，(桌面版-x.x.x) 里的 Setup exe 务必保留；不要边打包边删');
    }
  } catch (error) {
    add('skip', '磁盘空间', `无法读取：${error.message}`);
  }

  // ── 6. Git 工作区 ──────────────────────────────────
  try {
    const { stdout } = await run('git', ['status', '--porcelain'], { cwd: root });
    const changed = stdout.trim();
    if (changed) add('warn', 'Git 工作区', `有 ${changed.split('\n').length} 个未提交改动`, '发布前提交或打 tag，确保能回滚到这一版');
    else add('ok', 'Git 工作区', '干净');
  } catch {
    add('skip', 'Git 工作区', '未初始化或 git 不可用');
  }

  // ── 输出 ───────────────────────────────────────────
  if (asJson) { console.log(JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2)); return; }

  const mark = { ok: '  OK  ', warn: ' 注意 ', skip: ' 跳过 ' };
  console.log('');
  console.log('玩剧 · 发布前一致性检查');
  console.log(`工程目录：${root}`);
  console.log('');
  for (const row of rows) {
    console.log(`[${mark[row.level] ?? row.level}] ${row.item}`);
    if (row.detail) console.log(`         ${row.detail}`);
    if (row.fix) console.log(`         → ${row.fix}`);
  }
  const warns = rows.filter((row) => row.level === 'warn').length;
  console.log('');
  console.log('─'.repeat(60));
  console.log(warns ? `${warns} 项需要处理。全部处理完再动下载页。` : '全部通过，可以发布。');
  console.log('');
  console.log('发布顺序建议：本脚本通过 → verify-package-secrets.mjs → 上传产物 → 更新下载页版本与校验值 → 在干净机器上装一次。');
  console.log('');
}

main().catch((error) => { console.error('检查异常终止：', error.message); process.exit(1); });
