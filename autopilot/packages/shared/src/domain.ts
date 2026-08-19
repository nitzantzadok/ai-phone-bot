/**
 * Cross-cutting domain vocabulary.
 *
 * These enums are referenced by the database schema, the agent, the scoring engine and the
 * UI. Keeping one definition means a new value cannot be added in one layer and silently
 * ignored in another.
 */

/* ------------------------------------------------------------------ provenance --- */

/**
 * Where an observation came from. This is the honesty boundary of the product (brief §10):
 * a simulation must never be presented as a real engine response.
 */
export const SOURCE_TYPES = [
  'OBSERVED_API', // returned by an official provider API call we made
  'SEARCH_EVIDENCE', // official grounding/web-search result attached to a response
  'INFERRED', // derived by our own analysis from other stored data
  'HISTORICAL', // a previously observed value being reused
  'OWN_PROPERTY', // read from a property the business controls (its site, its profile)
  'THIRD_PARTY', // supplied by an external dataset or connected profile
  'CUSTOMER_PROVIDED', // stated by the business owner
  'SYNTHETIC', // mock/simulated — never shown as a real observation
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

/** Observations that may be presented to a customer as real AI behaviour. */
export const REAL_OBSERVATION_TYPES: readonly SourceType[] = ['OBSERVED_API', 'SEARCH_EVIDENCE']

export const isRealObservation = (t: SourceType): boolean => REAL_OBSERVATION_TYPES.includes(t)

/* --------------------------------------------------------------- controllability --- */

export const CONTROLLABILITY = ['CONTROLLED', 'INFLUENCEABLE', 'NOT_CONTROLLED'] as const
export type Controllability = (typeof CONTROLLABILITY)[number]

/** Only CONTROLLED items may be acted on autonomously. */
export const isActionable = (c: Controllability): boolean => c === 'CONTROLLED'

/* -------------------------------------------------------------------- confidence --- */

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]

export const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
}

export const atLeastConfidence = (
  actual: ConfidenceLevel,
  required: ConfidenceLevel,
): boolean => CONFIDENCE_RANK[actual] >= CONFIDENCE_RANK[required]

/**
 * Default confidence a source class confers on a fact. An LLM inference is UNKNOWN until
 * corroborated — an old AI answer is never a business fact (brief §75).
 */
export const SOURCE_CONFIDENCE: Record<SourceType, ConfidenceLevel> = {
  OBSERVED_API: 'MEDIUM',
  SEARCH_EVIDENCE: 'MEDIUM',
  INFERRED: 'LOW',
  HISTORICAL: 'LOW',
  OWN_PROPERTY: 'HIGH',
  THIRD_PARTY: 'MEDIUM',
  CUSTOMER_PROVIDED: 'HIGH',
  SYNTHETIC: 'UNKNOWN',
}

/* --------------------------------------------------------------------- freshness --- */

export const FRESHNESS = ['FRESH', 'RECENT', 'AGING', 'STALE'] as const
export type Freshness = (typeof FRESHNESS)[number]

export interface FreshnessPolicy {
  readonly freshDays: number
  readonly recentDays: number
  readonly agingDays: number
}

export const DEFAULT_FRESHNESS: FreshnessPolicy = { freshDays: 7, recentDays: 30, agingDays: 90 }

/** Business hours go stale faster than a business name. */
export const FRESHNESS_BY_FACT_KIND: Record<string, FreshnessPolicy> = {
  opening_hours: { freshDays: 3, recentDays: 14, agingDays: 30 },
  price_range: { freshDays: 14, recentDays: 45, agingDays: 120 },
  phone: { freshDays: 30, recentDays: 90, agingDays: 180 },
  address: { freshDays: 30, recentDays: 90, agingDays: 180 },
}

export const freshnessOf = (
  lastVerifiedAt: Date,
  now: Date,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS,
): Freshness => {
  const days = (now.getTime() - lastVerifiedAt.getTime()) / 86_400_000
  if (days < policy.freshDays) return 'FRESH'
  if (days < policy.recentDays) return 'RECENT'
  if (days < policy.agingDays) return 'AGING'
  return 'STALE'
}

/* ---------------------------------------------------------------- classification --- */

/** How an AI answer treated the business. Ordered from worst to best. */
export const RECOMMENDATION_CLASSES = [
  'NOT_PRESENT',
  'MENTIONED',
  'RELEVANT_RECOMMENDATION',
  'TOP_3',
  'TOP_1',
  'STRONGLY_RECOMMENDED',
] as const
export type RecommendationClass = (typeof RECOMMENDATION_CLASSES)[number]

export const RECOMMENDATION_RANK: Record<RecommendationClass, number> = {
  NOT_PRESENT: 0,
  MENTIONED: 1,
  RELEVANT_RECOMMENDATION: 2,
  TOP_3: 3,
  TOP_1: 4,
  STRONGLY_RECOMMENDED: 5,
}

/** "Recommended" means the answer actually steered a customer toward the business. */
export const isRecommended = (c: RecommendationClass): boolean =>
  RECOMMENDATION_RANK[c] >= RECOMMENDATION_RANK.RELEVANT_RECOMMENDATION

export const isTop3 = (c: RecommendationClass): boolean =>
  RECOMMENDATION_RANK[c] >= RECOMMENDATION_RANK.TOP_3

export const isTop1 = (c: RecommendationClass): boolean =>
  RECOMMENDATION_RANK[c] >= RECOMMENDATION_RANK.TOP_1

export const isMentioned = (c: RecommendationClass): boolean =>
  RECOMMENDATION_RANK[c] >= RECOMMENDATION_RANK.MENTIONED

export const ACCURACY_CLASSES = [
  'CORRECT',
  'PARTIALLY_CORRECT',
  'INCORRECT',
  'UNKNOWN',
] as const
export type AccuracyClass = (typeof ACCURACY_CLASSES)[number]

/* ----------------------------------------------------------------------- action --- */

export const RISK_TIERS = ['LOW', 'MEDIUM', 'HIGH'] as const
export type RiskTier = (typeof RISK_TIERS)[number]

export const AUTONOMY_MODES = ['MONITOR', 'RECOMMEND', 'AUTO_SAFE', 'AUTOPILOT'] as const
export type AutonomyMode = (typeof AUTONOMY_MODES)[number]

/**
 * The single authority on "may this run without a human?".
 * HIGH risk is never auto-approvable, whatever the mode — no setting can turn it off.
 */
export const canAutoApply = (mode: AutonomyMode, risk: RiskTier): boolean => {
  if (risk === 'HIGH') return false
  switch (mode) {
    case 'MONITOR':
    case 'RECOMMEND':
      return false
    case 'AUTO_SAFE':
      return risk === 'LOW'
    case 'AUTOPILOT':
      return risk === 'LOW' || risk === 'MEDIUM'
  }
}

/** Modes in which the agent may perform any write at all. */
export const allowsWrites = (mode: AutonomyMode): boolean =>
  mode === 'AUTO_SAFE' || mode === 'AUTOPILOT'

export const ACTION_CATEGORIES = ['TECHNICAL', 'CONTENT', 'ENTITY', 'SCHEMA', 'PROFILE'] as const
export type ActionCategory = (typeof ACTION_CATEGORIES)[number]

export const ACTION_STATUSES = [
  'PROPOSED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'APPLYING',
  'APPLIED',
  'FAILED',
  'ROLLED_BACK',
  'SUPERSEDED',
] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

/* ------------------------------------------------------------------------ roles --- */

export const ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 }

export const hasRole = (actual: Role, required: Role): boolean =>
  ROLE_RANK[actual] >= ROLE_RANK[required]

/* ------------------------------------------------------------- data classification --- */

export const DATA_CLASSES = [
  'PUBLIC_BUSINESS_DATA',
  'CUSTOMER_ACCOUNT_DATA',
  'AUTHENTICATION_DATA',
  'OAUTH_TOKEN',
  'AI_OUTPUT',
  'ANALYTICS',
  'BILLING_DATA',
  'LOG_DATA',
] as const
export type DataClass = (typeof DATA_CLASSES)[number]

/** Retention in days per class; null = retained while the account exists. */
export const RETENTION_DAYS: Record<DataClass, number | null> = {
  PUBLIC_BUSINESS_DATA: null,
  CUSTOMER_ACCOUNT_DATA: null,
  AUTHENTICATION_DATA: null,
  OAUTH_TOKEN: null,
  AI_OUTPUT: 400,
  ANALYTICS: 730,
  BILLING_DATA: 2555, // 7 years — statutory bookkeeping retention
  LOG_DATA: 90,
}

/* ------------------------------------------------------------------- engines --- */

export const PROVIDER_IDS = ['openai', 'gemini', 'anthropic'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'ChatGPT',
  gemini: 'Gemini',
  anthropic: 'Claude',
}
