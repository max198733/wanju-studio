export const CHAT_TIER_DEFINITIONS = Object.freeze({
  base: Object.freeze({ label: '基础档', inputPointsPerMillion: 80, outputPointsPerMillion: 400,
    cachedInputPointsPerMillion: 4, cacheWritePointsPerMillion: 100 }),
  claude: Object.freeze({ label: '增强档', inputPointsPerMillion: 364, outputPointsPerMillion: 1820,
    cachedInputPointsPerMillion: 18.2, cacheWritePointsPerMillion: 455 }),
  'claude-max': Object.freeze({ label: '高阶档', inputPointsPerMillion: 1004, outputPointsPerMillion: 5020,
    cachedInputPointsPerMillion: 50.2, cacheWritePointsPerMillion: 1255 }),
});
