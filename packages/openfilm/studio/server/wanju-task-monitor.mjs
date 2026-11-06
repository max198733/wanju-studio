const pending = (task) => ['h3', 'h3_zm_nono', 'seedance', 'sparkvideo'].includes(task.provider) && task.remoteId && ['queued', 'running'].includes(task.status);

// Timers sleep outside the project's write queue. Only a status check and its commit enter it.
export function createTaskMonitor(query, {
  intervalMs = 10000, maxWatchMs = 30 * 60 * 1000, maxErrors = 3,
  schedule = setTimeout, cancel = clearTimeout, now = Date.now,
} = {}) {
  const entries = new Map();
  let closed = false;
  const keyOf = (project, task) => `${project.id}:${task.id}`;
  const remove = (key) => {
    const entry = entries.get(key);
    if (entry?.timer) cancel(entry.timer);
    entries.delete(key);
  };
  const watch = (project, task, { restart = false } = {}) => {
    const key = keyOf(project, task);
    if (closed) return;
    if (!pending(task)) { remove(key); return; }
    if (restart) remove(key);
    if (entries.has(key)) return;
    const entry = { timer: null, startedAt: now(), errors: 0 };
    entries.set(key, entry);
    const later = (wait) => {
      entry.timer = schedule(async () => {
        entry.timer = null;
        if (closed || entries.get(key) !== entry) return;
        let next;
        try {
          next = await query(project, task.id);
          entry.errors = 0;
        } catch {
          entry.errors++;
        }
        if (closed || entries.get(key) !== entry) return;
        if (next && !pending(next)) { remove(key); return; }
        // Leave a paused entry so routine page refreshes cannot restart a failing watcher.
        if (entry.errors >= maxErrors || now() - entry.startedAt >= maxWatchMs) return;
        later(intervalMs * 2 ** entry.errors);
      }, wait);
      entry.timer?.unref?.();
    };
    later(intervalMs);
  };
  return {
    watch,
    resume(project, tasks) { for (const task of tasks) watch(project, task); },
    close() {
      closed = true;
      for (const key of entries.keys()) remove(key);
    },
  };
}
