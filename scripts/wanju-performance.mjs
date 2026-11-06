import { resolve } from 'node:path';
import { readChatPerformance } from '../packages/openfilm/studio/server/wanju-chat-performance.mjs';

// Read-only, available even when Studio is closed. Never starts an agent or contacts a supplier.
const project = resolve(process.argv[2] || process.cwd());
console.log(JSON.stringify(await readChatPerformance(project), null, 2));
