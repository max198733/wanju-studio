import React from 'react';
import { createRoot } from 'react-dom/client';
import { WanjuProductionAssets } from '../../../packages/openfilm/studio/ui/src/components/WanjuProductionAssets';
import '../shell/shell.css';

function Fixture() {
  const [project, setProject] = React.useState('asset-fixture');
  return <main className="p-6" data-host-titlebar>
    <button onClick={() => setProject('other-project')}>切换测试项目</button>
    <button onClick={() => setProject('legacy-project')}>打开旧工程</button>
    <header data-titlebar><WanjuProductionAssets projectId={project} className="p-2" /></header>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
