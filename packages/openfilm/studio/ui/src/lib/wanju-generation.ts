export type GenerationTiming = Partial<Record<
  'preparationMs' | 'cosUploadMs' | 'submitMs' | 'providerMs' | 'elapsedSinceSubmitMs'
  | 'remoteWaitMs' | 'downloadMs' | 'localWriteMs' | 'probeMs' | 'totalMs' | 'queryCount', number
>>;

export type GenerationTask = {
  id: string; shot: string; assetId?: string; provider: string; status: string; createdAt: string;
  remoteId?: string; path?: string; error?: string; queryError?: string; timing?: GenerationTiming;
  recoveryAvailable?: boolean; bindingWarning?: string;
};

const duration = (ms: number) => {
  if (ms < 1000) return '不足 1 秒';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

export function taskTimingSummary(task: GenerationTask) {
  if (!task.timing) return '';
  const t = task.timing;
  const parts: string[] = [];
  const add = (label: string, value: number | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) parts.push(`${label} ${duration(value)}`);
  };
  if (task.provider === 'image') add('图片接口', t.providerMs);
  else {
    add('参考图上传', t.cosUploadMs);
    add('提交', t.submitMs);
    // This is observed readiness, including the interval between status checks.
    add('等待（含离线间隔）', t.remoteWaitMs ?? t.elapsedSinceSubmitMs);
  }
  add('下载', t.downloadMs);
  if (t.localWriteMs !== undefined || t.probeMs !== undefined) {
    add('本地检查', (t.localWriteMs ?? 0) + (t.probeMs ?? 0));
  }
  add('总计', t.totalMs);
  return parts.join(' · ');
}

type Shot = {
  id: string; title: string; description: string; dialogue: string; duration: number;
  media: string; image?: string; video?: string;
};
type Board = { version: number; title: string; ratio: string; script: string; music: string; shots: Shot[] };

// Merge only generated media from the server. Other remote edits still require a conflict review.
export function mergeGeneratedMedia<T extends Board>(base: T, local: T, remote: T): T | null {
  const content = (board: T) => JSON.stringify({
    version: board.version, title: board.title, ratio: board.ratio, script: board.script, music: board.music,
    shots: board.shots.map(({ id, title, description, dialogue, duration }) => ({ id, title, description, dialogue, duration })),
  });
  if (content(base) !== content(remote)) return null;
  const before = new Map(base.shots.map((shot) => [shot.id, shot]));
  const after = new Map(remote.shots.map((shot) => [shot.id, shot]));
  const media = (shot: Shot) => [shot.media, shot.image ?? '', shot.video ?? ''];
  return {
    ...local,
    shots: local.shots.map((shot) => {
      const old = before.get(shot.id), next = after.get(shot.id);
      if (!old || !next || JSON.stringify(media(shot)) !== JSON.stringify(media(old))) return shot;
      return { ...shot, media: next.media, image: next.image, video: next.video };
    }),
  };
}
