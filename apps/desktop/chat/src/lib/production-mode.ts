export const PRODUCTION_MODES = ['auto', 'quick', 'drama', 'mixed'] as const;
export type ProductionMode = typeof PRODUCTION_MODES[number];

export function productionMode(value: unknown): ProductionMode {
  return PRODUCTION_MODES.find((mode) => mode === value) ?? 'auto';
}

export const PRODUCTION_LABELS: Record<ProductionMode, string> = {
  auto: '自动',
  quick: '快速创作',
  drama: 'AI 剧情',
  mixed: '混合制作',
};

export const PRODUCTION_STARTERS: Record<ProductionMode, readonly string[]> = {
  auto: [
    '用代码做一支 15 秒的产品介绍，先做可预览版本',
    '做一集 30 秒的竖屏悬疑短剧，先给我剧本和分镜',
    '把我上传的视频剪成精华片段，保留原声',
    '用动画和已有素材制作一支短视频',
    '继续这个项目，先完成当前阶段',
  ],
  quick: [
    '用 OpenFilm 原生流程做一支 15 秒的产品介绍，先做可预览版本',
    '用 OpenFilm 原生流程制作标题和转场文字动效',
    '用 OpenFilm 原生流程把我上传的视频剪成精华片段，保留原声',
    '用 OpenFilm 原生流程把演示文稿制作成讲解视频',
    '继续用 OpenFilm 原生流程修改当前视频，不创建新项目',
  ],
  drama: [
    '做一集 30 秒的竖屏悬疑短剧，先给我剧本和分镜',
    '把我的故事改成三集短剧，先规划人物、场景和关键道具',
    '根据当前剧本规划人物定妆照和场景参考',
    '检查当前分镜的人物一致性，先不要付费生成',
    '继续当前短剧，从未完成阶段接着做',
  ],
  mixed: [
    '用已有素材和代码动画制作广告，先不要调用付费生成',
    '给当前 AI 镜头添加标题、字幕和转场',
    '先剪辑已有镜头，再列出需要补拍的 AI 镜头',
    '为当前短剧制作代码片头，保留已有剧情镜头',
    '继续完善当前时间轴，不重复导入镜头',
  ],
};

const PATHS: Record<ProductionMode, string> = {
  auto: 'Choose native code for motion graphics, explainers and supplied-media edits; choose the enabled drama skill only for AI footage or continuity-driven drama. Do not make every short video a drama workflow.',
  quick: 'Use the OpenFilm-native quick-creation path: the current project, native pages, film.html, code animation, title motion and supplied media, with the existing preview, timeline and export. Read the installed OpenFilm manual once, make a visible first version, then inspect it. The Wanju API status describes only the legacy server-side media workflow, not the selected desktop conversation mode. An empty Wanju script/storyboard does not mean the native film or timeline is empty; inspect film.html and the current project pages. Do not inspect suppliers or require character catalogs for code-only work. If the request explicitly needs AI footage, explain the scope change; never imitate requested AI footage with code.',
  drama: 'Use the enabled short-drama skill for screenplay, stable shot IDs, character/scene/important-prop references, storyboard review and shot generation. Do not skip required assets or failed review gates. Respect the requested stage; a script-only request is not permission to generate media. If the skill is disabled, ask before enabling it.',
  mixed: 'Use native pages and existing media directly; apply enabled drama continuity/reference gates only to AI story shots that require them. Keep both in the current editor and timeline, without imposing drama asset gates on code titles or supplied-media edits.',
};

/** Sent every turn, so a resumed agent receives the currently selected preference too. */
export function productionContext(value: unknown, projectId: string): string {
  const mode = productionMode(value);
  return `[Wanju production preference: ${mode}; current project: ${JSON.stringify(projectId)}]
${PATHS[mode]}
This preference is not paid-generation authorization and does not enable a disabled skill.
Do not clear assets, disable existing review gates, create a project copy or open another tab merely because the mode changed.
Use this project's task/shot/version bindings. Only successfully downloaded and validated video enters its timeline through the existing automatic binding; do not insert a second copy. Pending tasks and reference images stay off the timeline unless the person explicitly requests an image clip.
The person's explicit request and requested stage still apply.

`;
}
