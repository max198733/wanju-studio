/**
 * The app's window: Studio's editor, as the open-source Studio is (its App, unchanged), and the chat in the column
 * Studio leaves for it (lib/host.ts `panel`). One page, one theme, one layer of dialogs over both.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './shell.css';
import '../chat/src/chat.css';

const root = createRoot(document.getElementById('root')!);
async function start() {
  const native = (window as unknown as { openfilmNative?: { productName?: string; wanju?: unknown } }).openfilmNative;
  const desktop = Boolean(native);
  // This shell is also the Wanju browser preview; it has no native bridge.
  if (!native || native.productName === '玩剧' || native.wanju) document.documentElement.dataset.wanju = '1';
  // App reads its host when imported; install the desktop bridge before loading it.
  if (desktop) await import('./bridge');
  const [{ App }, { FocusNav }, { applyStudioHost }] = await Promise.all([
    import('openfilm/studio-ui/App.tsx'),
    import('openfilm/studio-ui/components/FocusNav.tsx'),
    import('openfilm/studio-ui/lib/host.ts'),
  ]);
  applyStudioHost();
  root.render(<StrictMode><FocusNav /><App /></StrictMode>);
  if (desktop) {
    const { mountChat } = await import('../chat/src/mount');
    await mountChat(document.getElementById('of-chat')!);
  } else {
    document.getElementById('of-chat')?.remove();
    document.getElementById('of-chat-layer')?.remove();
  }
}

void start().catch(() => {
  root.render(<main role="alert" className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--surface)] p-6 text-[var(--text)]">
    <h1 className="text-lg font-medium">玩剧页面未能加载</h1>
    <p className="max-w-md text-center text-sm text-[var(--text-muted)]">请刷新页面；如果仍无法打开，请关闭并重新启动玩剧调试版。</p>
    <button type="button" className="rounded border border-[var(--border)] px-4 py-2" onClick={() => location.reload()}>重新加载</button>
  </main>);
});
