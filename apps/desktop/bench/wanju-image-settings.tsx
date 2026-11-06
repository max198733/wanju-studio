import React from 'react';
import { createRoot } from 'react-dom/client';
import { WanjuProviders } from '../../../packages/openfilm/studio/ui/src/components/settings/WanjuProviders';
import { WanjuAccount } from '../../../packages/openfilm/studio/ui/src/components/settings/WanjuAccount';
import '../shell/shell.css';

createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 32, maxWidth: 880 }}>
    <h2 style={{ fontSize: 22, marginBottom: 24 }}>设置 / 图片与视频</h2>
    {new URLSearchParams(location.search).has('account') ? <WanjuAccount /> : <WanjuProviders onAccount={() => { location.search = '?account'; }} />}
  </main>,
);
