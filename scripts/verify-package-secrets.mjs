import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const resource = process.env.WANJU_VERIFY_RESOURCES || join(root, '..', '安装包', '桌面版-0.1.12', 'win-unpacked', 'resources');
const secrets = new Set();
const collect = (value) => {
  if (!value || typeof value !== 'object') return;
  for (const [name, child] of Object.entries(value)) {
    if (typeof child === 'string' && /^(api[_-]?key|key|secret(?:[_-]?(?:id|key))?|access[_-]?key(?:[_-]?(?:id|secret))?|token|password)$/i.test(name) && child.length >= 16
      && !/^(https?:|Bearer|Authorization|[A-Z_]+$)/.test(child)) secrets.add(child);
    else if (child && typeof child === 'object') collect(child);
  }
};
for (const name of await readdir(join(root, '.local/config'))) {
  if (name.endsWith('.json')) collect(JSON.parse((await readFile(join(root, '.local/config', name), 'utf8')).replace(/^\uFEFF/, '')));
}
let checked = 0;
const scan = async (path) => {
  const facts = await stat(path);
  if (facts.isDirectory()) {
    for (const name of await readdir(path)) {
      assert.ok(!/^(?:\.local|\.env|student-session|providers\.json|media-profiles\.json|.+_config\.json)$/.test(name), 'Private configuration must not be packaged.');
      await scan(join(path, name));
    }
    return;
  }
  const needles = [...secrets].map((value) => Buffer.from(value));
  const overlap = Math.max(1, ...needles.map((value) => value.length)) - 1;
  let tail = Buffer.alloc(0);
  for await (const part of createReadStream(path)) {
    const chunk = Buffer.concat([tail, part]);
    for (const secret of needles) assert.equal(chunk.includes(secret), false, 'A private credential was found in packaged resources.');
    tail = chunk.subarray(Math.max(0, chunk.length - overlap));
  }
  checked++;
};
await scan(join(resource, 'wanju'));
await scan(join(resource, 'app.asar'));
await scan(join(resource, 'app.asar.unpacked/node_modules/openfilm'));
assert.ok((await stat(join(resource, 'wanju/LICENSE'))).size > 0);
assert.ok((await stat(join(resource, 'wanju/OPENFILM-TRADEMARK.md'))).size > 0);
console.log(JSON.stringify({ checkedResourceFiles: checked, credentialLeaks: 0, licenseAndTrademark: 'preserved' }));
