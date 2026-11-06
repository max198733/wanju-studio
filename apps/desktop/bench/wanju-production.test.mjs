import assert from 'node:assert/strict';
import test from 'node:test';
import { productionOverview } from '../chat/src/lib/wanju-production.ts';

const fixture = (patch = {}) => ({
  state: { script: 'Three shots', shots: [{ id: 'S1' }, { id: 'S2' }, { id: 'S3' }] },
  workflow: { enabled: false },
  tasks: [],
  ...patch,
});

test('native projects have no drama prerequisites, while changing preference preserves enabled gates', () => {
  assert.equal(productionOverview(fixture(), 'quick').stage, '原生剪辑');
  assert.equal(productionOverview(fixture(), 'auto').drama, false);
  assert.equal(productionOverview(fixture(), 'drama').stage, '剧情准备');
  const savedDrama = fixture({ workflow: { enabled: true, referencesReady: false, issues: ['资产已改变'] } });
  const overview = productionOverview(savedDrama, 'quick');
  assert.equal(overview.stage, '人物与场景');
  assert.equal(overview.next, '资产已改变');
  assert.equal(savedDrama.workflow.enabled, true);
});

test('stages follow saved script, asset and storyboard gates before video completion', () => {
  assert.equal(productionOverview(fixture({ state: { script: '', shots: [] } }), 'drama').stage, '剧本与分镜');
  const workflow = { enabled: true, referencesReady: true, storyboardApproved: false, readyForVideo: false, counts: { videos: 3 } };
  assert.equal(productionOverview(fixture({ workflow }), 'drama').stage, '分镜审核');
  workflow.storyboardApproved = workflow.readyForVideo = true;
  workflow.counts.videos = 2;
  assert.equal(productionOverview(fixture({ workflow }), 'drama').stage, '镜头生成');
  workflow.counts.videos = 3;
  assert.equal(productionOverview(fixture({ workflow }), 'drama').stage, '剪辑与导出');
});

test('uncertain submissions and downloadable results remain distinct from running and failed records', () => {
  const overview = productionOverview(fixture({ tasks: [
    { id: 'unknown', status: 'unknown', recoveryAvailable: true }, { id: 'submitting', status: 'submitting' },
    { id: 'queued', status: 'queued' }, { id: 'running', status: 'running' },
    { id: 'received', status: 'received' }, { id: 'download', status: 'download-failed', recoveryAvailable: true },
    { id: 'archiving', status: 'done', recoveryAvailable: true }, { id: 'failed', status: 'rejected' },
    { id: 'done', status: 'done' },
  ] }), 'drama');
  assert.equal(overview.uncertain, 2);
  assert.equal(overview.pending, 2);
  assert.equal(overview.recoverable, 3);
  assert.equal(overview.failed, 1);
  assert.ok(overview.pending + overview.uncertain + overview.recoverable + overview.failed <= 9);
  assert.equal(overview.hasTasks, true);
  assert.equal('cost' in overview, false);
});
