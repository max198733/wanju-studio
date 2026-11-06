import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const name = 'xem8k5_gpt_image_config.json';

async function readConfig(directory) {
  if (!directory) throw new Error('图片服务配置目录尚未就绪。');
  try {
    const value = JSON.parse((await readFile(join(directory, name), 'utf8')).replace(/^\uFEFF/, ''));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid config');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {
      base_url: 'https://image.xem8k5.top', model: 'gpt-image-2.5-flare',
      create_endpoint: '/v1/images/generations', auth_scheme: 'Bearer',
    };
    throw new Error('图片配置文件无法读取，请先导入有效的配套配置。');
  }
}

const summary = (config) => ({
  baseUrl: typeof config.base_url === 'string' ? config.base_url : 'https://image.xem8k5.top',
  model: typeof config.model === 'string' ? config.model : '',
  configured: typeof config.api_key === 'string' && Boolean(config.api_key.trim()),
  responseFormat: config.response_format === 'url' ? 'url' : 'b64_json',
});

export async function readImageSettings(directory) {
  return summary(await readConfig(directory));
}

export async function saveImageKey(directory, input) {
  const formatOnly = input?.key === '' && ['b64_json', 'url'].includes(input?.responseFormat);
  if (!formatOnly && (!input || typeof input.key !== 'string' || input.key.trim().length < 8
    || input.key.length > 512 || /\s/.test(input.key.trim()))) {
    throw new Error('请粘贴有效的图片 API 密钥，密钥中不能包含空格或换行。');
  }
  if (input.responseFormat !== undefined && !['b64_json', 'url'].includes(input.responseFormat)) throw new Error('图片返回方式无效。');
  const config = await readConfig(directory);
  if (formatOnly && !config.api_key) throw new Error('请先配置图片 API 密钥。');
  const updated = { ...config, ...(formatOnly ? {} : { api_key: input.key.trim() }),
    ...(input.responseFormat !== undefined ? { response_format: input.responseFormat } : {}) };
  await mkdir(directory, { recursive: true });
  const file = join(directory, name);
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, file);
  } catch {
    await rm(temp, { force: true }).catch(() => {});
    throw new Error('图片密钥未保存，请稍后重试。');
  }
  return summary(updated);
}
