import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStyles } from './build-skills.mjs';

function fixture(root) {
  const source = join(root, 'source');
  const output = join(root, 'output');
  const overrides = join(root, 'overrides');
  const paths = [
    'references',
    'references/catalog.json',
    'references/attribution.md',
    'assets/library/风格提示词/A-G_代码样片',
    'assets/library/风格提示词/A-G_代码样片/A1_字雨.md',
    'assets/library/风格提示词/A-G_代码样片/A1_字雨.jpg',
    'assets/library/风格提示词/A-G_代码样片/_公共函数.js',
    'assets/library/说明.md',
    'assets/library/许可与来源.md',
    'assets/library/第三方许可',
  ];
  for (const path of paths) if (!path.endsWith('.json') && !path.endsWith('.md') && !path.endsWith('.jpg') && !path.endsWith('.js')) {
    mkdirSync(join(source, path), { recursive: true });
  }
  const files = {
    'LICENSE.md': 'collection license',
    'references/catalog.json': JSON.stringify({ entries: [
      { id: 'A1', name: '字雨', series: 'AG', category: 'A 字', description: '文字落下。', fit: '表达压力', file: 'assets/library/风格提示词/A-G_代码样片/A1_字雨.md', image: 'assets/library/风格提示词/A-G_代码样片/A1_字雨.jpg' },
      { id: 'K1', name: '纸偶', series: 'K', category: '卡通', description: '平面角色。', fit: '', file: 'assets/library/风格提示词/A-G_代码样片/A1_字雨.md' },
    ] }),
    'references/attribution.md': 'source attribution',
    'assets/library/风格提示词/A-G_代码样片/A1_字雨.md': '# 字雨\n\n内容',
    'assets/library/风格提示词/A-G_代码样片/A1_字雨.jpg': 'cover',
    'assets/library/风格提示词/A-G_代码样片/_公共函数.js': 'export {};',
    'assets/library/说明.md': 'sharing terms',
    'assets/library/许可与来源.md': 'provenance',
    'assets/library/第三方许可/Lemo-Opuscar_LICENSE.txt': 'Lemo',
    'assets/library/第三方许可/mg-styles-15_LICENSE.txt': 'MG',
    'assets/library/第三方许可/code-video_LICENSE.txt': 'Code video',
  };
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(source, path, '..'), { recursive: true });
    writeFileSync(join(source, path), contents);
  }
  mkdirSync(join(overrides, 'code-animation-k1'), { recursive: true });
  writeFileSync(join(overrides, 'code-animation-k1/cover.jpg'), 'manual cover');
  return { source, output, overrides };
}

test('style builder is portable, repeatable and keeps explicit cover overrides and source notices', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'wanju-style-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = fixture(root);
  const config = { sourceDir: paths.source, outputDir: paths.output, overrideDir: paths.overrides };
  const first = buildStyles(config);
  const before = readFileSync(join(paths.output, 'code-animation-k1/openfilm.json'), 'utf8');
  const second = buildStyles(config);
  assert.equal(first.count, 2);
  assert.equal(first.withCover, 2);
  assert.deepEqual(second, first);
  assert.equal(readFileSync(join(paths.output, 'code-animation-k1/cover.jpg'), 'utf8'), 'manual cover');
  assert.equal(readFileSync(join(paths.output, 'code-animation-k1/openfilm.json'), 'utf8'), before);
  assert.equal(readFileSync(join(paths.output, 'THIRD_PARTY/assets/library/第三方许可/code-video_LICENSE.txt'), 'utf8'), 'Code video');
});

test('style builder rejects catalog paths that escape the source snapshot before changing output', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'wanju-style-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = fixture(root);
  const catalog = JSON.parse(readFileSync(join(paths.source, 'references/catalog.json'), 'utf8'));
  catalog.entries[0].file = '../../outside.md';
  writeFileSync(join(paths.source, 'references/catalog.json'), JSON.stringify(catalog));
  assert.throws(() => buildStyles({ sourceDir: paths.source, outputDir: paths.output, overrideDir: paths.overrides }), /escapes the asset snapshot/);
  assert.equal(existsSync(paths.output), false);
});

test('rebuilding removes obsolete generated covers and helpers but keeps unrelated files', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'wanju-style-stale-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = fixture(root);
  const config = { sourceDir: paths.source, outputDir: paths.output, overrideDir: paths.overrides };
  buildStyles(config);
  const catalogPath = join(paths.source, 'references/catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  delete catalog.entries[0].image;
  writeFileSync(catalogPath, JSON.stringify(catalog));
  rmSync(join(paths.overrides, 'code-animation-k1/cover.jpg'));
  const second = join(paths.output, 'code-animation-k1');
  writeFileSync(join(second, '_公共函数.js'), 'obsolete generated helper');
  writeFileSync(join(second, 'notes.txt'), 'keep this note');
  const rebuilt = buildStyles(config);
  assert.equal(rebuilt.withCover, 2);
  assert.equal(rebuilt.generatedCovers, 2);
  assert.equal(existsSync(join(paths.output, 'code-animation-a1/cover.jpg')), false);
  assert.equal(existsSync(join(paths.output, 'code-animation-a1/cover.svg')), true);
  assert.equal(existsSync(join(second, 'cover.jpg')), false);
  assert.equal(existsSync(join(second, 'cover.svg')), true);
  assert.equal(existsSync(join(second, '_公共函数.js')), false);
  assert.equal(readFileSync(join(second, 'notes.txt'), 'utf8'), 'keep this note');
});

test('missing catalog summaries fall back to the style body and label generated covers as illustrative', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'wanju-style-summary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = fixture(root);
  const catalogPath = join(paths.source, 'references/catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  delete catalog.entries[1].description;
  writeFileSync(catalogPath, JSON.stringify(catalog));
  rmSync(join(paths.overrides, 'code-animation-k1/cover.jpg'));
  const result = buildStyles({ sourceDir: paths.source, outputDir: paths.output, overrideDir: paths.overrides });
  const metadata = JSON.parse(readFileSync(join(paths.output, 'code-animation-k1/openfilm.json'), 'utf8'));
  assert.equal(result.withoutCover, 0);
  assert.match(metadata.summary['zh-CN'], /内容/);
  assert.match(readFileSync(join(paths.output, 'code-animation-k1/SKILL.md'), 'utf8'), /纸偶：内容/);
  assert.match(metadata.details['zh-CN'], /示意图/);
});
