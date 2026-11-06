import React from 'react';
import { Clapperboard, FileInput, KeyRound, RefreshCw, Save } from 'lucide-react';
import { WANJU_SUPPORTED_PROVIDERS, wanjuProviderLabel } from '@/lib/wanju-provider-labels';
import { wanjuAccount, wanjuUnifiedAccount, type StudentAccount } from '@/lib/wanju-account';
import { isWanju } from '@/lib/branding';
import { SettingsButton, SettingsField, SettingsGroup, SettingsItem, SettingsStatus, settingsError } from './ui';
import { WanjuMediaProfiles, type MediaBridge } from './WanjuMediaProfiles';

type Provider = { id: string; configured: boolean; supported?: boolean; managed?: boolean; verification: string };
type KeySettings = { configured: boolean; model?: string; baseUrl?: string; responseFormat?: 'b64_json' | 'url' };
type KeyBridge = { get(): Promise<KeySettings>; saveKey(input: { key: string; responseFormat?: 'b64_json' | 'url' }): Promise<KeySettings> };
type WanjuNative = {
  studentEdition?: boolean;
  importConfigs(): Promise<{ imported: number }>;
  imageConfig?: KeyBridge; seedanceConfig?: KeyBridge; h3Config?: KeyBridge;
  mediaProfiles?: MediaBridge;
};
const native = (globalThis as { openfilmNative?: { wanju?: WanjuNative | null } }).openfilmNative?.wanju;
const SERVICES = [
  { id: 'image', bridge: 'imageConfig', name: '图片生成', description: '角色定妆、场景、道具与分镜首帧。', technical: '图片中转服务', field: '图片 API 密钥' },
  { id: 'seedance', bridge: 'seedanceConfig', name: '视频 · 参考素材创作', description: '参考图片、视频或音频制作镜头，适合连续性要求较高的短剧。', field: '参考素材视频 API 密钥' },
  { id: 'h3_zm_nono', bridge: 'h3Config', name: '视频 · 首帧快拍', description: '只使用当前镜头首帧图，适合快速逐镜生成。需配置素材存储。', field: '首帧视频 API 密钥' },
] as const;

export function WanjuProviders({ onAccount }: { onAccount?: () => void } = {}) {
  return native?.mediaProfiles ? <WanjuMediaProfiles bridge={native.mediaProfiles} /> : <LegacyWanjuProviders onAccount={onAccount} />;
}
function LegacyWanjuProviders({ onAccount }: { onAccount?: () => void } = {}) {
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [settings, setSettings] = React.useState<Record<string, KeySettings>>({});
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState('');
  const [key, setKey] = React.useState('');
  const [responseFormat, setResponseFormat] = React.useState<'b64_json' | 'url'>('b64_json');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [account, setAccount] = React.useState<StudentAccount | null>(null);
  const localAllowed = wanjuUnifiedAccount || !native?.studentEdition || Boolean(account?.authenticated && account.ownMediaEnabled);
  const refresh = React.useCallback(async () => {
    const response = await fetch('/api/wanju/status');
    if (!response.ok) throw new Error('读取配置状态失败。');
    const data = await response.json();
    if (!Array.isArray(data.providers)) throw new Error('配置状态格式无效。');
    const next: Record<string, KeySettings> = {};
    if (localAllowed) {
      for (const service of SERVICES) {
        const bridge = native?.[service.bridge];
        if (bridge) next[service.id] = await bridge.get();
      }
    }
    setProviders(data.providers);
    setSettings(next);
    setLoaded(true);
  }, [localAllowed, account?.user?.id]);
  React.useEffect(() => { setLoaded(false); setSettings({}); if (native && localAllowed) void refresh().catch((e: Error) => { setLoaded(false); setError(e.message); }); }, [refresh, localAllowed]);
  React.useEffect(() => {
    if (wanjuUnifiedAccount || !native?.studentEdition || !wanjuAccount) return;
    const bridge = wanjuAccount;
    let active = true;
    const read = () => void bridge.status().then((state) => { if (active) { setAccount(state); setError(''); } }, () => { if (active) { setAccount(null); setError('账户连接中断，请重新连接后配置。'); } });
    read();
    const stop = bridge.onChange(read);
    const timer = setInterval(read, 60000);
    return () => { active = false; stop(); clearInterval(timer); };
  }, []);
  if (!native) return isWanju() ? <SettingsGroup title="图片与视频">
    <SettingsItem title="请在玩剧桌面版配置服务" description="当前浏览器可以查看与剪辑本机项目。账户激活和本地密钥配置请在玩剧桌面版完成。" />
  </SettingsGroup> : null;
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  };
  const importConfigs = () => perform(async () => {
    const result = await native.importConfigs();
    await refresh();
    if (result.imported) setMessage(`已导入 ${result.imported} 份配置；尚未接入的服务不会因此启用。`);
  });
  const save = () => perform(async () => {
    const service = SERVICES.find((item) => item.id === editing);
    const bridge = service && native[service.bridge];
    if (!bridge || (!key.trim() && !(editing === 'image' && settings.image?.configured))) return;
    await bridge.saveKey({ key, ...(editing === 'image' ? { responseFormat } : {}) });
    setKey(''); setEditing('');
    await refresh();
    setMessage('密钥已保存。尚未发送生成请求，不代表已验证服务可用。');
  });
  const mode = !wanjuUnifiedAccount && native.studentEdition ? <SettingsGroup title="媒体服务来源">
    <SettingsItem title="老师统一提供" description="云端图片与视频服务尚未开通。" control={<SettingsStatus tone="muted">尚未开通</SettingsStatus>} />
    <SettingsItem title="使用自己的图片与视频服务" description="需要激活并登录。密钥由你填写，供应商直接扣费，不扣玩剧点。"
      control={account?.authenticated
        ? <SettingsButton disabled={busy} onClick={() => void perform(async () => {
          if (!wanjuAccount) return;
          setAccount(await wanjuAccount.setOwnMediaEnabled(!account.ownMediaEnabled));
          setEditing(''); setKey(''); setLoaded(false);
        })}>{account.ownMediaEnabled ? '停用自有服务' : '启用自有服务'}</SettingsButton>
        : <SettingsButton disabled={!onAccount} onClick={onAccount}>前往激活 / 登录</SettingsButton>} />
    {error && !localAllowed ? <p className={`${settingsError} py-3`} role="alert">{error}</p> : null}
  </SettingsGroup> : null;
  if (!localAllowed) return <>{mode}<SettingsGroup title="本地素材">
    <SettingsItem title="导入、剪辑与导出" description="使用已有素材，不需要激活或配置供应商。" control={<SettingsStatus>可使用</SettingsStatus>} />
  </SettingsGroup></>;
  const configured = (id: string) => settings[id]?.configured ?? providers.find((item) => item.id === id)?.configured ?? false;
  return <>
    {mode}
    <SettingsGroup title={wanjuUnifiedAccount ? '我的图片与视频服务' : native.studentEdition ? '我的媒体服务' : '老师本机服务'}
      footnote={wanjuUnifiedAccount ? '供应商直接收取生成费用。如启用玩剧成功服务费，当前在保存到云端时核算，不是生成时即时扣点。API 密钥仅保存在本机，不随作品同步。' : '这些服务由供应商直接扣费，不使用学员玩剧点。密钥仅保存在本机。'}>
      {SERVICES.map((service) => <SettingsItem key={service.id}
        mark={<KeyRound size={17} />} title={service.name}
        badge={<SettingsStatus tone="muted">{!loaded ? '状态未确认' : configured(service.id) ? '密钥已保存 · 未验证' : '未配置'}</SettingsStatus>}
        description={service.description}
        control={native[service.bridge] && editing !== service.id ? <SettingsButton disabled={busy} aria-label={`配置${service.name}`} onClick={() => { setEditing(service.id); setKey(''); setResponseFormat(settings.image?.responseFormat ?? 'b64_json'); setMessage(''); setError(''); }}><KeyRound size={14} />配置</SettingsButton> : null}
      >
        {editing === service.id ? <form className="flex flex-col gap-3 border-l-2 border-[var(--border)] pl-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {wanjuUnifiedAccount ? <div className="break-all text-[13px] leading-relaxed text-[var(--text-muted)]">
            <p>{service.id === 'seedance' ? '火山方舟 · Seedance 2.0' : service.id === 'h3_zm_nono' ? 'AutoDL · MiniMax H3 首帧' : '图片供应商接口'}</p>
            <p>接口：{settings[service.id]?.baseUrl || '尚未设置，请导入服务配置'}</p>
            <p>模型：{settings[service.id]?.model || '尚未设置'}</p>
          </div> : <p className="text-[13px] text-[var(--text-muted)]">接口地址与模型由老师通过配套配置文件管理。</p>}
          <label className="flex flex-col gap-2 text-[14px]">{service.field}
            <SettingsField type="password" autoFocus autoComplete="off" spellCheck={false} maxLength={512} value={key} disabled={busy} onChange={(event) => setKey(event.target.value)} placeholder={service.id === 'image' && settings.image?.configured ? '留空保留已存密钥' : '粘贴此服务的密钥'} />
          </label>
          {service.id === 'image' && <label className="flex flex-col gap-2 text-[14px]">图片返回方式
            <select value={responseFormat} disabled={busy} onChange={(event) => setResponseFormat(event.target.value as 'b64_json' | 'url')}
              className="min-h-9 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px]">
              <option value="b64_json">直接返回图片（减少下载等待）</option>
              <option value="url">返回下载地址（兼容模式）</option>
            </select>
          </label>}
          <div className="flex flex-wrap justify-end gap-2">
            <SettingsButton disabled={busy} onClick={() => { setEditing(''); setKey(''); }}>取消</SettingsButton>
            <SettingsButton type="submit" variant="primary" disabled={busy || (!key.trim() && !(editing === 'image' && settings.image?.configured))}><Save size={15} />保存密钥</SettingsButton>
          </div>
        </form> : null}
      </SettingsItem>)}
    </SettingsGroup>
    <SettingsGroup title="创作流程">
      <SettingsItem mark={<Clapperboard size={18} />} title="何导工作流" description="剧本、资产、分镜审核与生成规则；不包含模型额度。" control={<SettingsStatus>已内置</SettingsStatus>} />
    </SettingsGroup>
    <details className="mb-6">
      <summary className="cursor-pointer py-2 text-[14px] text-[var(--text-muted)]">{wanjuUnifiedAccount || native.studentEdition ? '高级配置' : '老师高级配置'}</summary>
      <SettingsItem title="配套配置文件" description="导入素材存储、服务地址及模型等配套 JSON 设置。" control={<SettingsButton disabled={busy} onClick={() => void importConfigs()}><FileInput size={15} />导入配置</SettingsButton>} />
      {['cos', 'h3'].map((id) => <SettingsItem key={id} title={wanjuProviderLabel(id)} description={id === 'h3' ? '旧版兼容，与首帧快拍共用密钥。' : '本地首帧上传需要对象存储。通过配套文件配置。'}
        control={<SettingsStatus tone="muted">{!loaded ? '状态未确认' : configured(id) ? '密钥已保存 · 未验证' : '未配置'}</SettingsStatus>} />)}
      {providers.filter((provider) => !WANJU_SUPPORTED_PROVIDERS.has(provider.id)).length ? <p className="py-3 text-[13px] text-[var(--text-muted)]">其他历史配置暂不支持生成，已从创作线路中隐藏。</p> : null}
    </details>
    <div className="flex flex-wrap items-center gap-3">
      <SettingsButton disabled={busy} onClick={() => void perform(async () => { setLoaded(false); await refresh(); setMessage('已读取本机配置，未发送付费请求。'); })}><RefreshCw size={14} />刷新配置</SettingsButton>
      {message ? <p className="text-[13px] text-[var(--text-muted)]" role="status">{message}</p> : null}
      {error ? <p className={settingsError} role="alert">{error}</p> : null}
    </div>
  </>;
}
