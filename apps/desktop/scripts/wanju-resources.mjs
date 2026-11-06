import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = fileURLToPath(new URL('../../../', import.meta.url));
export function prepareWanjuResources(target = join(repository, '.local', 'desktop-resources'), { studentEdition } = {}) {
  const dest = resolve(target);
  mkdirSync(dest, { recursive: true });
  const copy = (from, to) => cpSync(join(repository, from), join(dest, to), { recursive: true });
  // Explicit allowlist: configuration, user projects, logs and keys are never packaged.
  copy('resources/hedao', 'resources/hedao');
  copy('apps/desktop/wanju-skill', 'skill');
  copy('.agents/skills/wanju-creator/references/tool-contract.md', 'skill/references/tool-contract.md');
  copy('scripts/wanju-agent.mjs', 'scripts/wanju-agent.mjs');
  copy('integrations/agent/client.mjs', 'integrations/agent/client.mjs');
  copy('integrations/agent/guide.mjs', 'integrations/agent/guide.mjs');
  copy('apps/wanju-service/cloud-client.mjs', 'cloud/cloud-client.mjs');
  copy('apps/wanju-service/media-profiles.mjs', 'cloud/media-profiles.mjs');
  copy('LICENSE', 'LICENSE');
  copy('packages/openfilm/TRADEMARK.md', 'OPENFILM-TRADEMARK.md');
  const service = JSON.parse(readFileSync(join(repository, 'apps/desktop/student-service.public.json'), 'utf8'));
  if (typeof service.serviceUrl !== 'string') throw new Error('Public student service URL must be a string.');
  writeFileSync(join(dest, 'student-service.public.json'), JSON.stringify({
    serviceUrl: service.serviceUrl, studentEdition: studentEdition ?? service.studentEdition === true,
  }));
  if (existsSync(join(repository, 'apps/desktop/build/wanju.png'))) copy('apps/desktop/build/wanju.png', 'icon.png');
  return dest;
}
