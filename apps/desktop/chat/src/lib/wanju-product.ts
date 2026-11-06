export function isWanjuProduct(productName: unknown): boolean {
  return typeof productName === 'string' && productName.startsWith('玩剧');
}
