import { maximumUsagePoints } from './store.mjs';
import { CHAT_TIER_DEFINITIONS } from './chat-tiers.mjs';

/** User-provided screenshot, 2026-10-31; these are proposed sale prices, not live supplier quotes. */
export const CLAUDE_OPUS_PRICE_TIERS = Object.freeze(Object.fromEntries(
  Object.entries(CHAT_TIER_DEFINITIONS).map(([id, { label: _label, ...rates }]) => [id, Object.freeze(rates)])
));

export function claudeOpusPriceDraft(tier) {
  if (!Object.hasOwn(CLAUDE_OPUS_PRICE_TIERS, tier)) throw new Error('Choose the screenshot price tier explicitly.');
  const config = {
    enabled: false, baseUrl: 'https://ai.xem8k5.top/v1', model: 'claude-opus-5-5',
    displayName: 'Claude Opus 5.5 · 玩剧积分', format: 'chat', billingMode: 'wallet',
    context: 32000, maxOutputTokens: 4096, ...CLAUDE_OPUS_PRICE_TIERS[tier],
  };
  return { ...config, reservePoints: maximumUsagePoints(config) };
}
