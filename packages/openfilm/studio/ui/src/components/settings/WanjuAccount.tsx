import React from 'react';
import { CreditCard, LogIn, LogOut, RefreshCw, Settings2, Wallet } from 'lucide-react';
import { cloudChatAccess, pointsAsYuan, pointsRateAsYuan, wanjuAccount, wanjuStudentEdition, wanjuUnifiedAccount, type StudentAccount } from '@/lib/wanju-account';
import { WanjuCloud } from './WanjuCloud';
import { SettingsButton, SettingsField, SettingsGroup, SettingsItem, SettingsPage, SettingsSegmented, SettingsStatus, settingsError } from './ui';

export function WanjuAccount({ onAgents }: { onAgents?: () => void } = {}) {
  const [state, setState] = React.useState<StudentAccount | null>(null);
  const [mode, setMode] = React.useState<'activate' | 'login'>('activate');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [recharge, setRecharge] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [reachable, setReachable] = React.useState(true);
  const run = React.useCallback(async (action: () => Promise<StudentAccount>, success = '') => {
    setBusy(true); setError(''); setMessage('');
    try { const next = await action(); setState(next); setReachable(true); setMessage(next.warning || success); return true; }
    catch (e) { setReachable(false); setError(e instanceof Error ? e.message : '操作失败，请稍后再试。'); return false; }
    finally { setBusy(false); }
  }, []);
  React.useEffect(() => {
    if (!wanjuAccount) return;
    let active = true;
    const refresh = () => { void wanjuAccount!.status().then((next) => { if (active) { setState(next); setReachable(true); setError(''); setMessage(next.warning ?? ''); } }, (e: Error) => { if (active) { setReachable(false); setError(e.message); } }); };
    refresh();
    const stop = wanjuAccount.onChange(refresh);
    const timer = setInterval(refresh, 60000);
    return () => { active = false; stop(); clearInterval(timer); };
  }, []);
  if (!wanjuAccount) return null;
  const chat = state?.chat;
  const access = cloudChatAccess(state, reachable);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const ok = await run(() => mode === 'activate' && wanjuUnifiedAccount && wanjuAccount!.register
      ? wanjuAccount!.register!({ username, password })
      : mode === 'activate'
      ? wanjuAccount!.activate({ username, password, code })
      : wanjuAccount!.login({ username, password }), mode === 'activate' ? wanjuUnifiedAccount ? '账号已创建。' : '激活成功。' : '登录成功。');
    if (ok) { setPassword(''); setCode(''); }
  };
  const rechargeNow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (await run(() => wanjuAccount!.redeem(recharge), '充值已到账。')) setRecharge('');
  };
  return (
    <SettingsPage>
      {wanjuUnifiedAccount ? <SettingsGroup title="玩剧账号">
        <SettingsItem title="本地创作、剪辑与导出" description="本地剪辑与导出可直接使用。" control={<SettingsStatus>可使用</SettingsStatus>} />
        <SettingsItem title="云端创作助手" description="登录后默认使用基础档，按实际用量自动扣点，余额不足时提示充值。" control={<div className="flex items-center gap-2">
          <SettingsStatus tone={access.ready ? 'ok' : 'muted'}>{access.ready ? '已开通' : access.label}</SettingsStatus>
          {onAgents ? <SettingsButton aria-label="管理创作助手" title="管理创作助手" onClick={onAgents}><Settings2 size={15} /></SettingsButton> : null}
        </div>} />
        <SettingsItem title="项目随账号保存" description="登录后保存项目与素材到云端；其他电脑登录同一账号后可下载继续编辑。" control={<SettingsStatus tone={state?.cloud?.available ? 'ok' : 'muted'}>{state?.cloud?.available ? '云服务已连接' : '云服务待开通'}</SettingsStatus>} />
      </SettingsGroup> : <SettingsGroup title={wanjuStudentEdition ? '学员版 · 当前权益' : '老师版 · 当前权益'}>
        <SettingsItem title="本地剪辑与导出" description="使用本地素材，无需激活或充值。" control={<SettingsStatus>可使用</SettingsStatus>} />
        <SettingsItem title="云端创作助手" description="登录且余额充足即可使用，按实际模型用量自动扣玩剧点。" control={<SettingsStatus tone={access.ready ? 'ok' : 'muted'}>{access.label}</SettingsStatus>} />
        <SettingsItem title="自有图片与视频服务" description={wanjuStudentEdition ? '激活登录后可在「图片与视频」手动配置自己的密钥，由供应商直接扣费。' : '在「图片与视频」配置本机密钥，由供应商直接扣费。'}
          control={<SettingsStatus tone={!wanjuStudentEdition || (reachable && state?.authenticated && state.ownMediaEnabled) ? 'ok' : 'muted'}>{!wanjuStudentEdition ? '可自行配置' : !reachable ? '权益待核实' : !state?.authenticated ? '激活后可配置' : state.ownMediaEnabled ? '已选择自有服务' : '可选择自有服务'}</SettingsStatus>} />
        <SettingsItem title="云端图片、视频与音乐" description="统一钱包媒体服务尚未开通，激活和充值不会启用。" control={<SettingsStatus tone="muted">尚未开通</SettingsStatus>} />
      </SettingsGroup>}
      <SettingsGroup title="云端账户与充值" footnote={wanjuUnifiedAccount ? '账号管理云项目、默认助手和服务费，本地作品始终保留。' : !wanjuStudentEdition ? '老师本机使用自有密钥不需要激活。此账户仅用于测试学员云端服务。' : undefined}>
        {!state && !error ? <p className="py-4 text-[14px] text-[var(--text-muted)]" role="status">正在连接…</p> : null}
        {state?.configured === false ? <p className="py-4 text-[14px] text-[var(--text-muted)]">{wanjuUnifiedAccount ? '云端账号服务尚未配置，本地创作可以继续。' : '老师尚未开通学员服务，请联系老师获取开通后的安装包。'}</p> : null}
        {state?.configured && !state.authenticated ? (
          <form onSubmit={(e) => void submit(e)} className="flex max-w-[440px] flex-col gap-4 py-4">
            <SettingsSegmented label="登录方式" value={mode} onChange={(next) => { setMode(next); setError(''); }}
              options={[{ value: 'activate', label: wanjuUnifiedAccount ? '创建账号' : '首次激活' }, { value: 'login', label: '已有账户' }]} />
            <label className="flex flex-col gap-2 text-[14px]">{wanjuUnifiedAccount ? '玩剧账号' : '学员账号'}<SettingsField required value={username} autoComplete="username" minLength={3} maxLength={32}
              onChange={(e) => setUsername(e.target.value)} placeholder="设置一个自己的账号" /></label>
            <label className="flex flex-col gap-2 text-[14px]">密码<SettingsField required type="password" value={password} minLength={10} maxLength={128}
              autoComplete={mode === 'activate' ? 'new-password' : 'current-password'} onChange={(e) => setPassword(e.target.value)} placeholder="至少10位" /></label>
            {mode === 'activate' && !wanjuUnifiedAccount ? <label className="flex flex-col gap-2 text-[14px]">激活码<SettingsField required value={code} autoComplete="off" maxLength={160}
              onChange={(e) => setCode(e.target.value)} placeholder="老师提供的 WJA 激活码" /></label> : null}
            <SettingsButton type="submit" variant="primary" disabled={busy}><LogIn size={15} />{busy ? '正在处理…' : mode === 'activate' ? wanjuUnifiedAccount ? '创建并登录' : '激活并登录' : '登录'}</SettingsButton>
          </form>
        ) : null}
        {state?.authenticated && state.user ? (
          <div className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-[14px] text-[var(--text-muted)]">{state.user.username}{!reachable ? ' · 离线，余额为上次查询结果' : ' · 已登录'}</p>
                <p className="my-2 flex items-center gap-2 text-[28px] font-semibold"><Wallet size={22} />{state.user.balance.toLocaleString('zh-CN')}<span className="text-[14px] font-normal">玩剧点</span></p>
                <p className="text-[13px] text-[var(--text-muted)]">可用余额 ¥{pointsAsYuan(state.user.balance)}{state.heldPoints ? ` · 预留中 ${state.heldPoints}点` : ''}</p>
              </div>
              <div className="flex gap-1">
                <SettingsButton aria-label="刷新余额" title="刷新余额" disabled={busy} onClick={() => void run(() => wanjuAccount!.status())}><RefreshCw size={15} /></SettingsButton>
                <SettingsButton variant="quiet" disabled={busy} onClick={() => void run(() => wanjuAccount!.logout(), '已退出登录。')}><LogOut size={15} />退出</SettingsButton>
              </div>
            </div>
            <form onSubmit={(e) => void rechargeNow(e)} className="mt-5 flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-2 text-[14px]">充值卡密<SettingsField required value={recharge} maxLength={160} autoComplete="off"
                onChange={(e) => setRecharge(e.target.value)} placeholder={wanjuUnifiedAccount ? '输入 WJR 充值码' : '输入老师提供的 WJR 充值码'} /></label>
              <SettingsButton type="submit" variant="primary" disabled={busy || !recharge.trim()}><CreditCard size={15} />充值</SettingsButton>
            </form>
            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <h4 className="text-[15px] font-medium">{chat?.displayName || '创作助手'}</h4>
              {chat?.tiers?.length && wanjuAccount.selectTier ? <div className="mt-3">
                <label className="flex max-w-[280px] flex-col gap-2 text-[14px]">创作档位
                  <select aria-label="创作档位" disabled={busy} value={chat.selectedTier}
                    onChange={(event) => {
                      const next = chat.tiers?.find((item) => item.id === event.target.value);
                      if (next?.enabled && next.id !== chat.selectedTier) void run(
                        () => wanjuAccount!.selectTier!(next.id!, next.priceVersion), '创作档位已更新。'
                      );
                    }}
                    className="min-h-9 rounded border border-[var(--border)] bg-[var(--bg)] px-2">
                    {chat.tiers.map((item) => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.label}{!item.enabled ? ' · 暂未开放' : ''}</option>)}
                  </select>
                </label>
              </div> : null}
              {chat?.enabled ? <>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {chat.billingMode === 'included' ? <>默认文字助手不扣钱包点数，近24小时最多 {chat.dailyRequestLimit ?? 200} 次模型请求。</> : <>
                  输入 ¥{pointsRateAsYuan(chat.inputPointsPerMillion)} / 百万Token；输出 ¥{pointsRateAsYuan(chat.outputPointsPerMillion)} / 百万Token。
                  {chat.cachedInputPointsPerMillion !== undefined && chat.cacheWritePointsPerMillion !== undefined
                    ? <>缓存读取 ¥{pointsRateAsYuan(chat.cachedInputPointsPerMillion)} / 百万Token；缓存写入 ¥{pointsRateAsYuan(chat.cacheWritePointsPerMillion)} / 百万Token。缓存用量从普通输入中扣除，不重复计算。</> : null}
                  登录后直接使用，按实际用量扣点；每次模型请求最多预留{chat.reservePoints}点，结束后按实际用量结算。一次创作可能包含多次模型请求。
                  </>}
                </p>
                <p className={`mt-3 text-[14px] ${access.ready ? 'text-[var(--ok)]' : 'text-[var(--text-muted)]'}`}>{access.label}</p>
              </> : <p className="mt-2 text-[14px] text-[var(--text-muted)]">创作助手尚未开通，点数不会因此扣除。</p>}
            </div>
            {state.operations?.some((op) => op.status === 'review') ? <p className="mt-4 text-[13px] text-[var(--text-muted)]">部分请求正在核对费用，对应点数仍在预留中。请联系管理员查询。</p> : null}
          </div>
        ) : null}
        {error ? <p role="alert" className={`${settingsError} py-3`}>{error}</p> : null}
        {message ? <p role="status" className="py-3 text-[14px] text-[var(--text-muted)]">{message}</p> : null}
        {error ? <SettingsButton onClick={() => void run(() => wanjuAccount!.status())} disabled={busy}><RefreshCw size={15} />重新连接</SettingsButton> : null}
      </SettingsGroup>
      {wanjuUnifiedAccount && state?.authenticated ? <WanjuCloud key={state.user?.id} state={state} onRefresh={() => void run(() => wanjuAccount!.status())} /> : null}
      {state?.authenticated ? <SettingsGroup title="最近账单">
        {state.ledger?.length ? <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)]"><th className="py-3 font-normal">时间</th><th className="py-3 font-normal">项目</th><th className="py-3 text-right font-normal">变动 / 点</th></tr></thead>
            <tbody>{state.ledger.map((row) => <tr key={row.id} className="border-b border-[var(--border)]">
              <td className="whitespace-nowrap py-3 pr-3 text-[var(--text-muted)]">{new Date(row.created).toLocaleString('zh-CN', { hour12: false })}</td>
              <td className="py-3 pr-3">{row.title}</td><td className="py-3 text-right tabular-nums">{row.delta > 0 ? '+' : ''}{row.delta}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="py-4 text-[14px] text-[var(--text-muted)]">暂无账单。</p>}
      </SettingsGroup> : null}
    </SettingsPage>
  );
}

export function WanjuAccountButton({ onClick }: { onClick: () => void }) {
  const [state, setState] = React.useState<StudentAccount | null>(null);
  const [offline, setOffline] = React.useState(false);
  React.useEffect(() => {
    if (!wanjuAccount) return;
    let active = true;
    const refresh = () => { void wanjuAccount!.status().then((next) => { if (active) { setState(next); setOffline(false); } }, () => { if (active) setOffline(true); }); };
    refresh();
    const stop = wanjuAccount.onChange(refresh);
    const timer = setInterval(refresh, 60000);
    return () => { active = false; stop(); clearInterval(timer); };
  }, []);
  if (!wanjuAccount) return null;
  return <button type="button" aria-label="账户与权益" title="账户与权益" onClick={onClick}
    className="flex h-[26px] max-w-[160px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--text-dim)] hover:bg-[var(--bg-hover)]">
    <Wallet size={14} /><span className="truncate">{offline ? '账户离线' : state?.authenticated ? `${state.user?.balance ?? 0}点` : wanjuUnifiedAccount ? '登录 / 云项目' : wanjuStudentEdition ? '未激活 / 登录' : '老师版 · 账户'}</span>
  </button>;
}
