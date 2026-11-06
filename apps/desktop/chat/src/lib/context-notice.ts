export function shouldSuggestNewConversation(
  context: { used: number; size: number } | null | undefined,
  dismissed = false,
): boolean {
  return !dismissed && Boolean(context
    && Number.isFinite(context.used) && Number.isFinite(context.size)
    && context.used >= 0 && context.size > 0 && context.used / context.size >= 0.85);
}
