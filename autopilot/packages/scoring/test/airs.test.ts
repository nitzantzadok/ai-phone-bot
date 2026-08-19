import { describe, expect, it } from 'vitest'
import type { RecommendationClass, SourceType } from '@autopilot/shared/domain.ts'
import {
  AIRS_DISCLOSURE,
  AIRS_FORMULA_VERSION,
  AIRS_WEIGHTS,
  calculateAirs,
  calculateShare,
  compareScores,
  explainScore,
  sliceObservations,
  type AirsInput,
  type AirsObservation,
} from '../src/airs.ts'

const observation = (
  classification: RecommendationClass,
  overrides: Partial<AirsObservation> = {},
): AirsObservation => ({
  promptId: overrides.promptId ?? `p-${Math.random()}`,
  provider: 'gemini',
  language: 'en',
  classification,
  sourceType: 'OBSERVED_API' as SourceType,
  citationReferencesBusiness: false,
  accurate: true,
  competitorRecommended: false,
  ...overrides,
})

const input = (
  observations: AirsObservation[],
  overrides: Partial<AirsInput> = {},
): AirsInput => ({
  observations,
  promptSetSize: Math.max(1, new Set(observations.map((o) => o.promptId)).size),
  attributeMatch: 0.5,
  informationCompleteness: 0.5,
  technicalDiscoverability: 0.5,
  windowStart: new Date('2026-08-01'),
  windowEnd: new Date('2026-08-19'),
  promptSetId: 'set-1',
  engines: ['gemini'],
  locations: ['IL/Tel Aviv'],
  ...overrides,
})

describe('AIRS formula', () => {
  it('has weights that sum to exactly 1', () => {
    const sum = Object.values(AIRS_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('stamps every result with the formula version and the disclosure', () => {
    const result = calculateAirs(input([observation('TOP_1')]))
    expect(result.formulaVersion).toBe(AIRS_FORMULA_VERSION)
    expect(result.disclosure).toBe(AIRS_DISCLOSURE)
    expect(result.disclosure).toContain('not a guarantee')
  })

  it('is pure: identical inputs always produce an identical result', () => {
    const observations = [observation('TOP_1', { promptId: 'a' }), observation('NOT_PRESENT', { promptId: 'b' })]
    expect(calculateAirs(input(observations))).toEqual(calculateAirs(input(observations)))
  })

  it('records every input it used, so the number is reproducible later', () => {
    const result = calculateAirs(
      input([
        observation('TOP_1', { promptId: 'a' }),
        observation('NOT_PRESENT', { promptId: 'b' }),
        observation('MENTIONED', { promptId: 'c' }),
      ]),
    )
    expect(result.inputs.observations).toBe(3)
    expect(result.inputs.recommended).toBe(1)
    expect(result.inputs.mentioned).toBe(2)
    expect(result.inputs.top1).toBe(1)
    expect(result.executionCount).toBe(3)
    expect(result.promptSetId).toBe('set-1')
  })

  it('breaks the score down into weighted components that sum to it', () => {
    const result = calculateAirs(input([observation('TOP_3')]))
    const sum = Object.values(result.components).reduce((a, c) => a + c.contribution, 0)
    expect(sum * 100).toBeCloseTo(result.score, 0)
  })

  it('scores a business recommended everywhere far above one recommended nowhere', () => {
    const winners = Array.from({ length: 20 }, (_, i) =>
      observation('TOP_1', { promptId: `p${i}`, citationReferencesBusiness: true }),
    )
    const losers = Array.from({ length: 20 }, (_, i) =>
      observation('NOT_PRESENT', { promptId: `p${i}`, competitorRecommended: true }),
    )
    const high = calculateAirs(input(winners, { attributeMatch: 1, informationCompleteness: 1, technicalDiscoverability: 1 }))
    const low = calculateAirs(input(losers, { attributeMatch: 0, informationCompleteness: 0, technicalDiscoverability: 0 }))
    expect(high.score).toBeGreaterThan(75)
    // The floor is not zero, and should not be: we did measure the full prompt set and
    // nothing false was said about the business. Every outcome component is zero, which is
    // what the customer is actually being told.
    expect(low.score).toBeLessThan(20)
    expect(low.components.recommendationRate.value).toBe(0)
    expect(low.components.top3Rate.value).toBe(0)
    expect(low.components.competitiveShare.value).toBe(0)
  })

  it('stays within 0..100 at both extremes', () => {
    expect(calculateAirs(input([])).score).toBeGreaterThanOrEqual(0)
    const perfect = calculateAirs(
      input(
        Array.from({ length: 100 }, (_, i) =>
          observation('STRONGLY_RECOMMENDED', { promptId: `p${i}`, citationReferencesBusiness: true }),
        ),
        { attributeMatch: 1, informationCompleteness: 1, technicalDiscoverability: 1 },
      ),
    )
    expect(perfect.score).toBeLessThanOrEqual(100)
  })

  it('uses the Wilson lower bound so a lucky 1-of-2 is not reported as 50%', () => {
    const tiny = calculateAirs(input([observation('TOP_1', { promptId: 'a' }), observation('NOT_PRESENT', { promptId: 'b' })]))
    expect(tiny.components.recommendationRate.value).toBeLessThan(0.3)
    expect(tiny.confidence).toBe('LOW')

    const many = calculateAirs(
      input(
        Array.from({ length: 100 }, (_, i) =>
          observation(i % 2 === 0 ? 'TOP_1' : 'NOT_PRESENT', { promptId: `p${i}` }),
        ),
      ),
    )
    // With 100 observations the lower bound has converged close to the true 50%.
    expect(many.components.recommendationRate.value).toBeGreaterThan(0.38)
    expect(many.confidence).toBe('MEDIUM')

    // HIGH confidence at a 50% rate needs a genuinely large sample; the threshold is the
    // interval width, not a round number of prompts.
    const lots = calculateAirs(
      input(
        Array.from({ length: 400 }, (_, i) =>
          observation(i % 2 === 0 ? 'TOP_1' : 'NOT_PRESENT', { promptId: `p${i}` }),
        ),
      ),
    )
    expect(lots.confidence).toBe('HIGH')
  })

  it('reports UNKNOWN confidence and a wide interval with no observations', () => {
    const result = calculateAirs(input([]))
    expect(result.confidence).toBe('UNKNOWN')
    expect(result.recommendationRateInterval).toEqual({ lower: 0, upper: 1 })
  })

  it('does not punish a business for accuracy we have not judged', () => {
    const unjudged = calculateAirs(
      input([observation('TOP_3', { accurate: null }), observation('TOP_3', { accurate: null })]),
    )
    expect(unjudged.components.entityAccuracy.value).toBe(1)
  })

  it('penalises detected misinformation', () => {
    const accurate = calculateAirs(input(Array.from({ length: 10 }, (_, i) => observation('TOP_3', { promptId: `p${i}` }))))
    const inaccurate = calculateAirs(
      input(Array.from({ length: 10 }, (_, i) => observation('TOP_3', { promptId: `p${i}`, accurate: false }))),
    )
    expect(inaccurate.score).toBeLessThan(accurate.score)
    expect(inaccurate.components.entityAccuracy.value).toBe(0)
  })

  it('measures prompt coverage against the full monitored set', () => {
    const result = calculateAirs(
      input([observation('TOP_1', { promptId: 'a' }), observation('TOP_1', { promptId: 'b' })], {
        promptSetSize: 10,
      }),
    )
    expect(result.components.promptCoverage.value).toBeCloseTo(0.2)
  })

  it('marks a score built from simulated observations as simulated', () => {
    const simulated = calculateAirs(input([observation('TOP_1', { sourceType: 'SYNTHETIC' })]))
    const real = calculateAirs(input([observation('TOP_1', { sourceType: 'OBSERVED_API' })]))
    expect(simulated.simulated).toBe(true)
    expect(real.simulated).toBe(false)
  })

  it('counts competitive share only over contested prompts', () => {
    const result = calculateAirs(
      input([
        observation('NOT_PRESENT', { promptId: 'a', competitorRecommended: true }),
        observation('TOP_1', { promptId: 'b', competitorRecommended: true }),
        observation('NOT_PRESENT', { promptId: 'c', competitorRecommended: false }),
      ]),
    )
    // Two contested prompts, we lost one.
    expect(result.components.competitiveShare.value).toBeCloseTo(0.5)
  })
})

describe('calculateShare', () => {
  it('always reports the denominator alongside every rate', () => {
    const share = calculateShare([
      observation('TOP_1'),
      observation('TOP_3'),
      observation('MENTIONED'),
      observation('NOT_PRESENT'),
    ])
    expect(share.promptsEvaluated).toBe(4)
    expect(share.recommendationCount).toBe(2)
    expect(share.recommendationRate).toBe(0.5)
    expect(share.top1Count).toBe(1)
    expect(share.mentionCount).toBe(3)
  })

  it('brackets the rate with a confidence interval', () => {
    const share = calculateShare(Array.from({ length: 20 }, (_, i) => observation(i < 5 ? 'TOP_3' : 'NOT_PRESENT')))
    expect(share.recommendationRateLower).toBeLessThan(0.25)
    expect(share.recommendationRateUpper).toBeGreaterThan(0.25)
  })

  it('handles an empty window without dividing by zero', () => {
    const share = calculateShare([])
    expect(share.recommendationRate).toBe(0)
    expect(share.confidence).toBe('UNKNOWN')
  })
})

describe('sliceObservations', () => {
  it('splits by engine and by language, because visibility differs across both', () => {
    const { byProvider, byLanguage } = sliceObservations([
      observation('TOP_1', { provider: 'gemini', language: 'en' }),
      observation('NOT_PRESENT', { provider: 'openai', language: 'he' }),
      observation('TOP_3', { provider: 'gemini', language: 'he' }),
    ])
    expect(byProvider.gemini).toHaveLength(2)
    expect(byProvider.openai).toHaveLength(1)
    expect(byLanguage.he).toHaveLength(2)
  })
})

describe('compareScores', () => {
  const base = { score: 31, formulaVersion: 'airs-v1', promptSetId: 'set-1' }

  it('reports a delta when the method and prompt set match', () => {
    const comparison = compareScores(base, { ...base, score: 39 })
    expect(comparison.comparable).toBe(true)
    expect(comparison.delta).toBe(8)
  })

  it('refuses to report a delta across formula versions', () => {
    const comparison = compareScores(base, { ...base, score: 39, formulaVersion: 'airs-v2' })
    expect(comparison.comparable).toBe(false)
    expect(comparison.delta).toBe(0)
    expect(comparison.reason).toContain('Scoring method changed')
  })

  it('refuses to report a delta across prompt sets', () => {
    const comparison = compareScores(base, { ...base, score: 39, promptSetId: 'set-2' })
    expect(comparison.comparable).toBe(false)
    expect(comparison.reason).toContain('monitored prompt set changed')
  })
})

describe('explainScore', () => {
  it('explains the score in plain language with a real denominator', () => {
    const result = calculateAirs(
      input([observation('TOP_1', { promptId: 'a' }), observation('NOT_PRESENT', { promptId: 'b' })]),
    )
    const english = explainScore(result, 'en')
    // Questions and checks are different numbers and must never be conflated.
    expect(english).toContain('2 questions')
    expect(english).toContain('2 checks in total')
    expect(english).toContain('recommended in 1')
    expect(english).not.toMatch(/entity|semantic|schema/i)
  })

  it('explains it in Hebrew too', () => {
    const result = calculateAirs(input([observation('TOP_1')]))
    expect(explainScore(result, 'he')).toMatch(/[֐-׿]/)
  })

  it('says so plainly when nothing has been measured', () => {
    expect(explainScore(calculateAirs(input([])), 'en')).toContain('have not measured')
  })
})
