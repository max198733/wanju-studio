import type { ProductionMode } from './production-mode';

export interface ProductionSnapshot {
  state: { script?: string; shots: Array<{ id: string }> };
  workflow: {
    enabled: boolean;
    referencesReady?: boolean;
    storyboardApproved?: boolean;
    readyForVideo?: boolean;
    counts?: { videos?: number };
    issues?: string[];
  };
  tasks: Array<{ id: string; status: string; recoveryAvailable?: boolean }>;
}

/** A read-only summary; changing a conversation mode never changes the project's review gates. */
export function productionOverview(snapshot: ProductionSnapshot, mode: ProductionMode) {
  const { state, workflow, tasks } = snapshot;
  const shots = state.shots.length;
  const videos = Math.min(shots, Math.max(0, workflow.counts?.videos ?? 0));
  const drama = workflow.enabled || mode === 'drama';
  let pending = 0, uncertain = 0, recoverable = 0, failed = 0;
  for (const task of tasks) {
    if (['unknown', 'submitting'].includes(task.status)) uncertain++;
    else if (task.recoveryAvailable || ['received', 'download-failed'].includes(task.status)) recoverable++;
    else if (['queued', 'running'].includes(task.status)) pending++;
    else if (['failed', 'rejected', 'reference-rejected'].includes(task.status)) failed++;
  }
  let stage = '原生剪辑';
  let next = '本地编辑与导出可用';
  if (drama) {
    if (!state.script?.trim() || !shots) {
      stage = '剧本与分镜';
      next = '待完善剧本与镜头';
    } else if (!workflow.enabled) {
      stage = '剧情准备';
      next = '待确认资产制作流程';
    } else if (!workflow.referencesReady) {
      stage = '人物与场景';
      next = workflow.issues?.[0] || '待准备与确认资产';
    } else if (!workflow.storyboardApproved || !workflow.readyForVideo) {
      stage = '分镜审核';
      next = workflow.issues?.[0] || '待确认逐镜分镜';
    } else if (videos < shots) {
      stage = '镜头生成';
      next = `已绑定视频 ${videos} / ${shots}`;
    } else {
      stage = '剪辑与导出';
      next = `已绑定视频 ${videos} / ${shots}`;
    }
  }
  return { stage, next, drama, shots, videos, pending, uncertain, recoverable, failed, hasTasks: tasks.length > 0 };
}
