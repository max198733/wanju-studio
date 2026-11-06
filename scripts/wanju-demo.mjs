import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.env.OPENFILM_HOME = join(root, '.local/home');
process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
process.env.OPENFILM_LIBRARY = join(root, 'Projects');
const { createProject, listProjects } = await import('../packages/openfilm/studio/server/projects.mjs');
const { saveWanju } = await import('../packages/openfilm/studio/server/wanju.mjs');
const name = '示例 · 三镜素材剪辑';
if ((await listProjects()).some((p) => p.name === name)) {
  console.log('Demo project already exists.');
} else {
  const project = await createProject(name);
  await mkdir(join(project.path, 'assets'), { recursive: true });
  const covers = [
    ['vintage-film', '旅途的记忆', '一组海边旅途的老照片，作为回忆段落。'],
    ['collage', '片段的交汇', '用拼贴素材组织画面，作为段落转折。'],
    ['whiteboard', '故事的线索', '以手绘说明画面收束，作为片尾占位素材。'],
  ];
  const shots = [];
  for (const [index, [skill, title, description]] of covers.entries()) {
    const media = `assets/${skill}.jpg`;
    await copyFile(join(root, 'packages/openfilm/skills', skill, 'cover.jpg'), join(project.path, media));
    shots.push({ id: `S00${index + 1}`, title, description, dialogue: '', duration: 2, media });
  }
  await saveWanju(project.path, {
    version: 1, title: name, ratio: '16:9', music: '', shots,
    script: '这是本地剪辑示例，用于体验分镜排序、预览和导出，并非 AI 短剧成片。\n\n素材来自本工程上游 OpenFilm 的 vintage-film、collage、whiteboard 技能封面，沿用上游许可。\n\n每镜计划 2 秒，总时长 6 秒。请用自己的图片或视频替换后再制作正式作品。\n台词目前仅作分镜记录，尚未合成配音或字幕。',
  });
  console.log(`Demo project created: ${project.id}`);
}
