import { createHash } from 'node:crypto';

export class WanjuError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const stateRev = (state) => createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 20);
export const shotPlanRev = (state, shot) => stateRev({
  title: state.title, script: state.script, ratio: state.ratio,
  shot: { id: shot.id, title: shot.title, description: shot.description, dialogue: shot.dialogue, duration: shot.duration },
});
export const blankState = () => ({ version: 1, title: '', ratio: '9:16', script: '', music: '', shots: [] });
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|avif)$/i;
export const isVideoPath = (value) => typeof value === 'string' && VIDEO_EXT.test(value);
export const isImagePath = (value) => typeof value === 'string' && IMAGE_EXT.test(value);
export const shotImage = (shot) => shot?.image || (isImagePath(shot?.media) ? shot.media : '');
export const shotVideo = (shot) => shot?.video || (isVideoPath(shot?.media) ? shot.media : '');

export function assetPath(value) {
  if (typeof value !== 'string' || !value.startsWith('assets/') || /[\\:#?\0]/.test(value)
    || value.split('/').some((part) => !part || part.startsWith('.'))) {
    throw new WanjuError('素材路径无效，请重新导入素材。');
  }
  return value;
}

export function validateState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shots) || raw.shots.length > 200) {
    throw new WanjuError('分镜清单格式无效，单项目最多 200 个镜头。');
  }
  if (!['9:16', '16:9', '1:1'].includes(raw.ratio)) throw new WanjuError('画幅无效。');
  const text = (value, max) => {
    if (typeof value !== 'string' || value.length > max) throw new WanjuError('文本格式或长度无效。');
    return value;
  };
  const ids = new Set();
  const shots = raw.shots.map((shot) => {
    if (!shot || !/^[A-Za-z0-9_-]{1,64}$/.test(shot.id) || ids.has(shot.id)) throw new WanjuError('镜号重复或无效。');
    ids.add(shot.id);
    const duration = Number(shot.duration);
    if (!Number.isFinite(duration) || duration < 0.1 || duration > 300) throw new WanjuError('镜头时长须为 0.1 到 300 秒。');
    const media = shot.media ? assetPath(shot.media) : '';
    const image = shot.image ? assetPath(shot.image) : shotImage({ media });
    const video = shot.video ? assetPath(shot.video) : shotVideo({ media });
    if (media && !image && !video) throw new WanjuError('镜头素材必须是图片或视频。');
    if (image && !isImagePath(image)) throw new WanjuError('分镜图必须是 PNG、JPG、WebP 或 AVIF。');
    if (video && !isVideoPath(video)) throw new WanjuError('视频素材必须是 MP4、MOV、WebM 或 MKV。');
    const normalized = {
      id: shot.id, title: text(shot.title ?? '', 200), description: text(shot.description ?? '', 12000),
      dialogue: text(shot.dialogue ?? '', 5000), duration,
      media: video || media || image,
    };
    if (image) normalized.image = image;
    if (video) normalized.video = video;
    return normalized;
  });
  return {
    version: 1, title: text(raw.title ?? '', 200), ratio: raw.ratio,
    script: text(raw.script ?? '', 200000), music: raw.music ? assetPath(raw.music) : '', shots,
  };
}

export function nextShotId(shots) {
  const ids = new Set(shots.map((s) => s.id));
  for (let n = 1; ; n++) {
    const id = `S${String(n).padStart(3, '0')}`;
    if (!ids.has(id)) return id;
  }
}

export function timelineOf(state, durations = {}) {
  const checked = validateState(state);
  const sizes = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };
  const [w, h] = sizes[checked.ratio];
  let at = 0;
  const clips = [];
  for (const shot of checked.shots) {
    const video = shotVideo(shot);
    if (video) {
      const sourceDuration = durations[video];
      const duration = Number.isFinite(sourceDuration) ? Math.min(shot.duration, sourceDuration) : shot.duration;
      if (!(duration > 0)) throw new WanjuError('素材时长无效。');
      clips.push({ id: shot.id, src: video, at, time: [0, duration] });
    }
    at = Math.round((at + shot.duration) * 1000000) / 1000000;
  }
  const tracks = clips.length ? [{ clips }] : [];
  if (checked.music) {
    const duration = Math.min(at, durations[checked.music] ?? at);
    if (duration > 0) tracks.push({ clips: [{ id: 'wanju_music', src: checked.music, at: 0, time: [0, duration], volume: 0.25, sound: true }] });
  }
  return { stage: { w, h }, tracks };
}
