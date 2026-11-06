#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { podcastCuts } from '../studio/server/podcast-cut.mjs';
import { readPodcastSource } from '../studio/server/podcast-source.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.error('用法：node packages/openfilm/bin/podcast-cut.mjs <word-times.json>');
  console.error('或：node packages/openfilm/bin/podcast-cut.mjs --project <项目目录> --src assets/口播.mp4 --duration <原录音秒数>');
  console.error('JSON 格式：{ "durationSec": 60, "words": [{ "token": "嗯", "start": 1.2, "end": 1.5 }] }');
  console.error('只输出待人工复核的建议，不会修改 film.html 或提交生成任务。');
  process.exitCode = args.length ? 0 : 2;
} else {
  try {
    let input;
    if (args[0] === '--project') {
      const values = new Map();
      for (let index = 0; index < args.length; index += 2) {
        if (!['--project', '--src', '--duration'].includes(args[index]) || !args[index + 1] || values.has(args[index])) {
          throw new TypeError('项目模式需要 --project、--src 和 --duration，各提供一次。');
        }
        values.set(args[index], args[index + 1]);
      }
      if (!values.has('--src') || !values.has('--duration')) throw new TypeError('请提供 --src 和录音实际秒数 --duration。');
      input = { words: await readPodcastSource(resolve(values.get('--project')), values.get('--src')), durationSec: Number(values.get('--duration')) };
    } else {
      if (args.length !== 1) throw new TypeError('JSON 模式仅接受一个文件路径。');
      input = JSON.parse(await readFile(resolve(args[0]), 'utf8'));
    }
    if (!input || typeof input !== 'object' || !Array.isArray(input.words)) {
      throw new TypeError('输入需要包含 words 数组和 durationSec。');
    }
    const cuts = podcastCuts(input.words, input.durationSec, input.options ?? {});
    process.stdout.write(`${JSON.stringify({ durationSec: input.durationSec, reviewRequired: true, cuts }, null, 2)}\n`);
  } catch (error) {
    console.error(`podcast-cut: ${error.message}`);
    process.exitCode = 1;
  }
}
