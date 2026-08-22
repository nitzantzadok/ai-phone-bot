import { describe, expect, it } from 'vitest'
import type { EvidenceGap } from '@autopilot/knowledge/evidence.ts'
import type { TechnicalFinding } from '@autopilot/crawler/audit.ts'
import { diagnose, scoreOpportunity, topOpportunities, type PromptOutcome } from '../src/diagnosis.ts'
import { buildSchema, planAction, type PlanningContext } from '../src/actions.ts'
import {
  MIN_TRIALS_PER_ARM,
  evaluateExperiment,
  splitPrompts,
  summarizeIntervention,
} from '../src/experiments.ts'
import type { GroundingFact } from '../src/quality-gates.ts'

const outcome = (o: Partial<PromptOutcome> = {}): PromptOutcome => ({
  promptId: `p-${Math.random()}`,
  recommended: false,
  competitorRecommended: true,
  requiredAttributes: [],
  promptScore: 0.7,
  difficulty: 0.5,
  ...o,
})

const romanticGap: EvidenceGap = {
  attributeKey: 'romantic',
  attributeLabel: 'Romantic',
  ourStrength: 0.1,
  bestCompetitorStrength: 0.9,
  bestCompetitorName: 'Vito',
  gap: 0.8,
  controllability: 'CONTROLLED',
  affectedPromptCount: 12,
  reason: 'You confirmed this is true of your business, but your website never says so.',
}

const externalGap: EvidenceGap = {
  ...romanticGap,
  attributeKey: 'upscale',
  attributeLabel: 'Upscale',
  controllability: 'NOT_CONTROLLED',
  reason: 'Vito is corroborated by independent sources we cannot create. External authority gap.',
}

const finding = (o: Partial<TechnicalFinding> = {}): TechnicalFinding => ({
  findingType: 'MISSING_META_DESCRIPTION',
  severity: 'MEDIUM',
  url: 'https://rosa.example.com/menu',
  detail: 'no meta description',
  plainLanguage: 'This page has no short summary for AI systems to read.',
  plainLanguageHe: 'לעמוד הזה אין תיאור קצר שמערכות AI יכולות לקרוא.',
  confidence: 1,
  autoFixable: true,
  ...o,
})

describe('scoreOpportunity', () => {
  const base = {
    businessValue: 0.7,
    promptReach: 10,
    recommendationGap: 0.8,
    expectedLift: 0.3,
    confidence: 0.7,
    controllabilityFactor: 1,
    estimatedCost: 1,
  }

  it('rises with reach, gap and expected lift', () => {
    expect(scoreOpportunity({ ...base, promptReach: 40 })).toBeGreaterThan(scoreOpportunity(base))
    expect(scoreOpportunity({ ...base, recommendationGap: 1 })).toBeGreaterThan(scoreOpportunity(base))
  })

  it('falls with cost and with lower controllability', () => {
    expect(scoreOpportunity({ ...base, estimatedCost: 3 })).toBeLessThan(scoreOpportunity(base))
    expect(scoreOpportunity({ ...base, controllabilityFactor: 0.15 })).toBeLessThan(
      scoreOpportunity(base) / 3,
    )
  })

  it('damps reach so one broad finding cannot crowd out everything specific', () => {
    const wide = scoreOpportunity({ ...base, promptReach: 100 })
    const narrow = scoreOpportunity({ ...base, promptReach: 25 })
    expect(wide / narrow).toBeLessThan(3)
  })

  it('is zero when the gap is zero', () => {
    expect(scoreOpportunity({ ...base, recommendationGap: 0 })).toBe(0)
  })
})

describe('diagnose', () => {
  const input = {
    prompts: [],
    outcomes: [
      outcome({ requiredAttributes: ['romantic'] }),
      outcome({ requiredAttributes: ['romantic'] }),
      outcome({ recommended: true, requiredAttributes: [] }),
    ],
    evidenceGaps: [romanticGap],
    technicalFindings: [finding(), finding({ url: 'https://rosa.example.com/about' })],
    missingPageTypes: ['faq'],
    factConflicts: [{ factKind: 'phone', values: [{ value: '03-1234567' }, { value: '03-7654321' }] }],
    vertical: 'restaurant',
  }

  it('produces opportunities from every diagnostic source', () => {
    const diagnosis = diagnose(input)
    const keys = diagnosis.opportunities.map((o) => o.dedupeKey)
    expect(keys).toContain('attribute-gap:romantic')
    expect(keys).toContain('technical:MISSING_META_DESCRIPTION')
    expect(keys).toContain('missing-page:faq')
    expect(keys).toContain('conflict:phone')
  })

  it('reports the recommendation rate it diagnosed from', () => {
    const diagnosis = diagnose(input)
    expect(diagnosis.recommendationRate).toBeCloseTo(1 / 3)
    expect(diagnosis.lostPromptCount).toBe(2)
  })

  it('explains every opportunity in plain language, with the numbers behind it', () => {
    const diagnosis = diagnose(input)
    const gap = diagnosis.opportunities.find((o) => o.dedupeKey === 'attribute-gap:romantic')!
    expect(gap.explanation).toContain('12 of the 3 questions')
    expect(gap.explanation).toContain('Vito')
    expect(gap.explanation).not.toMatch(/entity graph|semantic|schema markup/i)
  })

  it('attaches the evidence that produced each opportunity', () => {
    const diagnosis = diagnose(input)
    const gap = diagnosis.opportunities.find((o) => o.dedupeKey === 'attribute-gap:romantic')!
    expect(gap.evidence.competitor).toBe('Vito')
    expect(gap.evidence.lostPrompts).toBe(2)
  })

  it('labels an uncontrollable gap honestly and never marks it auto-fixable', () => {
    const diagnosis = diagnose({ ...input, evidenceGaps: [externalGap] })
    const gap = diagnosis.opportunities.find((o) => o.dedupeKey === 'attribute-gap:upscale')!
    expect(gap.controllability).toBe('NOT_CONTROLLED')
    expect(gap.autoFixable).toBe(false)
    expect(gap.suggestedActionType).toBeNull()
    expect(gap.title).toContain('External authority gap')
    expect(diagnosis.externalAuthorityGapCount).toBe(1)
  })

  it('never marks a conflicting business detail auto-fixable, because only the owner knows', () => {
    const diagnosis = diagnose(input)
    const conflict = diagnosis.opportunities.find((o) => o.dedupeKey === 'conflict:phone')!
    expect(conflict.autoFixable).toBe(false)
  })

  it('ranks work we can actually do ahead of work that needs a human', () => {
    const diagnosis = diagnose({ ...input, evidenceGaps: [romanticGap, externalGap] })
    const top = topOpportunities(diagnosis.opportunities, 10)
    const lastAutoFixable = top.map((o) => o.autoFixable).lastIndexOf(true)
    const firstManual = top.map((o) => o.autoFixable).indexOf(false)
    expect(lastAutoFixable).toBeLessThan(firstManual)
    expect(top[0]!.autoFixable).toBe(true)
    // The uncontrollable gap is surfaced, but never at the top of the list.
    const external = top.findIndex((o) => o.controllability === 'NOT_CONTROLLED')
    expect(external).toBeGreaterThan(0)
  })

  it('summarises in plain English and in Hebrew', () => {
    expect(diagnose(input).summary).toContain('recommended in 1 of 3')
    expect(diagnose({ ...input, language: 'he' }).summary).toMatch(/[֐-׿]/)
  })

  it('says so plainly when nothing has been measured', () => {
    const empty = diagnose({ ...input, outcomes: [], evidenceGaps: [], technicalFindings: [], missingPageTypes: [], factConflicts: [] })
    expect(empty.summary).toContain('No measurements')
    expect(empty.opportunities).toHaveLength(0)
  })

  it('ignores a missing page type that the vertical does not expect', () => {
    const diagnosis = diagnose({ ...input, missingPageTypes: ['careers'] })
    expect(diagnosis.opportunities.some((o) => o.dedupeKey === 'missing-page:careers')).toBe(false)
  })
})

describe('planAction', () => {
  const facts: GroundingFact[] = [
    { id: 'f1', factKind: 'business_name', value: 'Rosa', confidence: 'HIGH' },
    { id: 'f2', factKind: 'phone', value: '03-1234567', confidence: 'HIGH' },
    { id: 'f3', factKind: 'cuisine', value: 'Italian', confidence: 'HIGH' },
    { id: 'f4', factKind: 'attribute', value: 'romantic', confidence: 'HIGH', attributeKey: 'romantic' },
  ]

  const context: PlanningContext = {
    vertical: 'restaurant',
    businessName: 'Rosa',
    city: 'Tel Aviv',
    language: 'en',
    facts,
    homeUrl: 'https://rosa.example.com/',
    pages: [
      { url: 'https://rosa.example.com/', pageType: 'home', title: null },
      { url: 'https://rosa.example.com/menu', pageType: 'menu', title: 'Menu' },
    ],
  }

  const diagnosis = diagnose({
    prompts: [],
    outcomes: [outcome({ requiredAttributes: ['romantic'] })],
    evidenceGaps: [romanticGap],
    technicalFindings: [finding({ findingType: 'MISSING_TITLE', severity: 'HIGH' })],
    missingPageTypes: [],
    factConflicts: [{ factKind: 'phone', values: [{ value: 'a' }, { value: 'b' }] }],
    vertical: 'restaurant',
  })

  const find = (key: string) => diagnosis.opportunities.find((o) => o.dedupeKey === key)!

  it('builds a metadata fix from confirmed facts only', () => {
    const action = planAction(find('technical:MISSING_TITLE'), context)!
    expect(action.actionType).toBe('FIX_METADATA')
    expect(action.riskTier).toBe('LOW')
    expect(action.payload.title).toContain('Rosa')
    expect(action.payload.title).toContain('Tel Aviv')
    expect(String(action.payload.title).length).toBeLessThanOrEqual(60)
    expect(action.text).not.toMatch(/best|leading|award/i)
  })

  it('builds an attribute section only when a confirmed fact backs it', () => {
    const action = planAction(find('attribute-gap:romantic'), context)!
    expect(action.actionType).toBe('ADD_CONTENT_SECTION')
    expect(action.assertedAttributes).toEqual(['romantic'])
    expect(action.riskTier).toBe('MEDIUM')
    expect(action.text).toContain('Rosa')
  })

  it('refuses to write about an attribute with no confirmed fact', () => {
    const withoutFact = { ...context, facts: facts.filter((f) => f.attributeKey !== 'romantic') }
    expect(planAction(find('attribute-gap:romantic'), withoutFact)).toBeNull()
  })

  it('never plans an action for an uncontrollable gap', () => {
    const external = diagnose({
      prompts: [],
      outcomes: [outcome({ requiredAttributes: ['upscale'] })],
      evidenceGaps: [externalGap],
      technicalFindings: [],
      missingPageTypes: [],
      factConflicts: [],
      vertical: 'restaurant',
    })
    expect(planAction(external.opportunities[0]!, context)).toBeNull()
  })

  it('leaves a conflicting business detail for the owner', () => {
    expect(planAction(find('conflict:phone'), context)).toBeNull()
  })

  it('writes the Hebrew variant in Hebrew', () => {
    const action = planAction(find('attribute-gap:romantic'), { ...context, language: 'he' })!
    expect(action.text).toMatch(/[֐-׿]/)
  })
})

describe('buildSchema', () => {
  const context: PlanningContext = {
    vertical: 'restaurant',
    businessName: 'Rosa',
    city: 'Tel Aviv',
    language: 'en',
    facts: [
      { id: 'f1', factKind: 'business_name', value: 'Rosa', confidence: 'HIGH' },
      { id: 'f2', factKind: 'phone', value: '03-1234567', confidence: 'HIGH' },
    ],
    homeUrl: 'https://rosa.example.com/',
    pages: [],
  }

  it('emits only properties backed by a fact', () => {
    const schema = buildSchema(context)!
    expect(schema.name).toBe('Rosa')
    expect(schema.telephone).toBe('03-1234567')
    expect(schema.priceRange).toBeUndefined()
    expect(schema.servesCuisine).toBeUndefined()
    expect(schema.aggregateRating).toBeUndefined()
  })

  it('returns null without a business name', () => {
    expect(buildSchema({ ...context, businessName: '', facts: [] })).toBeNull()
  })
})

describe('experiments', () => {
  const arm = (successes: number, trials: number) => ({ successes, trials })

  it('offers no conclusion below the minimum sample per arm', () => {
    const result = evaluateExperiment({
      hypothesis: 'h',
      interventionType: 'ADD_CONTENT_SECTION',
      vertical: 'restaurant',
      preTreatment: arm(1, 4),
      postTreatment: arm(3, 4),
      preControl: arm(1, 4),
      postControl: arm(1, 4),
      observationWindowDays: 14,
    })
    expect(result.conclusion).toBe('NO_EVIDENCE')
    expect(result.sufficientData).toBe(false)
    expect(result.conclusionText).toContain('not enough data')
  })

  it('calls a small swing inconclusive rather than a win', () => {
    const result = evaluateExperiment({
      hypothesis: 'h',
      interventionType: 'ADD_CONTENT_SECTION',
      vertical: 'restaurant',
      preTreatment: arm(3, MIN_TRIALS_PER_ARM + 2),
      postTreatment: arm(5, MIN_TRIALS_PER_ARM + 2),
      preControl: arm(3, MIN_TRIALS_PER_ARM + 2),
      postControl: arm(3, MIN_TRIALS_PER_ARM + 2),
      observationWindowDays: 14,
    })
    expect(result.conclusion).toBe('INCONCLUSIVE')
    expect(result.conclusionText).toContain('cannot say the change was responsible')
  })

  it('reports a large, significant improvement as an association, never as a cause', () => {
    const result = evaluateExperiment({
      hypothesis: 'Adding a date-night section will improve visibility',
      interventionType: 'ADD_CONTENT_SECTION',
      vertical: 'restaurant',
      preTreatment: arm(10, 100),
      postTreatment: arm(45, 100),
      preControl: arm(20, 100),
      postControl: arm(22, 100),
      observationWindowDays: 14,
    })
    expect(result.conclusion).toBe('ASSOCIATED_POSITIVE')
    expect(result.conclusionText).toContain('associated with')
    expect(result.conclusionText).not.toMatch(/\bcaused\b/i)
    expect(result.adjustedDelta).toBeCloseTo(0.33, 2)
  })

  it('subtracts control movement, so a market-wide rise is not claimed as our win', () => {
    const result = evaluateExperiment({
      hypothesis: 'h',
      interventionType: 'ADD_SCHEMA',
      vertical: 'restaurant',
      preTreatment: arm(10, 100),
      postTreatment: arm(40, 100),
      preControl: arm(10, 100),
      postControl: arm(40, 100),
      observationWindowDays: 14,
    })
    expect(result.adjustedDelta).toBe(0)
    expect(result.confounders.some((c) => c.includes('Control prompts moved'))).toBe(true)
    expect(result.conclusionText).toContain('association rather than a proven cause')
  })

  it('flags a decline as an associated negative', () => {
    const result = evaluateExperiment({
      hypothesis: 'h',
      interventionType: 'CREATE_PAGE',
      vertical: 'restaurant',
      preTreatment: arm(45, 100),
      postTreatment: arm(10, 100),
      preControl: arm(20, 100),
      postControl: arm(21, 100),
      observationWindowDays: 14,
    })
    expect(result.conclusion).toBe('ASSOCIATED_NEGATIVE')
  })
})

describe('splitPrompts', () => {
  const prompts = [
    { id: 'a', requiredAttributes: ['romantic'] },
    { id: 'b', requiredAttributes: ['romantic', 'quiet'] },
    { id: 'c', requiredAttributes: [] },
    { id: 'd', requiredAttributes: ['kosher'] },
  ]

  it('excludes contaminated prompts rather than assigning them', () => {
    const { treatment, control, excluded } = splitPrompts(prompts, ['romantic'])
    expect(treatment.map((p) => p.id)).toEqual(['a'])
    expect(control.map((p) => p.id)).toEqual(['c', 'd'])
    expect(excluded.map((p) => p.id)).toEqual(['b'])
  })
})

describe('summarizeIntervention', () => {
  it('refuses to have an opinion until enough experiments exist', () => {
    const evidence = summarizeIntervention(
      [{ conclusion: 'ASSOCIATED_POSITIVE', adjustedDelta: 0.2 }],
      'ADD_SCHEMA',
      'restaurant',
    )
    expect(evidence.recommendation).toBe('INSUFFICIENT_DATA')
  })

  it('prefers an intervention with a consistent record', () => {
    const evidence = summarizeIntervention(
      Array.from({ length: 12 }, () => ({ conclusion: 'ASSOCIATED_POSITIVE' as const, adjustedDelta: 0.15 })),
      'ADD_CONTENT_SECTION',
      'restaurant',
    )
    expect(evidence.recommendation).toBe('PREFER')
    expect(evidence.successRateLower).toBeGreaterThan(0.6)
  })

  it('avoids an intervention that consistently fails', () => {
    const evidence = summarizeIntervention(
      Array.from({ length: 12 }, () => ({ conclusion: 'ASSOCIATED_NEGATIVE' as const, adjustedDelta: -0.1 })),
      'CREATE_PAGE',
      'restaurant',
    )
    expect(evidence.recommendation).toBe('AVOID')
  })
})
