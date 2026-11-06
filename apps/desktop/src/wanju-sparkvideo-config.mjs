import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const name = 'runninghub_sparkvideo_config.json';
async function readConfig(directory) {
  if (!directory) throw new Error('视频配置目录尚未就绪。');
  try {
    const value = JSON.parse((await readFile(join(directory, name), 'utf8')).replace(/^\uFEFF/, ''));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid config');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('视频配置文件无法读取，请先导入有效配置。');
  }
}
const summary = (config) => ({ configured: typeof config.api_key === 'string' && Boolean(config.api_key.trim()) });
export async function readSparkVideoSettings(directory) { return summary(await readConfig(directory)); }
export async function saveSparkVideoKey(directory, input) {
  if (!input || typeof input.key !== 'string' || input.key.trim().length < 8
    || input.key.length > 512 || /\s/.test(input.key.trim())) throw new Error('请粘贴有效的视频 API 密钥，不要包含空格或换行。');
  const updated = { ...(await readConfig(directory)), api_key: input.key.trim() };
  await mkdir(directory, { recursive: true });
  const file = join(directory, name);
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, file);
  } catch {
    await rm(temp, { force: true }).catch(() => {});
    throw new Error('视频密钥未保存，请稍后重试。');
  }
  return summary(updated);
}
