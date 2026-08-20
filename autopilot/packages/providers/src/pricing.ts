/**
 * Model catalogue and price table.
 *
 * Prices are configuration, not constants buried in call sites, and are versioned so a
 * historical cost record stays reproducible after a provider changes its rates.
 *
 * VERIFY BEFORE PRODUCTION: confirm each rate against the provider's current pricing page
 * at deployment time and bump PRICING_VERSION. An out-of-date table under-reports gross
 * margin, which is the one number this business cannot afford to be wrong about.
 */
import type { ProviderId } from '@autopilot/shared/domain.ts'
import type { ModelTier } from './types.ts'

export const PRICING_VERSION = 'pricing-2026-08'

/**
 * FX for converting provider USD prices into the ILS accounting currency.
 * Deliberately a single configured number: precise FX belongs in the finance
 * reconciliation, not in a per-call cost estimate.
 */
export const USD_TO_ILS = 3.7

export interface ModelSpec {
  readonly provider: ProviderId
  readonly model: string
  readonly tier: ModelTier
  /** USD per 1M input tokens. */
  readonly inputPerMillionUsd: number
  /** USD per 1M output tokens. */
  readonly outputPerMillionUsd: number
  /** USD per 1000 web searches, when the provider bills search separately. */
  readonly searchPerThousandUsd: number
  readonly supportsSearch: boolean
  readonly supportsStructuredOutput: boolean
  readonly maxContextTokens: number
}

/**
 * The catalogue is intentionally small. Every entry must earn its place by being the best
 * choice for a tier; more models means more routing decisions and more drift.
 */
export const MODEL_CATALOG: readonly ModelSpec[] = [
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    tier: 'CHEAP',
    inputPerMillionUsd: 1,
    outputPerMillionUsd: 5,
    searchPerThousandUsd: 10,
    supportsSearch: true,
    supportsStructuredOutput: true,
    maxContextTokens: 200_000,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    tier: 'STANDARD',
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
    searchPerThousandUsd: 10,
    supportsSearch: true,
    supportsStructuredOutput: true,
    maxContextTokens: 200_000,
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-5',
    tier: 'STRONG',
    inputPerMillionUsd: 15,
    outputPerMillionUsd: 75,
    searchPerThousandUsd: 10,
    supportsSearch: true,
    supportsStructuredOutput: true,
    maxContextTokens: 200_000,
  },
  {
    provider: 'openai',
    model: 'gpt-5-mini',
    tier: 'CHEAP',
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 2,
    searchPerThousandUsd: 10,
    supportsSearch: true,
    supportsStructuredOutput: true,
    maxContextTokens: 400_000,
  },
  {
    provider: 'openai',
    model: 'gpt-5',
    tier: 'STANDARD',
    inputPerMillionUsd: 1.25,
    outputPerMillionUsd: 10,
    searchPerThousandUsd: 10,
    supportsSearch: true,
    supportsStructuredOutput: true,
    maxContextTokens: 400_000,
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    tier: 'CHEAP',
    inputPerMillionUsd: 0.3,
    outputPerMillionUsd: 2.5,
    searchPerThousandUsd: 35,
    supportsSearch: true,
    supportsStructuredOutput: true,
    maxContextTokens: 1_000_000,
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    tier: 'STANDARD',
    inputPerMillionUsd: 1.25,
    outputPerMillionUsd: 10,
    searchPerThousandUsd: 35,
    supportsSearch: true,
    supportsStructuredOutput: true,
    maxContextTokens: 1_000_000,
  },
]

export const findModel = (provider: ProviderId, tier: ModelTier): ModelSpec | undefined => {
  // SEARCH is a capability, not a size: satisfy it with the cheapest searching model.
  const wanted: ModelTier = tier === 'SEARCH' ? 'CHEAP' : tier
  const candidates = MODEL_CATALOG.filter(
    (m) => m.provider === provider && (tier === 'SEARCH' ? m.supportsSearch : true),
  )
  return (
    candidates.find((m) => m.tier === wanted) ??
    candidates.find((m) => m.tier === 'STANDARD') ??
    candidates[0]
  )
}

export const modelByName = (model: string): ModelSpec | undefined =>
  MODEL_CATALOG.find((m) => m.model === model)

/** Cost of a call in ILS minor units (agorot), rounded up so we never under-charge ourselves. */
export const estimateCostMinor = (
  spec: ModelSpec,
  usage: { promptTokens: number; completionTokens: number; searchCount: number },
): number => {
  const usd =
    (usage.promptTokens / 1_000_000) * spec.inputPerMillionUsd +
    (usage.completionTokens / 1_000_000) * spec.outputPerMillionUsd +
    (usage.searchCount / 1000) * spec.searchPerThousandUsd
  return Math.ceil(usd * USD_TO_ILS * 100)
}

/** Rough token estimate for pre-flight budget checks, before a real usage figure exists. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.5)
