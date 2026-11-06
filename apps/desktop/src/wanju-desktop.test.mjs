import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advertiseWanju, importWanjuConfigs, installWanjuTools, wanjuEnvironment, wanjuIdentity, wanjuInstructions } from './wanju-desktop.mjs';
import { prepareWanjuResources } from '../scripts/wanju-resources.mjs';

test('Wanju identity and runtime are opt-in and isolated from upstream homes', () => {
  assert.equal(wanjuIdentity({}), null);
  assert.equal(wanjuInstructions({}), '');
  const identity = wanjuIdentity({ WANJU_DESKTOP: '1', WANJU_DATA_DIR: 'C:/Wanju/Data', WANJU_LIBRARY: 'C:/Films' });
  assert.equal(identity.productName, '玩剧');
  assert.equal(identity.bundleId, 'local.wanju.studio');
  assert.notEqual(identity.studioPort, 4747);
  assert.match(identity.studioHome, /Data[\\/]home$/);
  const env = wanjuEnvironment({ WANJU_DESKTOP: '1', WANJU_DATA_DIR: 'x', OPENAI_API_KEY: 'not-forwarded', OPENFILM_EXPORTS: 'y' });
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.OPENFILM_EXPORTS, 'y');
  const debug = wanjuIdentity({ WANJU_DESKTOP: '1', WANJU_DEBUG: '1', WANJU_DATA_DIR: 'C:/Wanju/Debug' });
  assert.equal(debug.productName, '玩剧调试版');
  assert.equal(debug.bundleId, 'local.wanju.debug');
  assert.notEqual(debug.studioPort, identity.studioPort);
  assert.notEqual(debug.studioHome, identity.studioHome);
});

test('production instructions reserve native preview checks for actual visual edits', () => {
  const text = wanjuInstructions({ WANJU_DESKTOP: '1' });
  assert.match(text, /not after each JSON/);
  assert.match(text, /legacy media-workflow field is not the selected chat mode/);
  assert.match(text, /script\/storyboard does not mean the native film is empty/);
  assert.match(text, /review gate/);
  assert.match(text, /explicit authorization for the provider and submission count/);
  assert.match(text, /wanju diagnostics/);
  assert.match(text, /Respect their on\/off switches/);
  assert.match(text, /Do NOT open it automatically/);
  assert.match(text, /explicitly asks to view or edit it/);
  assert.match(text, /completion alone is NOT a reason to call assemble/);
  assert.ok(text.indexOf('Choose the production path') < text.indexOf('wanju current'));
  assert.match(text, /wanju import_story/);
  assert.match(text, /wanju read_story_source/);
  assert.match(text, /Do not stop intake or planning for the original S1 questionnaire/);
  assert.match(text, /No AI image\/video submission, character-asset catalog or Hedao review/);
  assert.match(text, /do not require `node` on PATH/);
  assert.match(text, /never bypass them to save time/);
});

test('repository skill entry completes the current project and cannot reintroduce automatic assembly', () => {
  const entry = readFileSync(new URL('../../../.agents/skills/wanju-creator/SKILL.md', import.meta.url), 'utf8');
  assert.match(entry, /For normal completion, edit and export the current project/);
  assert.match(entry, /never switch tabs automatically/);
  assert.doesNotMatch(entry, /Assemble a separate cut once each shot/);
});

test('desktop connection and CLI do not embed the Studio key or provider credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wanju-desktop-'));
  try {
    const root = join(dir, 'resources');
    mkdirSync(join(root, 'skill'), { recursive: true });
    writeFileSync(join(root, 'skill/SKILL.md'), '# Wanju');
    installWanjuTools(dir, { root, node: 'C:\\App\\Wanju.exe', platform: 'win32' });
    const script = readFileSync(join(dir, 'bin/wanju.cmd'), 'utf8');
    assert.match(script, /ELECTRON_RUN_AS_NODE=1/);
    assert.match(script, /WANJU_KEY_FILE=/);
    assert.match(readFileSync(join(dir, 'bin/wanju'), 'utf8'), /^#!\/bin\/sh/);
    assert.equal(readFileSync(join(dir, 'Skills/wanju-creator/SKILL.md'), 'utf8'), '# Wanju');
    advertiseWanju({ origin: 'http://127.0.0.1:4858', key: 'never-serialize-me' }, { WANJU_DESKTOP: '1', WANJU_DATA_DIR: dir });
    const run = readFileSync(join(dir, 'wanju-run.json'), 'utf8');
    assert.doesNotMatch(run, /never-serialize-me/);
    assert.equal(JSON.parse(run).desktop, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Windows Git Bash runs the bundled Wanju command with spaces and Chinese paths without node on PATH', (t) => {
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh';
  if (!existsSync(shell)) { t.skip('POSIX shell unavailable'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'wanju 中文 command-'));
  try {
    const root = join(dir, '工具 resources');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/wanju-agent.mjs'), 'console.log(JSON.stringify({ args: process.argv.slice(2), root: process.env.WANJU_ROOT }));\n');
    const bin = installWanjuTools(dir, { root, node: process.execPath, platform: 'win32' });
    const entry = join(bin, 'wanju').replaceAll('\\', '/');
    const out = JSON.parse(execFileSync(shell, ['-c', `"${entry}" current "中文 argument"`], {
      env: { ...process.env, PATH: '/usr/bin:/bin' }, encoding: 'utf8', windowsHide: true,
    }));
    assert.deepEqual(out.args, ['current', '中文 argument']);
    assert.equal(out.root, root.replaceAll('\\', '/'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('config importer validates the entire selection before copying private JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wanju-config-test-'));
  try {
    const good = join(dir, 'minimax_h3_config.json');
    const bad = join(dir, 'arbitrary.json');
    const out = join(dir, 'providers');
    mkdirSync(out);
    writeFileSync(good, '{"api_key":"dummy-test-only"}');
    writeFileSync(bad, '{}');
    assert.throws(() => importWanjuConfigs([good, bad], out));
    assert.deepEqual(readdirSync(out), []);
    assert.deepEqual(importWanjuConfigs([good], out), { imported: 1 });
    assert.equal(JSON.parse(readFileSync(join(out, 'minimax_h3_config.json'), 'utf8')).api_key, 'dummy-test-only');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resource preparation keeps the teacher source launcher separate from the student package', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wanju-public-resources-'));
  try {
    const teacher = prepareWanjuResources(join(dir, 'teacher'), { studentEdition: false });
    const student = prepareWanjuResources(join(dir, 'student'), { studentEdition: true });
    assert.equal(JSON.parse(readFileSync(join(teacher, 'student-service.public.json'), 'utf8')).studentEdition, false);
    const config = JSON.parse(readFileSync(join(student, 'student-service.public.json'), 'utf8'));
    assert.equal(config.studentEdition, true);
    assert.deepEqual(Object.keys(config).sort(), ['serviceUrl', 'studentEdition']);
    assert.ok(!readdirSync(student).includes('providers'));
    assert.ok(readFileSync(join(student, 'integrations/agent/guide.mjs'), 'utf8').includes('export async function readGuide'));
    assert.match(readFileSync(join(teacher, 'resources/hedao/wanju-story-intake.md'), 'utf8'), /不逐轮强制询问/);
    assert.match(readFileSync(join(student, 'resources/hedao/wanju-story-intake.md'), 'utf8'), /不逐轮强制询问/);
    assert.match(readFileSync(join(teacher, 'resources/hedao/wanju-sparkvideo.md'), 'utf8'), /sparkvideo-2\.0\/multimodal-video/);
    assert.match(readFileSync(join(teacher, 'skill/references/tool-contract.md'), 'utf8'), /video_sparkvideo/);
    assert.match(readFileSync(join(teacher, 'resources/hedao/wanju-seedance.md'), 'utf8'), /doubao-seedance-2-0-260128/);
    assert.match(readFileSync(join(student, 'skill/SKILL.md'), 'utf8'), /video_seedance/);
    assert.equal(JSON.parse(readFileSync(join(student, 'skill/openfilm.json'), 'utf8')).title['zh-CN'], '何导短剧工作流');
    assert.match(readFileSync(join(student, 'skill/references/production.md'), 'utf8'), /approve_storyboard/);
    assert.match(readFileSync(join(student, 'skill/references/production.md'), 'utf8'), /wanju import_story/);
    assert.match(readFileSync(join(student, 'skill/references/production.md'), 'utf8'), /do not open it automatically/);
    assert.match(readFileSync(join(student, 'skill/references/production.md'), 'utf8'), /explicitly asks to view or edit it/);
    assert.match(readFileSync(join(student, 'skill/references/production.md'), 'utf8'), /Do not call `assemble` just because all shots have real media/);
    const runtime = wanjuInstructions({ WANJU_DESKTOP: '1', WANJU_ROOT: 'D:/App' });
    assert.doesNotMatch(runtime, /Read the app's wanju-creator|wanju guide S3|generate_asset/);
    assert.match(runtime, /Respect their on\/off switches/);
    assert.match(readFileSync(join(teacher, 'skill/references/tool-contract.md'), 'utf8'), /provider: "video"/);
    assert.match(readFileSync(join(teacher, 'skill/references/tool-contract.md'), 'utf8'), /bypass category selection and use legacy settings, only when requested/);
    assert.match(readFileSync(join(teacher, 'skill/references/tool-contract.md'), 'utf8'), /do not call `assemble` just to finish it/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
