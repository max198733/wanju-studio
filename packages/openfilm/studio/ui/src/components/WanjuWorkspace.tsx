import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, CheckCircle2, Clapperboard, Download, ExternalLink, FileJson, FileText, Film, FolderOpen, Image as ImageIcon, LayoutGrid, Loader2, Music2, Plus, RefreshCw, Save, Settings2, Sparkles, Trash2, Upload, Video, X } from 'lucide-react';
import { api, type MediaFile, type Project } from '../api';
import { WANJU_SUPPORTED_PROVIDERS, wanjuProviderDescription, wanjuProviderLabel } from '../lib/wanju-provider-labels';
import { mergeGeneratedMedia, taskTimingSummary, type GenerationTask } from '../lib/wanju-generation';
import { WanjuAssetLibrary, type AssetReport } from './WanjuProductionAssets';
import './WanjuWorkspace.css';

type Shot = { id: string; title: string; description: string; dialogue: string; duration: number; media: string; image?: string; video?: string };
type Board = { version: number; title: string; ratio: string; script: string; music: string; shots: Shot[] };
type Loaded = { project: Project; state: Board; rev: string; folder: string; files: MediaFile[]; tasks?: GenerationTask[]; workflow?: AssetReport };
type Provider = { id: string; name: string; configured: boolean; verification: string };
type MediaRoute = { name: string; adapter: string; configured: boolean };
type View = 'board' | 'script' | 'assets' | 'settings';
type Export = { id: string; status: string; progress: number; out?: string; error?: string };

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/wanju/${path}`, {
    method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || `请求失败 (${response.status})`), { status: response.status });
  return result;
}
const keyUrl = (path: string) => {
  const url = new URL(path, location.origin);
  const key = new URLSearchParams(location.search).get('key');
  if (key) url.searchParams.set('key', key);
  return url.href;
};
const mediaUrl = (folder: string, path: string) => `${folder.replace(/\/$/, '')}/${path.split('/').map(encodeURIComponent).join('/')}`;
const isVideo = (path: string) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(path);
const isImage = (path: string) => /\.(png|jpe?g|webp|avif)$/i.test(path);
const shotImage = (item: Pick<Shot, 'media' | 'image'>) => item.image || (isImage(item.media) ? item.media : '');
const shotVideo = (item: Pick<Shot, 'media' | 'video'>) => item.video || (isVideo(item.media) ? item.media : '');
const sec = (value: number) => `${Number(value.toFixed(1))}s`;

function Tool({ title, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string; children: ReactNode }) {
  return <button type="button" className="wj-icon" title={title} aria-label={title} {...props}>{children}</button>;
}

export function WanjuWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<View>('board');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultVideo, setDefaultVideo] = useState<MediaRoute | null>(null);
  const [cut, setCut] = useState<Project | null>(null);
  const [exportJob, setExportJob] = useState<Export | null>(null);
  const [generating, setGenerating] = useState<'image' | 'h3' | 'h3_zm_nono' | 'seedance' | null>(null);
  const [videoEngine, setVideoEngine] = useState<'video' | 'h3' | 'h3_zm_nono' | 'seedance'>('video');
  const effectiveVideoEngine = videoEngine === 'video' ? defaultVideo?.adapter === 'h3-single' ? 'h3_zm_nono' : 'seedance' : videoEngine;
  const customHttpVideo = videoEngine === 'video' && defaultVideo?.adapter === 'custom-http';
  const [sparkRefs, setSparkRefs] = useState({ imageUrls: [] as string[], videoUrls: [] as string[], audioUrls: [] as string[] });
  const [sparkPrompt, setSparkPrompt] = useState('');
  const [generateAudio, setGenerateAudio] = useState(true);
  const [useReference, setUseReference] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const live = useRef({ loaded, board, dirty, busy });
  live.current = { loaded, board, dirty, busy };
  const shot = board?.shots.find((s) => s.id === selected) ?? null;
  const total = board?.shots.reduce((sum, item) => sum + (Number(item.duration) || 0), 0) ?? 0;
  const workflow = loaded?.workflow;
  const lockedImages = workflow?.enabled && shot ? [...new Set([shotImage(shot), ...(workflow.bindings.find((binding) => binding.shot === shot.id)?.assetIds ?? [])
    .map((id) => workflow.assets.find((asset) => asset.id === id)?.path ?? '')].filter(Boolean))] : [];
  const hasVideoRefs = lockedImages.length > 0 || Object.values(sparkRefs).some((refs) => refs.length > 0);
  const audioNeedsVisual = sparkRefs.audioUrls.length > 0 && !lockedImages.length && !sparkRefs.imageUrls.length && !sparkRefs.videoUrls.length;

  const list = async () => { const all = (await api.projects()).filter((p) => !p.missing); setProjects(all); return all; };
  const accept = (value: Loaded) => {
    setLoaded(value); setBoard(value.state); setDirty(false);
    setSelected((id) => value.state.shots.some((s) => s.id === id) ? id : value.state.shots[0]?.id ?? '');
  };
  const save = async () => {
    if (!loaded || !board) return null;
    if (!dirty) return { state: board, rev: loaded.rev };
    let latest = loaded;
    let result: { state: Board; rev: string };
    try {
      result = await call(`projects/${loaded.project.id}`, 'PUT', { state: board, base: loaded.rev });
    } catch (e) {
      if (!(e instanceof Error) || (e as Error & { status?: number }).status !== 409) throw e;
      latest = await call<Loaded>(`projects/${loaded.project.id}`);
      const merged = mergeGeneratedMedia(loaded.state, board, latest.state);
      if (!merged) throw e;
      result = await call(`projects/${loaded.project.id}`, 'PUT', { state: merged, base: latest.rev });
    }
    setLoaded({ ...latest, ...result }); setBoard(result.state); setDirty(false);
    return result;
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(''); }
  };
  const openProject = async (id: string) => {
    await save();
    accept(await call<Loaded>(`projects/${id}`));
    setCut(null); setExportJob(null);
    localStorage.setItem('wanju.project', id);
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const all = await api.projects();
        const status = await call<{ providers: Provider[]; activeMedia?: { video?: MediaRoute } }>('status');
        if (!active) return;
        setProjects(all.filter((p) => !p.missing)); setProviders(status.providers);
        setDefaultVideo(status.activeMedia?.video || null);
        const remembered = localStorage.getItem('wanju.project');
        const first = all.find((p) => p.id === remembered && !p.missing) ?? all.find((p) => !p.missing);
        if (first) {
          const value = await call<Loaded>(`projects/${first.id}`);
          if (active) accept(value);
        }
      } catch (e) { if (active) setError(String(e instanceof Error ? e.message : e)); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  useEffect(() => {
    let active = true;
    const refresh = () => void call<{ providers: Provider[]; activeMedia?: { video?: MediaRoute } }>('status').then((status) => {
      if (active) { setProviders(status.providers); setDefaultVideo(status.activeMedia?.video || null); }
    }).catch(() => {});
    const bridge = (window as unknown as { openfilmNative?: { wanju?: { mediaProfiles?: { onChange(fn: () => void): () => void } } } }).openfilmNative?.wanju?.mediaProfiles;
    const unsubscribe = bridge?.onChange(refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; unsubscribe?.(); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (board?.ratio === '1:1' && videoEngine === 'h3_zm_nono') setVideoEngine('seedance');
  }, [board?.ratio, videoEngine]);
  useEffect(() => {
    if (!cut || !exportJob || !['waiting', 'running'].includes(exportJob.status)) return;
    const timer = setInterval(() => {
      void fetch(`/api/projects/${cut.id}/exports`).then((r) => r.json()).then((body) => {
        const job = body.exports?.find((j: Export) => j.id === exportJob.id);
        if (job) setExportJob(job);
      }).catch(() => setError('导出状态暂时无法读取。'));
    }, 1500);
    return () => clearInterval(timer);
  }, [cut, exportJob]);
  useEffect(() => {
    const projectId = loaded?.project.id;
    if (!projectId || !['board', 'assets'].includes(view)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        if (!live.current.busy) {
          const next = await call<Loaded>(`projects/${projectId}`);
          const current = live.current;
          if (active && current.loaded?.project.id === projectId && !current.busy) {
            if (current.dirty && current.board) {
              const merged = mergeGeneratedMedia(current.loaded.state, current.board, next.state);
              if (merged) { setLoaded(next); setBoard(merged); }
              else setLoaded({ ...current.loaded, files: next.files, tasks: next.tasks, workflow: next.workflow });
            } else accept(next);
          }
        }
      } catch { /* Preserve the current work while the local service is temporarily busy. */ }
      finally { if (active) timer = setTimeout(() => void refresh(), 5000); }
    };
    timer = setTimeout(() => void refresh(), 5000);
    return () => { active = false; clearTimeout(timer); };
  }, [loaded?.project.id, view]);

  const change = (patch: Partial<Board>) => { if (board && !busy) { setBoard({ ...board, ...patch }); setDirty(true); } };
  const changeShot = (patch: Partial<Shot>) => { if (board && shot) change({ shots: board.shots.map((s) => s.id === shot.id ? { ...s, ...patch } : s) }); };
  const addShot = () => {
    if (!board || board.shots.length >= 200) return;
    let n = 1;
    while (board.shots.some((s) => s.id === `S${String(n).padStart(3, '0')}`)) n++;
    const id = `S${String(n).padStart(3, '0')}`;
    change({ shots: [...board.shots, { id, title: '', description: '', dialogue: '', duration: 4, media: '' }] }); setSelected(id);
  };
  const moveShot = (direction: number) => {
    if (!board || !shot) return;
    const shots = [...board.shots], index = shots.findIndex((s) => s.id === shot.id), to = index + direction;
    if (to < 0 || to >= shots.length) return;
    [shots[index], shots[to]] = [shots[to], shots[index]];
    change({ shots });
  };
  const upload = async (files: File[]) => {
    if (!loaded || !files.length) return;
    await save();
    const failures: string[] = [];
    for (const file of files) {
      try {
        const response = await fetch(`/api/wanju/projects/${loaded.project.id}/import?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '导入失败');
      } catch (e) { failures.push(`${file.name}: ${e instanceof Error ? e.message : e}`); }
    }
    accept(await call<Loaded>(`projects/${loaded.project.id}`));
    if (failures.length) throw new Error(failures.join('；'));
    setNotice(`已导入 ${files.length} 个素材`);
  };
  const assemble = async () => {
    if (!loaded) return;
    const saved = await save();
    const result = await call<{ project: Project }>(`projects/${loaded.project.id}/assemble`, 'POST', { base: saved?.rev });
    setCut(result.project); setExportJob(null);
    await list(); setNotice('初剪版本已创建');
  };
  const downloadBoard = () => {
    if (!board) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'wanju-storyboard.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  const importBoard = async (file?: File) => {
    if (!file || !board || !loaded) return;
    if (file.size > 4 * 1024 * 1024) throw new Error('分镜 JSON 最大 4 MB。');
    const raw = JSON.parse(await file.text());
    const shots = Array.isArray(raw) ? raw : raw.shots;
    if (!Array.isArray(shots) || shots.length > 200) throw new Error('JSON 需要包含 shots 数组，最多 200 个镜头。');
    if (board.shots.length && !window.confirm('替换当前分镜清单？已保存的素材文件会保留。')) return;
    const next: Board = {
      ...board, script: typeof raw.script === 'string' ? raw.script : board.script,
      shots: shots.map((s: Partial<Shot> & { shot_id?: string }, i) => ({
        id: s.id || s.shot_id || `S${String(i + 1).padStart(3, '0')}`, title: s.title || '',
        description: s.description || '', dialogue: s.dialogue || '', duration: Number(s.duration ?? 4), media: s.media || '',
        image: s.image || '', video: s.video || '',
      })),
    };
    const result = await call<{ state: Board; rev: string }>(`projects/${loaded.project.id}`, 'PUT', { state: next, base: loaded.rev });
    accept({ ...loaded, ...result }); setNotice('分镜清单已导入');
  };
  const startExport = async () => {
    if (!cut) return;
    const response = await fetch(`/api/projects/${cut.id}/exports`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'video', codec: 'h264', fps: 25, quality: 'standard', hardware: false }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '导出失败');
    setExportJob(body.export);
  };
  const generate = async () => {
    if (!loaded || !shot || !generating) return;
    const saved = await save();
    try {
      const result = await call<{ task: GenerationTask }>(`projects/${loaded.project.id}/generations`, 'POST', {
        base: saved?.rev, shot: shot.id, provider: generating === 'image' ? 'image' : videoEngine, useReference, confirm: true,
        ...(generating === 'seedance' ? { videoOptions: { ...sparkRefs, ...(sparkPrompt.trim() ? { prompt: sparkPrompt.trim() } : {}),
          resolution: '720p', ratio: board?.ratio, generateAudio, watermark: false } } : {}),
      });
      setNotice(result.task.status === 'done' ? '素材已生成并保存' : result.task.status === 'reference-rejected' ? '参考图未被消费，已保留原镜头，请检查后台' : '任务已提交，正在自动查询视频进度');
    } finally {
      setGenerating(null);
      accept(await call<Loaded>(`projects/${loaded.project.id}`));
    }
  };
  const queryTask = async (task: GenerationTask) => {
    if (!loaded) return;
    await save();
    try { await call(`projects/${loaded.project.id}/generations/${task.id}/query`, 'POST', {}); }
    finally { accept(await call<Loaded>(`projects/${loaded.project.id}`)); }
  };
  const recoverAssets = async () => {
    if (!loaded) return;
    const saved = await save();
    await call(`projects/${loaded.project.id}/assets/recover`, 'POST', { base: saved?.rev });
    accept(await call<Loaded>(`projects/${loaded.project.id}`));
    setNotice('已恢复已有分镜图关联，未提交生成请求');
  };

  return <div className="wanju">
    <aside className="wj-sidebar">
      <a className="wj-brand" href={keyUrl('/wanju')}><Clapperboard size={27} /><span>玩剧<span>WANJU STUDIO</span></span></a>
      <div className="wj-local"><span />本地工作空间</div>
      <nav aria-label="工作空间">
        {([
          ['board', LayoutGrid, '分镜工作台'], ['script', FileText, '剧本'], ['assets', ImageIcon, '制作资产'], ['settings', Settings2, '接口与工作流'],
        ] as const).map(([id, Icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}
      </nav>
      <div className="wj-project-heading"><span>我的项目</span><Tool title="新建项目" onClick={() => setCreate(true)}><Plus size={17} /></Tool></div>
      <div className="wj-projects">{projects.map((project) => <button disabled={!!busy} key={project.id} title={project.name} className={loaded?.project.id === project.id ? 'active' : ''} onClick={() => void run('打开项目', () => openProject(project.id))}><Film size={15} /><span>{project.name}</span></button>)}
        {!projects.length && <p>暂无项目</p>}
      </div>
      <div className="wj-sidebar-footer"><a href="https://wanju.kukukaka.cn/" target="_blank" rel="noreferrer">玩剧官网</a><span>玩剧本地版</span></div>
    </aside>
    <main className="wj-main">
      <header className="wj-header"><div><span className="wj-breadcrumb">工作空间 / {view === 'board' ? '分镜工作台' : view === 'script' ? '剧本' : view === 'assets' ? '制作资产' : '设置'}</span><h1>{board?.title || '玩剧工作台'}</h1></div>
        <div className="wj-actions">
          {board && <span className={`wj-save-state ${dirty ? 'dirty' : ''}`}>{dirty ? '有未保存的修改' : <><Check size={13} />已保存</>}</span>}
          <button disabled={!board || !!busy || !dirty} onClick={() => void run('保存中', async () => { await save(); setNotice('已保存'); })}><Save size={15} />保存</button>
          <button className="wj-primary" onClick={() => setCreate(true)} disabled={!!busy}><Plus size={16} />新建项目</button>
        </div>
      </header>
      {(error || notice || busy) && <div className={`wj-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{busy ? <Loader2 size={15} className="wj-spin" /> : error ? <X size={15} /> : <CheckCircle2 size={15} />}{error || busy || notice}{error && <Tool title="关闭提示" onClick={() => setError('')}><X size={14} /></Tool>}</div>}
      {view === 'settings' ? <section className="wj-settings">
        <div className="wj-section-title"><h2>第三方接口</h2><span>配置状态</span></div>
        <table><thead><tr><th>服务</th><th>本机密钥</th><th>接入状态</th></tr></thead><tbody>{providers.filter((p) => WANJU_SUPPORTED_PROVIDERS.has(p.id)).map((p) => <tr key={p.id}><td>{wanjuProviderLabel(p.id)}</td><td><span className="wj-status">{p.configured ? '已保存' : '未配置 / 未授权'}</span></td><td>{wanjuProviderDescription(p.configured)}</td></tr>)}</tbody></table>
        <div className="wj-section-title wj-spaced"><h2>何导工作流</h2><span>资产闭环 · 图册审核模式</span></div>
        <ol className="wj-workflow">{['故事立项', '剧本', '分镜', '角色与声音', '分镜图', '图册审核', '镜头视频', '剪辑与导出'].map((item, i) => <li key={item}><span>{String(i + 1).padStart(2, '0')}</span>{item}</li>)}</ol>
        <div className="wj-connection-note"><span className="wj-status">单镜生成 · 尚未实测</span><span>图片、视频与素材存储服务已接入，完整自动工作流待实测</span></div>
      </section> : !board || !loaded ? <section className="wj-empty"><Clapperboard size={48} /><h2>我的第一部短剧</h2><button className="wj-primary" onClick={() => setCreate(true)}><Plus size={16} />新建项目</button></section> : view === 'assets' ? <section className="wj-settings wj-assets">
        <div className="wj-section-title"><h2>制作资产</h2></div>
        {workflow && <WanjuAssetLibrary folder={loaded.folder} workflow={workflow} busy={!!busy}
          onRefresh={() => void run('刷新资产', async () => { await save(); accept(await call<Loaded>(`projects/${loaded.project.id}`)); })}
          onRecover={() => void run('恢复图片关联', recoverAssets)}
          onEnable={() => void run('启用何导流程', async () => {
            await save();
            const current = await call<Loaded>(`projects/${loaded.project.id}`);
            await call(`projects/${loaded.project.id}/workflow`, 'POST', { base: current.rev, assetBase: current.workflow?.revision ?? null });
            accept(await call<Loaded>(`projects/${loaded.project.id}`));
          })}
          onReveal={() => void run('打开文件夹', async () => { await api.revealProject(loaded.project.id); })} />}
      </section> : view === 'script' ? <section className="wj-script">
        <div className="wj-section-title"><h2>剧本正文</h2><span>{board.script.length} 字</span></div>
        <label className="wj-field">项目名称<input value={board.title} onChange={(e) => change({ title: e.target.value })} maxLength={200} /></label>
        <label className="wj-field">正文<textarea aria-label="剧本正文" value={board.script} onChange={(e) => change({ script: e.target.value })} placeholder="剧本正文" maxLength={200000} /></label>
      </section> : <>
        <section className="wj-toolbar"><div className="wj-summary"><span>{board.shots.length} <small>镜头</small></span><i /><span>{sec(total)} <small>计划时长</small></span><i /><label>画幅<select aria-label="画幅" value={board.ratio} onChange={(e) => change({ ratio: e.target.value })}><option>9:16</option><option>16:9</option><option>1:1</option></select></label></div>
          <div className="wj-actions"><Tool title="导入分镜 JSON" disabled={!!busy} onClick={() => jsonInput.current?.click()}><FileJson size={17} /></Tool><Tool title="下载分镜 JSON" onClick={downloadBoard}><Download size={17} /></Tool><button onClick={() => input.current?.click()} disabled={!!busy}><Upload size={15} />导入素材</button><a className="wj-open-timeline" href={keyUrl(`/projects/${loaded.project.id}`)} target="_blank" rel="noreferrer"><ExternalLink size={14} />打开时间轴</a><button className="wj-primary" onClick={() => void run('生成独立初剪', assemble)} disabled={!!busy || !board.shots.length || board.shots.some((s) => !shotVideo(s))}><Clapperboard size={16} />生成独立初剪</button></div>
        </section>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/avif,video/mp4,video/quicktime,video/webm,video/x-matroska,audio/*" multiple hidden onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void run('导入素材', () => upload(files)); }} />
        <input ref={jsonInput} type="file" accept=".json" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void run('导入分镜', () => importBoard(file)); }} />
        {cut && <div className="wj-cut"><CheckCircle2 size={17} /><strong>{cut.name}</strong><a target="_blank" rel="noreferrer" href={keyUrl(`/projects/${cut.id}`)}>打开剪辑器<ExternalLink size={14} /></a><button disabled={!!busy || ['waiting', 'running'].includes(exportJob?.status ?? '')} onClick={() => void run('提交导出', startExport)}><Download size={14} />导出 MP4</button>
          {exportJob && <span role="status">{exportJob.status === 'done' ? '导出完成' : exportJob.status === 'failed' ? `导出失败：${exportJob.error}` : `导出中 ${Math.round(exportJob.progress * 100)}%`}</span>}
          {exportJob?.status === 'done' && <Tool title="打开导出文件夹" onClick={() => { void fetch(`/api/projects/${cut.id}/exports/${exportJob.id}/reveal`, { method: 'POST' }); }}><FolderOpen size={16} /></Tool>}
        </div>}
        <section className="wj-workbench" aria-label="分镜工作台">
          <div className="wj-shots"><div className="wj-pane-title"><h2>镜头清单</h2><Tool title="添加镜头" onClick={addShot} disabled={!!busy || board.shots.length >= 200}><Plus size={17} /></Tool></div>
            <div className="wj-shot-list">{board.shots.map((item, index) => <button key={item.id} className={`wj-shot ${selected === item.id ? 'selected' : ''}`} onClick={() => setSelected(item.id)}>
              <span className="wj-shot-number">{String(index + 1).padStart(2, '0')}</span><span className="wj-thumb">{shotVideo(item) ? <video src={`${mediaUrl(loaded.folder, shotVideo(item))}#t=0.1`} muted preload="metadata" /> : shotImage(item) ? <img src={mediaUrl(loaded.folder, shotImage(item))} alt="" /> : <ImageIcon size={18} />}</span>
              <span className="wj-shot-label"><strong>{item.title || item.id}</strong><small>{item.id} · {sec(item.duration)} · {shotVideo(item) ? '已入时间轴' : shotImage(item) ? '分镜图已生成' : '待生成'}</small></span><span className={`wj-dot ${shotVideo(item) ? 'ready' : ''}`} />
            </button>)}</div>
            {!board.shots.length && <div className="wj-list-empty">暂无镜头</div>}
            <button className="wj-add-shot" onClick={addShot} disabled={!!busy || board.shots.length >= 200}><Plus size={15} />添加镜头</button>
          </div>
          <div className="wj-viewer"><div className="wj-pane-title"><h2>{shot?.id || '画面预览'}</h2><span>{board.ratio}</span></div>
            <div className="wj-stage" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void run('导入素材', () => upload(Array.from(e.dataTransfer.files))); }}>
              {shotVideo(shot ?? { media: '' }) ? <video key={shotVideo(shot ?? { media: '' })} data-testid="shot-preview" controls preload="metadata" src={mediaUrl(loaded.folder, shotVideo(shot ?? { media: '' }))} /> : shotImage(shot ?? { media: '' }) ? <img data-testid="shot-preview" src={mediaUrl(loaded.folder, shotImage(shot ?? { media: '' }))} alt={shot?.title || shot?.id} /> : <div className="wj-no-media"><ImageIcon size={38} /><span>{shot ? '待生成画面' : '暂无画面'}</span><button onClick={() => input.current?.click()} disabled={!!busy}><Upload size={15} />导入素材</button></div>}
            </div>
            <div className="wj-preview-caption"><span>{shot?.title || '分镜预览'}</span><span>{shot ? sec(shot.duration) : '0s'}</span></div>
            <div className="wj-music"><Music2 size={16} /><select aria-label="背景音乐" value={board.music} onChange={(e) => change({ music: e.target.value })}><option value="">无背景音乐</option>{loaded.files?.filter((f) => f.kind === 'audio').map((f) => <option key={f.path} value={f.path}>{f.path.split('/').pop()}</option>)}</select>{board.music && <audio controls src={mediaUrl(loaded.folder, board.music)} />}</div>
          </div>
          <div className="wj-inspector"><div className="wj-pane-title"><h2>镜头详情</h2>{shot && <div className="wj-actions"><Tool title="上移镜头" onClick={() => moveShot(-1)} disabled={board.shots[0]?.id === shot.id || !!busy}><ArrowUp size={15} /></Tool><Tool title="下移镜头" onClick={() => moveShot(1)} disabled={board.shots.at(-1)?.id === shot.id || !!busy}><ArrowDown size={15} /></Tool><Tool title="删除镜头" disabled={!!busy} onClick={() => { if (confirm(`删除镜头 ${shot.id}？素材文件会保留。`)) change({ shots: board.shots.filter((s) => s.id !== shot.id) }); }}><Trash2 size={15} /></Tool></div>}</div>
            {shot ? <fieldset className="wj-fields" disabled={!!busy}>
              <label className="wj-field">镜头名称<input aria-label="镜头名称" maxLength={200} value={shot.title} onChange={(e) => changeShot({ title: e.target.value })} /></label>
              <label className="wj-field">计划时长 / 秒<input aria-label="计划时长" type="number" min={0.1} max={300} step={0.1} value={shot.duration} onChange={(e) => changeShot({ duration: Number(e.target.value) })} /></label>
              <label className="wj-field">画面与动作<textarea aria-label="画面与动作" value={shot.description} maxLength={12000} onChange={(e) => changeShot({ description: e.target.value })} /></label>
              <label className="wj-field">台词 / 旁白<textarea aria-label="台词 / 旁白" value={shot.dialogue} maxLength={5000} onChange={(e) => changeShot({ dialogue: e.target.value })} /></label>
              <label className="wj-field">分镜图<select aria-label="分镜图" value={shotImage(shot)} onChange={(e) => { const image = e.target.value; changeShot({ image, media: shotVideo(shot) || image }); }}><option value="">未绑定图片</option>{loaded.files?.filter((f) => f.kind === 'image').map((f) => <option key={f.path} value={f.path}>{f.path.split('/').pop()}</option>)}</select></label>
              <label className="wj-field">生成视频<select aria-label="生成视频" value={shotVideo(shot)} onChange={(e) => { const video = e.target.value; changeShot({ image: shotImage(shot), video, media: video || shotImage(shot) }); }}><option value="">未绑定视频</option>{loaded.files?.filter((f) => f.kind === 'video').map((f) => <option key={f.path} value={f.path}>{f.path.split('/').pop()}</option>)}</select></label>
              <div className="wj-asset-state"><span className={`wj-status ${shotVideo(shot) ? 'ready' : ''}`}>{shotVideo(shot) ? '已入时间轴' : shotImage(shot) ? '分镜图已生成' : '待生成'}</span></div>
        <div className="wj-generate-controls"><label className="wj-field">视频线路<select aria-label="视频线路" value={videoEngine} onChange={(event) => setVideoEngine(event.target.value as 'video' | 'h3' | 'h3_zm_nono' | 'seedance')}><option value="video">按设置默认 · {defaultVideo?.name || '未配置'}</option><option value="seedance">Seedance · 旧配置</option><option value="h3_zm_nono" disabled={board?.ratio === '1:1'}>H3 首帧 · 旧配置</option><option value="h3">H3 标准 · 旧配置</option></select></label><div className="wj-actions"><button disabled={!!busy || !shot.description.trim() || !providers.some((p) => p.id === 'image' && p.configured)} onClick={() => { setUseReference(false); setGenerating('image'); }}><Sparkles size={14} />生成图片</button><button title={customHttpVideo ? '此供应商使用自定义 HTTP，请在对话中按已保存的调用说明生成。' : undefined} disabled={!!busy || customHttpVideo || !shot.description.trim() || !providers.some((p) => p.id === videoEngine && p.configured) || (['h3', 'h3_zm_nono'].includes(effectiveVideoEngine) && (!shotImage(shot) || !providers.some((p) => p.id === 'cos' && p.configured)))} onClick={() => { setSparkRefs({ imageUrls: [], videoUrls: [], audioUrls: [] }); setSparkPrompt(''); setGenerating(effectiveVideoEngine); }}><Video size={14} />生成视频</button></div></div>
            </fieldset> : <div className="wj-list-empty">未选择镜头</div>}
            {!!loaded.tasks?.length && <div className="wj-task-list"><h2>生成任务</h2>{loaded.tasks.slice(-10).reverse().map((task) => {
              const timing = taskTimingSummary(task);
              const status = ({ done: '已落盘', queued: '排队中', running: '生成中', submitting: '正在提交', unknown: '结果未知，请核查后台', rejected: '服务商拒绝，请检查配置', 'download-failed': '下载未完成', 'reference-rejected': '参考图未生效', failed: '任务失败', received: '已收到结果' } as Record<string, string>)[task.status] || task.status;
              return <div key={task.id} className="wj-task">
                <div><strong>{task.shot} · {task.provider === 'image' ? '生图' : '视频'}</strong><span>{status}</span>
                  {timing && <span className="wj-task-timing">{timing}</span>}
                </div>
                {(task.recoveryAvailable || task.remoteId && !['done', 'failed'].includes(task.status)) && <Tool title={task.provider === 'image' ? '恢复原图片（不重新生成）' : '立即查询原任务'} disabled={!!busy} onClick={() => void run('恢复原任务', () => queryTask(task))}><RefreshCw size={14} /></Tool>}
                {(task.error || task.queryError) && <p>{task.error || task.queryError}</p>}
                {task.bindingWarning && <p>{task.bindingWarning}</p>}
              </div>;
            })}</div>}
          </div>
        </section>
        <footer className="wj-board-footer"><span>{board.shots.filter((s) => shotVideo(s)).length} / {board.shots.length} 视频已入时间轴</span><button onClick={() => void run('打开文件夹', async () => { await api.revealProject(loaded.project.id); })}><FolderOpen size={14} />项目文件夹</button><a href={keyUrl(`/projects/${loaded.project.id}`)} target="_blank" rel="noreferrer">打开时间轴<ExternalLink size={12} /></a></footer>
      </>}
    </main>
    {create && <div className="wj-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !busy) setCreate(false); }}><form className="wj-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={(e) => { e.preventDefault(); void run('创建项目', async () => { await save(); const result = await call<Loaded>('projects', 'POST', { name: name.trim() || '未命名短剧', ratio, workflow: 'hedao' }); accept({ ...result, files: [] }); localStorage.setItem('wanju.project', result.project.id); setCut(null); setExportJob(null); await list(); setCreate(false); setName(''); setView('board'); }); }}>
      <div className="wj-section-title"><h2 id="new-project-title">新建短剧项目</h2><Tool title="关闭" onClick={() => setCreate(false)} disabled={!!busy}><X size={18} /></Tool></div>
      <label className="wj-field">项目名称<input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="输入项目名称" /></label>
      <fieldset><legend>画幅</legend><div className="wj-ratios">{['9:16', '16:9', '1:1'].map((r) => <label key={r} className={ratio === r ? 'active' : ''}><input type="radio" value={r} checked={ratio === r} onChange={() => setRatio(r)} /><span className={`wj-ratio-shape r${r.replace(':', '')}`} />{r}</label>)}</div></fieldset>
      <div className="wj-modal-actions"><button type="button" disabled={!!busy} onClick={() => setCreate(false)}>取消</button><button type="submit" className="wj-primary" disabled={!!busy}>{busy ? '创建中' : '创建项目'}</button></div>
    </form></div>}
    {generating && shot && <div className="wj-modal-backdrop"><section className="wj-modal" role="dialog" aria-modal="true" aria-labelledby="generation-title">
      <div className="wj-section-title"><h2 id="generation-title">{generating === 'image' ? '确认生成一张图片' : '确认提交一个视频任务'}</h2><Tool title="关闭" disabled={!!busy} onClick={() => setGenerating(null)}><X size={18} /></Tool></div>
      <p className="wj-spend-note">{generating === 'image' ? '将画面描述和可选参考图发送到你配置的第三方图片服务，提交 1 张图片请求。该服务可能按其费率计费。' : '选中的本地参考素材会上传到你配置的素材存储服务，再提交 1 个视频任务。素材存储与视频服务可能分别计费。'}</p>
      <div className="wj-generation-spec"><strong>{shot.id} · {shot.title || '未命名镜头'}</strong><span>{generating === 'image' ? '1 张 · 1024×1024' : `${shot.duration} 秒 · ${generating === 'seedance' ? '720p · 多模态线路' : generating === 'h3_zm_nono' ? '768p · 单图首帧' : '768p · 标准线路'} · ${board?.ratio}`}</span></div>
      {generating === 'image' && <label className="wj-checkbox"><input type="checkbox" checked={useReference} disabled={!!busy || !/\.(png|jpe?g|webp)$/i.test(shotImage(shot))} onChange={(e) => setUseReference(e.target.checked)} />使用当前图片作为参考</label>}
      {generating === 'seedance' && <div className="wj-multimodal">
        {workflow?.enabled && <div className="wj-spend-note">已绑定图片参考：{lockedImages.length ? lockedImages.map((path, i) => <div key={path}>图片{i + 1} · {path.split('/').pop()}</div>) : '前序资产尚未完成'}</div>}
        {([['imageUrls', 'image', '图片参考', 9], ['videoUrls', 'video', '视频参考', 3], ['audioUrls', 'audio', '音频参考', 3]] as const).filter(([field]) => field !== 'imageUrls' || !workflow?.enabled).map(([field, kind, label, limit]) => <fieldset key={field} disabled={!!busy}><legend>{label} · {sparkRefs[field].length} / {limit}</legend><div className="wj-reference-list">{loaded?.files?.filter((file) => file.kind === kind && (kind !== 'image' || /\.(png|jpe?g|webp)$/i.test(file.path)) && (kind !== 'video' || /\.(mp4|mov)$/i.test(file.path)) && (kind !== 'audio' || /\.(mp3|wav)$/i.test(file.path))).map((file) => {
          const index = sparkRefs[field].indexOf(file.path);
          return <label className="wj-checkbox" key={file.path}><input type="checkbox" checked={index >= 0} disabled={index < 0 && sparkRefs[field].length >= limit} onChange={(event) => { const checked = event.target.checked; setSparkRefs((refs) => ({ ...refs, [field]: checked ? [...refs[field], file.path] : refs[field].filter((path) => path !== file.path) })); }} /><span>{index >= 0 ? `@${kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'Audio'} ${index + 1} · ` : ''}{file.path.split('/').pop()}</span></label>;
        })}</div></fieldset>)}
        <label className="wj-field">视频提示词<textarea aria-label="视频提示词" value={sparkPrompt} disabled={!!busy} maxLength={12000} onChange={(event) => setSparkPrompt(event.target.value)} /></label>
        <label className="wj-checkbox"><input type="checkbox" checked={generateAudio} disabled={!!busy} onChange={(event) => setGenerateAudio(event.target.checked)} />生成声音</label>
        {audioNeedsVisual && <p role="alert" className="wj-spend-note">使用音频参考时，还需选择至少一张图片或一段视频。</p>}
        {!providers.some((provider) => provider.id === 'cos' && provider.configured) && hasVideoRefs && <p role="alert" className="wj-spend-note">选用本地参考素材前，请先配置素材存储。</p>}
        {workflow?.enabled && !workflow.readyForVideo && <p role="alert" className="wj-spend-note">{workflow.issues[0] || '前序审核尚未完成'}</p>}
      </div>}
      <p className="wj-spend-note">{generating === 'h3_zm_nono' ? '只上传当前镜头首帧图片，不上传额外图片、音频或视频；本地素材需要素材存储服务。' : generating === 'h3' ? '该版本未接入声线参考，不保证角色音色一致。首次真实出片和计费尚未验证。' : generating === 'seedance' ? '该线路尚未完成真实付费测试。生成成功后视频会自动进入时间轴。' : '首次真实出图和计费尚未验证。结果保存到本地，不自动上传 COS。'}</p>
      {busy && <span role="status">请求处理中，请保持页面打开。</span>}
      <div className="wj-modal-actions"><button disabled={!!busy} onClick={() => setGenerating(null)}>取消</button><button className="wj-primary" disabled={!!busy || (generating === 'seedance' && ((hasVideoRefs && !providers.some((provider) => provider.id === 'cos' && provider.configured)) || audioNeedsVisual || (workflow?.enabled && !workflow.readyForVideo)))} onClick={() => void run('提交单镜任务', generate)}>{busy ? '处理中' : '确认并提交（计费）'}</button></div>
    </section></div>}
  </div>;
}
