import React from 'react';
import { createRoot } from 'react-dom/client';
import { WanjuProductionStatus } from '../chat/src/components/WanjuProductionStatus';
import { ProductionModePicker } from '../chat/src/components/ProductionModePicker';
import type { ProductionMode } from '../chat/src/lib/production-mode';
import '../shell/shell.css';

function Fixture() {
  const [mode, setMode] = React.useState<ProductionMode>('quick');
  const [project, setProject] = React.useState('fixture-one');
  const [model, setModel] = React.useState<string | undefined>();
  const models = model ? [{ id: 'own', name: 'Test model', format: 'chat' as const, baseUrl: 'https://example.invalid/v1',
    model: 'test', levels: ['auto'], effort: 'auto', last4: 'test' }] : [];
  return <main className="of-chat" style={{ maxWidth: 440, margin: 'auto' }}>
    <WanjuProductionStatus projectId={project} mode={mode} agents={models.length ? [{ id: 'byok', name: 'Own key', shown: true, status: 'ready', byok: { models } }] : []}
      agent="byok" model={model} active={false} revision={0}
      onDetails={() => { document.body.dataset.details = 'open'; }} onUseCloud={() => setModel('wanjustudent')} />
    <ProductionModePicker value={mode} disabled={false} onChange={setMode} />
    <button onClick={() => setProject('fixture-two')}>切换测试项目</button>
    <button onClick={() => setModel('own')}>切换测试自有模型</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
