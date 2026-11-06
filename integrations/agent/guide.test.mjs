import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGuide } from './guide.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));

test('the built-in workflow reader works from a Chinese Windows-style resource path', async () => {
  const root = mkdtempSync(join(tmpdir(), '玩剧-工作流-'));
  try {
    const workflow = join(root, 'resources/hedao/何导工作流组合包');
    mkdirSync(join(workflow, 'stages'), { recursive: true });
    mkdirSync(join(workflow, 'core'), { recursive: true });
    mkdirSync(join(root, 'skill/references'), { recursive: true });
    writeFileSync(join(root, 'resources/hedao/wanju-story-intake.md'), '# 创作素材优先\n先接收原文并继续策划。\n', 'utf8');
    writeFileSync(join(root, 'skill/SKILL.md'), '# 玩剧工作流\n', 'utf8');
    writeFileSync(join(root, 'skill/references/tool-contract.md'), '# 工具契约\n', 'utf8');
    writeFileSync(join(workflow, 'README.md'), '# 何导工作流\n', 'utf8');
    writeFileSync(join(workflow, 'core/01-support.json'), JSON.stringify({
      layer: 'support', pack_version: '2.1.1', read_rule: '按阶段读取',
      by_stage: { project_layout: 'S1 与 S3', runtime_control: 'S1' },
      sections: {
        project_layout: { desc: '目录结构', content: { marker: 'project-layout-only' } },
        runtime_control: { desc: '运行控制', content: { marker: 'runtime-only' } },
      },
    }), 'utf8');
    const stage = {
      skeleton_id: 'S3', name: '分镜拆解', purpose: '按阶段读取',
      core_anchor: {}, contracts: {}, gates: [], batch_plan: {},
      phases: [{ phase_id: '3a', name: '建组期', read_rule: '仅读本段', rule_count: 1, rules: ['检查人物连续性'] }],
      stage_policies: { routing: { duration_calculation: { rule: '按分镜时长' } } },
      self_checks: {
        items: [
          { id: 'C1', p0: true, scope: 'batch', text: '检查分镜' },
          { id: 'C2', p0: false, scope: 'batch', text: '其他检查' },
          { id: 'F1', p0: true, scope: 'full_film', text: '检查全片连续性' },
        ],
      },
      skills_hint: ['分镜技能'],
    };
    writeFileSync(join(workflow, 'stages/S3-分镜拆解.json'), JSON.stringify(stage), 'utf8');
    writeFileSync(join(workflow, 'stages/S1-立项与运行配置.json'), JSON.stringify({
      skeleton_id: 'S1', name: '立项', purpose: '准备运行配置',
      contracts: {}, gates: [], stage_policies: { intake: { must_ask_rule: { first: 'one question' } } },
      stages: [],
    }), 'utf8');

    assert.equal(await readGuide(root, 'workflow_readme'), '# 何导工作流\n');
    assert.equal(await readGuide(root, 'workflow_start'), '# 创作素材优先\n先接收原文并继续策划。\n');
    assert.match(await readGuide(root, 'skill'), /玩剧工作流/);
    const supportIndex = JSON.parse(await readGuide(root, 'workflow_support'));
    assert.equal(supportIndex.by_stage.project_layout, 'S1 与 S3');
    assert.equal(supportIndex.sections.project_layout, '目录结构');
    assert.equal(JSON.stringify(supportIndex).includes('project-layout-only'), false);
    const supportSection = JSON.parse(await readGuide(root, 'workflow_support', { section: 'project_layout' }));
    assert.equal(supportSection.content.marker, 'project-layout-only');
    assert.equal(JSON.stringify(supportSection).includes('runtime-only'), false);
    await assert.rejects(readGuide(root, 'workflow_support', { section: 'not-a-section' }), /Unknown support section/);
    const phase = JSON.parse(await readGuide(root, 'S3', { phase: '3a' }));
    assert.equal(phase.phases[0].phase_id, '3a');
    assert.equal(phase.self_checks, undefined);
    const checks = JSON.parse(await readGuide(root, 'S3', { phase: '3a', checks: true }));
    assert.equal(checks.self_checks.items.length, 1);
    assert.equal(JSON.parse(await readGuide(root, 'S3', { fullfilm: true })).checks[0].id, 'F1');
    assert.equal(JSON.parse(await readGuide(root, 'S3', { full: true })).phases[0].rules[0], '检查人物连续性');
    assert.equal(JSON.parse(await readGuide(root, 'S3')).phases[0].phase_id, '3a');
    assert.equal(JSON.parse(await readGuide(root, 'S3', { policy: 'duration_calculation' })).content.rule, '按分镜时长');
    const adaptedS1 = JSON.parse(await readGuide(root, 'S1'));
    assert.match(adaptedS1.wanju_application_policy, /先接收原文并继续策划/);
    assert.match(JSON.parse(await readGuide(root, 'S1', { full: true })).stage_policies.intake.must_ask_rule.first, /one question/);
    assert.match(JSON.parse(await readGuide(root, 'S1', { policy: 'must_ask_rule' })).wanju_application_policy, /先接收原文并继续策划/);

    const cli = spawnSync(process.execPath, [join(repo, 'scripts/wanju-agent.mjs'), 'guide', 'workflow_readme'], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, WANJU_ROOT: root },
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.trim(), '# 何导工作流');

    const supportCli = spawnSync(process.execPath, [
      join(repo, 'scripts/wanju-agent.mjs'), 'guide', 'workflow_support', '--section', 'project_layout',
    ], { cwd: repo, encoding: 'utf8', env: { ...process.env, WANJU_ROOT: root } });
    assert.equal(supportCli.status, 0, supportCli.stderr);
    assert.equal(JSON.parse(supportCli.stdout).content.marker, 'project-layout-only');

    const phaseCli = spawnSync(process.execPath, [join(repo, 'scripts/wanju-agent.mjs'), 'guide', 'S3', '3a', '--checks'], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, WANJU_ROOT: root },
    });
    assert.equal(phaseCli.status, 0, phaseCli.stderr);
    assert.equal(JSON.parse(phaseCli.stdout).self_checks.items[0].id, 'C1');

    const fullfilmCli = spawnSync(process.execPath, [join(repo, 'scripts/wanju-agent.mjs'), 'guide', 'S3', '--fullfilm'], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, WANJU_ROOT: root },
    });
    assert.equal(fullfilmCli.status, 0, fullfilmCli.stderr);
    assert.equal(JSON.parse(fullfilmCli.stdout).checks[0].id, 'F1');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the real S1 source is preserved while its app-facing read exposes the intake adaptation', async () => {
  const sourcePath = join(repo, 'resources/hedao/何导工作流组合包/stages/S1-立项与运行配置.json');
  const source = readFileSync(sourcePath, 'utf8');
  const sourceValue = JSON.parse(source);
  assert.ok(JSON.stringify(sourceValue).includes('must_ask_rule'));
  const adapted = JSON.parse(await readGuide(repo, 'S1', { full: true }));
  assert.ok(JSON.stringify(adapted).includes('must_ask_rule'));
  assert.match(adapted.wanju_application_policy, /不逐轮强制询问/);
  assert.equal(readFileSync(sourcePath, 'utf8'), source);
});
