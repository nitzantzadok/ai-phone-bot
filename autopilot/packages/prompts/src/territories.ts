/**
 * Recommendation Territories.
 *
 * A business cannot win "best restaurant in Tel Aviv" on day one, and pretending otherwise
 * wastes the customer's budget and their patience. Territories group the monitored prompt
 * set by winnability so the agent pursues high-probability wins first and expands outward
 * (brief section 51).
 */
import type { GeneratedPrompt } from './generator.ts'

export type TerritoryTier = 'CORE' | 'REACHABLE' | 'AMBITIOUS' | 'ASPIRATIONAL'

export interface Territory {
  readonly tier: TerritoryTier
  readonly label: string
  readonly description: string
  readonly prompts: readonly GeneratedPrompt[]
  readonly averageDifficulty: number
}

const TIER_COPY: Record<TerritoryTier, { label: string; description: string }> = {
  CORE: {
    label: 'Where you should already be winning',
    description:
      'Very specific questions that match what you actually offer. If you are not recommended here, the cause is almost always something on your own site.',
  },
  REACHABLE: {
    label: 'Winnable next',
    description:
      'Questions where a few competitors dominate but the gap is closable with clearer information.',
  },
  AMBITIOUS: {
    label: 'Worth working toward',
    description:
      'Broader questions with strong incumbents. Progress here usually follows progress in the two tiers above.',
  },
  ASPIRATIONAL: {
    label: 'Long term',
    description:
      'The broadest questions in your market. We monitor them so you can see movement, but they are not where we spend your effort first.',
  },
}

export const buildTerritories = (prompts: readonly GeneratedPrompt[]): Territory[] => {
  const buckets: Record<TerritoryTier, GeneratedPrompt[]> = {
    CORE: [],
    REACHABLE: [],
    AMBITIOUS: [],
    ASPIRATIONAL: [],
  }

  for (const prompt of prompts) {
    if (prompt.difficulty < 0.35) buckets.CORE.push(prompt)
    else if (prompt.difficulty < 0.55) buckets.REACHABLE.push(prompt)
    else if (prompt.difficulty < 0.75) buckets.AMBITIOUS.push(prompt)
    else buckets.ASPIRATIONAL.push(prompt)
  }

  return (Object.keys(buckets) as TerritoryTier[])
    .map((tier) => ({
      tier,
      label: TIER_COPY[tier].label,
      description: TIER_COPY[tier].description,
      prompts: buckets[tier],
      averageDifficulty:
        buckets[tier].length === 0
          ? 0
          : buckets[tier].reduce((s, p) => s + p.difficulty, 0) / buckets[tier].length,
    }))
    .filter((t) => t.prompts.length > 0)
}

/**
 * The prompts the agent should focus on right now: winnable, valuable, and currently lost.
 * Ordered by expected return rather than by how impressive they would look on a dashboard.
 */
export const focusPrompts = (
  prompts: readonly GeneratedPrompt[],
  currentlyRecommended: ReadonlySet<string>,
  limit = 10,
): GeneratedPrompt[] =>
  prompts
    .filter((p) => !currentlyRecommended.has(p.id))
    .sort((a, b) => b.promptScore * (1 - b.difficulty) - a.promptScore * (1 - a.difficulty))
    .slice(0, limit)
