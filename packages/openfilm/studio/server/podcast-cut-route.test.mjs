import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editProjectFilm, readProjectFilm, writeProjectFilm } from './film.mjs';
import { writePodcastSource } from './podcast-source.mjs';
import { startStudio } from './server.mjs';

test('podcast cut route returns reviewable operations without editing until Studio applies them', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'podcast-cut-route-'));
  const env = Object.fromEntries(['OPENFILM_HOME', 'OPENFILM_SHARED_HOME', 'OPENFILM_LIBRARY', 'WANJU_CONFIG_DIR']
    .map((key) => [key, process.env[key]]));
  process.env.OPENFILM_HOME = join(root, 'home');
  process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
  process.env.OPENFILM_LIBRARY = join(root, 'projects');
  process.env.WANJU_CONFIG_DIR = join(root, 'config');
  await mkdir(process.env.WANJU_CONFIG_DIR, { recursive: true });
  const studio = await startStudio({ port: 0, openBrowser: () => {} });
  t.after(async () => {
    await studio.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const request = async (path, body) => {
    const response = await fetch(`${studio.origin}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-studio-key': studio.key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const created = await request('projects', { name: '口播剪辑路由测试' });
  const project = created.body.project;
  const media = join(project.path, 'assets/voice.mp3');
  await mkdir(join(project.path, 'assets'), { recursive: true });
  await writeFile(media, 'test recording bytes');
  const initialFilm = {
    stage: { w: 1920, h: 1080 },
    tracks: [{ clips: [
      { id: 'voice', src: 'assets/voice.mp3', time: [0, 10] },
      { id: 'later', src: 'assets/later.mp3', at: 10 },
    ] }],
  };
  await writeProjectFilm(project.path, initialFilm);
  const words = [
    { token: '我', startSec: 0, endSec: 0.3 },
    { token: '嗯', startSec: 1, endSec: 1.2 },
    { token: '继续', startSec: 1.7, endSec: 2 },
  ];
  assert.equal(await writePodcastSource(project.path, 'assets/voice.mp3', words), true);
  const before = await readProjectFilm(project.path);
  const analyzed = await request(`projects/${project.id}/podcast-cut`, {
    src: 'assets/voice.mp3', clipId: 'voice', durationSec: 10,
  });
  assert.equal(analyzed.status, 200);
  assert.ok(analyzed.body.cuts.length > 0);
  assert.equal(analyzed.body.ops, undefined);
  assert.equal((await readProjectFilm(project.path)).rev, before.rev, 'analysis never changes the timeline');
  const invalidOptions = await request(`projects/${project.id}/podcast-cut`, {
    src: 'assets/voice.mp3', durationSec: 10, options: { minPauseSec: -1 },
  });
  assert.equal(invalidOptions.status, 422, 'invalid analysis parameters are reported as input errors');
  const invalidDuration = await request(`projects/${project.id}/podcast-cut`, {
    src: 'assets/voice.mp3', durationSec: 1,
  });
  assert.equal(invalidDuration.status, 422, 'word times outside the supplied duration do not become a server error');

  const planned = await request(`projects/${project.id}/podcast-cut`, {
    src: 'assets/voice.mp3', clipId: 'voice', durationSec: 10, includeOps: true,
    selectedCuts: [0], expectedRev: analyzed.body.rev, reviewId: analyzed.body.reviewId,
  });
  assert.equal(planned.status, 200);
  assert.ok(planned.body.ops.some((op) => op.op === 'remove' && op.clip === 'voice'));
  assert.ok(planned.body.removedSec > 0);
  assert.equal((await readProjectFilm(project.path)).rev, before.rev, 'planning is also read-only');

  const missingSelection = await request(`projects/${project.id}/podcast-cut`, {
    src: 'assets/voice.mp3', clipId: 'voice', durationSec: 10, includeOps: true,
    expectedRev: analyzed.body.rev, reviewId: analyzed.body.reviewId,
  });
  assert.equal(missingSelection.status, 400, 'never defaults to applying every cut');
  await editProjectFilm(project.path, before.rev, [{ op: 'move', clip: 'voice', at: 1 }]);
  const modified = await readProjectFilm(project.path);
  const stale = await request(`projects/${project.id}/podcast-cut`, {
    src: 'assets/voice.mp3', clipId: 'voice', durationSec: 10, includeOps: true,
    selectedCuts: [0], expectedRev: analyzed.body.rev, reviewId: analyzed.body.reviewId,
  });
  assert.equal(stale.status, 409, 'a changed timeline invalidates analysis');
  const staleCommit = await request(`projects/${project.id}/edit`, {
    base: modified.rev, ops: planned.body.ops, expectedRev: before.rev,
  });
  assert.equal(staleCommit.status, 409, 'a reviewed edit cannot rebase even when the client has a newer base');
  assert.equal((await readProjectFilm(project.path)).rev, modified.rev);
  await writeProjectFilm(project.path, initialFilm);
  const changedWords = words.map((word) => ({ ...word, startSec: word.startSec + 0.1, endSec: word.endSec + 0.1 }));
  await writePodcastSource(project.path, 'assets/voice.mp3', changedWords);
  const staleTranscript = await request(`projects/${project.id}/podcast-cut`, {
    src: 'assets/voice.mp3', clipId: 'voice', durationSec: 10, includeOps: true,
    selectedCuts: [0], expectedRev: analyzed.body.rev, reviewId: analyzed.body.reviewId,
  });
  assert.equal(staleTranscript.status, 409, 'changed word times cannot silently change selected indexes');
  await writePodcastSource(project.path, 'assets/voice.mp3', words);
  const written = await editProjectFilm(project.path, before.rev, planned.body.ops, { expectedRev: before.rev });
  assert.equal(written.value.tracks[0].clips.some((clip) => clip.id === 'voice'), false);
  assert.equal(written.value.tracks[0].clips.at(-1).id, 'later');
  assert.ok(written.value.tracks[0].clips.at(-1).at < 10);
});
