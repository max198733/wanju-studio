import { isIP } from 'node:net';
import { WanjuError, assetPath, shotImage } from './wanju-model.mjs';

export const H3_SINGLE_PROVIDER = 'h3_zm_nono';
export const H3_SINGLE_MODEL = 'minimax_h3_zm_nono';
export const H3_SINGLE_ENDPOINT = `https://autodl.art/api/v1/comfyui/comfyui_workflow/${H3_SINGLE_MODEL}`;
export const H3_SINGLE_RESOLUTIONS = ['480p竖', '768p竖', '960p竖', '480p横', '768p横'];

function reference(value, extension, publicIP) {
  if (typeof value !== 'string' || !value || value.length > 8192) throw new WanjuError('参考素材地址无效。');
  if (value.startsWith('assets/')) {
    assetPath(value);
    if (!extension.test(value)) throw new WanjuError('参考图片支持 JPG/PNG/WebP，参考音频支持 MP3/WAV。');
    return value;
  }
  let url;
  try { url = new URL(value); } catch { throw new WanjuError('参考素材须为项目 assets 路径或公网 HTTPS 链接。'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || (isIP(host) && !publicIP(host))) throw new WanjuError('参考素材须使用公网 HTTPS 链接。');
  return value;
}

export function h3SingleRequest(shot, ratio, options = {}, publicIP) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new WanjuError('视频参数必须是对象。');
  const duration = Number(shot.duration);
  if (!Number.isInteger(duration) || duration < 1 || duration > 15) throw new WanjuError('单图视频线路支持 1–15 秒整数时长，请先调整镜头计划。');
  if (options.duration !== undefined && Number(options.duration) !== duration) throw new WanjuError('视频时长须与镜头计划一致。');
  if (!['9:16', '16:9'].includes(ratio) || (options.ratio !== undefined && options.ratio !== ratio)) throw new WanjuError('单图视频线路只支持与项目一致的横屏或竖屏。');
  const resolution = options.resolution ?? (ratio === '9:16' ? '768p竖' : '768p横');
  if (!H3_SINGLE_RESOLUTIONS.includes(resolution)) throw new WanjuError('单图视频分辨率无效；960p横尚未获得文档确认，未提交。');
  if (!resolution.endsWith(ratio === '9:16' ? '竖' : '横')) throw new WanjuError('分辨率方向须与项目画幅一致。');
  const imageUrls = options.imageUrls ?? (shotImage(shot) ? [shotImage(shot)] : []);
  const audioUrls = options.audioUrls ?? [];
  if (!Array.isArray(imageUrls) || imageUrls.length !== 1) throw new WanjuError('单图视频线路只发送一张分镜图，请先选择本镜首帧图片。');
  if (!Array.isArray(audioUrls) || audioUrls.length) throw new WanjuError('单图视频线路不发送参考音频。');
  if (options.videoUrls !== undefined && (!Array.isArray(options.videoUrls) || options.videoUrls.length)) throw new WanjuError('该线路不支持参考视频，请改用图片或音频。');
  for (const field of ['generateAudio', 'watermark', 'returnLastFrame', 'seed']) {
    if (options[field] !== undefined) throw new WanjuError(`${field} 不在该接口文档中，未提交。`);
  }
  const images = imageUrls.map((value) => reference(value, /\.(png|jpe?g|webp)$/i, publicIP));
  const audio = audioUrls.map((value) => reference(value, /\.(mp3|wav)$/i, publicIP));
  const prompt = options.prompt ?? `${shot.description.trim()}${shot.dialogue.trim() ? `\n台词：${shot.dialogue.trim()}` : ''}`;
  if (typeof prompt !== 'string' || !prompt.trim() || Array.from(prompt).length > 20000) throw new WanjuError('视频提示词须为 1–20000 个字符。');
  return {
    prompt, duration, resolution,
    ...Object.fromEntries(images.map((url, i) => [`ref_image_${i}`, url])),
    ...Object.fromEntries(audio.map((url, i) => [`ref_audio_${i}`, url])),
  };
}

export function h3ResultStatus(result) {
  const code = result?.code;
  if (code !== undefined && !['0', '200', '202', 'OK', 'SUCCESS'].includes(String(code).toUpperCase())) return 'error';
  const status = String(result?.data?.status ?? '').toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED'].includes(status)) return 'done';
  if (['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(status)) return 'failed';
  if (['QUEUED', 'PENDING', 'SUBMITTED'].includes(status)) return 'queued';
  if (['RUNNING', 'PROCESSING', 'IN_PROGRESS'].includes(status)) return 'running';
  return 'unknown';
}

export function h3ResultVideo(result) {
  const outputs = Array.isArray(result?.data?.results) ? result.data.results : [];
  const videos = outputs.filter((item) => item && typeof item.url === 'string' && item.type === 'video'
    && (!item.output_type || item.output_type === 'output'));
  return (videos.find((item) => item.alias === 'final_video') ?? videos[0])?.url;
}
