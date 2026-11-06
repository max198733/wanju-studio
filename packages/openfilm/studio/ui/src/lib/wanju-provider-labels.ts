const labels: Record<string, string> = {
  image: '图片生成',
  h3: '视频 · 传统首帧',
  h3_zm_nono: '视频 · 首帧快拍',
  sparkvideo: '历史视频线路（已停用）',
  wan: '视频扩展（尚未接入）',
  grok: '视频扩展（尚未接入）',
  seedance: '视频 · 参考素材创作',
  music: '音乐生成',
  cos: '素材存储',
};

export function wanjuProviderLabel(id: string): string {
  return labels[id] ?? '其他服务';
}

export function wanjuProviderDescription(configured: boolean): string {
  return configured ? '密钥已保存，尚未验证生成结果。' : '尚未配置';
}

export const WANJU_ACTIVE_MEDIA = ['image', 'h3_zm_nono', 'seedance'] as const;
export const WANJU_SUPPORTED_PROVIDERS = new Set(['image', 'h3', 'h3_zm_nono', 'seedance', 'cos']);
