import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrandLogo } from '../../../packages/openfilm/studio/ui/src/components/BrandLogo';
import { SettingsModal } from '../../../packages/openfilm/studio/ui/src/components/settings/SettingsModal';
import { SkillsLibrary } from '../../../packages/openfilm/studio/ui/src/components/SkillsLibrary';
import { WhatsNew } from '../../../packages/openfilm/studio/ui/src/components/WhatsNew';
import { lookup, setLanguageChoice } from '../../../packages/openfilm/studio/ui/src/i18n';
import { translate, setLanguage } from '../chat/src/i18n';
import { brandUiText } from '../../../packages/openfilm/studio/ui/src/lib/branding';
import { browserLines, fullReport } from '../../../packages/openfilm/studio/ui/src/lib/diagnostics';
import { INTERRUPTED } from '../chat/src/lib/local-agent-run';
import '../shell/shell.css';

setLanguageChoice('zh-CN');
setLanguage('zh-CN');
function Fixture() {
  const [open, setOpen] = React.useState(false);
  const [skill, setSkill] = React.useState<null | 'view'>(null);
  return <main>
    <BrandLogo />
    <p>{lookup('gallery.fromOpenFilm')}</p>
    <p>{translate('banner.ffmpegFailed').replace('{error}', '测试错误')}</p>
    <p>{INTERRUPTED}</p>
    <pre>{brandUiText(fullReport('OpenFilm doctor\nOpenFilm desktop app', {
      userAgent: 'test', chromium: true, webgl: 'test', framed: false, cookies: true, storage: true, screen: 'test',
    }))}</pre>
    <pre>{browserLines({
      userAgent: 'test', chromium: true, webgl: 'test', framed: false, cookies: true, storage: true, screen: 'test',
    }).join('\n')}</pre>
    <button onClick={() => setOpen(true)}>打开设置</button>
    <button onClick={() => setSkill('view')}>打开技能</button>
    {skill && <SkillsLibrary skills={[]} setSkills={() => {}} projectId={null} opened={null} onOpen={() => {}} onBack={() => setSkill(null)} />}
    <SettingsModal open={open} onClose={() => setOpen(false)} section="shortcuts" />
    <WhatsNew />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
