import { describe, expect, it, vi } from 'vitest'
import { FixedClock } from '@autopilot/shared/clock.ts'
import { AppError } from '@autopilot/shared/errors.ts'
import { CostLedger } from '@autopilot/providers/cost.ts'
import { MockAIProvider } from '@autopilot/providers/adapters/mock.ts'
import type { MockWorld } from '@autopilot/providers/adapters/mock.ts'
import { generatePrompts } from '@autopilot/prompts/generator.ts'
import { newId } from '@autopilot/shared/ids.ts'
import {
  InMemoryExecutionCache,
  assertRealObservations,
  cacheKey,
  runPrompts,
} from '../src/runner.ts'
import { analyzeCitationGap, analyzeCitations, classifySource, citationPresenceRate } from '../src/citations.ts'

const world = (): MockWorld => ({
  businesses: [
    {
      name: 'Rosa',
      city: 'Tel Aviv',
      domain: 'rosa.example.com',
      attributes: { handmade_pasta: 0.4, romantic: 0.2 },
      authority: 0.4,
      sources: [{ url: 'https://rosa.example.com/', title: 'Rosa' }],
    },
    {
      name: 'Vito',
      city: 'Tel Aviv',
      domain: 'vito.example.com',
      attributes: { romantic: 0.9, handmade_pasta: 0.7 },
      authority: 0.75,
      sources: [
        { url: 'https://vito.example.com/', title: 'Vito' },
        { url: 'https://timeout.example.com/tlv', title: 'Most romantic in TLV' },
      ],
    },
  ],
})

const prompts = () =>
  generatePrompts({
    businessId: newId<'BusinessId'>(),
    vertical: 'restaurant',
    city: 'Tel Aviv',
    country: 'IL',
    languages: ['en'],
    qualifiers: ['Italian'],
    confirmedAttributes: ['handmade_pasta'],
    maxPrompts: 6,
  })

const subject = { id: 'b1', name: 'Rosa', aliases: ['רוזה'] }

describe('runPrompts', () => {
  it('executes every prompt against every engine and evaluates each answer', async () => {
    const providers = [
      new MockAIProvider('gemini', { world: world() }),
      new MockAIProvider('openai', { world: world() }),
    ]
    const set = prompts()
    const summary = await runPrompts({ prompts: set, providers, subject })

    expect(summary.results).toHaveLength(set.length * 2)
    expect(summary.stoppedBecause).toBe('COMPLETE')
    for (const result of summary.results) {
      expect(result.evaluation.evaluatorVersion).toBeTruthy()
      expect(result.context.locale).toBe('en-IL')
      expect(result.context.timezone).toBe('Asia/Jerusalem')
    }
  })

  it('marks simulated observations SYNTHETIC and refuses to report them as real', async () => {
    const summary = await runPrompts({
      prompts: prompts().slice(0, 2),
      providers: [new MockAIProvider('gemini', { world: world() })],
      subject,
    })
    expect(summary.results.every((r) => r.sourceType === 'SYNTHETIC')).toBe(true)
    expect(() => assertRealObservations(summary)).toThrow(/SYNTHETIC/)
  })

  it('reuses a cached execution instead of paying twice', async () => {
    const provider = new MockAIProvider('gemini', { world: world() })
    const cache = new InMemoryExecutionCache(60_000, new FixedClock(new Date('2026-01-01')))
    const set = prompts().slice(0, 3)

    const first = await runPrompts({ prompts: set, providers: [provider], subject, cache })
    const callsAfterFirst = provider.calls
    const second = await runPrompts({ prompts: set, providers: [provider], subject, cache })

    expect(first.cacheHits).toBe(0)
    expect(second.cacheHits).toBe(3)
    expect(second.executed).toBe(0)
    expect(provider.calls).toBe(callsAfterFirst)
  })

  it('expires cached executions so business information never goes stale forever', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'))
    const cache = new InMemoryExecutionCache(1000, clock)
    const provider = new MockAIProvider('gemini', { world: world() })
    const set = prompts().slice(0, 1)

    await runPrompts({ prompts: set, providers: [provider], subject, cache })
    clock.advance(2000)
    const after = await runPrompts({ prompts: set, providers: [provider], subject, cache })
    expect(after.cacheHits).toBe(0)
  })

  it('keys the cache on engine, model and locale so they never collide', () => {
    const [prompt] = prompts()
    const context = {
      country: 'IL',
      city: 'Tel Aviv',
      language: 'en' as const,
      locale: 'en-IL',
      timezone: 'Asia/Jerusalem',
    }
    expect(cacheKey(prompt!, 'gemini', 'm', context)).not.toBe(
      cacheKey(prompt!, 'openai', 'm', context),
    )
    expect(cacheKey(prompt!, 'gemini', 'm', context)).not.toBe(
      cacheKey(prompt!, 'gemini', 'm', { ...context, locale: 'he-IL' }),
    )
  })

  it('stops the whole run when the budget is exhausted rather than half-measuring', async () => {
    const ledger = new CostLedger()
    ledger.addScope({ key: 'run:1', limitMinor: 0 })
    // A provider whose ledger refuses the call is indistinguishable from a real breach.
    const provider = new MockAIProvider('gemini', {
      world: world(),
      failWith: new AppError({ code: 'BUDGET_EXCEEDED', message: 'no budget' }),
    })

    const summary = await runPrompts({ prompts: prompts(), providers: [provider], subject })
    expect(summary.stoppedBecause).toBe('BUDGET')
    expect(summary.results).toHaveLength(0)
    expect(summary.failures.length).toBeGreaterThan(0)
  })

  it('records a provider failure without aborting the rest of the run', async () => {
    const good = new MockAIProvider('gemini', { world: world() })
    const bad = new MockAIProvider('openai', {
      world: world(),
      failWith: new AppError({ code: 'PROVIDER_UNAVAILABLE', message: 'down' }),
    })
    const set = prompts().slice(0, 2)
    const summary = await runPrompts({ prompts: set, providers: [good, bad], subject })

    expect(summary.results).toHaveLength(2)
    expect(summary.failures).toHaveLength(2)
    expect(summary.failures[0]!.code).toBe('PROVIDER_UNAVAILABLE')
  })

  it('honours cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    const summary = await runPrompts({
      prompts: prompts(),
      providers: [new MockAIProvider('gemini', { world: world() })],
      subject,
      signal: controller.signal,
    })
    expect(summary.stoppedBecause).toBe('CANCELLED')
  })

  it('streams results so a dashboard can fill in progressively', async () => {
    const onResult = vi.fn()
    const set = prompts().slice(0, 3)
    await runPrompts({
      prompts: set,
      providers: [new MockAIProvider('gemini', { world: world() })],
      subject,
      onResult,
    })
    expect(onResult).toHaveBeenCalledTimes(3)
  })

  it('discovers competitors from the answers themselves', async () => {
    const summary = await runPrompts({
      prompts: prompts(),
      providers: [new MockAIProvider('gemini', { world: world() })],
      subject,
    })
    const names = new Set(summary.results.flatMap((r) => r.discoveredCompetitors.map((c) => c.name)))
    expect(names.has('Vito')).toBe(true)
    expect(names.has('Rosa')).toBe(false)
  })
})

describe('classifySource', () => {
  it.each([
    ['https://rosa.example.com/menu', 'own_website'],
    ['https://maps.google.com/place/rosa', 'google_business_profile'],
    ['https://www.tripadvisor.com/x', 'review_site'],
    ['https://www.facebook.com/rosa', 'social'],
    ['https://zap.co.il/x', 'directory'],
    ['https://timeout.example.com/tlv', 'editorial'],
  ])('classifies %s as %s', (url, expected) => {
    expect(classifySource(url, 'rosa.example.com')).toBe(expected)
  })

  it('returns other for an unparseable URL', () => {
    expect(classifySource('not a url', null)).toBe('other')
  })
})

describe('analyzeCitations', () => {
  it('marks only our own site and profile as controllable', () => {
    const analysed = analyzeCitations({
      citations: [
        { url: 'https://rosa.example.com/', title: 'Rosa', position: 1 },
        { url: 'https://timeout.example.com/tlv', title: 'Best of TLV', position: 2 },
      ],
      ownDomain: 'rosa.example.com',
      businessNames: ['Rosa'],
      competitorNames: ['Vito'],
    })
    expect(analysed[0]!.controllable).toBe(true)
    expect(analysed[1]!.controllable).toBe(false)
    expect(analysed[0]!.authority).toBeLessThan(analysed[1]!.authority)
  })

  it('detects which cited pages mention us or a competitor', () => {
    const analysed = analyzeCitations({
      citations: [{ url: 'https://timeout.example.com/tlv', title: 'Vito and Rosa reviewed', position: 1 }],
      ownDomain: 'rosa.example.com',
      businessNames: ['Rosa'],
      competitorNames: ['Vito'],
    })
    expect(analysed[0]!.referencesBusiness).toBe(true)
    expect(analysed[0]!.referencedCompetitors).toEqual(['Vito'])
  })
})

describe('analyzeCitationGap', () => {
  const cite = (url: string, refs: boolean, position = 1) => ({
    url,
    domain: new URL(url).hostname.replace(/^www\./, ''),
    title: undefined,
    position,
    kind: classifySource(url, 'rosa.example.com'),
    authority: 0.8,
    referencesBusiness: refs,
    referencedCompetitors: [],
    controllable: classifySource(url, 'rosa.example.com') === 'own_website',
  })

  it('labels an editorial advantage as an external authority gap and says we cannot fake it', () => {
    const gap = analyzeCitationGap(
      [cite('https://rosa.example.com/', true)],
      [cite('https://timeout.example.com/a', false), cite('https://haaretz.example.com/b', false, 2)],
      'Vito',
    )
    expect(gap.externalAuthorityGap).toBe(true)
    expect(gap.plainLanguage).toContain('cannot create independent coverage')
    expect(gap.plainLanguage).not.toMatch(/backlink/i)
  })

  it('does not cry external authority when the difference is claimable listings', () => {
    const gap = analyzeCitationGap(
      [cite('https://rosa.example.com/', true)],
      [cite('https://zap.co.il/vito', false)],
      'Vito',
    )
    expect(gap.externalAuthorityGap).toBe(false)
    expect(gap.plainLanguage).toContain('claim or correct')
  })

  it('reports no gap when we appear on the same sources', () => {
    const shared = cite('https://timeout.example.com/a', true)
    const gap = analyzeCitationGap([shared], [shared], 'Vito')
    expect(gap.missingCorroboration).toHaveLength(0)
  })
})

describe('citationPresenceRate', () => {
  it('is the share of answers whose sources referenced us', () => {
    const withUs = [{ referencesBusiness: true }] as never
    const without = [{ referencesBusiness: false }] as never
    expect(citationPresenceRate([withUs, without, withUs])).toBeCloseTo(2 / 3)
    expect(citationPresenceRate([])).toBe(0)
  })
})
