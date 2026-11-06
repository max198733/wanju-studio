/** @param {string} text */
export function docxFixture(text) {
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

/** @param {(string|string[])[]} pages */
export function pdfFixture(pages) {
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
