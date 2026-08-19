import { describe, expect, it, vi } from 'vitest'
import { CostLedger, type BudgetAlert } from '../src/cost.ts'
import { MODEL_CATALOG, estimateCostMinor, findModel, modelByName } from '../src/pricing.ts'
import { ModelRouter, TASK_TIER } from '../src/router.ts'
import { MockAIProvider } from '../src/adapters/mock.ts'
import { rosaWorld } from './fixtures.ts'
import type { AIProvider } from '../src/types.ts'

describe('pricing', () => {
  it('prices a call in ILS minor units and never returns a fraction', () => {
    const spec = modelByName('claude-sonnet-5')!
    const cost = estimateCostMinor(spec, {
      promptTokens: 10_000,
      completionTokens: 2_000,
      searchCount: 1,
    })
    expect(Number.isInteger(cost)).toBe(true)
    expect(cost).toBeGreaterThan(0)
  })

  it('charges a frontier model materially more than a cheap one for identical usage', () => {
    const usage = { promptTokens: 50_000, completionTokens: 5_000, searchCount: 0 }
    const cheap = estimateCostMinor(modelByName('claude-haiku-4-5-20251001')!, usage)
    const strong = estimateCostMinor(modelByName('claude-opus-5')!, usage)
    expect(strong).toBeGreaterThan(cheap * 5)
  })

  it('resolves a searching model for the SEARCH tier on every provider', () => {
    for (const provider of ['openai', 'gemini', 'anthropic'] as const) {
      const spec = findModel(provider, 'SEARCH')
      expect(spec, provider).toBeDefined()
      expect(spec!.supportsSearch, provider).toBe(true)
    }
  })

  it('keeps the catalogue free of duplicate provider/tier pairs', () => {
    const seen = new Set<string>()
    for (const m of MODEL_CATALOG) {
      const key = `${m.provider}:${m.tier}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  })
})

describe('CostLedger budget enforcement', () => {
  it('refuses the call that would breach a ceiling', () => {
    const ledger = new CostLedger()
    ledger.addScope({ key: 'run:1', limitMinor: 100 })
    expect(ledger.canAfford(50)).toBe(true)
    expect(ledger.canAfford(150)).toBe(false)
    expect(() => ledger.assertAffordable(150)).toThrow(/would be exceeded/)
  })

  it('accumulates spend and reports the tightest remaining scope', async () => {
    const ledger = new CostLedger()
    ledger.addScope({ key: 'org:daily', limitMinor: 1000 })
    ledger.addScope({ key: 'run:1', limitMinor: 200 })
    await ledger.record({
      providerName: 'gemini',
      endpoint: 'generate',
      requestType: 'MEASURE',
      promptTokens: 100,
      completionTokens: 50,
      searchCount: 1,
      estimatedCostMinor: 120,
      durationMs: 10,
      status: 'SUCCEEDED',
    })
    expect(ledger.spentOn('run:1')).toBe(120)
    expect(ledger.remaining()).toBe(80)
    expect(() => ledger.assertAffordable(100)).toThrow()
  })

  it('honours spend already incurred in a previous process', () => {
    const ledger = new CostLedger()
    ledger.addScope({ key: 'org:daily', limitMinor: 1000 }, 950)
    expect(ledger.canAfford(100)).toBe(false)
    expect(ledger.remainingOn('org:daily')).toBe(50)
  })

  it('alerts once at the threshold and again on breach', async () => {
    const alerts: BudgetAlert[] = []
    const ledger = new CostLedger({ onAlert: (a) => alerts.push(a) })
    ledger.addScope({ key: 'org:daily', limitMinor: 100, alertThreshold: 0.8 })

    const spend = (minor: number) =>
      ledger.record({
        providerName: 'gemini',
        endpoint: 'generate',
        requestType: 'MEASURE',
        promptTokens: 0,
        completionTokens: 0,
        searchCount: 0,
        estimatedCostMinor: minor,
        durationMs: 1,
        status: 'SUCCEEDED',
      })

    await spend(50)
    expect(alerts).toHaveLength(0)
    await spend(35) // 85 → threshold
    expect(alerts.map((a) => a.kind)).toEqual(['THRESHOLD'])
    await spend(20) // 105 → exceeded
    expect(alerts.map((a) => a.kind)).toEqual(['THRESHOLD', 'EXCEEDED'])
  })

  it('reports a per-provider breakdown for margin analysis', async () => {
    const ledger = new CostLedger()
    for (const [provider, cost] of [
      ['gemini', 10],
      ['gemini', 15],
      ['anthropic', 40],
    ] as const) {
      await ledger.record({
        providerName: provider,
        endpoint: 'generate',
        requestType: 'ANALYZE',
        promptTokens: 100,
        completionTokens: 100,
        searchCount: 0,
        estimatedCostMinor: cost,
        durationMs: 5,
        status: 'SUCCEEDED',
      })
    }
    const breakdown = ledger.breakdown()
    expect(breakdown.gemini).toEqual({ calls: 2, costMinor: 25, tokens: 400 })
    expect(breakdown.anthropic!.costMinor).toBe(40)
    expect(ledger.totalSpentMinor()).toBe(65)
  })

  it('records failed calls so a wasted spend is still visible', async () => {
    const sink = vi.fn()
    const ledger = new CostLedger({ sink })
    await ledger.record({
      providerName: 'openai',
      endpoint: 'generate',
      requestType: 'MEASURE',
      promptTokens: 0,
      completionTokens: 0,
      searchCount: 0,
      estimatedCostMinor: 0,
      durationMs: 900,
      status: 'FAILED',
      errorCode: 'PROVIDER_TIMEOUT',
    })
    expect(sink).toHaveBeenCalledOnce()
    expect(ledger.recentRecords()[0]!.status).toBe('FAILED')
  })
})

describe('ModelRouter', () => {
  const world = rosaWorld()
  const providers = new Map<string, AIProvider>([
    ['openai', new MockAIProvider('openai', { world })],
    ['gemini', new MockAIProvider('gemini', { world })],
    ['anthropic', new MockAIProvider('anthropic', { world })],
    // oxlint-disable-next-line no-explicit-any
  ]) as any

  it('routes cheap tasks to cheap models and strategy to strong ones', () => {
    const router = new ModelRouter(providers)
    const classify = router.route({ task: 'CLASSIFY', prompt: 'label this' })
    const strategy = router.route({ task: 'STRATEGY', prompt: 'plan the quarter' })
    expect(classify.tier).toBe('CHEAP')
    expect(strategy.tier).toBe('STRONG')
    expect(strategy.estimatedCostMinor).toBeGreaterThan(classify.estimatedCostMinor)
  })

  it('maps every task type to a tier', () => {
    const router = new ModelRouter(providers)
    for (const task of Object.keys(TASK_TIER) as (keyof typeof TASK_TIER)[]) {
      expect(router.route({ task, prompt: 'x' }).model).toBeTruthy()
    }
  })

  it('only offers search-capable providers for measurement', () => {
    const router = new ModelRouter(providers)
    expect(router.measurementProviders().length).toBe(3)
    expect(router.route({ task: 'MEASURE', prompt: 'best restaurant' }).tier).toBe('SEARCH')
  })

  it('degrades an expensive task when the budget is nearly spent', () => {
    const ledger = new CostLedger()
    ledger.addScope({ key: 'run:1', limitMinor: 3 })
    const router = new ModelRouter(providers, { ledger })
    const decision = router.route({ task: 'STRATEGY', prompt: 'x'.repeat(4000) })
    expect(decision.degraded).toBe(true)
    expect(decision.tier).not.toBe('STRONG')
    expect(decision.reason).toContain('degraded')
  })

  it('never degrades a publish check, because a bad publish costs more than tokens', () => {
    const ledger = new CostLedger()
    ledger.addScope({ key: 'run:1', limitMinor: 1 })
    const router = new ModelRouter(providers, { ledger })
    const decision = router.route({ task: 'PUBLISH_CHECK', prompt: 'x'.repeat(4000) })
    expect(decision.degraded).toBe(false)
    expect(decision.tier).toBe('STRONG')
  })

  it('skips providers disabled by feature flag', () => {
    const router = new ModelRouter(providers, { disabled: ['gemini', 'openai'] })
    expect(router.available()).toEqual(['anthropic'])
    expect(router.route({ task: 'MEASURE', prompt: 'x' }).provider.id).toBe('anthropic')
  })

  it('raises a typed error when nothing is available', () => {
    const router = new ModelRouter(providers, { disabled: ['gemini', 'openai', 'anthropic'] })
    expect(() => router.route({ task: 'ANALYZE', prompt: 'x' })).toThrow(/No provider available/)
  })
})
