/**
 * 生成服务端部署包。
 *
 * 只做三件事：按白名单收文件、算哈希、把运维脚本和说明放进同一个目录。
 * 白名单是刻意的——服务端目录里还躺着测试、本地库、备份，一律不进包。
 *
 * 用法：
 *   node scripts/prepare-service-deploy.mjs --version 2.0.0
 *   node scripts/prepare-service-deploy.mjs --version 2.0.0 --output "C:/tmp/xxx"
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const service = join(repository, 'apps/wanju-service');
const opsSource = join(service, 'ops/deploy-2.0.0');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} 需要一个值。`);
  return value;
}

const version = arg('version', '');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('必须用 --version 指定版本号，例如 --version 2.0.1。');
if (JSON.parse(readFileSync(join(service, 'package.json'), 'utf8')).version !== version) {
  throw new Error('部署包版本必须与服务端 package.json 一致。');
}
/* 默认输出到 ASCII 暂存目录：这台机器的 Node 22 在"中文目录 + 中文文件名"组合下
   cpSync 会段错误（退出码 139）。因此先落到 work/，再由 shell 搬进 发布/。 */
const output = arg('output', join(repository, 'work', `deploy-${version}`));
const payload = join(output, 'payload');

/* ── 进包的文件：只收运行必需 ───────────────────────── */
const serverFiles = [
  'server.mjs', 'store.mjs', 'pricing.mjs', 'cloud.mjs', 'cloud-client.mjs',
  'media-config.mjs', 'media-profiles.mjs', 'media-relay.mjs', 'manual-enrollment.mjs',
  'package.json', 'Dockerfile', '.dockerignore',
  'ops/backup.mjs', 'ops/backup.sh', 'ops/wanju-backup.service', 'ops/wanju-backup.timer',
];
const publicFiles = [
  'admin.html', 'admin.js', 'admin.css', 'media-admin.js', 'enrollment.js',
  'download.html', 'download.css', 'download.js', 'wanju.png',
  'student-guide.html', 'teacher-guide.html',
  'account.html', 'account.js', 'account.css',
];
const rootFiles = [
  ['LICENSE', join(repository, 'LICENSE')],
  ['OPENFILM-TRADEMARK.md', join(repository, 'packages/openfilm/TRADEMARK.md')],
];
/* 故意不进包的，都写在部署说明里：
   compose.yaml / Caddyfile —— 线上可能有本机改动，覆盖会动到反代和端口
   public/downloads.json    —— 线上是真实发布清单，仓库里的是示例，覆盖会把下载页改坏
   .env.example             —— 与生产 .env 无关，避免误导 */

const entries = [
  ...serverFiles.map((name) => [name, join(service, name)]),
  ...publicFiles.map((name) => [`public/${name}`, join(service, 'public', name)]),
  ...rootFiles,
];

/* ── 依赖闭包：从入口出发把 import 到的本地模块全找出来 ──
   2.0.0 第一次上线时就是漏了 chat-tiers.mjs（白名单是人写的，人就会漏），
   线上直接 ERR_MODULE_NOT_FOUND 重启循环。这里改成自动补齐，缺文件就报错。 */
const withExtension = new Set(entries.map(([name]) => name));
const queue = entries.map(([name, from]) => ({ name, from })).filter((item) => item.name.endsWith('.mjs'));
const autoAdded = [];
while (queue.length) {
  const { name, from } = queue.shift();
  const source = readFileSync(from, 'utf8');
  for (const match of source.matchAll(/from '\.\/([^']+\.mjs)'/g)) {
    const dependency = match[1];
    if (withExtension.has(dependency)) continue;
    const dependencyPath = join(service, dependency);
    if (!existsSync(dependencyPath)) {
      throw new Error(`${name} 引用了 ${dependency}，但磁盘上没有这个文件。`);
    }
    withExtension.add(dependency);
    entries.push([dependency, dependencyPath]);
    queue.push({ name: dependency, from: dependencyPath });
    autoAdded.push(dependency);
  }
}
if (autoAdded.length) console.log(`自动补齐被引用的模块：${autoAdded.join(', ')}`);

for (const [name, from] of entries) {
  if (!existsSync(from)) throw new Error(`缺少部署源文件：${name}（${from}）`);
}

if (existsSync(output)) throw new Error('输出目录已存在，请选择全新的部署目录。');
mkdirSync(payload, { recursive: true });

const manifest = { version, preparedAt: new Date().toISOString(), uploaded: false, includesPrivateConfig: false, files: [] };
for (const [name, from] of entries) {
  const to = join(payload, name);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  manifest.files.push({
    name,
    bytes: statSync(to).size,
    sha256: createHash('sha256').update(readFileSync(to)).digest('hex'),
  });
}

/* ── 运维脚本与说明放在包根，跟 payload 平级 ────────── */
const mark = (step) => { if (process.env.WANJU_DEPLOY_DEBUG) console.error(`[step] ${step}`); };
mark('copy scripts');
for (const name of ['升级.sh', '回滚.sh', '自检.sh', '校验.sh']) {
  let script = readFileSync(join(opsSource, name), 'utf8').replaceAll('2.0.0', version);
  if (name === '升级.sh') script = script.replace(/cat <<EOF[\s\S]*$/, `cat <<EOF
服务端 ${version} 升级完成。请保留上面的数据库快照、源码备份和旧镜像。
在 /admin 分别管理基础、增强、高阶三个创作档位。每档独立保存密钥、售价和开放状态。
新用户默认基础档；登录后按档位显示价格和实际用量通过钱包网关自动扣点，余额不足时不会联系供应商。
尚未验证的供应商分组请保持关闭。图片与视频的开通状态单独配置。
EOF
`);
  writeFileSync(join(output, name), script);
}
mark('copy docs');
writeFileSync(join(output, '部署说明.md'), `# 玩剧服务端 ${version}

本目录为部署产物，生成时尚未上传。以线上 /health 和发布验收记录确认实际部署状态。

1. 将整个目录上传至服务器独立目录，执行 bash 校验.sh。
2. 在原部署主机执行 bash 升级.sh。先生成一致性数据库快照和源码备份，再构建并重启 server。
3. 执行 bash 自检.sh，核对 /health 的 release 为 ${version}。
4. /admin 的创作助手按档位保存配置。基础档为新用户默认；仅开启已实测的服务。
5. 安装包、PDF 和 public/downloads.json 独立发布，须等安装包验收通过后更新。

沿用现有 /opt/wanju-students/.env、compose.yaml、Caddyfile 和数据卷。部署包不含这些文件。
回滚使用 bash 回滚.sh，按提示选择升级前源码备份。请保留数据库快照。
升级沿用旧用户与余额；旧客户端的自有供应商会话仍由供应商直接计费，不能当作积分助手验收。
`);
mark('scripts done');

let commit = '';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repository }).toString().trim();
} catch { commit = '(非 git 仓库)'; }
manifest.commit = commit;
manifest.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: repository }).toString().trim());
manifest.node = '>=24 (镜像 node:24-alpine)';
writeFileSync(join(output, 'bundle-manifest.json'), JSON.stringify(manifest, null, 2));

/* 给 shell 用的校验清单：服务器上不一定有 node，但有 sha256sum */
writeFileSync(join(output, 'SHA256SUMS'),
  manifest.files.map((f) => `${f.sha256}  payload/${f.name}`).join('\n') + '\n');

/* ── 自检：包里不能出现私密材料 ─────────────────────── */
const forbidden = /(\.env$|\.env\.|\.sqlite|\.key$|\.pem$|password|secret[\s\S]*=|BEGIN [A-Z ]*PRIVATE KEY)/i;
const suspicious = manifest.files.filter((f) => forbidden.test(f.name));
if (suspicious.length) throw new Error(`包内出现疑似私密文件：${suspicious.map((f) => f.name).join(', ')}`);

const totalBytes = manifest.files.reduce((sum, f) => sum + f.bytes, 0);
console.log(JSON.stringify({
  output,
  version,
  commit,
  files: manifest.files.length,
  totalKB: Math.round(totalBytes / 1024),
  payloadDir: relative(dirname(repository), payload),
  scripts: ['升级.sh', '回滚.sh', '自检.sh'],
  uploaded: false,
}, null, 2));
