import { describe, expect, it, vi } from 'vitest'
import { FixedClock } from '@autopilot/shared/clock.ts'
import { AppError } from '@autopilot/shared/errors.ts'
import type { Opportunity } from '@autopilot/optimization/diagnosis.ts'
import type { PlannedAction } from '@autopilot/optimization/actions.ts'
import type { GroundingFact } from '@autopilot/optimization/quality-gates.ts'
import { AgentBudget, DEFAULT_LIMITS } from '../src/budget.ts'
import { TOOL_SIDE_EFFECTS, ToolRegistry, isWriteTool } from '../src/tools.ts'
import { ShortTermMemory, renderBusinessMemory, renderExperience } from '../src/memory.ts'
import { assertToolAllowed, evaluateGates, runAgent, type AgentRunContext } from '../src/runtime.ts'
import { z } from 'zod'

const clock = () => new FixedClock(new Date('2026-08-19T10:00:00Z'))

const facts: GroundingFact[] = [
  { id: 'f1', factKind: 'business_name', value: 'Rosa', confidence: 'HIGH' },
  { id: 'f2', factKind: 'attribute', value: 'romantic', confidence: 'HIGH', attributeKey: 'romantic' },
]

const context = (overrides: Partial<AgentRunContext> = {}): AgentRunContext => ({
  organizationId: 'org-1',
  businessId: 'biz-1',
  vertical: 'restaurant',
  autonomyMode: 'AUTOPILOT',
  businessRules: [],
  facts,
  language: 'en',
  ...overrides,
})

const opportunity = (o: Partial<Opportunity & { dismissed: boolean }> = {}): Opportunity & { dismissed?: boolean } => ({
  dedupeKey: 'attribute-gap:romantic',
  title: 'AI does not associate you with Romantic',
  explanation: 'Twelve monitored questions depend on it.',
  category: 'CONTENT',
  controllability: 'CONTROLLED',
  riskTier: 'LOW',
  businessValue: 0.8,
  promptReach: 12,
  recommendationGap: 0.7,
  expectedLift: 0.3,
  confidence: 0.7,
  controllabilityFactor: 1,
  estimatedCost: 1,
  score: 2.5,
  evidence: {},
  attributeKey: 'romantic',
  autoFixable: true,
  suggestedActionType: 'ADD_CONTENT_SECTION',
  ...o,
})

const action = (o: Partial<PlannedAction> = {}): PlannedAction => ({
  actionType: 'ADD_CONTENT_SECTION',
  category: 'CONTENT',
  riskTier: 'LOW',
  summary: 'Describe the room as suitable for a quiet dinner',
  rationale: 'Your confirmed information supports it and your site never says it.',
  expectedImpact: 0.3,
  targetUrl: 'https://rosa.example.com/',
  payload: {},
  text: 'Rosa offers a quiet room suitable for a relaxed dinner in Tel Aviv.',
  assertedAttributes: ['romantic'],
  language: 'en',
  ...o,
})

describe('AgentBudget', () => {
  it('reports which ceiling stopped it, rather than just failing', () => {
    const budget = new AgentBudget({ ...DEFAULT_LIMITS, maxIterations: 2 }, clock())
    budget.startIteration()
    expect(budget.check()).toBeNull()
    budget.startIteration()
    expect(budget.check()).toBe('MAX_ITERATIONS')
  })

  it('enforces every ceiling independently', () => {
    const spend = new AgentBudget({ ...DEFAULT_LIMITS, maxSpendMinor: 100 }, clock())
    spend.recordToolCall({ spendMinor: 100 })
    expect(spend.check()).toBe('MAX_SPEND')

    const tokens = new AgentBudget({ ...DEFAULT_LIMITS, maxTokens: 1000 }, clock())
    tokens.recordToolCall({ tokens: 1000 })
    expect(tokens.check()).toBe('MAX_TOKENS')

    const publishes = new AgentBudget({ ...DEFAULT_LIMITS, maxPublishOperations: 1 }, clock())
    publishes.recordToolCall({ published: true })
    expect(publishes.check()).toBe('MAX_PUBLISHES')

    const calls = new AgentBudget({ ...DEFAULT_LIMITS, maxToolCalls: 1 }, clock())
    calls.recordToolCall({})
    expect(calls.check()).toBe('MAX_TOOL_CALLS')
  })

  it('enforces wall-clock time', () => {
    const time = clock()
    const budget = new AgentBudget({ ...DEFAULT_LIMITS, maxWallClockMs: 1000 }, time)
    expect(budget.check()).toBeNull()
    time.advance(1001)
    expect(budget.check()).toBe('MAX_TIME')
  })

  it('refuses a step that WOULD breach a ceiling, not just one that has', () => {
    const budget = new AgentBudget({ ...DEFAULT_LIMITS, maxSpendMinor: 100 }, clock())
    budget.recordToolCall({ spendMinor: 80 })
    expect(budget.check()).toBeNull()
    expect(budget.canAfford({ spendMinor: 50 })).toBe('MAX_SPEND')
    expect(budget.canAfford({ spendMinor: 10 })).toBeNull()
  })

  it('ships ceilings tight enough to catch a runaway on every axis', () => {
    // Publishes and spend are the ceilings that protect the customer and the margin.
    expect(DEFAULT_LIMITS.maxPublishOperations).toBeLessThanOrEqual(15)
    expect(DEFAULT_LIMITS.maxIterations).toBeLessThanOrEqual(30)
    expect(DEFAULT_LIMITS.maxToolCalls).toBeLessThanOrEqual(100)
    expect(DEFAULT_LIMITS.maxWallClockMs).toBeLessThanOrEqual(15 * 60 * 1000)
    expect(DEFAULT_LIMITS.maxSpendMinor).toBeLessThanOrEqual(5000)
  })
})

describe('tool registry', () => {
  const tool = (name: string, sideEffect: 'READ' | 'PUBLISH') => ({
    name,
    description: 'test',
    sideEffect,
    inputSchema: z.object({}),
    estimatedCostMinor: 0,
    handler: async () => ({}),
  })

  it('refuses a tool that has not been classified', () => {
    const registry = new ToolRegistry()
    expect(() => registry.register(tool('sneakyNewTool', 'READ'))).toThrow(/not classified/)
  })

  it('refuses a tool whose declared side effect contradicts its classification', () => {
    const registry = new ToolRegistry()
    expect(() => registry.register(tool('publishPage', 'READ'))).toThrow(/declares side effect/)
  })

  it('exposes no write tools in read-only modes', () => {
    const registry = new ToolRegistry()
    registry.register(tool('crawlWebsite', 'READ'))
    registry.register(tool('publishPage', 'PUBLISH'))

    expect(registry.availableFor('MONITOR')).toEqual(['crawlWebsite'])
    expect(registry.availableFor('RECOMMEND')).toEqual(['crawlWebsite'])
    expect(registry.availableFor('AUTOPILOT')).toContain('publishPage')
  })

  it('has no shell, HTTP or delete tool in its vocabulary', () => {
    const names = Object.keys(TOOL_SIDE_EFFECTS).join(' ').toLowerCase()
    expect(names).not.toMatch(/shell|exec|command|fetchurl|httprequest|deletepage|dropdatabase/)
  })

  it('classifies exactly the three write tools as writes', () => {
    const writes = Object.keys(TOOL_SIDE_EFFECTS).filter(isWriteTool)
    expect(writes.sort()).toEqual(['publishPage', 'rollbackChange', 'updateBusinessProfile'])
  })
})

describe('assertToolAllowed', () => {
  it('blocks a write tool outside a writing mode', () => {
    expect(() => assertToolAllowed('publishPage', 'MONITOR')).toThrow()
    expect(() => assertToolAllowed('publishPage', 'RECOMMEND')).toThrow()
    expect(() => assertToolAllowed('publishPage', 'AUTOPILOT')).not.toThrow()
    expect(() => assertToolAllowed('crawlWebsite', 'MONITOR')).not.toThrow()
  })
})

describe('the gate chain', () => {
  it('passes a grounded, low-risk change in autopilot', () => {
    const gate = evaluateGates(action(), opportunity(), context())
    expect(gate.canApply).toBe(true)
    expect(gate.qualityGate!.passed).toBe(true)
  })

  it('refuses to act on an uncontrollable gap, and says why', () => {
    const gate = evaluateGates(
      action(),
      opportunity({ controllability: 'NOT_CONTROLLED' }),
      context(),
    )
    expect(gate.canApply).toBe(false)
    expect(gate.requiresApproval).toBe(false)
    expect(gate.reason).toContain('outside your website')
  })

  it('lets a business rule override even a perfect change', () => {
    const gate = evaluateGates(
      action({ text: 'Rosa is a luxury dining room in Tel Aviv with a quiet atmosphere.' }),
      opportunity(),
      context({ businessRules: [{ ruleType: 'DO_NOT_CLAIM', value: 'luxury' }] }),
    )
    expect(gate.canApply).toBe(false)
    expect(gate.reason).toContain('luxury')
  })

  it('blocks an ungrounded claim before any risk assessment happens', () => {
    const gate = evaluateGates(
      action({ text: 'Rosa has a beautiful garden terrace for outdoor dining.', assertedAttributes: ['outdoor_seating'] }),
      opportunity(),
      context(),
    )
    expect(gate.canApply).toBe(false)
    expect(gate.requiresApproval).toBe(true)
    expect(gate.qualityGate!.passed).toBe(false)
  })

  it('holds a medium-risk change in AUTO_SAFE but applies it in AUTOPILOT', () => {
    const medium = action({ riskTier: 'MEDIUM' })
    expect(evaluateGates(medium, opportunity(), context({ autonomyMode: 'AUTO_SAFE' })).canApply).toBe(false)
    expect(evaluateGates(medium, opportunity(), context({ autonomyMode: 'AUTOPILOT' })).canApply).toBe(true)
  })

  it('never applies a high-risk change, in any mode', () => {
    for (const mode of ['MONITOR', 'RECOMMEND', 'AUTO_SAFE', 'AUTOPILOT'] as const) {
      const gate = evaluateGates(action({ riskTier: 'HIGH' }), opportunity(), context({ autonomyMode: mode }))
      expect(gate.canApply, mode).toBe(false)
    }
    expect(evaluateGates(action({ riskTier: 'HIGH' }), opportunity(), context()).reason)
      .toContain('always need your explicit approval')
  })

  it('applies nothing at all in MONITOR or RECOMMEND', () => {
    for (const mode of ['MONITOR', 'RECOMMEND'] as const) {
      expect(evaluateGates(action(), opportunity(), context({ autonomyMode: mode })).canApply).toBe(false)
    }
  })

  it('honours a blanket approval requirement even for a passing change', () => {
    const gate = evaluateGates(
      action(),
      opportunity(),
      context({ businessRules: [{ ruleType: 'APPROVAL_REQUIRED', value: 'all_changes' }] }),
    )
    expect(gate.canApply).toBe(false)
    expect(gate.requiresApproval).toBe(true)
    expect(gate.reason).toContain('review changes of this kind')
  })

  it('does not run content gates on a change with no customer-visible text', () => {
    const gate = evaluateGates(
      action({ text: undefined, assertedAttributes: undefined, actionType: 'FIX_CANONICAL' }),
      opportunity(),
      context(),
    )
    expect(gate.canApply).toBe(true)
    expect(gate.qualityGate).toBeUndefined()
  })
})

describe('runAgent', () => {
  const applier = vi.fn(async () => ({ versionId: 'ver-1', published: true }))

  it('applies passing changes and proposes the rest, explaining each', async () => {
    const result = await runAgent({
      context: context(),
      opportunities: [
        opportunity(),
        opportunity({ dedupeKey: 'external', controllability: 'NOT_CONTROLLED', autoFixable: false }),
      ],
      planner: (o) => action({ targetUrl: `https://rosa.example.com/${o.dedupeKey}` }),
      applier,
      clock: clock(),
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.appliedActions).toHaveLength(1)
    expect(result.proposedActions).toHaveLength(1)
    expect(result.proposedActions[0]!.heldBecause).toContain('outside your website')
    expect(result.summary).toContain('Applied 1 change')
  })

  it('records a reason for every decision and gate', async () => {
    const result = await runAgent({
      context: context(),
      opportunities: [opportunity()],
      planner: () => action(),
      applier,
      clock: clock(),
    })
    const reasoned = result.steps.filter((s) => s.stepType === 'DECISION' || s.stepType === 'GATE')
    expect(reasoned.length).toBeGreaterThan(0)
    for (const step of reasoned) expect(step.reason).toBeTruthy()
  })

  it('stops at the iteration ceiling without leaving work half-applied', async () => {
    const result = await runAgent({
      context: context(),
      opportunities: Array.from({ length: 20 }, (_, i) => opportunity({ dedupeKey: `o-${i}` })),
      planner: (o) => action({ targetUrl: `https://rosa.example.com/${o.dedupeKey}` }),
      applier,
      limits: { ...DEFAULT_LIMITS, maxIterations: 3 },
      clock: clock(),
    })

    expect(result.stopReason).toBe('MAX_ITERATIONS')
    expect(result.status).toBe('STOPPED_LIMIT')
    expect(result.appliedActions.length).toBeLessThanOrEqual(3)
    expect(result.steps.some((s) => s.stepType === 'LIMIT')).toBe(true)
  })

  it('stops before publishing once the publish ceiling would be breached', async () => {
    const result = await runAgent({
      context: context(),
      opportunities: Array.from({ length: 10 }, (_, i) => opportunity({ dedupeKey: `o-${i}` })),
      // Distinct pages, so the duplicate-write guard does not mask the ceiling.
      planner: (o) => action({ targetUrl: `https://rosa.example.com/${o.dedupeKey}` }),
      applier,
      limits: { ...DEFAULT_LIMITS, maxPublishOperations: 2 },
      clock: clock(),
    })
    expect(result.appliedActions).toHaveLength(2)
    expect(result.stopReason).toBe('MAX_PUBLISHES')
  })

  it('does not write the same change to the same page twice in one run', async () => {
    const spy = vi.fn(async () => ({ versionId: 'v', published: true }))
    const result = await runAgent({
      context: context(),
      // Two findings that both suggest the same fix on the same page.
      opportunities: [opportunity({ dedupeKey: 'missing-summary' }), opportunity({ dedupeKey: 'long-title' })],
      planner: () => action({ actionType: 'FIX_METADATA', targetUrl: 'https://rosa.example.com/' }),
      applier: spy,
      clock: clock(),
    })
    expect(spy).toHaveBeenCalledOnce()
    expect(result.appliedActions).toHaveLength(1)
    expect(result.steps.some((s) => s.reason?.includes('skipping the duplicate'))).toBe(true)
  })

  it('applies nothing in MONITOR mode, however attractive the opportunities', async () => {
    const spy = vi.fn(async () => ({ versionId: 'v', published: true }))
    const result = await runAgent({
      context: context({ autonomyMode: 'MONITOR' }),
      opportunities: [opportunity(), opportunity({ dedupeKey: 'b' })],
      planner: (o) => action({ targetUrl: `https://rosa.example.com/${o.dedupeKey}` }),
      applier: spy,
      clock: clock(),
    })
    expect(spy).not.toHaveBeenCalled()
    expect(result.appliedActions).toHaveLength(0)
    expect(result.proposedActions).toHaveLength(2)
  })

  it('records a failed change as failed rather than as done', async () => {
    const failing = vi.fn(async () => {
      throw new AppError({ code: 'PROVIDER_ERROR', message: 'connector down' })
    })
    const result = await runAgent({
      context: context(),
      opportunities: [opportunity()],
      planner: () => action(),
      applier: failing,
      clock: clock(),
    })
    expect(result.appliedActions).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.steps.some((s) => s.stepType === 'ERROR')).toBe(true)
  })

  it('proposes rather than guesses when no grounded change can be built', async () => {
    const result = await runAgent({
      context: context(),
      opportunities: [opportunity()],
      planner: () => null,
      applier,
      clock: clock(),
    })
    expect(result.appliedActions).toHaveLength(0)
    expect(result.proposedActions[0]!.heldBecause).toContain('needs a person')
  })

  it('skips opportunities the customer dismissed', async () => {
    const spy = vi.fn(async () => ({ versionId: 'v', published: true }))
    const result = await runAgent({
      context: context(),
      opportunities: [opportunity({ dismissed: true })],
      planner: () => action(),
      applier: spy,
      clock: clock(),
    })
    expect(spy).not.toHaveBeenCalled()
    expect(result.stopReason).toBe('NO_WORK')
  })

  it('honours cancellation mid-run', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await runAgent({
      context: context(),
      opportunities: [opportunity()],
      planner: () => action(),
      applier,
      signal: controller.signal,
      clock: clock(),
    })
    expect(result.status).toBe('CANCELED')
  })

  it('reports NO_WORK plainly when there is nothing to do', async () => {
    const result = await runAgent({
      context: context(),
      opportunities: [],
      planner: () => action(),
      applier,
      clock: clock(),
    })
    expect(result.stopReason).toBe('NO_WORK')
    expect(result.summary).toBe('Nothing needed changing this cycle.')
  })

  it('does controllable work before anything else', async () => {
    const order: string[] = []
    await runAgent({
      context: context(),
      opportunities: [
        opportunity({ dedupeKey: 'external', controllability: 'NOT_CONTROLLED', autoFixable: false, score: 99 }),
        opportunity({ dedupeKey: 'ours', score: 1 }),
      ],
      planner: (o) => {
        order.push(o.dedupeKey)
        return action()
      },
      applier,
      clock: clock(),
    })
    expect(order[0]).toBe('ours')
  })

  it('summarises in Hebrew for a Hebrew customer', async () => {
    const result = await runAgent({
      context: context({ language: 'he' }),
      opportunities: [opportunity()],
      planner: () => action(),
      applier,
      clock: clock(),
    })
    expect(result.summary).toMatch(/[֐-׿]/)
  })
})

describe('agent memory', () => {
  it('keeps run state separate and bounded', () => {
    const memory = new ShortTermMemory()
    for (let i = 0; i < 50; i++) {
      memory.nextStep()
      memory.observe('crawlWebsite', `page ${i}`, new Date())
    }
    expect(memory.render(5).split('\n')).toHaveLength(5)
  })

  it('excludes low-confidence facts from what the agent is told', () => {
    const rendered = renderBusinessMemory({
      businessName: 'Rosa',
      vertical: 'restaurant',
      city: 'Tel Aviv',
      facts: [
        { factKind: 'phone', value: '03-1234567', confidence: 'HIGH', source: 'website' },
        { factKind: 'awards', value: 'Best of 2025', confidence: 'LOW', source: 'guess' },
      ],
      confirmedAttributes: ['romantic'],
      constraints: [{ ruleType: 'DO_NOT_CLAIM', value: 'luxury' }],
      pastChanges: [],
      automationMode: 'AUTOPILOT',
    })
    expect(rendered).toContain('03-1234567')
    expect(rendered).not.toContain('Best of 2025')
    expect(rendered).toContain('DO_NOT_CLAIM')
  })

  it('says it does not know rather than inventing a heuristic', () => {
    expect(renderExperience([])).toContain('No intervention outcome data yet')
    expect(
      renderExperience([
        { interventionType: 'ADD_SCHEMA', vertical: 'restaurant', recommendation: 'INSUFFICIENT_DATA', experimentCount: 2 },
      ]),
    ).toContain('Not enough experiment data')
  })

  it('reports what the experiments actually showed', () => {
    const rendered = renderExperience([
      { interventionType: 'ADD_CONTENT_SECTION', vertical: 'restaurant', recommendation: 'PREFER', experimentCount: 12 },
    ])
    expect(rendered).toContain('ADD_CONTENT_SECTION: PREFER')
  })
})
