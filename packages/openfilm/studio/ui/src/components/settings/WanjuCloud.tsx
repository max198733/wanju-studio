import React from 'react';
import { CloudDownload, CloudUpload, RefreshCw, History, Trash2, RotateCcw, Play } from 'lucide-react';
import { pointsAsYuan, wanjuCloud, type CloudAutomaticStatus, type CloudCleanupPreview, type CloudProgress, type CloudProject, type CloudTrashProject, type CloudVersion, type StudentAccount } from '@/lib/wanju-account';
import { SettingsButton, SettingsGroup, SettingsItem, SettingsStatus, SettingsSwitch, settingsError } from './ui';

const bytesLabel = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
export function WanjuCloud({ state, onRefresh }: { state: StudentAccount; onRefresh: () => void }) {
  const [projects, setProjects] = React.useState<CloudProject[]>([]);
  const [trashed, setTrashed] = React.useState<CloudTrashProject[]>([]);
  const [view, setView] = React.useState<'projects' | 'trash'>('projects');
  const [history, setHistory] = React.useState<{ projectId: string; versions: CloudVersion[]; nextBefore: number | null } | null>(null);
  const [confirmation, setConfirmation] = React.useState<{ action: 'trash' | 'purge'; project: CloudProject | CloudTrashProject } | { action: 'cleanup'; preview: CloudCleanupPreview } | null>(null);
  const [confirmTitle, setConfirmTitle] = React.useState('');
  const epoch = React.useRef(0);
  const [local, setLocal] = React.useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [progress, setProgress] = React.useState<CloudProgress | null>(null);
  const [automatic, setAutomatic] = React.useState<CloudAutomaticStatus>({ projects: [] });
  const refresh = React.useCallback(async () => {
    if (!wanjuCloud) return;
    const owner = epoch.current;
    const result = await wanjuCloud.list();
    const trash = wanjuCloud.trashList ? await wanjuCloud.trashList() : { projects: [] };
    const auto = await wanjuCloud.automaticStatus?.();
    if (owner !== epoch.current) return;
    setProjects(result.projects); setLocal(result.localProjects);
    setTrashed(trash.projects);
    if (auto) setAutomatic(auto);
    setSelected((old) => result.localProjects.some((item) => item.id === old) ? old : result.localProjects[0]?.id ?? '');
  }, []);
  React.useEffect(() => {
    epoch.current++;
    setProjects([]); setTrashed([]); setLocal([]); setSelected(''); setHistory(null); setConfirmation(null);
    setMessage(''); setError(''); setView('projects');
    setAutomatic({ projects: [] });
    if (state.authenticated && state.cloud?.available) void refresh().catch((e: Error) => setError(e.message));
    return () => { epoch.current++; };
  }, [state.user?.id, state.authenticated, state.cloud?.available, refresh]);
  React.useEffect(() => wanjuCloud?.onProgress(setProgress), []);
  React.useEffect(() => wanjuCloud?.onAutomatic?.((value) => {
    if (value.userId === state.user?.id && state.authenticated) setAutomatic(value);
  }), [state.user?.id, state.authenticated]);
  const run = async (action: () => Promise<string>) => {
    if (!wanjuCloud || busy) return;
    const owner = epoch.current;
    setBusy(true); setMessage(''); setError(''); setProgress(null);
    try {
      const text = await action();
      if (owner === epoch.current) { setMessage(text); await refresh(); onRefresh(); }
      else { setHistory(null); setConfirmation(null); setConfirmTitle(''); }
    }
    catch (e) { if (owner === epoch.current) setError(e instanceof Error ? e.message : '云项目操作失败。'); }
    finally { setBusy(false); setProgress(null); }
  };
  const cloud = state.cloud;
  if (!cloud?.available || !wanjuCloud) return <SettingsGroup title="账号云项目">
    <SettingsItem title="跨电脑恢复项目" description="云存储服务尚未部署。本机项目仍可正常创作和导出。" control={<SettingsStatus tone="muted">待开通</SettingsStatus>} />
  </SettingsGroup>;
  const price = cloud.prices;
  const autoProject = automatic.projects.find((item) => item.projectId === selected);
  const configureAutomatic = (enabled: boolean) => void run(async () => {
    const value = await wanjuCloud!.setAutomatic!({ projectId: selected, enabled, priceVersion: price.priceVersion });
    if (value.userId === state.user?.id) setAutomatic(value);
    return enabled ? '本项目已开启自动保存。' : '本项目已关闭自动保存。';
  });
  const phase = progress?.phase === 'uploading' ? '正在上传' : progress?.phase === 'downloading' ? '正在下载' : '正在检查项目';
  return <SettingsGroup title="账号云项目" footnote="下载保留已有本地工程。自动保存仅在本机软件运行时生效；关闭前请核对最近保存时间。">
    <SettingsItem title="已用空间" description={`${bytesLabel(cloud.usedBytes)} / ${bytesLabel(cloud.quotaBytes)}；包含未完成同步预留，历史版本和未引用文件也占空间。`}
      control={<div className="flex gap-2">
        <SettingsButton disabled={busy} onClick={() => void run(async () => {
          const preview = await wanjuCloud!.cleanupPreview(); setConfirmation({ action: 'cleanup', preview }); return '';
        })}>清理空间</SettingsButton>
        <SettingsButton aria-label="刷新云项目" title="刷新云项目" disabled={busy} onClick={() => void run(async () => '云项目列表已刷新。')}><RefreshCw size={15} /></SettingsButton>
      </div>} />
    <div className="flex flex-wrap items-end gap-3 py-4">
      <label className="flex min-w-0 flex-1 flex-col gap-2 text-[14px]">本地项目
        <select value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)} className="min-h-9 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-3">
          <option value="">选择一个本地项目</option>
          {local.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <SettingsButton variant="primary" disabled={busy || !selected} onClick={() => void run(async () => {
        const saved = await wanjuCloud!.push({ projectId: selected });
        return `已保存云版本 ${saved.revision}，${saved.files} 个文件，本次上传 ${saved.uploaded} 个。${saved.billingWarnings.length ? `另有 ${saved.billingWarnings.length} 个任务待结算：${saved.billingWarnings[0].message}` : saved.charged ? `服务费 ${saved.charged} 点。` : ''}`;
      })}><CloudUpload size={15} />保存到云端</SettingsButton>
    </div>
    {wanjuCloud.setAutomatic ? <SettingsItem title="本项目自动保存"
      description={automatic.warning || (autoProject
        ? `${autoProject.message}${autoProject.revision ? ` · 版本 ${autoProject.revision}` : ''}${autoProject.lastSyncedAt ? ` · ${new Date(autoProject.lastSyncedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}`
        : '未开启；先手动保存一次，再选择自动保存。开启后按已确认价格结算成功任务。')}
      control={<div className="flex items-center gap-2">
        {autoProject?.phase === 'paused' ? <SettingsButton title="恢复自动保存" aria-label="恢复本项目自动保存"
          disabled={busy || (price.enabled && !cloud.authorized)} onClick={() => configureAutomatic(true)}><Play size={15} /></SettingsButton> : null}
        <SettingsSwitch label="本项目自动保存" checked={Boolean(autoProject?.enabled)}
        disabled={busy || !selected || Boolean(automatic.warning) || (!autoProject && price.enabled && !cloud.authorized)}
        onChange={configureAutomatic} /></div>} /> : null}
    {price.enabled ? <SettingsItem title="生成成功服务费" description={`图片 ¥${pointsAsYuan(price.imagePoints)} / 次；视频 ¥${pointsAsYuan(price.videoPoints)} / 次。供应商生成费用另计。历史任务和重复同步不重复收费。`}
      control={cloud.authorized ? <SettingsStatus>当前价格已确认</SettingsStatus> : <SettingsButton disabled={busy} onClick={() => void run(async () => {
        await wanjuCloud!.consent(price.priceVersion); return '已确认本次服务费价格。';
      })}>确认服务费</SettingsButton>} /> : <SettingsItem title="生成成功服务费" description={`示例价格：图片 ¥${pointsAsYuan(price.imagePoints)}，视频 ¥${pointsAsYuan(price.videoPoints)}。收费开关未启用，不会扣款。`} control={<SettingsStatus tone="muted">未启用</SettingsStatus>} />}
    <div role="tablist" aria-label="云项目列表" className="flex gap-4 border-b border-[var(--border)] py-3 text-[14px]">
      <button role="tab" aria-selected={view === 'projects'} disabled={busy} onClick={() => setView('projects')}>我的云项目（{projects.length}）</button>
      <button role="tab" aria-selected={view === 'trash'} disabled={busy} onClick={() => setView('trash')}>回收站（{trashed.length}）</button>
    </div>
    {confirmation ? <section role="dialog" aria-label={confirmation.action === 'cleanup' ? '确认清理空间' : confirmation.action === 'purge' ? '确认永久删除' : '确认移入回收站'} className="my-3 border border-[var(--border)] p-4 text-[14px]">
      {confirmation.action === 'cleanup' ? <p>本次可清理 {confirmation.preview.objects} 个未引用文件，释放 {bytesLabel(confirmation.preview.bytes)}。保留所有云版本、回收站素材及最近 {confirmation.preview.graceHours} 小时上传的文件。{confirmation.preview.more ? '本次最多清理 200 个，完成后可再次预览。' : ''}</p>
        : confirmation.action === 'trash' ? <p>将「{confirmation.project.title}」移入云端回收站？本地工程不变，之后可以恢复。回收站仍占用空间。</p>
          : <><p>永久删除「{confirmation.project.title}」及全部云端历史版本？此操作不可恢复，本地工程仍保留。</p>
            <label className="my-3 flex flex-col gap-2">输入完整项目名称
              <input value={confirmTitle} disabled={busy} onChange={(event) => setConfirmTitle(event.target.value)} className="min-h-9 rounded border border-[var(--border)] bg-[var(--surface-2)] px-3" />
            </label></>}
      <div className="mt-3 flex flex-wrap gap-2">
        <SettingsButton disabled={busy} onClick={() => { setConfirmation(null); setConfirmTitle(''); }}>取消</SettingsButton>
        <SettingsButton disabled={busy || (confirmation.action === 'purge' && confirmTitle !== confirmation.project.title) || (confirmation.action === 'cleanup' && !confirmation.preview.objects)}
          onClick={() => void run(async () => {
            if (confirmation.action === 'cleanup') {
              const result = await wanjuCloud!.cleanup({ token: confirmation.preview.token, confirm: '清理未引用文件' });
              setConfirmation(null);
              return `已清理 ${result.objects} 个文件，释放 ${bytesLabel(result.bytes)}。${result.skipped ? `${result.skipped} 个文件正在使用或暂不可删除，已保留。` : ''}${result.more ? '还有可清理文件，可再次预览。' : ''}`;
            }
            if (confirmation.action === 'trash') {
              await wanjuCloud!.trash({ projectId: confirmation.project.id, revision: confirmation.project.revision });
              setHistory(null); setConfirmation(null); return '已移入云端回收站，本地工程保留。';
            }
            const project = confirmation.project as CloudTrashProject;
            await wanjuCloud!.purge({ projectId: project.id, trashToken: project.trashToken, confirmTitle });
            setConfirmation(null); setConfirmTitle(''); return '云项目及历史版本已永久删除。可通过清理空间回收不再引用的素材。';
          })}>{confirmation.action === 'cleanup' ? '确认清理' : confirmation.action === 'purge' ? '永久删除云项目' : '移入回收站'}</SettingsButton>
      </div>
    </section> : null}
    <div className="divide-y divide-[var(--border)]">
      {view === 'projects' ? projects.length ? projects.map((project) => <React.Fragment key={project.id}><SettingsItem title={project.title}
        description={`云版本 ${project.revision} · ${new Date(project.updated).toLocaleString('zh-CN', { hour12: false })}`}
        control={<div className="flex flex-wrap gap-2"><SettingsButton disabled={busy} aria-label={`下载并打开${project.title}`} onClick={() => void run(async () => {
          await wanjuCloud!.pull({ projectId: project.id }); return '已下载、校验并打开新的本地工程副本。';
        })}><CloudDownload size={15} />下载并打开</SettingsButton>
          <SettingsButton disabled={busy} aria-label={`历史版本${project.title}`} title="历史版本" onClick={() => void run(async () => {
            const result = await wanjuCloud!.versions({ projectId: project.id }); setHistory({ projectId: project.id, ...result }); return '';
          })}><History size={15} /></SettingsButton>
          <SettingsButton disabled={busy} aria-label={`移入回收站${project.title}`} title="移入回收站" onClick={() => setConfirmation({ action: 'trash', project })}><Trash2 size={15} /></SettingsButton>
        </div>} />
        {history?.projectId === project.id ? <div className="pb-3 pl-3 text-[13px]">
          <p className="py-2 text-[var(--text-muted)]">历史版本下载为独立本地副本。修改后重新上传前，需要先与云端最新版本合并。</p>
          {history.versions.map((version) => <div key={version.revision} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>版本 {version.revision} · {new Date(version.created).toLocaleString('zh-CN', { hour12: false })} · {version.files} 个文件 · {bytesLabel(version.bytes)}</span>
            <SettingsButton disabled={busy} aria-label={`下载历史版本${version.revision}`} onClick={() => void run(async () => {
              await wanjuCloud!.pull({ projectId: project.id, revision: version.revision }); return `已下载并打开历史版本 ${version.revision} 的独立副本。`;
            })}><CloudDownload size={15} />下载副本</SettingsButton>
          </div>)}
          {history.nextBefore !== null ? <SettingsButton disabled={busy} onClick={() => void run(async () => {
            const result = await wanjuCloud!.versions({ projectId: project.id, before: history.nextBefore! });
            setHistory({ projectId: project.id, versions: [...history.versions, ...result.versions], nextBefore: result.nextBefore }); return '';
          })}>更早版本</SettingsButton> : null}
        </div> : null}
      </React.Fragment>) : <p className="py-4 text-[14px] text-[var(--text-muted)]">此账号还没有云项目。</p>
        : trashed.length ? trashed.map((project) => <SettingsItem key={project.id} title={project.title}
          description={`云版本 ${project.revision} · 删除于 ${new Date(project.deleted).toLocaleString('zh-CN', { hour12: false })}；仍保留历史和素材。`}
          control={<div className="flex flex-wrap gap-2">
            <SettingsButton disabled={busy} aria-label={`恢复${project.title}`} onClick={() => void run(async () => {
              await wanjuCloud!.restore({ projectId: project.id, trashToken: project.trashToken }); return '云项目已恢复，历史版本仍可下载。';
            })}><RotateCcw size={15} />恢复</SettingsButton>
            <SettingsButton disabled={busy} aria-label={`永久删除${project.title}`} onClick={() => { setConfirmTitle(''); setConfirmation({ action: 'purge', project }); }}><Trash2 size={15} />永久删除</SettingsButton>
          </div>} />) : <p className="py-4 text-[14px] text-[var(--text-muted)]">回收站为空。不会自动清空。</p>}
    </div>
    {busy ? <p role="status" className="py-3 text-[13px]">{progress ? `${phase}${progress.total ? ` ${progress.completed}/${progress.total}` : '…'}` : '正在连接云项目…'}</p> : null}
    {message ? <p role="status" className="py-3 text-[13px] text-[var(--text-muted)]">{message}</p> : null}
    {error ? <p role="alert" className={`${settingsError} py-3`}>{error}</p> : null}
  </SettingsGroup>;
}
