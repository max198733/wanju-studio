import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const inside = (root, path) => {
  const part = relative(root, path);
  return part !== '' && !part.startsWith('..') && !isAbsolute(part);
};
export function releaseTreeManifest(directory, filter = () => true) {
  const files = {};
  const visit = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (!filter(path)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Release-owned tree contains a symbolic link: ${path}`);
      if (entry.isDirectory()) visit(path);
      else files[relative(directory, path)] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  };
  visit(directory);
  return files;
}

export function replaceReleaseTree(source, target, stagingRoot, { filter = () => true } = {}) {
  const root = realpathSync(stagingRoot), from = realpathSync(source), to = resolve(target);
  if (!inside(root, to) || inside(from, to) || inside(to, from) || from === to)
    throw new Error('Release replacement must target a separate directory within the staging root.');
  const expected = releaseTreeManifest(from, filter);
  mkdirSync(dirname(to), { recursive: true });
  if (!inside(root, realpathSync(dirname(to))) && realpathSync(dirname(to)) !== root)
    throw new Error('Release target parent escapes the staging root.');
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, filter });
  const actual = releaseTreeManifest(to);
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error(`Release tree verification failed: ${to}`);
  return { files: Object.keys(actual).length };
}
