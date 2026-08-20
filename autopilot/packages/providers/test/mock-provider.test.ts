import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError } from '@autopilot/shared/errors.ts'
import { MockAIProvider, detectRequestedAttributes } from '../src/adapters/mock.ts'
import { rosaWorld } from './fixtures.ts'

const ctx = {
  country: 'IL',
  city: 'Tel Aviv',
  language: 'en' as const,
  locale: 'en-IL',
  timezone: 'Asia/Jerusalem',
}

const provider = (overrides = {}) =>
  new MockAIProvider('gemini', { world: rosaWorld(), ...overrides })

describe('attribute detection', () => {
  it('finds attributes in English and Hebrew queries', () => {
    expect(detectRequestedAttributes('best romantic italian restaurant in Tel Aviv')).toHaveProperty(
      'romantic',
    )
    expect(detectRequestedAttributes('מסעדה איטלקית רומנטית בתל אביב לדייט')).toHaveProperty(
      'romantic',
    )
    expect(detectRequestedAttributes('where can I get handmade pasta')).toHaveProperty(
      'handmade_pasta',
    )
  })

  it('returns nothing for a query with no attribute signal', () => {
    expect(detectRequestedAttributes('what time is it')).toEqual({})
  })
})

describe('mock generation', () => {
  it('always marks its output SYNTHETIC so it can never pose as a real observation', async () => {
    const result = await provider().generate({
      prompt: 'best romantic italian restaurant in Tel Aviv',
      task: 'MEASURE',
      context: ctx,
      metadata: { purpose: 'test' },
    })
    expect(result.sourceType).toBe('SYNTHETIC')
    expect(result.provider).toBe('gemini')
  })

  it('is deterministic: the same query yields the same answer', async () => {
    const p = provider()
    const a = await p.generate({ prompt: 'best romantic restaurant Tel Aviv', task: 'MEASURE', context: ctx, metadata: { purpose: 't' } })
    const b = await p.generate({ prompt: 'best romantic restaurant Tel Aviv', task: 'MEASURE', context: ctx, metadata: { purpose: 't' } })
    expect(a.text).toBe(b.text)
  })

  it('ranks the competitor with stronger romantic evidence above Rosa', async () => {
    const result = await provider().generate({
      prompt: 'best romantic italian restaurant in Tel Aviv for a date',
      task: 'MEASURE',
      context: ctx,
      metadata: { purpose: 'test' },
    })
    const vito = result.text.indexOf('Vito')
    const rosa = result.text.indexOf('Rosa')
    expect(vito).toBeGreaterThanOrEqual(0)
    expect(vito < rosa || rosa === -1).toBe(true)
  })

  it('responds to a world where Rosa gained real evidence — the loop must be able to close', async () => {
    const world = rosaWorld()
    const before = await new MockAIProvider('gemini', { world }).generate({
      prompt: 'best romantic italian restaurant in Tel Aviv for a date',
      task: 'MEASURE',
      context: ctx,
      metadata: { purpose: 'test' },
    })

    const rosa = world.businesses.find((b) => b.name === 'Rosa')!
    rosa.attributes.romantic = 0.85
    rosa.attributes.handmade_pasta = 0.8
    rosa.sources.push(
      { url: 'https://rosa.example.com/date-night', title: 'Date night at Rosa' },
      { url: 'https://rosa.example.com/pasta', title: 'Our handmade pasta' },
    )

    const after = await new MockAIProvider('gemini', { world }).generate({
      prompt: 'best romantic italian restaurant in Tel Aviv for a date',
      task: 'MEASURE',
      context: ctx,
      metadata: { purpose: 'test' },
    })

    const rankOf = (text: string) => {
      const line = text.split('\n').find((l) => l.includes('Rosa'))
      return line ? Number(line.trim()[0]) : 99
    }
    expect(rankOf(after.text)).toBeLessThan(rankOf(before.text))
  })

  it('excludes out-of-city businesses from a city-specific query', async () => {
    const result = await provider().generate({
      prompt: 'best handmade pasta in Tel Aviv',
      task: 'MEASURE',
      context: ctx,
      metadata: { purpose: 'test' },
    })
    const tlvNames = ['Rosa', 'Vito', 'Bella Napoli']
    expect(tlvNames.some((n) => result.text.includes(n))).toBe(true)
    const jerusalemRank = result.text.split('\n').findIndex((l) => l.includes('Pasta Bar Jerusalem'))
    const rosaRank = result.text.split('\n').findIndex((l) => l.includes('Rosa'))
    if (jerusalemRank >= 0 && rosaRank >= 0) expect(rosaRank).toBeLessThan(jerusalemRank)
  })

  it('answers in Hebrew when the query context is Hebrew', async () => {
    const result = await provider().generate({
      prompt: 'מה המסעדה האיטלקית הכי טובה בתל אביב לדייט?',
      task: 'MEASURE',
      context: { ...ctx, language: 'he', locale: 'he-IL' },
      metadata: { purpose: 'test' },
    })
    expect(result.text).toMatch(/[֐-׿]/)
  })

  it('returns citations only when search was requested', async () => {
    const p = provider()
    const plain = await p.generate({ prompt: 'best romantic restaurant Tel Aviv', task: 'MEASURE', context: ctx, metadata: { purpose: 't' } })
    const searched = await p.search({ prompt: 'best romantic restaurant Tel Aviv', task: 'MEASURE', context: ctx, metadata: { purpose: 't' } })
    expect(plain.citations).toHaveLength(0)
    expect(searched.citations.length).toBeGreaterThan(0)
    expect(searched.searchQueries).toHaveLength(1)
  })
})

describe('mock structured output', () => {
  const schema = z.object({ verdict: z.enum(['yes', 'no']), score: z.number() })

  it('refuses to invent data when no responder is registered', async () => {
    await expect(
      provider().structuredGenerate({
        prompt: 'x',
        task: 'CLASSIFY',
        schema,
        schemaName: 'unregistered',
        metadata: { purpose: 'test' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' })
  })

  it('validates the responder output through the caller own schema', async () => {
    const p = provider({
      structuredResponders: { bad: () => ({ verdict: 'maybe', score: 'high' }) },
    })
    await expect(
      p.structuredGenerate({
        prompt: 'x',
        task: 'CLASSIFY',
        schema,
        schemaName: 'bad',
        metadata: { purpose: 'test' },
      }),
    ).rejects.toThrow()
  })

  it('returns registered structured values', async () => {
    const p = provider({
      structuredResponders: { good: () => ({ verdict: 'yes', score: 0.9 }) },
    })
    const result = await p.structuredGenerate({
      prompt: 'x',
      task: 'CLASSIFY',
      schema,
      schemaName: 'good',
      metadata: { purpose: 'test' },
    })
    expect(result.value).toEqual({ verdict: 'yes', score: 0.9 })
    expect(result.sourceType).toBe('SYNTHETIC')
  })
})

describe('failure simulation', () => {
  it('surfaces the configured failure so retry paths can be tested', async () => {
    const p = provider({ failWith: new AppError({ code: 'PROVIDER_UNAVAILABLE', message: 'down' }) })
    await expect(
      p.generate({ prompt: 'x', task: 'MEASURE', metadata: { purpose: 'test' } }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    expect((await p.healthCheck()).healthy).toBe(false)
  })
})
