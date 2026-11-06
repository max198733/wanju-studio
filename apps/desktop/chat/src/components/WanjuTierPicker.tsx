import React from 'react';
import { Check, ChevronDown, Layers, Settings2 } from 'lucide-react';
import { desktopBridge } from '@/lib/desktop-bridge';
import { keepFocus, Popover } from './Popover';

type Tier = { id: string; label: string; enabled: boolean; priceVersion: string; billingMode: string;
  inputPointsPerMillion: number; outputPointsPerMillion: number; reservePoints: number;
  cachedInputPointsPerMillion?: number; cacheWritePointsPerMillion?: number };
type Account = { authenticated: boolean; chat?: Tier & { selectedTier: string; tiers?: Tier[] } };
type Bridge = { status(): Promise<Account>; selectTier?(id: string, version: string): Promise<Account>;
  onChange(listener: () => void): () => void };
const account = (globalThis as { openfilmNative?: { wanju?: { account?: Bridge } } }).openfilmNative?.wanju?.account;
const yuan = (points: number) => (points / 100).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 });

export function WanjuTierPicker({ active }: { active: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<Account | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!account) return;
    let disposed = false;
    const refresh = () => { void account.status().then((next) => {
      if (!disposed) { setState(next); setError(''); }
    }, () => { if (!disposed) setError('暂时无法读取档位，请稍后重试。'); }); };
    refresh();
    const stop = account.onChange(refresh);
    return () => { disposed = true; stop(); };
  }, []);
  const selected = state?.chat?.tiers?.find((item) => item.id === state.chat?.selectedTier);
  const changeOpen = (next: boolean) => {
    setOpen(next); setError('');
    if (next) void account?.status().then(setState, () => setError('暂时无法读取档位，请稍后重试。'));
  };
  const apply = async (tier: Tier) => {
    if (!tier.enabled || !state?.authenticated || !account?.selectTier || busy || active) return;
    if (tier.id === state.chat?.selectedTier) { setOpen(false); return; }
    setBusy(true); setError('');
    try { setState(await account.selectTier(tier.id, tier.priceVersion)); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : '档位切换失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <Popover open={open} onOpenChange={changeOpen} placement="top" trigger={
    <button type="button" onMouseDown={keepFocus} disabled={active || busy} aria-label="创作档位" title="创作档位"
      className="inline-flex h-8 max-w-[180px] items-center gap-1.5 rounded px-2 text-[12.5px] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
      <Layers size={14} /><span className="truncate">{selected?.label || '基础档'}</span><ChevronDown size={12} />
    </button>
  }>
    <div role="dialog" aria-label="选择创作档位" className="w-[260px] max-w-[calc(100vw-32px)] p-1 text-[13px]">
      <p className="px-2.5 py-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
        按实际用量扣点
      </p>
      {(state?.chat?.tiers ?? []).map((tier) => <button key={tier.id} type="button" onMouseDown={keepFocus}
        disabled={busy || active || !tier.enabled || !state?.authenticated}
        onClick={() => void apply(tier)} aria-label={tier.label} aria-pressed={state?.chat?.selectedTier === tier.id}
        className="flex min-h-9 w-full items-center gap-2 rounded px-2.5 text-left hover:bg-[var(--bg-hover)] disabled:opacity-40">
        <span className="min-w-0 flex-1 py-1.5">
          <span className="block">{tier.label}</span>
          {tier.enabled ? <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">
            {tier.billingMode === 'included' ? '平台承担模型费用'
              : `输入 ¥${yuan(tier.inputPointsPerMillion)} · 输出 ¥${yuan(tier.outputPointsPerMillion)} / 百万Token`}
          </span> : null}
          {tier.enabled && tier.cachedInputPointsPerMillion !== undefined ? <span className="block text-[11px] leading-relaxed text-[var(--text-muted)]">
            缓存读取 ¥{yuan(tier.cachedInputPointsPerMillion)} · 写入 ¥{yuan(tier.cacheWritePointsPerMillion ?? 0)} / 百万Token
          </span> : null}
        </span>
        {!tier.enabled ? <span className="text-[11px] text-[var(--text-muted)]">暂未开放</span>
          : state?.chat?.selectedTier === tier.id ? <Check size={14} /> : null}
      </button>)}
      {busy ? <p role="status" className="px-2.5 py-2 text-[12px] text-[var(--text-muted)]">正在切换…</p> : null}
      {!state?.authenticated ? <p className="px-2.5 py-2 text-[12px] text-[var(--text-muted)]">登录后使用默认创作助手。</p> : null}
      {error ? <p role="alert" className="px-2.5 py-2 text-[12px] text-[var(--err)]">{error}</p> : null}
      <button type="button" onMouseDown={keepFocus} onClick={() => { setOpen(false); desktopBridge()?.openSettings?.('account'); }}
        className="mt-1 flex min-h-8 w-full items-center gap-2 border-t border-[var(--border)] px-2.5 text-[var(--text-muted)]">
        <Settings2 size={13} />账户与账单
      </button>
    </div>
  </Popover>;
}
