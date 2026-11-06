import React from 'react';
import { Cloud, Plus, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react';
import { SettingsButton, SettingsField, SettingsGroup, SettingsItem, SettingsStatus, settingsError } from './ui';

type Category = 'image' | 'video' | 'audio';
type Profile = {
  id: string; category: Category; adapter: string; name: string; baseUrl: string; model: string;
  note?: string; auth?: string; responseFormat?: string; configured?: boolean;
};
type Snapshot = {
  profiles: Profile[];
  cloud: { owner: string; revision: string; profiles: Profile[]; defaults: Partial<Record<Category, string>> };
  selection: Record<Category, string>;
};
type Draft = Profile & { key: string };
export type MediaBridge = {
  get(): Promise<Snapshot>; sync(): Promise<Snapshot>;
  save(input: Draft): Promise<Snapshot>;
  select(input: { category: Category; id: string }): Promise<Snapshot>;
  remove(input: { id: string }): Promise<Snapshot>;
  onChange(listener: () => void): () => void;
};
const categories: [Category, string][] = [['image', '图片'], ['video', '视频'], ['audio', '音频']];
const adapters = [
  { id: 'openai-image', name: 'OpenAI 兼容图片', category: 'image' },
  { id: 'seedance', name: 'Seedance / 方舟兼容视频', category: 'video' },
  { id: 'h3-single', name: 'AutoDL H3 首帧视频', category: 'video' },
  { id: 'custom-http', name: '自定义 HTTP 服务', category: '' },
];
const selectClass = 'min-h-10 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[14px]';
const initial = (category: Category): Draft => ({
  id: '', category, name: '', adapter: category === 'image' ? 'openai-image' : category === 'video' ? 'seedance' : 'custom-http',
  baseUrl: '', model: '', note: '', auth: 'Authorization: Bearer {key}', responseFormat: 'b64_json', key: '',
});
export function WanjuMediaProfiles({ bridge }: { bridge: MediaBridge }) {
  const [data, setData] = React.useState<Snapshot | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const reload = React.useCallback(() => bridge.get().then(setData), [bridge]);
  React.useEffect(() => {
    void reload().catch((e: Error) => setError(e.message));
    return bridge.onChange(() => void reload().catch((e: Error) => setError(e.message)));
  }, [bridge, reload]);
  const perform = async (fn: () => Promise<Snapshot>, success: string) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { setData(await fn()); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : '设置未保存，请重试。'); }
    finally { setBusy(false); }
  };
  const field = (key: keyof Draft, value: string) => setDraft((old) => old ? { ...old, [key]: value } : null);
  return <>
    <SettingsGroup title="云端默认服务" footnote="登录后自动同步账号的默认配置。自定义设置独立保留；同步不会修改你的选择。配置保存不代表服务已验证，也不会发送付费生成请求。">
      <SettingsItem mark={<Cloud size={18} />} title={data?.cloud.owner ? '已同步账号配置' : '尚未同步云端配置'}
        description={data?.cloud.profiles.length ? `云端提供 ${data.cloud.profiles.length} 个供应商配置。` : '登录后同步；管理员需先设置默认供应商并为账号分配密钥。'}
        control={<SettingsButton disabled={busy} onClick={() => void perform(() => bridge.sync(), '云端默认配置已同步。')}><RefreshCw size={15} />同步云端配置</SettingsButton>} />
    </SettingsGroup>
    {categories.map(([category, title]) => {
      const profiles = data?.profiles.filter((p) => p.category === category) || [];
      const cloud = data?.cloud.profiles.find((p) => p.id === data.cloud.defaults[category]);
      const selection = data?.selection[category] || 'cloud';
      return <SettingsGroup key={category} title={`${title}服务`}>
        <SettingsItem title={`默认${title}供应商`}
          description={selection === 'cloud' ? cloud ? `${cloud.name} · ${cloud.model || '自定义协议'}` : '云端尚未设置此类别的默认服务。' : '使用你选择的自定义供应商。'}
          control={<SettingsButton disabled={busy} aria-label={`添加${title}供应商`} onClick={() => { setDraft(initial(category)); setError(''); }}><Plus size={15} />添加</SettingsButton>}>
          <label className="flex flex-col gap-2 text-[14px]">{title}服务来源
            <select className={selectClass} aria-label={`${title}服务来源`} value={selection} disabled={busy || !data}
              onChange={(e) => void perform(() => bridge.select({ category, id: e.target.value }), '默认供应商已更新。正在执行的任务继续使用原供应商。')}>
              <option value="cloud">云端默认{cloud ? ` · ${cloud.name}` : ''}</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {selection === 'cloud' && cloud ? <SettingsStatus tone="muted">{cloud.configured ? '账号密钥已分配 · 未验证' : '尚未分配账号密钥'}</SettingsStatus> : null}
        </SettingsItem>
        {profiles.map((p) => <SettingsItem key={p.id} title={p.name}
          description={`${p.model || '自定义 HTTP'} · ${p.baseUrl}`}
          badge={<SettingsStatus tone="muted">{p.configured ? '密钥已保存 · 未验证' : '未配置密钥'}</SettingsStatus>}
          control={<div className="flex gap-2">
            <SettingsButton disabled={busy} aria-label={`编辑${p.name}`} title="编辑供应商" onClick={() => { setDraft({ ...p, key: '' }); setError(''); }}><Pencil size={15} /></SettingsButton>
            <SettingsButton disabled={busy} aria-label={`删除${p.name}`} title="删除供应商" onClick={() => {
              if (confirm(`删除“${p.name}”？若它是默认供应商，将恢复云端默认。`)) void perform(() => bridge.remove({ id: p.id }), '供应商已删除。');
            }}><Trash2 size={15} /></SettingsButton>
          </div>} />)}
        <details className="pb-3 text-[13px] text-[var(--text-muted)]">
          <summary className="cursor-pointer py-2">查看云端{title}供应商</summary>
          {(data?.cloud.profiles.filter((p) => p.category === category) || []).map((p) => <p key={p.id} className="break-all py-1">{p.name} · {p.model || '自定义 HTTP'} · {p.baseUrl}</p>)}
        </details>
      </SettingsGroup>;
    })}
    {draft ? <SettingsGroup title={draft.id ? `编辑 · ${draft.name}` : '添加自定义供应商'}>
      <form className="flex flex-col gap-4 pb-5" onSubmit={(e) => {
        e.preventDefault();
        const saved = { ...draft };
        void perform(async () => { const result = await bridge.save(saved); setDraft(null); return result; }, '供应商已保存；请在对应类别中选择为默认。');
      }}>
        <label className="flex flex-col gap-2 text-[14px]">供应商名称<SettingsField required maxLength={80} value={draft.name} onChange={(e) => field('name', e.target.value)} /></label>
        <label className="flex flex-col gap-2 text-[14px]">接口协议
          <select className={selectClass} value={draft.adapter} onChange={(e) => field('adapter', e.target.value)}>
            {adapters.filter((a) => !a.category || a.category === draft.category).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-[14px]">API 地址<SettingsField required type="url" value={draft.baseUrl} placeholder="https://api.example.com/v1" onChange={(e) => field('baseUrl', e.target.value)} /></label>
        {draft.adapter === 'seedance' ? <p className="text-[13px] text-[var(--text-muted)]">填写完整任务地址，包含 /contents/generations/tasks。</p> : null}
        {draft.adapter === 'h3-single' ? <p className="text-[13px] text-[var(--text-muted)]">填写以 /minimax_h3_zm_nono 结尾的完整任务地址。参考素材上传仍需对象存储配置。</p> : null}
        <label className="flex flex-col gap-2 text-[14px]">模型名称<SettingsField required={draft.adapter !== 'custom-http'} maxLength={200} value={draft.model} onChange={(e) => field('model', e.target.value)} /></label>
        <label className="flex flex-col gap-2 text-[14px]">API 密钥<SettingsField type="password" autoComplete="new-password" spellCheck={false} maxLength={2000} value={draft.key}
          placeholder={draft.id ? '留空保留；更换地址或协议时须重新填写' : '只填写密钥，不含 Bearer'} onChange={(e) => field('key', e.target.value)} /></label>
        {draft.adapter === 'openai-image' ? <label className="flex flex-col gap-2 text-[14px]">图片返回方式<select className={selectClass} value={draft.responseFormat} onChange={(e) => field('responseFormat', e.target.value)}>
          <option value="b64_json">直接返回图片</option><option value="url">返回下载地址</option>
        </select></label> : null}
        {draft.adapter === 'custom-http' ? <>
          <label className="flex flex-col gap-2 text-[14px]">认证请求头<SettingsField value={draft.auth} onChange={(e) => field('auth', e.target.value)} placeholder="Authorization: Bearer {key}" /></label>
          <label className="flex flex-col gap-2 text-[14px]">调用说明<textarea required className={`${selectClass} min-h-28 py-2`} maxLength={1600} value={draft.note} onChange={(e) => field('note', e.target.value)} placeholder="填写接口路径、请求参数、模型字段、结果查询方法；供创作助手调用。" /></label>
          <p className="text-[13px] text-[var(--text-muted)]">此协议通过原生 HTTP 工具调用。不同音频供应商参数不同，需要填写实际调用说明。</p>
        </> : null}
        <div className="flex justify-end gap-2">
          <SettingsButton disabled={busy} onClick={() => setDraft(null)}>取消</SettingsButton>
          <SettingsButton disabled={busy} variant="primary" type="submit"><Save size={15} />保存供应商</SettingsButton>
        </div>
      </form>
    </SettingsGroup> : null}
    <div className="py-3">
      {error ? <p className={settingsError} role="alert">{error}</p> : null}
      {message ? <p className="text-[13px] text-[var(--text-muted)]" role="status">{message}</p> : null}
    </div>
    <p className="pb-5 text-[13px] leading-relaxed text-[var(--text-muted)]">供应商直接收取生成费用。API 密钥不会显示给创作助手，也不会随作品上传。更换接口协议需要使用相应适配器或填写自定义 HTTP 调用说明。</p>
  </>;
}
