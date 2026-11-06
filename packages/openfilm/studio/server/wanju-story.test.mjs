import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeStorySource, importStorySource, readStory, readStorySource, saveStory } from './wanju-story.mjs';

const plan = {
  format: 'series',
  title: '旧城来信',
  logline: '一封迟到的信改变了两个人的选择。',
  synopsis: '主角在旧城寻找写信人。',
  adaptationNotes: '保留原作主线。',
  style: '现实主义',
  ratio: '9:16',
  targetEpisodeSeconds: null,
  plannedEpisodes: null,
  characters: [{ id: 'C01', name: '林夏', description: '旧城居民' }],
  scenes: [],
  props: [],
  episodeOutlines: [{ number: 1, title: '迟到的信', summary: '林夏找到一封旧信。', hook: '信上出现她的名字。' }],
};

test('novel text decoding handles BOMs, UTF-16, GB18030 and chapter indexes', async () => {
  const utf8 = await decodeStorySource(Buffer.from('\uFEFF第一章 初见\r\n林夏收到一封信。\r\n第二章 回城\r\n她回到旧城。', 'utf8'));
  assert.equal(utf8.encoding, 'utf-8');
  assert.equal(utf8.chapters.length, 2);
  assert.equal(utf8.chapters[0].title, '第一章 初见');
  assert.equal(utf8.chapters[1].line, 3);
  assert.ok(utf8.text.includes('\n'));

  const utf16 = await decodeStorySource(Buffer.concat([
    Buffer.from([0xff, 0xfe]), Buffer.from('第一章 初见\n正文', 'utf16le'),
  ]));
  assert.equal(utf16.encoding, 'utf-16le');
  assert.match(utf16.text, /正文/);

  const utf16beText = '第二章 回城';
  const littleEndian = Buffer.from(utf16beText, 'utf16le');
  const bigEndian = Buffer.alloc(littleEndian.length);
  for (let i = 0; i < littleEndian.length; i += 2) {
    bigEndian[i] = littleEndian[i + 1];
    bigEndian[i + 1] = littleEndian[i];
  }
  const utf16be = await decodeStorySource(Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian]));
  assert.equal(utf16be.encoding, 'utf-16be');
  assert.equal(utf16be.text, utf16beText);

  const gb18030 = await decodeStorySource(Buffer.from([0xd6, 0xd0]));
  assert.equal(gb18030.encoding, 'gb18030');
  assert.equal(gb18030.text, '中');
  await assert.rejects(decodeStorySource(Buffer.alloc(0)), /为空/);
});

function docxFixture(text) {
  const xmlText = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = text.split('\n').map((line) => `<w:p><w:r><w:t>${xmlText(line)}</w:t></w:r></w:p>`).join('');
  const document = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格甲</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>表格乙</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`;
  const entries = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': document,
  };
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, value] of Object.entries(entries)) {
    const name = Buffer.from(path);
    const body = Buffer.from(value);
    const local = Buffer.alloc(30 + name.length + body.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    body.copy(local, 30 + name.length);
    locals.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centrals.length, 8);
  eocd.writeUInt16LE(centrals.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, eocd]);
}

function pdfFixture(pages) {
  const characters = [...new Set(pages.flatMap((page) => Array.isArray(page) ? page : [page]).join(''))];
  const codes = new Map(characters.map((character, index) => [character, index + 1]));
  const hex = (value) => [...value].map((character) => codes.get(character).toString(16).padStart(4, '0')).join('');
  const unicodeHex = (character) => Buffer.from(character, 'utf16le').swap16().toString('hex');
  const cmap = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    `${characters.length} beginbfchar`,
    ...characters.map((character, index) => `<${(index + 1).toString(16).padStart(4, '0')}> <${unicodeHex(character)}>`),
    'endbfchar',
    'endcmap CMapName currentdict /CMap defineresource pop',
    'end end',
  ].join('\n');
  const objects = [];
  const pageIds = pages.map((_, index) => 3 + index);
  const fontId = 3 + pages.length;
  const cidFontId = fontId + 1;
  const cmapId = fontId + 2;
  const contentIds = pages.map((_, index) => cmapId + 1 + index);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  for (const [index, pageId] of pageIds.entries()) {
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
  }
  objects[fontId] = `<< /Type /Font /Subtype /Type0 /BaseFont /Wanju /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${cmapId} 0 R >>`;
  objects[cidFontId] = `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Wanju /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 >>`;
  objects[cmapId] = `<< /Length ${Buffer.byteLength(cmap, 'ascii')} >>\nstream\n${cmap}\nendstream`;
  for (const [index, page] of pages.entries()) {
    const segments = Array.isArray(page) ? page : [page];
    const runs = segments.map((segment, segmentIndex) => `${segmentIndex ? '56 0 Td ' : ''}<${hex(segment)}> Tj`).join(' ');
    const stream = `BT /F1 12 Tf 72 720 Td ${runs} ET`;
    objects[contentIds[index]] = `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`;
  }
  let pdf = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const startxref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('DOCX and PDF imports extract正文, tables, page order and chapter indexes', async () => {
  const docx = await decodeStorySource(docxFixture('第一章 初见\n林夏收到一封信。'), 'story.docx');
  assert.equal(docx.encoding, 'docx');
  assert.match(docx.text, /林夏收到一封信/);
  assert.match(docx.text, /表格甲/);
  assert.ok(docx.text.indexOf('林夏') < docx.text.indexOf('表格甲'));
  assert.equal(docx.count, 1);

  const decodedPdf = await decodeStorySource(pdfFixture([['第一页：', '林夏收到一封信。'], '第二页：她回到旧城。']), 'story.pdf');
  assert.equal(decodedPdf.encoding, 'pdf');
  assert.match(decodedPdf.text, /第一页：\s+林夏收到一封信/);
  assert.ok(decodedPdf.text.indexOf('第一页') < decodedPdf.text.indexOf('第二页'));
  await assert.rejects(decodeStorySource(pdfFixture(['']), 'scan.pdf'), /OCR/);
  await assert.rejects(decodeStorySource(Buffer.from('%PDF-1.4'), 'scan.pdf'), /OCR/);
});

test('DOCX and PDF sources are imported and can be paged after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-story-documents-'));
  try {
    const current = await readStory(root);
    const imported = await importStorySource(root, current.revision, '原著.docx', docxFixture('第一章 初见\n林夏收到一封信。'));
    assert.equal(imported.source.format, 'docx');
    assert.equal(imported.source.encoding, 'docx');
    const page = await readStorySource(root, imported.source.id, 0, 100);
    assert.match(page.content, /林夏收到一封信/);
    assert.equal(page.source.name, '原著.docx');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('story sources remain separate from board data and saves use their own revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-story-'));
  try {
    let current = await readStory(root);
    const original = Buffer.from('第一章 初见\n林夏收到一封信。\n第二章 回城\n她回到旧城。', 'utf8');
    const imported = await importStorySource(root, current.revision, '小说.TXT', original);
    assert.equal(imported.source.encoding, 'utf-8');
    assert.equal(imported.source.chapterCount, 2);
    assert.equal(imported.source.name, '小说.TXT');
    assert.deepEqual(await readFile(join(root, imported.source.path)), original);

    const firstPage = await readStorySource(root, imported.source.id, 0, 12);
    assert.equal(firstPage.offset, 0);
    assert.ok(firstPage.nextOffset > 0);
    const secondPage = await readStorySource(root, imported.source.id, firstPage.nextOffset, 12000);
    assert.equal(secondPage.done, true);
    assert.match(firstPage.content + secondPage.content, /林夏收到一封信/);

    const duplicate = await importStorySource(root, imported.revision, '副本.txt', original);
    assert.equal(duplicate.reused, true);
    assert.equal(duplicate.revision, imported.revision);

    const saved = await saveStory(root, imported.revision, plan, [
      { number: 1, title: '迟到的信', script: '内景，林夏拆开信封。' },
    ]);
    assert.notEqual(saved.revision, imported.revision);
    assert.equal((await readStory(root)).story.episodes[0].script, '内景，林夏拆开信封。');
    await assert.rejects(saveStory(root, imported.revision, plan, []), { status: 409 });
    await assert.rejects(importStorySource(root, imported.revision, '新小说.md', original), { status: 409 });
    await assert.rejects(readStorySource(root, 'bad-id'), /编号无效/);

    const archived = await saveStory(root, saved.revision, plan, [
      { number: 1, title: '迟到的信', script: '内景，林夏拆开信封。', archived: true },
    ]);
    assert.equal(archived.story.episodes[0].archived, true);
    await assert.rejects(saveStory(root, archived.revision, plan, [
      { number: 1, title: '迟到的信', script: '', archived: true },
    ]), /不能归档/);
    const restored = await saveStory(root, archived.revision, plan, [
      { number: 1, title: '迟到的信', script: '内景，林夏拆开信封。', archived: false },
    ]);
    assert.equal(restored.story.episodes[0].archived, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('story source import rejects unsupported and empty documents without changing the workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-story-reject-'));
  try {
    const current = await readStory(root);
    await assert.rejects(importStorySource(root, current.revision, 'story.rtf', Buffer.from('not supported')), /支持 TXT、Markdown、DOCX 和 PDF/);
    await assert.rejects(importStorySource(root, current.revision, 'story.txt', Buffer.alloc(0)), /为空/);
    assert.deepEqual((await readStory(root)).story, { version: 1, sources: [], plan: null, episodes: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
