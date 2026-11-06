import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const guideIds = Object.freeze([
  'skill', 'tool_contract', 'film_manual', 'workflow_start', 'workflow_readme', 'workflow_redlines',
  'workflow_support', 'workflow_contract', 'workflow_assets', 'video_seedance', 'video_h3_single', 'video_sparkvideo', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7',
]);

export const supportSectionIds = Object.freeze([
  'local_execution_environment', 'project_layout', 'runtime_control', 'gate_enforcement', 'refs',
]);

async function readFirst(root, candidates) {
  for (const candidate of candidates) {
    try { return await readFile(join(root, candidate), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error(`This guide is not included in this build: ${candidates[0]}`);
}

export async function readGuide(root, which, {
  phase, policy, checks = false, fullfilm = false, full = false, section,
} = {}) {
  const named = {
    skill: ['.agents/skills/wanju-creator/SKILL.md', 'skill/SKILL.md'],
    tool_contract: ['.agents/skills/wanju-creator/references/tool-contract.md', 'skill/references/tool-contract.md'],
    film_manual: ['packages/openfilm/MANUAL.md'],
    workflow_start: ['resources/hedao/wanju-story-intake.md'],
    workflow_readme: ['resources/hedao/何导工作流组合包/README.md'],
    workflow_redlines: ['resources/hedao/何导工作流组合包/core/00-core.json'],
    workflow_support: ['resources/hedao/何导工作流组合包/core/01-support.json'],
    workflow_contract: ['resources/hedao/何导工作流组合包/core/02-contracts.json'],
    workflow_assets: ['resources/hedao/wanju-drama-workflow.md'],
    video_sparkvideo: ['resources/hedao/wanju-sparkvideo.md'],
    video_seedance: ['resources/hedao/wanju-seedance.md'],
    video_h3_single: ['resources/hedao/wanju-h3-single.md'],
  };
  if (which === 'workflow_support') {
    const support = JSON.parse(await readFirst(root, named[which]));
    if (section) {
      if (!supportSectionIds.includes(section) || !support.sections?.[section]) {
        throw new Error(`Unknown support section. Available: ${supportSectionIds.join(', ')}`);
      }
      return JSON.stringify({
        layer: support.layer, pack_version: support.pack_version,
        section, desc: support.sections[section].desc,
        content: support.sections[section].content,
      });
    }
    return JSON.stringify({
      layer: support.layer, pack_version: support.pack_version,
      read_rule: support.read_rule, by_stage: support.by_stage,
      sections: Object.fromEntries(supportSectionIds
        .filter((id) => support.sections?.[id])
        .map((id) => [id, support.sections[id].desc])),
      next: '按当前阶段的 by_stage 选择章节，再用 --section <section_id> 只读该章节。',
    });
  }
  if (section) throw new Error('--section is only available for workflow_support.');
  if (named[which]) return readFirst(root, named[which]);

  const workflow = join(root, 'resources/hedao/何导工作流组合包');
  const stageName = (await readdir(join(workflow, 'stages')))
    .find((file) => file.startsWith(`${which}-`) && file.endsWith('.json'));
  if (!stageName) throw new Error('Unknown workflow guide.');

  const data = JSON.parse(await readFile(join(workflow, 'stages', stageName), 'utf8'));
  const policies = Object.assign({}, ...Object.values(data.stage_policies ?? {}));
  if (policy) {
    if (!(policy in policies)) throw new Error(`Unknown policy. Available: ${Object.keys(policies).join(', ')}`);
    return JSON.stringify({
      stage: which, policy, content: policies[policy],
      ...(which === 'S1' ? { wanju_application_policy: await readFirst(root, named.workflow_start) } : {}),
    });
  }
  if (full) return JSON.stringify(which === 'S1'
    ? { ...data, wanju_application_policy: await readFirst(root, named.workflow_start) }
    : data);
  if (fullfilm) {
    const items = (data.self_checks?.items ?? []).filter((item) => item.scope === 'full_film');
    return JSON.stringify({ stage: which, checks: items, count: items.length, scope: 'full_film' });
  }
  if (!data.phases) {
    return JSON.stringify({
      skeleton_id: data.skeleton_id, name: data.name, purpose: data.purpose,
      ...(which === 'S1' ? { wanju_application_policy: await readFirst(root, named.workflow_start) } : {}),
      core_anchor: data.core_anchor, contracts: data.contracts, gates: data.gates,
      stages: (data.stages ?? []).map((item) => ({
        stage_number: item.stage_number, name: item.name,
        rules: item.process?.length ?? 0, self_checks: item.self_checks_count,
      })),
      policy_keys: Object.keys(policies),
      self_checks: data.self_checks && {
        count: data.self_checks.count, p0_count: data.self_checks.p0_count,
        full_film_count: data.self_checks.full_film_count,
      },
      next: `Read the complete stage with "wanju guide ${which} --full".`,
    });
  }

  const selected = phase ? data.phases.find((entry) => entry.phase_id === phase) : null;
  if (phase && !selected) throw new Error('That phase is not part of this stage.');
  return JSON.stringify({
    skeleton_id: data.skeleton_id, name: data.name, purpose: data.purpose,
    core_anchor: data.core_anchor, contracts: data.contracts, gates: data.gates, batch_plan: data.batch_plan,
    phases: selected ? [selected] : data.phases.map(({ phase_id, name, read_rule, rule_count }) => ({ phase_id, name, read_rule, rule_count })),
    policy_keys: Object.keys(policies),
    ...(selected && checks ? { self_checks: {
      ...data.self_checks,
      items: (data.self_checks?.items ?? []).filter((item) => item.p0 && item.scope === 'batch'),
      remaining: 'Read the original stage self_checks for full-film and non-P0 checks when applicable.',
    } } : {}),
    ...(selected ? { skills_hint: data.skills_hint } : {}),
    next: selected
      ? 'Read the relevant named policy when needed; use --checks at the review gate.'
      : 'Select the current phase; do not load all phases into one context.',
  });
}
