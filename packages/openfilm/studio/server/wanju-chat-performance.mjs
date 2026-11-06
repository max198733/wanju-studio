import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const number = (value) => Number.isFinite(value) && value >= 0 ? value : 0;
const label = (value) => typeof value === 'string' && /^[\w.:[\]()-]{1,100}$/.test(value) ? value : null;
const timestamp = (value) => typeof value === 'number' ? number(value)
  : typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? number(Date.parse(value)) : 0;

async function lines(file, maxBytes) {
  let handle;
  try {
    handle = await open(file, 'r');
    const size = (await handle.stat()).size;
    const buffer = Buffer.alloc(Math.min(size, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const entries = text.split('\n');
    // A running writer or a bounded read can end halfway through a record.
    if (bytesRead < size || !text.endsWith('\n')) entries.pop();
    return {
      partial: bytesRead < size,
      entries: entries.flatMap((line) => {
        try { return line ? [JSON.parse(line)] : []; } catch { return []; }
      }),
    };
  } catch { return { entries: [], partial: false }; }
  finally { await handle?.close(); }
}

function coveredTime(intervals, start, end) {
  let total = 0, left = 0, right = 0;
  for (const [a, b] of intervals.map(([a, b]) => [Math.max(a, start), Math.min(b, end)])
    .filter(([a, b]) => b >= a).sort((a, b) => a[0] - b[0])) {
    if (a > right) { total += right - left; left = a; right = b; }
    else right = Math.max(right, b);
  }
  return total + right - left;
}

/** Numeric, bounded evidence only: never return prompts, messages, commands, keys or media URLs. */
export async function readChatPerformance(projectPath, { limit = 3, maxBytes = 24 * 1024 * 1024 } = {}) {
  const dir = join(projectPath, '.film', 'logs');
  let files;
  try {
    files = (await readdir(dir)).filter((name) => /^[\w-]+\.jsonl$/.test(name));
  } catch { return { turns: [], notes: ['当前项目还没有可读取的对话耗时记录。'] }; }
  const recent = (await Promise.all(files.map(async (name) => {
    try { return { name, modified: (await stat(join(dir, name))).mtimeMs }; } catch { return null; }
  }))).filter(Boolean).sort((a, b) => b.modified - a.modified).slice(0, Math.min(5, Math.max(1, limit)));
  const turns = [];
  for (const file of recent) {
    const events = await lines(join(dir, file.name), Math.min(maxBytes, 4 * 1024 * 1024));
    const calls = await lines(join(dir, file.name.replace(/\.jsonl$/, '.model.jsonl')), maxBytes);
    const prompt = events.entries.find((e) => e.kind === 'prompt');
    const done = events.entries.findLast((e) => e.kind === 'done');
    const first = timestamp(prompt?.t ?? events.entries[0]?.t);
    const last = timestamp(done?.t ?? events.entries.at(-1)?.t);
    const durations = [], intervals = [], models = new Set(), efforts = new Set();
    let maxInputTokens = 0, outputTokens = 0, currentContextTokens = 0, tools = 0;
    const selected = label(prompt?.session?.models?.currentModelId);
    if (selected) models.add(selected.replace(/\[[^\]]+\]$/, ''));
    const selectedEffort = selected?.match(/\[([a-z]+)\]$/)?.[1];
    if (selectedEffort) efforts.add(selectedEffort);
    for (const c of calls.entries) {
      if (!Number.isFinite(c.ms) || c.ms < 0) continue;
      durations.push(c.ms);
      const at = timestamp(c.startedAt);
      if (at) intervals.push([at, at + c.ms]);
      const answer = c.answer ?? {}, usage = answer.usage ?? {};
      const model = label(answer.responseModel ?? answer.model);
      const effort = label(answer.thinkingLevel ?? c.settings?.reasoning_effort);
      if (model) models.add(model);
      if (effort) efforts.add(effort);
      maxInputTokens = Math.max(maxInputTokens, number(usage.input) + number(usage.cacheRead) + number(usage.cacheWrite));
      outputTokens += number(usage.output);
    }
    for (const e of events.entries) {
      if (e.update?.sessionUpdate === 'tool_call') tools++;
      if (e.update?.sessionUpdate === 'usage_update') currentContextTokens = number(e.update.used);
    }
    durations.sort((a, b) => a - b);
    turns.push({
      turn: file.name.slice(0, -6), agent: label(prompt?.agent),
      models: [...models], efforts: [...efforts], status: done ? 'finished' : 'incomplete',
      startedAt: first ? new Date(first).toISOString() : null,
      observedMs: first && last >= first ? last - first : null,
      requests: durations.length, modelMs: durations.reduce((sum, ms) => sum + ms, 0),
      modelWallMs: first && last >= first && intervals.length ? coveredTime(intervals, first, last) : null,
      medianModelMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      maxModelMs: durations.at(-1) ?? null, maxInputTokens, currentContextTokens, outputTokens, tools,
      partial: events.partial || calls.partial,
      warnings: [
        ...(maxInputTokens >= 80000 || currentContextTokens >= 80000 ? ['long-context'] : []),
        ...([...efforts].some((e) => ['xhigh', 'max', 'ultra'].includes(e)) ? ['high-reasoning-effort'] : []),
      ],
    });
  }
  return {
    turns,
    notes: [
      '模型耗时包含请求、服务商排队和响应传输，不能单独视为模型思考时间。',
      'modelMs 是请求耗时之和；modelWallMs 合并重叠请求并限制在记录的回合内。',
      '未结束的回合可能尚未写入模型记录；incomplete 不等于仍在运行，observedMs 仅到最后一条事件。',
      '仅检查最近回合及限定大小的本地日志，不调用模型或媒体服务，不返回对话正文。',
    ],
  };
}
