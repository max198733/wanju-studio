import { useEffect, useRef, useState } from 'react';
import { Scissors, X } from 'lucide-react';
import type { Op } from '@/api';
import { Tooltip } from './Tooltip';
import './PodcastCutWorkspace.css';

type AudioClip = { id: string; src: string; durationSec?: number };
type CutRange = { startSec: number; endSec: number; reason: 'filler' | 'pause' | 'repeat'; reasons: string[]; text: string };
type Preview = {
  rev: string;
  reviewId: string;
  cuts: CutRange[];
  durationSec: number;
  clipId: string | null;
  removedSec?: number;
  ops?: Op[];
};
const REVIEW_PAGE_SIZE = 400;

const REASONS = [
  ['pause', '长停顿'],
  ['filler', '语气词'],
  ['repeat', '连续重复'],
] as const;

function timestamp(seconds: number) {
  const value = Math.max(0, seconds);
  const whole = Math.floor(value);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole % 3600 / 60);
  const rest = (value % 60).toFixed(2).padStart(5, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

async function request(projectId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/podcast-cut`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `口播分析失败 (${response.status})`);
  return result as Preview;
}

export function PodcastCutWorkspace({ projectId, clips, onApply }: {
  projectId: string;
  clips: AudioClip[];
  onApply: (ops: Op[], label: string, expectedRev: string) => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [clipId, setClipId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [visibleCount, setVisibleCount] = useState(REVIEW_PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!visible || !dialog.current) return;
    if (!dialog.current.open) dialog.current.showModal();
    return () => { if (dialog.current?.open) dialog.current.close(); };
  }, [visible]);

  useEffect(() => {
    if (!clips.some((clip) => clip.id === clipId)) {
      setClipId(clips[0]?.id ?? '');
      setPreview(null);
      setSelected([]);
    }
  }, [clips, clipId]);

  const currentClip = clips.find((clip) => clip.id === clipId);
  const analyze = async () => {
    if (!currentClip) throw new Error('请选择时间线上的录音片段。');
    const result = await request(projectId, {
      src: currentClip.src,
      clipId: currentClip.id,
      ...(currentClip.durationSec ? { durationSec: currentClip.durationSec } : {}),
    });
    setPreview(result);
    setVisibleCount(REVIEW_PAGE_SIZE);
    setSelected(result.cuts.slice(0, REVIEW_PAGE_SIZE).map((_, index) => index));
    setNotice(result.cuts.length ? `找到 ${result.cuts.length} 个待复核剪点。` : '没有发现符合当前规则的剪点。');
  };

  const apply = async () => {
    if (!currentClip || !preview || !selected.length) return;
    const result = await request(projectId, {
      src: currentClip.src,
      clipId: currentClip.id,
      durationSec: preview.durationSec,
      includeOps: true,
      selectedCuts: selected,
      expectedRev: preview.rev,
      reviewId: preview.reviewId,
    });
    const removed = Number(result.removedSec ?? 0);
    const summary = `将移除 ${selected.length} 个剪点，缩短约 ${removed.toFixed(2)} 秒；只改时间线，不删除原始录音。`;
    if (!window.confirm(`${summary}\n\n继续应用吗？`)) return;
    if (result.ops?.length) {
      const failure = await onApply(result.ops, '口播粗剪', result.rev);
      if (failure) throw new Error(failure);
    }
    setNotice(result.ops?.length ? `已应用 ${selected.length} 个剪点，可在时间线编辑历史中撤销。` : '所选剪点没有产生时间线变化。');
    setPreview(null);
    setSelected([]);
  };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '口播粗剪失败。'); }
    finally { setBusy(false); }
  };

  return <>
    <Tooltip label="口播粗剪" side="bottom">
      <button type="button" className="h-7 w-7 shrink-0 rounded-md text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        aria-label="口播粗剪" aria-haspopup="dialog" disabled={!clips.length} onClick={() => setVisible(true)}>
        <Scissors size={15} />
      </button>
    </Tooltip>
    {visible && <dialog ref={dialog} className="podcast-cut-dialog" aria-labelledby="podcast-cut-title" onCancel={(event) => {
      event.preventDefault();
      setVisible(false);
    }}>
      <header className="podcast-cut-header">
        <div><h2 id="podcast-cut-title">口播粗剪</h2><span>基于原始逐词时间生成建议，应用前逐条复核。</span></div>
        <button type="button" aria-label="关闭口播粗剪" title="关闭" onClick={() => setVisible(false)}><X size={17} /></button>
      </header>
      <div className="podcast-cut-body">
        {clips.length ? <>
          <label className="podcast-cut-field">时间线录音
            <select value={clipId} disabled={busy} onChange={(event) => { setClipId(event.target.value); setPreview(null); setNotice(''); }}>
              {clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.src} · {clip.id}</option>)}
            </select>
          </label>
          <p className="podcast-cut-note">扫描长停顿、独立语气词和连续重复。没有真实逐词结束时间或录音已变化时，不会生成剪点。原素材保持不变。</p>
          <div className="podcast-cut-actions">
            <button type="button" disabled={busy || !currentClip} onClick={() => void run(analyze)}>{busy ? '处理中…' : preview ? '重新分析' : '分析录音'}</button>
            {preview && <button type="button" className="primary" disabled={busy || !selected.length} onClick={() => void run(apply)}>
              应用选中 {selected.length} 项
            </button>}
          </div>
          {preview && <div className="podcast-cut-results">
            <div className="podcast-cut-result-heading">
              <strong>{preview.cuts.length ? `检测到 ${preview.cuts.length} 个剪点` : '没有检测到剪点'}</strong>
              <span>录音 {timestamp(preview.durationSec)}</span>
            </div>
            {preview.cuts.length > 0 && <div className="podcast-cut-checks">
              {REASONS.map(([reason, title]) => {
                const indexes = preview.cuts.slice(0, visibleCount).flatMap((cut, index) => cut.reasons.includes(reason) ? [index] : []);
                if (!indexes.length) return null;
                const allSelected = indexes.every((index) => selected.includes(index));
                return <label key={reason}><input type="checkbox" disabled={busy} checked={allSelected} onChange={() => setSelected((current) => allSelected
                  ? current.filter((index) => !indexes.includes(index))
                  : [...new Set([...current, ...indexes])].sort((a, b) => a - b))} />{title} · {indexes.length}</label>;
              })}
            </div>}
            <ol className="podcast-cut-list">
              {preview.cuts.slice(0, visibleCount).map((cut, index) => <li key={`${cut.startSec}-${cut.endSec}-${index}`}>
                <label>
                  <input type="checkbox" disabled={busy} checked={selected.includes(index)} onChange={() => setSelected((current) => current.includes(index)
                    ? current.filter((value) => value !== index)
                    : [...current, index].sort((a, b) => a - b))} />
                  <span className="podcast-cut-time">{timestamp(cut.startSec)}–{timestamp(cut.endSec)}</span>
                  <span className="podcast-cut-reason">{cut.reasons.map((reason) => REASONS.find(([key]) => key === reason)?.[1] ?? reason).join('、')}</span>
                  <span className="podcast-cut-text">{cut.text}</span>
                </label>
              </li>)}
            </ol>
            {preview.cuts.length > visibleCount && <div className="podcast-cut-actions">
              <button type="button" disabled={busy} onClick={() => setVisibleCount((count) => count + REVIEW_PAGE_SIZE)}>
                显示后续 {Math.min(REVIEW_PAGE_SIZE, preview.cuts.length - visibleCount)} 项
              </button>
              <span>已显示 {visibleCount} / {preview.cuts.length} 项，未展示项未选中。</span>
            </div>}
          </div>}
        </> : <p className="podcast-cut-empty">先把录音素材放到时间线上。</p>}
        {(error || notice) && <p className={`podcast-cut-status${error ? ' error' : ''}`} role="status">{error || notice}</p>}
      </div>
    </dialog>}
  </>;
}
