/**
 * AIRS: the AI Recommendation Score.
 *
 * Three properties this module exists to guarantee.
 *
 * It is PURE: no I/O, no provider imports, no clock. The same inputs always produce the
 * same score, which is what makes a historical score reproducible and a regression
 * debuggable.
 *
 * It is VERSIONED: the weights live in a named formula, every calculation stores which one
 * produced it, and a weight change requires a new version. Historical scores are never
 * silently recomputed, because a customer who sees their score drop after a deploy they
 * did not know about has learned that the number means nothing.
 *
 * It is HONEST: the score carries its own confidence (degraded for small samples via a
 * Wilson lower bound), the prompt set and window it was computed over, and a disclosure
 * string that every rendering surface must show. AIRS measures observed performance across
 * a declared monitored set. It is not a guarantee about any individual user's answer, and
 * the type system makes that qualifier impossible to drop.
 */
import type { ConfidenceLevel, RecommendationClass } from '@autopilot/shared/domain.ts'
import {
  isMentioned,
  isRecommended,
  isTop1,
  isTop3,
  isRealObservation,
  type SourceType,
} from '@autopilot/shared/domain.ts'
import { clamp01, proportionConfidence, round, wilsonInterval } from '@autopilot/shared/stats.ts'

export const AIRS_FORMULA_VERSION = 'airs-v1'

export const AIRS_DISCLOSURE =
  'The AI Recommendation Score measures observed performance across our monitored query ' +
  'set, engines and locations over the stated window. It is not a guarantee of a ' +
  'particular response for every user.'

/**
 * Component weights, summing to 1.
 *
 * Weighted toward outcomes over hygiene: being recommended is what earns the customer
 * money, while technical discoverability is a precondition that is worth little on its own.
 * Entity accuracy carries real weight because an AI confidently stating the wrong opening
 * hours costs a business customers regardless of where it ranks.
 */
export const AIRS_WEIGHTS = {
  recommendationRate: 0.22,
  top3Rate: 0.14,
  firstChoiceRate: 0.1,
  mentionRate: 0.08,
  promptCoverage: 0.08,
  citationPresence: 0.1,
  entityAccuracy: 0.1,
  attributeMatch: 0.08,
  competitiveShare: 0.05,
  informationCompleteness: 0.03,
  technicalDiscoverability: 0.02,
} as const

export type AirsComponent = keyof typeof AIRS_WEIGHTS

export interface AirsObservation {
  readonly promptId: string
  readonly provider: string
  readonly language: string
  readonly classification: RecommendationClass
  readonly sourceType: SourceType
  /** True when at least one cited source referenced the business. */
  readonly citationReferencesBusiness: boolean
  /** True when the answer contained no detected misstatement about the business. */
  readonly accurate: boolean | null
  /** Best competitor classification in the same answer, for competitive share. */
  readonly competitorRecommended: boolean
}

export interface AirsInput {
  readonly observations: readonly AirsObservation[]
  /** Total prompts in the monitored set, including any not executed this window. */
  readonly promptSetSize: number
  /** 0..1 from the evidence graph. */
  readonly attributeMatch: number
  /** 0..1 from the knowledge graph. */
  readonly informationCompleteness: number
  /** 0..1 from the technical audit. */
  readonly technicalDiscoverability: number
  readonly windowStart: Date
  readonly windowEnd: Date
  readonly promptSetId: string
  readonly engines: readonly string[]
  readonly locations: readonly string[]
}

export interface AirsComponentResult {
  readonly value: number
  readonly weight: number
  readonly contribution: number
}

export interface AirsResult {
  readonly formulaVersion: string
  /** 0..100, rounded for display. Components keep the precision. */
  readonly score: number
  readonly components: Readonly<Record<AirsComponent, AirsComponentResult>>
  readonly inputs: Readonly<Record<string, number>>
  readonly confidence: ConfidenceLevel
  /** Wilson interval on the headline recommendation rate. */
  readonly recommendationRateInterval: { lower: number; upper: number }
  readonly windowStart: Date
  readonly windowEnd: Date
  readonly promptSetId: string
  readonly engines: readonly string[]
  readonly locations: readonly string[]
  readonly executionCount: number
  /** True when the score came from simulated observations. Never customer-facing as real. */
  readonly simulated: boolean
  readonly disclosure: string
}

const rate = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator

/**
 * Computes AIRS.
 *
 * Note the treatment of small samples: the headline rate components use the Wilson LOWER
 * bound rather than the point estimate. Being recommended in 1 of 2 prompts is not a 50%
 * recommendation rate in any sense a customer should act on, and quoting it as one would
 * make the first week of every account a lie that the second week corrects.
 */
export const calculateAirs = (input: AirsInput): AirsResult => {
  const observations = input.observations
  const total = observations.length

  const mentioned = observations.filter((o) => isMentioned(o.classification)).length
  const recommended = observations.filter((o) => isRecommended(o.classification)).length
  const top3 = observations.filter((o) => isTop3(o.classification)).length
  const top1 = observations.filter((o) => isTop1(o.classification)).length
  const withCitation = observations.filter((o) => o.citationReferencesBusiness).length

  const accuracyJudged = observations.filter((o) => o.accurate !== null)
  const accurate = accuracyJudged.filter((o) => o.accurate === true).length

  const competitorWins = observations.filter(
    (o) => o.competitorRecommended && !isRecommended(o.classification),
  ).length
  const contested = observations.filter(
    (o) => o.competitorRecommended || isRecommended(o.classification),
  ).length

  const distinctPrompts = new Set(observations.map((o) => o.promptId)).size

  // Lower-bounded rates for the outcome components.
  const recommendationLower = total === 0 ? 0 : wilsonInterval(recommended, total).lower
  const top3Lower = total === 0 ? 0 : wilsonInterval(top3, total).lower
  const top1Lower = total === 0 ? 0 : wilsonInterval(top1, total).lower
  const mentionLower = total === 0 ? 0 : wilsonInterval(mentioned, total).lower

  const values: Record<AirsComponent, number> = {
    recommendationRate: recommendationLower,
    top3Rate: top3Lower,
    firstChoiceRate: top1Lower,
    mentionRate: mentionLower,
    promptCoverage: rate(distinctPrompts, Math.max(1, input.promptSetSize)),
    citationPresence: rate(withCitation, Math.max(1, total)),
    // No accuracy judgement yet is not evidence of inaccuracy; treat it as neutral-good.
    entityAccuracy: accuracyJudged.length === 0 ? 1 : rate(accurate, accuracyJudged.length),
    attributeMatch: clamp01(input.attributeMatch),
    competitiveShare: contested === 0 ? 0 : 1 - rate(competitorWins, contested),
    informationCompleteness: clamp01(input.informationCompleteness),
    technicalDiscoverability: clamp01(input.technicalDiscoverability),
  }

  const components = {} as Record<AirsComponent, AirsComponentResult>
  let score = 0
  for (const key of Object.keys(AIRS_WEIGHTS) as AirsComponent[]) {
    const weight = AIRS_WEIGHTS[key]
    const value = clamp01(values[key])
    const contribution = value * weight
    components[key] = { value: round(value, 4), weight, contribution: round(contribution, 4) }
    score += contribution
  }

  const { confidence } = proportionConfidence(recommended, total)
  const simulated = total > 0 && observations.every((o) => !isRealObservation(o.sourceType))

  return {
    formulaVersion: AIRS_FORMULA_VERSION,
    score: round(score * 100, 1),
    components,
    inputs: {
      observations: total,
      distinctPrompts,
      promptSetSize: input.promptSetSize,
      mentioned,
      recommended,
      top3,
      top1,
      withCitation,
      accuracyJudged: accuracyJudged.length,
      accurate,
      competitorWins,
      contested,
      attributeMatch: round(input.attributeMatch, 4),
      informationCompleteness: round(input.informationCompleteness, 4),
      technicalDiscoverability: round(input.technicalDiscoverability, 4),
    },
    confidence,
    recommendationRateInterval:
      total === 0 ? { lower: 0, upper: 1 } : wilsonInterval(recommended, total),
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    promptSetId: input.promptSetId,
    engines: input.engines,
    locations: input.locations,
    executionCount: total,
    simulated,
    disclosure: AIRS_DISCLOSURE,
  }
}

export interface ShareBreakdown {
  readonly promptsEvaluated: number
  readonly mentionCount: number
  readonly recommendationCount: number
  readonly top3Count: number
  readonly top1Count: number
  readonly citationCount: number
  readonly mentionRate: number
  readonly recommendationRate: number
  readonly top3Rate: number
  readonly top1Rate: number
  readonly recommendationRateLower: number
  readonly recommendationRateUpper: number
  readonly confidence: ConfidenceLevel
}

/**
 * Recommendation share over a declared prompt set and window (brief section 52).
 * Always paired with its denominator so two shares are never compared across
 * incompatible prompt sets.
 */
export const calculateShare = (
  observations: readonly AirsObservation[],
): ShareBreakdown => {
  const total = observations.length
  const mentionCount = observations.filter((o) => isMentioned(o.classification)).length
  const recommendationCount = observations.filter((o) => isRecommended(o.classification)).length
  const top3Count = observations.filter((o) => isTop3(o.classification)).length
  const top1Count = observations.filter((o) => isTop1(o.classification)).length
  const citationCount = observations.filter((o) => o.citationReferencesBusiness).length
  const interval = total === 0 ? { lower: 0, upper: 1 } : wilsonInterval(recommendationCount, total)

  return {
    promptsEvaluated: total,
    mentionCount,
    recommendationCount,
    top3Count,
    top1Count,
    citationCount,
    mentionRate: rate(mentionCount, total),
    recommendationRate: rate(recommendationCount, total),
    top3Rate: rate(top3Count, total),
    top1Rate: rate(top1Count, total),
    recommendationRateLower: interval.lower,
    recommendationRateUpper: interval.upper,
    confidence: proportionConfidence(recommendationCount, total).confidence,
  }
}

/** Per-engine and per-language slices. Visibility genuinely differs across both. */
export const sliceObservations = (
  observations: readonly AirsObservation[],
): {
  byProvider: Record<string, AirsObservation[]>
  byLanguage: Record<string, AirsObservation[]>
} => {
  const byProvider: Record<string, AirsObservation[]> = {}
  const byLanguage: Record<string, AirsObservation[]> = {}
  for (const observation of observations) {
    ;(byProvider[observation.provider] ??= []).push(observation)
    ;(byLanguage[observation.language] ??= []).push(observation)
  }
  return { byProvider, byLanguage }
}

export interface ScoreComparison {
  readonly previous: number
  readonly current: number
  readonly delta: number
  /** True only when both scores used the same formula AND the same prompt set. */
  readonly comparable: boolean
  readonly reason: string
}

/**
 * Comparing two scores.
 *
 * Refuses to report a delta across different formula versions or prompt sets. A score that
 * "improved" because the methodology changed is the fastest way to destroy the credibility
 * of the only number this product sells.
 */
export const compareScores = (
  previous: Pick<AirsResult, 'score' | 'formulaVersion' | 'promptSetId'>,
  current: Pick<AirsResult, 'score' | 'formulaVersion' | 'promptSetId'>,
): ScoreComparison => {
  const sameFormula = previous.formulaVersion === current.formulaVersion
  const samePromptSet = previous.promptSetId === current.promptSetId
  const comparable = sameFormula && samePromptSet

  return {
    previous: previous.score,
    current: current.score,
    delta: comparable ? round(current.score - previous.score, 1) : 0,
    comparable,
    reason: comparable
      ? 'Same scoring method and same monitored prompt set.'
      : !sameFormula
        ? 'Scoring method changed between these measurements, so the two numbers are not comparable.'
        : 'The monitored prompt set changed between these measurements, so the two numbers are not comparable.',
  }
}

/**
 * The score explained in a sentence a business owner would actually read.
 * No jargon, no percentages without a denominator (brief section 82).
 */
export const explainScore = (result: AirsResult, language: 'en' | 'he' = 'en'): string => {
  const recommended = result.inputs.recommended ?? 0
  const total = result.inputs.observations ?? 0

  if (total === 0) {
    return language === 'he'
      ? 'עוד לא ביצענו מדידות עבור העסק הזה.'
      : 'We have not measured this business yet.'
  }

  if (language === 'he') {
    return (
      `מתוך ${total} שאלות שנבדקו, העסק שלך הומלץ ב-${recommended}. ` +
      `הציון הנוכחי הוא ${result.score} מתוך 100.`
    )
  }
  return (
    `Across ${total} monitored questions, your business was recommended in ${recommended}. ` +
    `Your current score is ${result.score} out of 100.`
  )
}
