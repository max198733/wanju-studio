import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execute } from '../integrations/agent/client.mjs';
import { readGuide } from '../integrations/agent/guide.mjs';

const [action = 'help', file, ...args] = process.argv.slice(2);
if (action === 'help' || action === '--help') {
  console.log(JSON.stringify({
    usage: 'wanju <action> [input.json|-] | wanju guide <guide> [phase] [--checks|--fullfilm|--full|--policy key|--section key]',
    actions: ['guide', 'status', 'current', 'diagnostics', 'list', 'create', 'get', 'story', 'save_story', 'episode_project', 'import_story', 'read_story_source', 'save', 'assets', 'enable_workflow', 'save_assets', 'recover_assets', 'import', 'generate_asset', 'generate_image', 'generate_video', 'query_task', 'assemble', 'export', 'exports', 'open'],
    input: 'JSON file, or - for UTF-8 JSON on stdin. Omit only for status/list/open.',
    paid: 'generate_asset/image/video require confirm_spend:true and explicit prior user authorization.',
  }, null, 2));
} else if (action === 'guide') {
  try {
    if (!file) throw new Error('Usage: wanju guide <guide> [phase] [--policy key]');
    let phase;
    let policy;
    let section;
    const options = { checks: false, fullfilm: false, full: false };
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--phase' && args[i + 1]) phase = args[++i];
      else if (args[i] === '--policy' && args[i + 1]) policy = args[++i];
      else if (args[i] === '--section' && args[i + 1]) section = args[++i];
      else if (['--checks', '--fullfilm', '--full'].includes(args[i])) options[args[i].slice(2)] = true;
      else if (!args[i].startsWith('-') && !phase) phase = args[i];
      else throw new Error(`Unknown guide option: ${args[i]}`);
    }
    const root = process.env.WANJU_ROOT || fileURLToPath(new URL('../', import.meta.url));
    console.log(await readGuide(root, file, { phase, policy, section, ...options }));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
} else {
  try {
    let source = '{}';
    if (file === '-') {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      source = Buffer.concat(chunks).toString('utf8');
    } else if (file) source = await readFile(file, 'utf8');
    const result = await execute(action, JSON.parse(source.replace(/^\uFEFF/, '')));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, ...(error.status ? { status: error.status } : {}) }));
    process.exitCode = 1;
  }
}
