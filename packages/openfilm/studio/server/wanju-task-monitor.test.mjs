import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskMonitor } from './wanju-task-monitor.mjs';

const project = { id: 'project-1' };
const queued = { id: 'task-1', provider: 'h3', remoteId: 'remote-1', status: 'queued' };

test('monitor polls the existing task and stops after it completes', async () => {
  const timers = [];
  const calls = [];
  const monitor = createTaskMonitor(async (p, id) => {
    calls.push([p.id, id]);
    return { ...queued, status: 'done' };
  }, { schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {} });

  monitor.watch(project, queued);
  assert.equal(timers[0].ms, 10000);
  await timers[0].fn();
  assert.deepEqual(calls, [['project-1', 'task-1']]);
  assert.equal(timers.length, 1);
  monitor.close();
});

test('monitor resumes SparkVideo tasks using the same local and remote IDs', async () => {
  const timers = [];
  const task = { ...queued, provider: 'sparkvideo' };
  const calls = [];
  const monitor = createTaskMonitor(async (p, id) => {
    calls.push([p.id, id]);
    return { ...task, status: 'done' };
  }, { schedule: (fn) => { timers.push(fn); return fn; }, cancel: () => {} });
  monitor.resume(project, [task]);
  await timers[0]();
  assert.deepEqual(calls, [['project-1', 'task-1']]);
  assert.equal(timers.length, 1);
  monitor.close();
});

test('monitor resumes Seedance tasks and does not duplicate a watcher', async () => {
  const timers = [];
  const task = { ...queued, provider: 'seedance' };
  const monitor = createTaskMonitor(async (_project, id) => {
    assert.equal(id, task.id);
    return { ...task, status: 'done' };
  }, { schedule: (fn) => { timers.push(fn); return fn; }, cancel: () => {} });
  monitor.resume(project, [task]);
  monitor.resume(project, [task]);
  assert.equal(timers.length, 1);
  await timers[0]();
  assert.equal(timers.length, 1);
  monitor.close();
});

test('monitor backs off after transient errors and can be restarted by a manual check', async () => {
  const timers = [];
  let calls = 0;
  const monitor = createTaskMonitor(async () => {
    calls++;
    if (calls === 1) throw new Error('temporary');
    return { ...queued, status: 'running' };
  }, { schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {} });

  monitor.watch(project, queued);
  await timers[0].fn();
  assert.equal(timers[1].ms, 20000);
  monitor.watch(project, queued, { restart: true });
  assert.equal(timers.at(-1).ms, 10000);
  monitor.close();
});

test('monitor ignores non-video and terminal tasks', () => {
  const timers = [];
  const monitor = createTaskMonitor(async () => {}, { schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {} });
  monitor.watch(project, { ...queued, provider: 'image' });
  monitor.watch(project, { ...queued, status: 'failed' });
  assert.equal(timers.length, 0);
  monitor.close();
});

test('routine refreshes neither duplicate watches nor restart one paused after errors', async () => {
  const timers = [];
  let calls = 0;
  const monitor = createTaskMonitor(async () => { calls++; throw new Error('offline'); }, {
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {},
  });
  monitor.resume(project, [queued]);
  monitor.resume(project, [queued]);
  assert.equal(timers.length, 1);
  for (let i = 0; i < 3; i++) await timers[i].fn();
  assert.equal(calls, 3);
  assert.deepEqual(timers.map((timer) => timer.ms), [10000, 20000, 40000]);
  monitor.resume(project, [queued]);
  assert.equal(timers.length, 3);
  monitor.watch(project, queued, { restart: true });
  assert.equal(timers.length, 4);
  monitor.close();
});

test('a restarted or closed watcher cannot reschedule an obsolete in-flight query', async () => {
  const timers = [];
  let complete;
  const monitor = createTaskMonitor(() => new Promise((resolve) => { complete = resolve; }), {
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {},
  });
  monitor.watch(project, queued);
  const inFlight = timers[0].fn();
  monitor.watch(project, queued, { restart: true });
  complete({ ...queued, status: 'running' });
  await inFlight;
  assert.equal(timers.length, 2);
  monitor.close();
  await timers[1].fn();
  assert.equal(timers.length, 2);
});

test('a watch pauses after its deadline without being revived by page refresh', async () => {
  const timers = [];
  let time = 0;
  const monitor = createTaskMonitor(async () => ({ ...queued, status: 'running' }), {
    maxWatchMs: 100, now: () => time,
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {},
  });
  monitor.watch(project, queued);
  time = 101;
  await timers[0].fn();
  monitor.resume(project, [queued]);
  assert.equal(timers.length, 1);
  monitor.close();
});
