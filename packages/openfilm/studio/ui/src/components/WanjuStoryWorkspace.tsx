import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, BookOpen, Check, FileText, FolderOpen, Loader2, Plus, RefreshCw, Save, Upload, X } from 'lucide-react';
import { Tooltip } from './Tooltip';
import './WanjuStoryWorkspace.css';

type StoryEntity = { id: string; name: string; description: string };
type StoryOutline = { number: number; title: string; summary: string; hook: string };
type StoryPlan = {
  format: 'series' | 'short';
  title: string;
  logline: string;
  synopsis: string;
  adaptationNotes: string;
  style: string;
  ratio: '9:16' | '16:9' | '1:1';
  targetEpisodeSeconds: number | null;
  plannedEpisodes: number | null;
  characters: StoryEntity[];
  scenes: StoryEntity[];
  props: StoryEntity[];
  episodeOutlines: StoryOutline[];
};
type StoryEpisode = { number: number; title: string; script: string; projectId?: string; archived?: boolean };
type StorySource = {
  id: string; name: string; path: string; bytes: number; encoding: string; characters: number;
  format?: 'txt' | 'md' | 'docx' | 'pdf'; chapterCount: number; chapters: { title: string; offset: number; line: number }[];
};
type Story = { version: 1; seriesId?: string; sources: StorySource[]; plan: StoryPlan | null; episodes: StoryEpisode[] };
type Workspace = { story: Story; revision: string };
type StorySeries = {
  id: string; title: string; projectId: string; projectName: string;
  episodes: { number: number; title: string; projectId: string | null; projectName: string | null; archived?: boolean }[];
};
type StorySeriesContext = { series: StorySeries | null; currentEpisode: number | null };
type SourcePage = { source: { id: string; name: string; characters: number; chapterCount: number }; chapters?: StorySource['chapters']; offset: number; content: string; nextOffset: number | null; done: boolean };

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/wanju/${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || `请求失败 (${response.status})`), { status: response.status });
  return result;
}

function blankPlan(title: string, ratio: StoryPlan['ratio']): StoryPlan {
  return {
    format: 'series', title, logline: '', synopsis: '', adaptationNotes: '', style: '', ratio,
    targetEpisodeSeconds: null, plannedEpisodes: null, characters: [], scenes: [], props: [], episodeOutlines: [],
  };
}

function firstActiveEpisode(plan: StoryPlan | null, episodes: StoryEpisode[]) {
  const archived = new Set(episodes.filter((item) => item.archived).map((item) => item.number));
  return plan?.episodeOutlines.find((item) => !archived.has(item.number))?.number
    ?? episodes.find((item) => !item.archived)?.number
    ?? episodes[0]?.number
    ?? plan?.episodeOutlines[0]?.number
    ?? null;
}

function bytesLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function WanjuStoryWorkspace({ projectId, projectName, ratio, onOpenEpisodeProject }: {
  projectId: string;
  projectName: string;
  ratio: StoryPlan['ratio'];
  onOpenEpisodeProject: (projectId: string) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const selectedSourceRef = useRef('');
  const sourceRequestRef = useRef(0);
  const defaultsRef = useRef({ projectName, ratio });
  defaultsRef.current = { projectName, ratio };
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [seriesContext, setSeriesContext] = useState<StorySeriesContext | null>(null);
  const [plan, setPlan] = useState<StoryPlan | null>(null);
  const [episodes, setEpisodes] = useState<StoryEpisode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState('');
  const [sourcePage, setSourcePage] = useState<SourcePage | null>(null);
  const [readOffsets, setReadOffsets] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [visible, setVisible] = useState(false);
  const busyRef = useRef(false);

  const episodeNumbers = [...new Set([
    ...(plan?.episodeOutlines.map((item) => item.number) ?? []),
    ...episodes.map((item) => item.number),
  ])].sort((a, b) => a - b);
  const archivedNumbers = new Set(episodes.filter((item) => item.archived).map((item) => item.number));
  const activeEpisodeNumbers = episodeNumbers.filter((number) => !archivedNumbers.has(number));
  const archivedEpisodeNumbers = episodeNumbers.filter((number) => archivedNumbers.has(number));
  const episodeNumber = selectedEpisode ?? episodeNumbers[0] ?? null;
  const outline = plan?.episodeOutlines.find((item) => item.number === episodeNumber);
  const episode = episodes.find((item) => item.number === episodeNumber);
  const dirty = Boolean(workspace && plan && (
    JSON.stringify(plan) !== JSON.stringify(workspace.story.plan ?? blankPlan(projectName, ratio))
    || JSON.stringify(episodes) !== JSON.stringify(workspace.story.episodes)
  ));
  const currentSource = workspace?.story.sources.find((item) => item.id === selectedSource);
  const series = seriesContext?.series ?? null;
  const isEpisodeProject = Boolean(series && seriesContext?.currentEpisode !== null && seriesContext?.currentEpisode !== undefined);

  const readPage = useCallback(async (offset: number) => {
    const sourceId = selectedSourceRef.current;
    if (!sourceId) return;
    const requestId = ++sourceRequestRef.current;
    try {
      const page = await call<SourcePage>(`projects/${encodeURIComponent(projectId)}/story/sources/${sourceId}?offset=${offset}&limit=12000`);
      if (selectedSourceRef.current !== sourceId || sourceRequestRef.current !== requestId) return;
      setSourcePage(page);
      setReadOffsets((current) => ({ ...current, [sourceId]: Math.max(current[sourceId] ?? 0, page.offset + page.content.length) }));
    } catch (reason) {
      if (selectedSourceRef.current === sourceId && sourceRequestRef.current === requestId) throw reason;
    }
  }, [projectId]);

  useEffect(() => { selectedSourceRef.current = selectedSource; }, [selectedSource]);
  useEffect(() => {
    const element = dialog.current;
    if (!visible || !element) return;
    if (!element.open) element.showModal();
    return () => { if (element.open) element.close(); };
  }, [visible]);

  const load = async () => {
    const [next, relation] = await Promise.all([
      call<Workspace>(`projects/${encodeURIComponent(projectId)}/story`),
      call<StorySeriesContext>(`projects/${encodeURIComponent(projectId)}/story/series`),
    ]);
    setWorkspace(next);
    setSeriesContext(relation);
    setPlan(next.story.plan ?? blankPlan(projectName, ratio));
    setEpisodes(next.story.episodes);
    setSelectedEpisode((current) => current && (next.story.plan?.episodeOutlines.some((item) => item.number === current)
      || next.story.episodes.some((item) => item.number === current)) ? current
      : firstActiveEpisode(next.story.plan, next.story.episodes));
    const sourceId = next.story.sources.find((item) => item.id === selectedSourceRef.current)?.id
      ?? next.story.sources[0]?.id ?? '';
    selectedSourceRef.current = sourceId;
    setSelectedSource(sourceId);
    setSourcePage(null);
    return next;
  };

  useEffect(() => {
    let active = true;
    void Promise.all([
      call<Workspace>(`projects/${encodeURIComponent(projectId)}/story`),
      call<StorySeriesContext>(`projects/${encodeURIComponent(projectId)}/story/series`),
    ]).then(([next, relation]) => {
      if (!active) return;
      setWorkspace(next);
      setSeriesContext(relation);
      const defaults = defaultsRef.current;
      setPlan(next.story.plan ?? blankPlan(defaults.projectName, defaults.ratio));
      setEpisodes(next.story.episodes);
      setSelectedEpisode(firstActiveEpisode(next.story.plan, next.story.episodes));
      const firstSource = next.story.sources[0]?.id ?? '';
      selectedSourceRef.current = firstSource;
      setSelectedSource(firstSource);
      setSourcePage(null);
      setReadOffsets({});
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '故事工作区读取失败'); });
    return () => { active = false; sourceRequestRef.current++; };
  }, [projectId]);

  useEffect(() => {
    if (!visible || !selectedSource || sourcePage) return;
    let active = true;
    void readPage(0).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : '原文读取失败');
    });
    return () => { active = false; };
  }, [visible, selectedSource, sourcePage, readPage]);

  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  const run = async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label); setError(''); setNotice('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { busyRef.current = false; setBusy(''); }
  };

  const persist = async () => {
    if (!workspace || !plan) throw new Error('故事工作区尚未就绪。');
    const result = await call<{ story: Story; revision: string }>(`projects/${encodeURIComponent(projectId)}/story`, 'PUT', {
      base: workspace.revision, plan, episodes,
    });
    const next = { story: result.story, revision: result.revision };
    setWorkspace(next); setPlan(result.story.plan); setEpisodes(result.story.episodes);
    return next;
  };

  const setEpisodeArchived = async (archived: boolean) => {
    if (!workspace || !plan || episodeNumber === null) throw new Error('故事工作区尚未就绪。');
    const current = episodes.find((item) => item.number === episodeNumber);
    if (archived && !current?.script.trim()) throw new Error('先保存本集剧本，再归档。');
    const nextEpisodes = episodes.map((item) => item.number === episodeNumber
      ? { ...item, ...(archived ? { archived: true } : { archived: false }) }
      : item);
    const result = await call<{ story: Story; revision: string }>(`projects/${encodeURIComponent(projectId)}/story`, 'PUT', {
      base: workspace.revision, plan, episodes: nextEpisodes,
    });
    const next = { story: result.story, revision: result.revision };
    setWorkspace(next); setPlan(result.story.plan); setEpisodes(result.story.episodes);
    setNotice(archived
      ? `第 ${episodeNumber} 集已归档；剧本、剪辑工程和素材均已保留。`
      : `第 ${episodeNumber} 集已恢复到分集列表。`);
  };

  const changePlan = <K extends keyof StoryPlan>(key: K, value: StoryPlan[K]) => {
    setPlan((current) => current ? { ...current, [key]: value } : current);
  };

  const changeEntities = (kind: 'characters' | 'scenes' | 'props', index: number, patch: Partial<StoryEntity>) => {
    setPlan((current) => current ? {
      ...current,
      [kind]: current[kind].map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    } : current);
  };
  const addEntity = (kind: 'characters' | 'scenes' | 'props') => {
    setPlan((current) => {
      if (!current) return current;
      const prefix = kind === 'characters' ? 'C' : kind === 'scenes' ? 'L' : 'P';
      const ids = new Set(current[kind].map((item) => item.id));
      let number = 1;
      while (ids.has(`${prefix}${String(number).padStart(2, '0')}`)) number++;
      return {
        ...current,
        [kind]: [...current[kind], { id: `${prefix}${String(number).padStart(2, '0')}`, name: '', description: '' }],
      };
    });
  };
  const removeEntity = (kind: 'characters' | 'scenes' | 'props', index: number) => {
    setPlan((current) => current ? { ...current, [kind]: current[kind].filter((_, itemIndex) => itemIndex !== index) } : current);
  };

  const changeOutline = (patch: Partial<StoryOutline>) => {
    if (episodeNumber === null || !plan) return;
    const current = outline ?? { number: episodeNumber, title: `第${episodeNumber}集`, summary: '', hook: '' };
    const next = { ...current, ...patch };
    setPlan({ ...plan, episodeOutlines: plan.episodeOutlines.some((item) => item.number === episodeNumber)
      ? plan.episodeOutlines.map((item) => item.number === episodeNumber ? next : item)
      : [...plan.episodeOutlines, next].sort((a, b) => a.number - b.number) });
    setEpisodes((list) => list.map((item) => item.number === episodeNumber ? { ...item, title: next.title } : item));
  };

  const changeEpisode = (script: string) => {
    if (episodeNumber === null) return;
    const title = outline?.title || episode?.title || `第${episodeNumber}集`;
    setEpisodes((list) => list.some((item) => item.number === episodeNumber)
      ? list.map((item) => item.number === episodeNumber ? { ...item, title, script } : item)
      : [...list, { number: episodeNumber, title, script }].sort((a, b) => a.number - b.number));
  };

  const addEpisode = () => {
    const next = Math.max(0, ...episodeNumbers) + 1;
    const title = `第${next}集`;
    if (!plan) return;
    setPlan({ ...plan, episodeOutlines: [...plan.episodeOutlines, { number: next, title, summary: '', hook: '' }] });
    setEpisodes((list) => [...list, { number: next, title, script: '' }]);
    setSelectedEpisode(next);
  };

  const importSource = async (file?: File) => {
    if (!file || !workspace) return;
    if (!/\.(txt|md|docx|pdf)$/i.test(file.name)) throw new Error('请选择 TXT、Markdown、DOCX 或 PDF 小说文件。');
    if (dirty) await persist();
    const revision = dirty ? (await call<Workspace>(`projects/${encodeURIComponent(projectId)}/story`)).revision : workspace.revision;
    const query = new URLSearchParams({ base: revision, name: file.name });
    const response = await fetch(`/api/wanju/projects/${encodeURIComponent(projectId)}/story/sources?${query}`, {
      method: 'POST', body: file,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `导入失败 (${response.status})`);
    const next = await load();
    selectedSourceRef.current = result.source.id;
    setSelectedSource(result.source.id);
    setSourcePage(null);
    setNotice(`已导入《${result.source.name}》，索引到 ${result.source.chapterCount} 章。`);
    if (!next.story.plan) setPlan(blankPlan(projectName, ratio));
  };

  const openEpisodeProject = async () => {
    if (!workspace || episodeNumber === null || !episode?.script.trim()) throw new Error('先保存本集剧本，再打开分集剪辑工程。');
    let current = workspace;
    if (dirty) current = await persist();
    const result = await call<{ project: { id: string }; story: Story; revision: string; seeded: boolean }>(
      `projects/${encodeURIComponent(projectId)}/story/episodes/${episodeNumber}/project`,
      'POST', { base: current.revision },
    );
    const next = { story: result.story, revision: result.revision };
    setWorkspace(next); setPlan(result.story.plan); setEpisodes(result.story.episodes);
    setSeriesContext(await call<StorySeriesContext>(`projects/${encodeURIComponent(projectId)}/story/series`));
    if (result.seeded) setNotice('已建立本集独立剪辑工程并载入剧本。');
    await onOpenEpisodeProject(result.project.id);
    setVisible(false);
  };

  const openSeriesProject = async (targetProjectId: string) => {
    if (dirty) await persist();
    await onOpenEpisodeProject(targetProjectId);
    setVisible(false);
  };

  const close = () => {
    if (busyRef.current) return;
    if (dirty) {
      if (!window.confirm('还有未保存的故事修改，确定关闭并丢弃吗？')) return;
      if (workspace) {
        setPlan(workspace.story.plan ?? blankPlan(projectName, ratio));
        setEpisodes(workspace.story.episodes);
        setSelectedEpisode(firstActiveEpisode(workspace.story.plan, workspace.story.episodes));
      }
    }
    setVisible(false);
  };

  return <>
    <Tooltip label="小说与分集工作台" side="bottom">
      <button type="button" className="h-7 w-7 shrink-0 rounded-md text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        aria-label="小说与分集工作台" aria-haspopup="dialog" onClick={() => setVisible(true)}>
        <BookOpen size={15} />
      </button>
    </Tooltip>
    {visible && <dialog ref={dialog} className="wj-story-dialog" aria-labelledby="wj-story-title" onCancel={(event) => {
      event.preventDefault();
      close();
    }}>
      <header className="wj-story-dialog-header">
        <div><h1 id="wj-story-title">小说与分集</h1><span>{projectName}</span></div>
        <button type="button" aria-label="关闭小说与分集工作台" title="关闭" disabled={!!busy} onClick={close}><X size={17} /></button>
      </header>
    <section className="wj-story">
    <div className="wj-story-toolbar">
      <div className="wj-story-summary">
        <strong>{workspace?.story.sources.length ?? 0}</strong><span>份原文</span><i />
        <strong>{episodes.filter((item) => item.script.trim()).length}</strong><span>集有剧本</span><i />
        <span>{dirty ? '有未保存的修改' : workspace ? '已保存' : '正在读取'}</span>
      </div>
      {!isEpisodeProject && <input ref={fileInput} type="file" accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" hidden onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void run('正在导入原文', () => importSource(file));
      }} />}
      <div className="wj-actions">
        {!isEpisodeProject && <>
          <button disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload size={15} />导入小说</button>
          <button disabled={!dirty || !!busy} onClick={() => void run('正在保存故事资料', async () => { await persist(); setNotice('故事策划和分集剧本已保存。'); })}><Save size={15} />保存</button>
          {episode && <button className="wj-primary" disabled={!!busy || !episode.script.trim()} onClick={() => void run('正在打开分集工程', openEpisodeProject)}><FolderOpen size={15} />{episode.projectId ? '打开本集剪辑工程' : '开始制作本集'}</button>}
          <button className="wj-icon" title="重新读取" aria-label="重新读取" disabled={!!busy} onClick={() => void run('正在刷新', async () => {
          if (dirty && !window.confirm('重新读取会丢弃当前未保存的故事修改。继续吗？')) return;
          await load(); setNotice('故事资料已刷新。');
          })}><RefreshCw size={16} /></button>
        </>}
      </div>
    </div>
    {series && <nav className="wj-series-bar" aria-label="系列工程导航">
      <div className="wj-series-heading"><BookOpen size={15} /><span><strong>{series.title}</strong><small>{series.projectName} · {series.episodes.filter((item) => item.projectId).length}/{series.episodes.length} 集已建工程</small></span></div>
      <div className="wj-series-episodes">
        {series.episodes.map((item) => {
          const current = item.projectId === projectId || (isEpisodeProject && seriesContext?.currentEpisode === item.number);
          return <button key={item.number} title={item.projectName || '尚未建立剪辑工程'}
            aria-current={current ? 'page' : undefined}
            disabled={!!busy || !item.projectId || current}
            onClick={() => item.projectId && void run('正在切换分集工程', () => openSeriesProject(item.projectId!))}>
            <span>{String(item.number).padStart(2, '0')}</span><small>{item.archived ? '已归档' : item.projectId ? '已建' : '待建'}</small>
          </button>;
        })}
        {isEpisodeProject && series.projectId !== projectId && <button className="wj-series-parent" disabled={!!busy}
          onClick={() => void run('正在返回系列策划', () => openSeriesProject(series.projectId))}>
          <FolderOpen size={14} />系列策划
        </button>}
      </div>
    </nav>}
    {(error || notice || busy) && <div className={`wj-story-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {busy ? <Loader2 size={14} className="wj-spin" /> : error ? null : <Check size={14} />}{error || busy || notice}
    </div>}
    {isEpisodeProject && series ? <section className="wj-series-handoff">
      <BookOpen size={22} />
      <div><h2>{series.title} · 第 {seriesContext?.currentEpisode} 集</h2>
        <p>原文、分集剧本和全剧策划由系列总项目统一管理；当前项目保留本集独立剪辑时间线。</p></div>
      <button disabled={!!busy} onClick={() => void run('正在返回系列策划', () => openSeriesProject(series.projectId))}>
        <FolderOpen size={15} />返回系列策划
      </button>
    </section> : !workspace || !plan ? <div className="wj-story-loading"><Loader2 size={18} className="wj-spin" />读取故事工作区…</div> : <fieldset disabled={!!busy} className="wj-story-grid wj-story-editor">
      <aside className="wj-story-sources">
        <div className="wj-pane-title"><h2>原文与章节</h2><span>{workspace.story.sources.length}</span></div>
        <div className="wj-story-source-list">
          {workspace.story.sources.map((source) => <button key={source.id} className={selectedSource === source.id ? 'active' : ''} onClick={() => {
            selectedSourceRef.current = source.id;
            setSelectedSource(source.id); setSourcePage(null);
          }}>
            <BookOpen size={15} /><span><strong>{source.name}</strong><small>{source.chapterCount} 章 · {source.characters.toLocaleString()} 字 · {bytesLabel(source.bytes)}</small></span>
          </button>)}
          {!workspace.story.sources.length && <div className="wj-story-empty">导入 TXT、Markdown、DOCX 或 PDF 原文</div>}
        </div>
        {currentSource && <>
          <div className="wj-story-chapters">
            <div className="wj-story-subhead"><strong>章节索引</strong><span>{currentSource.chapterCount} 章</span></div>
            <div className="wj-story-chapter-list">
              {currentSource.chapters.map((chapter) => <button key={`${chapter.offset}-${chapter.line}`} onClick={() => void run('正在读取章节', () => readPage(chapter.offset))} title={`第 ${chapter.line} 行`}>
                <span>{chapter.title}</span><small>{chapter.line}</small>
              </button>)}
              {currentSource.chapterCount > currentSource.chapters.length && <span className="wj-story-more">仅显示前 {currentSource.chapters.length} 个章节标题</span>}
            </div>
          </div>
          <div className="wj-story-reader">
            <div className="wj-story-subhead"><strong>原文</strong><span>{sourcePage ? `${sourcePage.offset.toLocaleString()} / ${currentSource.characters.toLocaleString()}` : '选择章节开始阅读'}</span></div>
            <pre>{sourcePage?.content || '原文内容会显示在这里。'}</pre>
            <button disabled={!!busy || !sourcePage?.nextOffset} onClick={() => sourcePage?.nextOffset != null && void run('正在读取下一段', () => readPage(sourcePage.nextOffset!))}>
              <BookOpen size={14} />读取下一段
            </button>
          </div>
        </>}
      </aside>
      <div className="wj-story-main">
        <section className="wj-story-plan">
          <div className="wj-section-title"><h2>全剧策划</h2><span>{plan.format === 'series' ? '系列短剧' : '单集短片'}</span></div>
          <div className="wj-story-fields">
            <label className="wj-field">作品名称<input value={plan.title} maxLength={200} onChange={(event) => changePlan('title', event.target.value)} /></label>
            <label className="wj-field">故事梗概<input value={plan.logline} maxLength={5000} onChange={(event) => changePlan('logline', event.target.value)} /></label>
            <label className="wj-field">作品形式<select value={plan.format} onChange={(event) => changePlan('format', event.target.value as StoryPlan['format'])}><option value="series">系列短剧</option><option value="short">单集短片</option></select></label>
            <label className="wj-field">画幅<select value={plan.ratio} onChange={(event) => changePlan('ratio', event.target.value as StoryPlan['ratio'])}><option>9:16</option><option>16:9</option><option>1:1</option></select></label>
            <label className="wj-field">计划集数<input type="number" min={1} max={1000} value={plan.plannedEpisodes ?? ''} onChange={(event) => changePlan('plannedEpisodes', event.target.value ? Number(event.target.value) : null)} /></label>
            <label className="wj-field">单集时长 / 秒<input type="number" min={15} max={3600} value={plan.targetEpisodeSeconds ?? ''} onChange={(event) => changePlan('targetEpisodeSeconds', event.target.value ? Number(event.target.value) : null)} /></label>
            <label className="wj-field">风格<input value={plan.style} maxLength={2000} onChange={(event) => changePlan('style', event.target.value)} /></label>
            <label className="wj-field">改编说明<input value={plan.adaptationNotes} maxLength={20000} onChange={(event) => changePlan('adaptationNotes', event.target.value)} /></label>
            <label className="wj-field wj-story-wide">全剧梗概<textarea value={plan.synopsis} maxLength={30000} onChange={(event) => changePlan('synopsis', event.target.value)} /></label>
          </div>
          <div className="wj-story-entity-grid">
            {([
              ['characters', '人物', 100],
              ['scenes', '场景', 100],
              ['props', '道具', 200],
            ] as const).map(([kind, label, max]) => <section className="wj-story-entity-list" key={kind}>
              <div className="wj-story-subhead"><strong>{label}资产</strong><button disabled={plan[kind].length >= max} onClick={() => addEntity(kind)}><Plus size={13} />新增{label}</button></div>
              {!plan[kind].length && <p className="wj-story-entity-empty">暂未规划{label}</p>}
              {plan[kind].map((item, index) => <div className="wj-story-entity" key={`${item.id}-${index}`}>
                <span>{item.id}</span>
                <input aria-label={`${label}名称 ${index + 1}`} placeholder={`${label}名称`} value={item.name} maxLength={200}
                  onChange={(event) => changeEntities(kind, index, { name: event.target.value })} />
                <input aria-label={`${label}描述 ${index + 1}`} placeholder="外观、性格或场景特征" value={item.description} maxLength={8000}
                  onChange={(event) => changeEntities(kind, index, { description: event.target.value })} />
                <button className="wj-story-remove" aria-label={`删除${label}`} title={`删除${label}`} onClick={() => removeEntity(kind, index)}><X size={14} /></button>
              </div>)}
            </section>)}
          </div>
        </section>
        <section className="wj-story-episodes">
          <div className="wj-section-title"><h2>分集剧本</h2><button disabled={!!busy || episodeNumbers.length >= 200} onClick={addEpisode}><Plus size={14} />新增一集</button></div>
          {episodeNumbers.length ? <div className="wj-episode-layout">
            <nav className="wj-episode-list" aria-label="分集列表">
              {activeEpisodeNumbers.map((number) => {
                const item = episodes.find((entry) => entry.number === number);
                const row = plan.episodeOutlines.find((entry) => entry.number === number);
                return <button key={number} className={episodeNumber === number ? 'active' : ''} onClick={() => setSelectedEpisode(number)}>
                  <span className="wj-episode-index">{String(number).padStart(2, '0')}</span><span><strong>{row?.title || item?.title || `第${number}集`}</strong><small>{item?.projectId ? '独立剪辑工程' : item?.script.trim() ? '剧本已保存' : '待写剧本'}</small></span>
                </button>;
              })}
              {archivedEpisodeNumbers.length > 0 && <>
                <div className="wj-episode-archive-label">已归档 · {archivedEpisodeNumbers.length} 集</div>
                {archivedEpisodeNumbers.map((number) => {
                  const item = episodes.find((entry) => entry.number === number);
                  const row = plan.episodeOutlines.find((entry) => entry.number === number);
                  return <button key={number} className={episodeNumber === number ? 'active archived' : 'archived'} onClick={() => setSelectedEpisode(number)}>
                    <span className="wj-episode-index">{String(number).padStart(2, '0')}</span><span><strong>{row?.title || item?.title || `第${number}集`}</strong><small>{item?.projectId ? '已归档 · 剪辑工程保留' : '已归档 · 剧本保留'}</small></span>
                  </button>;
                })}
              </>}
            </nav>
            <div className="wj-episode-editor">
              {episodeNumber !== null && <>
                <div className="wj-episode-heading">
                  <h3>第 {episodeNumber} 集</h3>
                  <div className="wj-episode-heading-actions">
                    {episode?.projectId && <span className="wj-status ready">已有独立工程</span>}
                    {episode?.archived
                      ? <button title="恢复到分集列表" onClick={() => void run('正在恢复分集', () => setEpisodeArchived(false))}><ArchiveRestore size={14} />恢复</button>
                      : <button title="归档后仍保留剧本、剪辑工程和素材" disabled={!episode?.script.trim()}
                        onClick={() => void run('正在归档分集', () => setEpisodeArchived(true))}><Archive size={14} />归档</button>}
                  </div>
                </div>
                <label className="wj-field">分集标题<input value={outline?.title ?? episode?.title ?? `第${episodeNumber}集`} maxLength={200} onChange={(event) => changeOutline({ title: event.target.value })} /></label>
                <label className="wj-field">本集梗概<textarea value={outline?.summary ?? ''} maxLength={8000} onChange={(event) => changeOutline({ summary: event.target.value })} /></label>
                <label className="wj-field">结尾钩子<input value={outline?.hook ?? ''} maxLength={3000} onChange={(event) => changeOutline({ hook: event.target.value })} /></label>
                <label className="wj-field">剧本正文<textarea className="wj-episode-script" value={episode?.script ?? ''} maxLength={150000} onChange={(event) => changeEpisode(event.target.value)} placeholder="分集剧本保存在故事工作区；保存后可建立独立剪辑工程。" /></label>
              </>}
              <p className="wj-story-note"><FileText size={14} />每集剪辑工程独立保存分镜与时间线，不覆盖其他集。</p>
            </div>
          </div> : <div className="wj-story-empty">添加分集大纲，逐集保存剧本。</div>}
        </section>
      </div>
    </fieldset>}
    <div className="wj-story-footer">
      <span>{currentSource ? `本次阅读位置 ${Math.min(readOffsets[currentSource.id] ?? 0, currentSource.characters).toLocaleString()} / ${currentSource.characters.toLocaleString()} 字` : '导入小说后可查看原文和章节索引'}</span>
      <span>原文与分集策划独立保存；创建分集工程不会提交付费生成任务。</span>
    </div>
    </section>
    </dialog>}
  </>;
}
