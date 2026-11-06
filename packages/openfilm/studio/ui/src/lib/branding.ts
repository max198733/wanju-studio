/** Display branding only. Package IDs, saved projects and license notices keep their original names. */
interface BrandScope {
  openfilmNative?: { productName?: string; wanju?: unknown };
  openfilmHost?: { name?: string };
  document?: { documentElement?: { dataset?: { wanju?: string } } };
}

export function isWanju(scope: BrandScope = globalThis as BrandScope): boolean {
  return scope.openfilmNative?.productName === '玩剧'
    || Boolean(scope.openfilmNative?.wanju)
    || scope.openfilmHost?.name === '玩剧'
    || scope.document?.documentElement?.dataset?.wanju === '1';
}

/** Apply only to application-authored interface text, never user content or third-party notices. */
export function brandUiText(text: string, scope?: BrandScope): string {
  return isWanju(scope) ? text.replace(/\bOpenFilm\b/g, '玩剧') : text;
}
