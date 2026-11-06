import { taskSummary } from './wanju-generation.mjs';

export function productionDiagnostics(project, state, tasks, workflow, chat = null) {
  const safeTasks = tasks.map(taskSummary);
  const timedImages = safeTasks.filter((task) => task.provider === 'image' && task.status === 'done'
    && Number.isFinite(task.timing?.totalMs));
  const totals = { count: timedImages.length, providerMs: 0, downloadMs: 0, totalMs: 0 };
  for (const task of timedImages) {
    totals.providerMs += task.timing?.providerMs ?? 0;
    totals.downloadMs += task.timing?.downloadMs ?? 0;
    totals.totalMs += task.timing.totalMs;
  }
  return {
    project: { id: project.id, name: project.name },
    generatedAt: new Date().toISOString(), shots: state.shots.length,
    workflow: { enabled: workflow.enabled, counts: workflow.counts, issues: workflow.issues },
    imageTiming: {
      ...totals,
      bottleneck: !totals.count ? 'insufficient-data'
        : totals.downloadMs > totals.totalMs / 2 ? 'download'
          : totals.providerMs > totals.totalMs / 2 ? 'provider-response' : 'mixed',
    },
    chat,
    tasks: safeTasks,
    notes: [
      '时间来自本项目已保存的任务，不会重新调用供应商。',
      '图片接口耗时包含排队、推理及接口响应传输，无法单独等同于模型推理耗时。',
      '视频提交至发现完成的间隔可能包含应用关闭和轮询间隔，不代表供应商实际生成时长。',
      '缺少计时的旧任务不计入汇总；并发任务的耗时之和不代表项目的墙钟耗时。',
      '对话慢请同时看 chat 中的实际模型、推理档和上下文；环境检查正常不代表生成快。',
    ],
  };
}
