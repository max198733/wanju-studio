import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeGeneratedMedia, taskTimingSummary, type GenerationTask } from './wanju-generation.ts';

const board = {
  version: 1, title: 'Test', ratio: '9:16', script: '', music: '',
  shots: [{ id: 'S001', title: '', description: 'A scene', dialogue: '', duration: 4, media: '', image: '', video: '' }],
};

describe('generation task display', () => {
  it('shows measured phases and omits phases not measured', () => {
    const task: GenerationTask = {
      id: 'task', shot: 'S001', provider: 'h3', status: 'done', createdAt: '',
      timing: { cosUploadMs: 12000, submitMs: 500, remoteWaitMs: 121000, downloadMs: 4000, totalMs: 138000 },
    };
    assert.match(taskTimingSummary(task), /参考图上传 12 秒/);
    assert.match(taskTimingSummary(task), /等待（含离线间隔） 2 分 1 秒/);
    assert.doesNotMatch(taskTimingSummary(task), /本地检查/);
  });
});

describe('generated media refresh merge', () => {
  it('merges only server-generated media without replacing unsaved script edits', () => {
    const local = { ...board, script: 'unsaved draft' };
    const remote = { ...board, shots: [{ ...board.shots[0], media: 'assets/shot.mp4', video: 'assets/shot.mp4' }] };
    const merged = mergeGeneratedMedia(board, local, remote);
    assert.equal(merged?.script, 'unsaved draft');
    assert.equal(merged?.shots[0].video, 'assets/shot.mp4');
  });

  it('does not overwrite user media changes or merge unrelated remote edits', () => {
    const local = { ...board, shots: [{ ...board.shots[0], media: 'assets/manual.mp4' }] };
    const generated = { ...board, shots: [{ ...board.shots[0], media: 'assets/ai.mp4', video: 'assets/ai.mp4' }] };
    assert.equal(mergeGeneratedMedia(board, local, generated)?.shots[0].media, 'assets/manual.mp4');
    assert.equal(mergeGeneratedMedia(board, board, { ...generated, title: 'Other edit' }), null);
  });
});
