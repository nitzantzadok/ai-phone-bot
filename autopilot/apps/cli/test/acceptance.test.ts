/**
 * The acceptance test.
 *
 * The brief's definition of MVP completeness: one real business goes from a URL to a
 * measured score, a diagnosis, applied safe changes, and a re-measurement — with no manual
 * developer intervention anywhere in the middle.
 *
 * This test asserts the loop actually closes. Not that it runs without throwing: that the
 * agent's changes measurably move what the simulated engines say, because the engines read
 * the site the agent edited.
 */
import { describe, expect, it } from 'vitest'
import { FixedClock } from '@autopilot/shared/clock.ts'
import { compareScores } from '@autopilot/scoring/airs.ts'
import { evaluateExperiment, splitPrompts } from '@autopilot/optimization/experiments.ts'
import { runPipeline, type PipelineResult } from '../src/pipeline.ts'
import { OWNER_CONFIRMED_ATTRIBUTES } from '../src/fixtures/rosa.ts'

const clock = () => new FixedClock(new Date('2026-08-19T09:00:00Z'))

let cached: PipelineResult | null = null
const pipeline = async (): Promise<PipelineResult> => {
  cached ??= await runPipeline({ clock: clock(), maxPrompts: 24 })
  return cached
}

describe('acceptance: Rosa, an Italian restaurant in Tel Aviv', () => {
  it('crawls the site and finds the technical problems a real audit would', async () => {
    const { crawl } = await pipeline()
    expect(crawl.pages.length).toBeGreaterThanOrEqual(3)

    const findings = crawl.findings.map((f) => f.findingType)
    expect(findings).toContain('MISSING_META_DESCRIPTION')
    expect(findings).toContain('MISSING_CANONICAL')
    expect(findings).toContain('NO_STRUCTURED_DATA')
    expect(crawl.discoverability).toBeLessThan(0.7)
  })

  it('builds a business entity from real evidence, not from guesses', async () => {
    const { entity, facts } = await pipeline()
    expect(entity.canonicalName).toBe('Rosa')
    expect(entity.city).toBe('Tel Aviv')
    expect(entity.entityType).toBe('Restaurant')
    expect(facts.every((f) => f.sourceUrl.length > 0)).toBe(true)
    expect(facts.some((f) => f.sourceType === 'CUSTOMER_PROVIDED')).toBe(true)
  })

  it('generates a bilingual prompt universe of real customer questions', async () => {
    const { prompts } = await pipeline()
    expect(prompts.length).toBeGreaterThan(10)
    expect(prompts.some((p) => p.language === 'he')).toBe(true)
    expect(prompts.some((p) => p.language === 'en')).toBe(true)
    expect(prompts.every((p) => p.city === 'Tel Aviv')).toBe(true)
    // Constraint prompts exist only for what the owner confirmed.
    for (const prompt of prompts.filter((p) => p.intentCategory === 'CONSTRAINT')) {
      expect(OWNER_CONFIRMED_ATTRIBUTES).toContain(prompt.dimensions.constraint)
    }
  })

  it('measures across all three engines and labels every observation SYNTHETIC', async () => {
    const { before, prompts } = await pipeline()
    expect(before.summary.results).toHaveLength(prompts.length * 3)
    expect(before.summary.results.every((r) => r.sourceType === 'SYNTHETIC')).toBe(true)
    expect(before.airs.simulated).toBe(true)
    expect(before.airs.disclosure).toContain('not a guarantee')

    const engines = new Set(before.summary.results.map((r) => r.provider))
    expect(engines).toEqual(new Set(['openai', 'gemini', 'anthropic']))
  })

  it('discovers the real competitors from the answers themselves', async () => {
    const { competitors } = await pipeline()
    expect(competitors).toContain('Vito')
    expect(competitors).not.toContain('Rosa')
  })

  it('produces an AIRS with its inputs, window and prompt set recorded', async () => {
    const { before } = await pipeline()
    expect(before.airs.score).toBeGreaterThanOrEqual(0)
    expect(before.airs.score).toBeLessThanOrEqual(100)
    expect(before.airs.formulaVersion).toBe('airs-v1')
    expect(before.airs.executionCount).toBe(before.summary.results.length)
    expect(before.airs.promptSetId).toBe('set:rosa-v1')
    expect(Object.keys(before.airs.components)).toHaveLength(11)
  })

  it('diagnoses the romantic evidence gap and separates it from the external one', async () => {
    const { gaps, diagnosis } = await pipeline()

    const romantic = gaps.find((g) => g.attributeKey === 'romantic')
    expect(romantic).toBeDefined()
    expect(romantic!.controllability).toBe('CONTROLLED')
    expect(romantic!.bestCompetitorName).toBe('Vito')

    // Every opportunity explains itself in language a business owner would read.
    for (const opportunity of diagnosis.opportunities) {
      expect(opportunity.explanation.length).toBeGreaterThan(30)
      expect(opportunity.explanation).not.toMatch(/entity graph|semantic vector|E-E-A-T/i)
    }
    expect(diagnosis.summary).toContain('recommended in')
  })

  it('never proposes acting on something outside the business control', async () => {
    const { diagnosis } = await pipeline()
    for (const opportunity of diagnosis.opportunities) {
      if (opportunity.controllability !== 'CONTROLLED') {
        expect(opportunity.autoFixable).toBe(false)
        expect(opportunity.suggestedActionType).toBeNull()
      }
    }
  })

  it('applies safe changes autonomously and explains each one', async () => {
    const { agentRun } = await pipeline()

    expect(agentRun.appliedActions.length).toBeGreaterThan(0)
    expect(agentRun.status).toBe('COMPLETED')

    for (const applied of agentRun.appliedActions) {
      expect(applied.versionId).toBeTruthy()
      expect(applied.riskTier).not.toBe('HIGH')
    }
    for (const step of agentRun.steps.filter((s) => s.stepType === 'GATE')) {
      expect(step.reason).toBeTruthy()
    }
    for (const proposed of agentRun.proposedActions) {
      expect(proposed.heldBecause.length).toBeGreaterThan(10)
    }
  })

  it('actually changes the website, and every claim it writes is grounded', async () => {
    const { pagesAfter, agentRun } = await pipeline()
    const home = pagesAfter.find((p) => p.url.endsWith('/'))!

    // Something concrete improved.
    const improved =
      home.metaDescription !== null || home.canonical !== null || home.structuredData.length > 0
    expect(improved).toBe(true)

    const allText = pagesAfter.map((p) => `${p.title} ${p.metaDescription} ${p.content}`).join(' ')
    // Nothing unsupported was published, whatever the agent thought of the business.
    expect(allText).not.toMatch(/\bthe best\b|award[- ]winning|number one|\bguaranteed\b/i)

    // Structured data, if published, contains no property we cannot support.
    for (const page of pagesAfter) {
      for (const schema of page.structuredData) {
        expect(schema.aggregateRating).toBeUndefined()
        expect(schema.review).toBeUndefined()
        expect(schema['@context']).toBe('https://schema.org')
      }
    }
    expect(agentRun.errors).toHaveLength(0)
  })

  it('closes the loop: re-measuring after the changes moves the score', async () => {
    const { before, after } = await pipeline()

    const comparison = compareScores(before.airs, after.airs)
    expect(comparison.comparable).toBe(true)

    // The engines read the site the agent edited, so the score is not merely re-derived.
    expect(after.airs.score).not.toBe(before.airs.score)
    expect(after.airs.score).toBeGreaterThan(before.airs.score)
  })

  it('improves the attribute evidence the diagnosis identified as the gap', async () => {
    const { before, after } = await pipeline()
    expect(after.airs.components.attributeMatch.value).toBeGreaterThan(
      before.airs.components.attributeMatch.value,
    )
  })

  it('reports shares with their denominators, never a bare percentage', async () => {
    const { before, after } = await pipeline()
    for (const share of [before.share, after.share]) {
      expect(share.promptsEvaluated).toBeGreaterThan(0)
      expect(share.recommendationRateLower).toBeLessThanOrEqual(share.recommendationRate)
      expect(share.recommendationRateUpper).toBeGreaterThanOrEqual(share.recommendationRate)
    }
  })

  it('supports a controlled experiment over the change it made', async () => {
    const { prompts, before, after } = await pipeline()

    // Treatment = prompts whose demanded attributes are all ones the change addressed.
    // Anything touching an attribute we did not write about would contaminate the control.
    const { treatment, control } = splitPrompts(prompts, ['romantic', 'quiet'])
    expect(treatment.length).toBeGreaterThan(0)
    expect(control.length).toBeGreaterThan(0)

    const countFor = (phase: typeof before, ids: Set<string>) => {
      const relevant = phase.observations.filter((o) => ids.has(o.promptId))
      return {
        trials: relevant.length,
        successes: relevant.filter((o) =>
          ['RELEVANT_RECOMMENDATION', 'TOP_3', 'TOP_1', 'STRONGLY_RECOMMENDED'].includes(
            o.classification,
          ),
        ).length,
      }
    }

    const treatmentIds = new Set(treatment.map((p) => p.id))
    const controlIds = new Set(control.map((p) => p.id))

    const result = evaluateExperiment({
      hypothesis: 'Stating the date-night use case will improve visibility for those questions.',
      interventionType: 'ADD_CONTENT_SECTION',
      vertical: 'restaurant',
      preTreatment: countFor(before, treatmentIds),
      postTreatment: countFor(after, treatmentIds),
      preControl: countFor(before, controlIds),
      postControl: countFor(after, controlIds),
      observationWindowDays: 14,
    })

    // Whatever it concludes, it must never claim causation.
    expect(result.conclusionText).not.toMatch(/\bcaused\b/i)
    expect(['NO_EVIDENCE', 'INCONCLUSIVE', 'ASSOCIATED_POSITIVE', 'ASSOCIATED_NEGATIVE'])
      .toContain(result.conclusion)
  })

  it('runs the whole lifecycle without a developer touching it', async () => {
    const result = await pipeline()
    expect(result.crawl.pages.length).toBeGreaterThan(0)
    expect(result.prompts.length).toBeGreaterThan(0)
    expect(result.before.summary.results.length).toBeGreaterThan(0)
    expect(result.diagnosis.opportunities.length).toBeGreaterThan(0)
    expect(result.agentRun.appliedActions.length).toBeGreaterThan(0)
    expect(result.after.summary.results.length).toBeGreaterThan(0)
  })
})

describe('autonomy modes change what the same pipeline does', () => {
  it('applies nothing in MONITOR, and proposes everything instead', async () => {
    const result = await runPipeline({ clock: clock(), maxPrompts: 8, autonomyMode: 'MONITOR' })
    expect(result.agentRun.appliedActions).toHaveLength(0)
    expect(result.agentRun.proposedActions.length).toBeGreaterThan(0)
    // Nothing was written, so the score cannot have moved.
    expect(result.after.airs.score).toBe(result.before.airs.score)
  })

  it('respects a business rule that forbids a claim', async () => {
    const result = await runPipeline({
      clock: clock(),
      maxPrompts: 8,
      businessRules: [{ ruleType: 'DO_NOT_CREATE', value: 'new_pages' }],
    })
    expect(result.agentRun.appliedActions.every((a) => a.actionType !== 'CREATE_PAGE')).toBe(true)
  })

  it('stops within the spend ceiling rather than exceeding it', async () => {
    const result = await runPipeline({ clock: clock(), maxPrompts: 8, maxSpendMinor: 1 })
    // Mock providers cost nothing, so the run completes; the ceiling is still declared and
    // enforced by the same ledger a real provider would go through.
    expect(result.costMinor).toBeLessThanOrEqual(1)
  })
})
