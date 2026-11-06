import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductionModePicker } from '../chat/src/components/ProductionModePicker';
import { ProjectStarters } from '../chat/src/components/ProjectStarters';
import type { ProductionMode } from '../chat/src/lib/production-mode';
import '../shell/shell.css';

function Preview() {
  const [mode, setMode] = React.useState<ProductionMode>('auto');
  return <main className="of-chat" style={{ maxWidth: 440, margin: 'auto', padding: 16 }}>
    <ProductionModePicker value={mode} disabled={false} onChange={setMode} />
    <ProjectStarters mode={mode} onPick={() => {}} onAttach={() => {}} />
  </main>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
