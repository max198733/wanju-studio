import React from 'react';
import { CircleCheck, CircleHelp, ListChecks, Loader2, LogIn, RefreshCw, Settings2, Wallet } from 'lucide-react';
import { desktopBridge, type LocalAgentId, type RosterAgent } from '@/lib/desktop-bridge';
import { productionOverview, type ProductionSnapshot } from '@/lib/wanju-production';
import type { ProductionMode } from '@/lib/production-mode';
import { Tooltip } from './Tooltip';
import { WANJU_ASSISTANT, wanjuAssistantState } from '@/lib/wanju-assistant';

type MediaStatus = { activeMedia: { image?: { configured?: boolean } | null; video?: { configured?: boolean } | null } };
type NativeEvents = { mediaProfiles?: { onChange(listener: () => void): () => void } };

export function WanjuProductionStatus({ projectId, mode, agents, agent, model, active, revision, onDetails, onUseCloud }: {
  projectId: string;
  mode: ProductionMode;
  agents: RosterAgent[] | null;
  agent: LocalAgentId;
  model?: unknown;
  active: boolean;
  revision: number;
  onDetails: () => void;
  onUseCloud?: () => void;
}) {
  const [snapshot, setSnapshot] = React.useState<{ projectId: string; project: ProductionSnapshot; media: MediaStatus | null } | null>(null);
  const [failedFor, setFailedFor] = React.useState<string | null>(null);
  const data = snapshot?.projectId === projectId ? snapshot : null;
  const failed = failedFor === projectId;
  const [refresh, requestRefresh] = React.useReducer((value: number) => value + 1, 0);
  React.useEffect(() => {
    let disposed = false;
    let reading = false;
    let dirty = false;
    const controller = new AbortController();
    const read = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      if (reading) { dirty = true; return; }
      reading = true;
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
        const get = async (path: string) => {
          const response = await fetch(path, { signal });
          if (!response.ok) throw new Error('Status unavailable');
          return response.json();
        };
        const [projectResult, mediaResult] = await Promise.allSettled([
          get(`/api/wanju/projects/${encodeURIComponent(projectId)}/assets`),
          get('/api/wanju/status'),
        ]);
        const project = projectResult.status === 'fulfilled' ? projectResult.value : null;
        const media = mediaResult.status === 'fulfilled' && mediaResult.value?.activeMedia ? mediaResult.value : null;
        if (!Array.isArray(project?.state?.shots) || !Array.isArray(project?.tasks)
          || typeof project?.workflow?.enabled !== 'boolean') throw new Error('Invalid status');
        if (!disposed) { setSnapshot({ projectId, project, media }); setFailedFor(null); }
      } catch {
        if (!disposed) setFailedFor(projectId);
      } finally {
        reading = false;
        if (dirty && !disposed) { dirty = false; void read(); }
      }
    };
    void read();
    const wake = () => { void read(); };
    const timer = setInterval(wake, active ? 5000 : 30000);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    const native = (globalThis as { openfilmNative?: { wanju?: NativeEvents } }).openfilmNative?.wanju;
    const stop = native?.mediaProfiles?.onChange(wake);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      stop?.();
    };
  }, [projectId, active, revision, refresh]);
  const assistant = wanjuAssistantState(agent, agents, model);
  const overview = data ? productionOverview(data.project, mode) : null;
  const missing = overview?.drama && data?.media ? [
    ...(!data.media.activeMedia.image?.configured ? ['图片'] : []),
    ...(!data.media.activeMedia.video?.configured ? ['视频'] : []),
  ] : [];
  const iconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-40';
  return (
    <section aria-label="制作状态" className="shrink-0 border-b border-[var(--border)] px-4 py-2.5 text-[12px]">
      <div className="flex min-w-0 items-center gap-2">
        <ListChecks size={14} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
        <span className="min-w-0 flex-1 font-medium">{failed ? '制作状态暂不可用' : overview?.stage || '读取制作状态'}</span>
        <Tooltip label="刷新制作状态">
          <button type="button" aria-label="刷新制作状态" className={iconButton} onClick={requestRefresh}><RefreshCw size={13} /></button>
        </Tooltip>
        <Tooltip label="查看制作详情">
          <button type="button" aria-label="查看制作详情" className={iconButton} onClick={onDetails}><ListChecks size={14} /></button>
        </Tooltip>
      </div>
      {!failed && overview ? <p className="mt-1 break-words text-[var(--text-muted)]">{overview.next}</p> : null}
      <div className="mt-1 flex min-w-0 items-center gap-2">
        {assistant.checking ? <Loader2 size={12} className="shrink-0 animate-spin text-[var(--text-muted)]" aria-hidden />
          : assistant.ready ? <CircleCheck size={12} className="shrink-0 text-[var(--accent)]" aria-hidden />
            : <CircleHelp size={12} className="shrink-0 text-[var(--text-muted)]" aria-hidden />}
        <span className="min-w-0 flex-1 break-words text-[var(--text-muted)]">
          {assistant.label}
        </span>
        {!assistant.ready && !assistant.checking && !assistant.cloud ? <Tooltip label="配置创作助手">
          <button type="button" aria-label="配置创作助手" className={iconButton} disabled={active} onClick={() => desktopBridge()?.openSettings?.('agents')}><Settings2 size={13} /></button>
        </Tooltip> : null}
        <Tooltip label="玩剧账号">
          <button type="button" aria-label="玩剧账号" className={iconButton} onClick={() => desktopBridge()?.openSettings?.('account')}><LogIn size={13} /></button>
        </Tooltip>
      </div>
      {assistant.billing ? <div className="mt-1 flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
        <span className="min-w-0 flex-1 break-words">{assistant.billing}</span>
        {!assistant.cloud && onUseCloud ? <Tooltip label="使用玩剧积分助手">
          <button type="button" aria-label="使用玩剧积分助手" className={iconButton} disabled={active} onClick={() => {
            onUseCloud();
            if (!agents?.some((item) => item.id === 'byok' && item.byok?.models.some((m) => m.id === WANJU_ASSISTANT))) desktopBridge()?.openSettings?.('account');
          }}><Wallet size={13} /></button>
        </Tooltip> : null}
      </div> : null}
      {!failed && missing.length ? <div className="flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
        <span className="min-w-0 flex-1 break-words">{missing.join('、')}服务待配置</span>
        <Tooltip label="配置图片与视频">
          <button type="button" aria-label="配置图片与视频" className={iconButton} onClick={() => desktopBridge()?.openSettings?.('providers')}><Settings2 size={13} /></button>
        </Tooltip>
      </div> : null}
      {!failed && overview?.drama && data && !data.media ? <p className="mt-1 text-[var(--text-muted)]">媒体配置状态暂不可用</p> : null}
      {!failed && overview?.hasTasks ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[var(--text-muted)]">
        {overview.pending ? <span>进行中 {overview.pending}</span> : null}
        {overview.uncertain ? <span>结果待核实 {overview.uncertain}</span> : null}
        {overview.recoverable ? <span>可恢复记录 {overview.recoverable}</span> : null}
        {overview.failed ? <span>失败记录 {overview.failed}</span> : null}
        <Tooltip label="供应商费用与云服务费分别核算，当前未核实实际账单。"><span>费用待核对</span></Tooltip>
      </div> : null}
    </section>
  );
}
