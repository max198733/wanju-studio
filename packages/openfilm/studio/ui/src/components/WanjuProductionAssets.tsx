import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FolderOpen, Images, RefreshCw, X } from 'lucide-react';
import { api } from '../api';
import { Tooltip } from './Tooltip';
import { taskTimingSummary, type GenerationTask } from '../lib/wanju-generation';

export type AssetReport = {
  enabled: boolean; revision: string | null; catalogPresent: boolean; referencesReady: boolean;
  storyboardApproved: boolean; readyForVideo: boolean; issues: string[];
  assets: { id: string; kind: 'character' | 'scene' | 'prop'; name: string; path: string; exists: boolean; approved: boolean }[];
  bindings: { shot: string; assetIds: string[] }[];
  recoverable: { shot: string; path: string }[];
  shotImages: { shot: string; path: string; exists: boolean }[];
  counts: { characters: number; scenes: number; props: number; storyboardImages: number; videos: number };
};
const source = (folder: string, path: string) => `${folder.replace(/\/$/, '')}/${path.split('/').map(encodeURIComponent).join('/')}`;
const button = 'inline-flex min-h-8 items-center justify-center gap-2 rounded px-3 py-1.5 text-[12px] text-[var(--text-muted)] ring-1 ring-inset ring-[var(--border)] hover:bg-[var(--bg-hover)] disabled:opacity-40';

export function WanjuAssetLibrary({ folder, workflow, busy, onRefresh, onRecover, onReveal, onEnable }: {
  folder: string; workflow: AssetReport; busy: boolean; onRefresh: () => void; onRecover: () => void; onReveal: () => void; onEnable: () => void;
}) {
  const labels = { character: '人物', scene: '场景', prop: '道具' };
  return <div className="space-y-5 text-[var(--text)]" data-testid="production-assets">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--text-muted)]">
        <span>人物 {workflow.counts.characters} / {workflow.assets.filter((asset) => asset.kind === 'character').length}</span>
        <span>场景 {workflow.counts.scenes} / {workflow.assets.filter((asset) => asset.kind === 'scene').length}</span>
        <span>道具 {workflow.counts.props} / {workflow.assets.filter((asset) => asset.kind === 'prop').length}</span>
        <span>分镜图 {workflow.counts.storyboardImages} / {workflow.shotImages.length}</span><span>视频 {workflow.counts.videos}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={onRefresh} title="刷新资产状态"><RefreshCw size={14} />刷新</button>
        <button type="button" className={button} disabled={busy} onClick={onReveal}><FolderOpen size={14} />项目文件夹</button>
      </div>
    </div>
    {!workflow.catalogPresent && <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--border)] py-3">
      <span className="text-[13px]">{workflow.enabled ? '何导流程待初始化' : '普通剪辑工程'}</span>
      <button type="button" className={button} disabled={busy} onClick={onEnable}><Images size={14} />启用何导流程</button>
    </div>}
    {workflow.recoverable.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--border)] py-3">
      <p className="text-[13px]">{workflow.recoverable.length} 个镜头已有成功生成的图片，尚未关联。</p>
      <button type="button" className={button} disabled={busy} onClick={onRecover}><RefreshCw size={14} />恢复分镜图关联（不计费）</button>
    </div>}
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--border)] pb-3 text-[12px] text-[var(--text-muted)]">
      <span>资产：{workflow.referencesReady ? '已审核' : workflow.catalogPresent ? workflow.assets.length ? '待生成或审核' : '待规划' : '未登记'}</span>
      <span>图册：{workflow.storyboardApproved ? '已审核' : workflow.enabled ? '待审核' : '未启用'}</span>
      <span>视频阶段：{workflow.readyForVideo ? '可提交' : workflow.enabled ? '前序未完成' : '未启用何导资产流程'}</span>
    </div>
    {workflow.issues.length > 0 && <details className="text-[12px] text-[var(--text-muted)]" open>
      <summary className="cursor-pointer py-1">待处理 {workflow.issues.length} 项</summary>
      <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5">{workflow.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
    </details>}
    <section className="space-y-3">
      <h3 className="text-[13px] font-medium">人物、场景与道具</h3>
      {!workflow.assets.length && <p className="py-5 text-[12px] text-[var(--text-dim)]">尚未登记资产</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
        {workflow.assets.map((asset) => <article key={asset.id} className="min-w-0 space-y-2">
          <div className="flex h-40 items-center justify-center overflow-hidden rounded bg-[var(--surface-2)]">
            {asset.exists ? <img className="h-full w-full object-contain" src={source(folder, asset.path)} alt={asset.name} loading="lazy" /> : <Images size={24} className="text-[var(--text-dim)]" />}
          </div>
          <p className="break-words text-[12px]">{asset.id} · {asset.name}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{labels[asset.kind]} · {asset.approved ? '已审核' : asset.exists ? '待审核' : '尚无图片'}</p>
          {asset.path && <p className="break-all text-[10px] text-[var(--text-dim)]">{asset.path}</p>}
        </article>)}
      </div>
    </section>
    <section className="space-y-3 border-t border-[var(--border)] pt-4">
      <h3 className="text-[13px] font-medium">逐镜分镜图</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        {workflow.shotImages.map((shot) => <article key={shot.shot} className="min-w-0 space-y-2">
          <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-[var(--surface-2)]">
            {shot.exists ? <img className="h-full w-full object-contain" src={source(folder, shot.path)} alt={shot.shot} loading="lazy" /> : <span className="text-[11px] text-[var(--text-dim)]">尚无分镜图</span>}
          </div>
          <p className="text-[12px]">{shot.shot}</p>
          <p className="break-words text-[10px] text-[var(--text-dim)]">{workflow.bindings.find((binding) => binding.shot === shot.shot)?.assetIds.join(' · ') || '未绑定资产'}</p>
        </article>)}
      </div>
    </section>
  </div>;
}

export function WanjuProductionAssets({ projectId, className }: { projectId: string; className: string }) {
  return <ProjectProductionAssets key={projectId} projectId={projectId} className={className} />;
}

function ProjectProductionAssets({ projectId, className }: { projectId: string; className: string }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState<{
    project?: { id: string; name: string }; folder: string; rev: string; workflow: AssetReport; tasks?: GenerationTask[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/wanju/projects/${encodeURIComponent(projectId)}/assets`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '资产状态暂时无法读取。');
    if (body.project && body.project.id !== projectId) throw new Error('项目资料不匹配，请重新打开资产窗口。');
    if (mounted.current) { setValue(body); setError(''); }
  }, [projectId]);
  useEffect(() => {
    if (!visible) return;
    dialog.current?.showModal();
    let active = true, reading = false;
    const read = async () => {
      if (!active || reading) return;
      reading = true;
      try { await refresh(); } catch (e) { if (active) setError(e instanceof Error ? e.message : '资产状态暂时无法读取。'); }
      finally { reading = false; }
    };
    void read();
    const timer = setInterval(read, 5000);
    return () => { active = false; clearInterval(timer); dialog.current?.close(); };
  }, [visible, refresh]);
  const recover = async () => {
    if (!value || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/wanju/projects/${encodeURIComponent(projectId)}/assets/recover`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base: value.rev }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '恢复未完成。');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : '恢复未完成。'); }
    finally { setBusy(false); }
  };
  const enable = async () => {
    if (!value || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/wanju/projects/${encodeURIComponent(projectId)}/workflow`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base: value.rev, assetBase: value.workflow.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '流程未启用。');
      await refresh();
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '流程未启用。'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const recoverTask = async (task: GenerationTask) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/wanju/projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(task.id)}/query`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '原任务恢复未完成。');
      if (mounted.current) await refresh();
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '原任务恢复未完成。'); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <>
    <Tooltip label="制作资产" side="bottom"><button type="button" className={className} aria-label="制作资产" aria-haspopup="dialog"
      onClick={() => { setError(''); setValue(null); setVisible(true); }}><Images size={15} /></button></Tooltip>
    {visible && <dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onCancel={() => setVisible(false)}
      className="fixed inset-0 m-auto h-fit max-h-[85dvh] w-[860px] max-w-[94vw] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-xl backdrop:bg-black/60">
      <div className="flex max-h-[85dvh] min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-medium">制作资产</h2>
          {value?.project && <p className="mt-1 break-words text-[13px] text-[var(--text-muted)]">{value.project.name}</p>}
        </div>
        <button type="button" autoFocus className={button} aria-label="关闭制作资产" onClick={() => setVisible(false)}><X size={15} /></button>
      </div>
      <div role="region" aria-label="制作资产内容" tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 outline-none [scrollbar-gutter:stable]">
      {error && <p role="alert" className="mb-4 break-words text-[13px] text-red-400">{error}</p>}
      {!value ? <p role="status" className="text-[13px] text-[var(--text-dim)]">读取中</p> : <WanjuAssetLibrary folder={value.folder} workflow={value.workflow} busy={busy}
        onRefresh={() => { setError(''); void refresh().catch((e: Error) => setError(e.message)); }}
        onRecover={() => void recover()} onEnable={() => void enable()}
        onReveal={() => { void api.revealProject(projectId).catch(() => setError('文件夹暂时无法打开。')); }} />}
      {!!value?.tasks?.length && <section className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
        <h3 className="text-[13px] font-medium">最近生成任务</h3>
        {value.tasks.slice(-8).reverse().map((task) => <div key={task.id} className="min-w-0 border-b border-[var(--border)] pb-2">
          <p className="break-words text-[12px]">{task.assetId || task.shot} · {task.provider === 'image' ? '图片' : '视频'} · {{
            done: '完成', submitting: '提交中', received: '接收结果', queued: '排队中', running: '生成中',
            unknown: '结果待核实', rejected: '被拒绝', failed: '失败', 'download-failed': '下载失败',
            'reference-rejected': '参考图未生效',
          }[task.status] || '待检查'}</p>
          <p className="mt-1 break-words text-[11px] text-[var(--text-muted)]">{taskTimingSummary(task) || '旧任务无耗时记录'}</p>
          {(task.error || task.queryError) && <p className="mt-1 break-words text-[11px] text-red-400">{task.error || task.queryError}</p>}
          {task.bindingWarning && <p className="mt-1 break-words text-[11px] text-[var(--text-muted)]">{task.bindingWarning}</p>}
          {(task.recoveryAvailable || task.remoteId && !['done', 'failed'].includes(task.status)) && <button type="button"
            className={`${button} mt-2`} disabled={busy} onClick={() => void recoverTask(task)}>
            <RefreshCw size={14} />{task.provider === 'image' ? '恢复原图片（不重新生成）' : '查询原视频任务'}
          </button>}
        </div>)}
      </section>}
      </div>
      </div>
    </dialog>}
  </>;
}
