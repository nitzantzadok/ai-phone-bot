import { describe, expect, it } from 'vitest'
import { newId } from '@autopilot/shared/ids.ts'
import {
  attributeDemand,
  estimateDifficulty,
  generatePrompts,
  scorePrompt,
  type GeneratedPrompt,
} from '../src/generator.ts'
import { buildTerritories, focusPrompts } from '../src/territories.ts'
import { VERTICALS, getVertical, inferVertical } from '../src/verticals.ts'

const businessId = newId<'BusinessId'>()

const rosaInput = (overrides = {}) => ({
  businessId,
  vertical: 'restaurant',
  city: 'Tel Aviv',
  country: 'IL',
  languages: ['he', 'en'] as const,
  qualifiers: ['Italian'],
  confirmedAttributes: ['romantic', 'handmade_pasta', 'outdoor_seating'],
  ...overrides,
})

describe('verticals', () => {
  it('covers the Israeli launch verticals from the brief', () => {
    for (const id of [
      'restaurant',
      'hotel',
      'lawyer',
      'dentist',
      'clinic',
      'salon',
      'gym',
      'home_services',
      'real_estate',
      'event',
      'tourism',
    ]) {
      expect(VERTICALS[id], id).toBeDefined()
    }
  })

  it('gives every vertical Hebrew and English service terms', () => {
    for (const vertical of Object.values(VERTICALS)) {
      expect(vertical.serviceTerms.he?.length, vertical.id).toBeGreaterThan(0)
      expect(vertical.serviceTerms.en?.length, vertical.id).toBeGreaterThan(0)
    }
  })

  it('falls back to local_business rather than throwing on an unknown vertical', () => {
    expect(getVertical('does_not_exist').id).toBe('local_business')
  })

  it('infers a vertical from a schema type, then from text', () => {
    expect(inferVertical('Restaurant', '')).toBe('restaurant')
    expect(inferVertical('LegalService', '')).toBe('lawyer')
    expect(inferVertical(null, 'We are a hair salon and barber in Haifa')).toBe('salon')
    expect(inferVertical(null, 'nothing identifiable here')).toBe('local_business')
  })
})

describe('generatePrompts', () => {
  it('produces natural questions in both languages', () => {
    const prompts = generatePrompts(rosaInput())
    expect(prompts.length).toBeGreaterThan(20)
    expect(prompts.some((p) => p.language === 'he')).toBe(true)
    expect(prompts.some((p) => p.language === 'en')).toBe(true)

    for (const prompt of prompts) {
      // A question, not a keyword string.
      expect(prompt.queryText.split(' ').length).toBeGreaterThan(3)
      expect(prompt.queryText).not.toMatch(/^\w+ \w+$/)
    }
  })

  it('writes Hebrew prompts in Hebrew, not transliterated English', () => {
    const hebrew = generatePrompts(rosaInput()).filter((p) => p.language === 'he')
    expect(hebrew.length).toBeGreaterThan(5)
    for (const prompt of hebrew) {
      expect(prompt.queryText).toMatch(/[֐-׿]/)
    }
  })

  it('records the location assumptions every prompt is measured under', () => {
    for (const prompt of generatePrompts(rosaInput())) {
      expect(prompt.country).toBe('IL')
      expect(prompt.city).toBe('Tel Aviv')
      expect(prompt.locale).toMatch(/^(he|en)-IL$/)
    }
  })

  it('never assumes Tel Aviv for an Israeli business', () => {
    const haifa = generatePrompts(rosaInput({ city: 'Haifa' }))
    expect(haifa.every((p) => p.city === 'Haifa')).toBe(true)
    expect(haifa.some((p) => p.queryText.includes('Tel Aviv'))).toBe(false)
  })

  it('links occasion prompts to the attributes an answer would need', () => {
    const prompts = generatePrompts(rosaInput())
    const dateNight = prompts.find(
      (p) => p.intentCategory === 'OCCASION' && p.dimensions.occasion === 'first_date',
    )
    expect(dateNight).toBeDefined()
    expect(dateNight!.requiredAttributes).toContain('romantic')
  })

  it('only generates constraint prompts for attributes the owner confirmed', () => {
    const prompts = generatePrompts(rosaInput())
    const constraints = prompts.filter((p) => p.intentCategory === 'CONSTRAINT')
    expect(constraints.length).toBeGreaterThan(0)
    for (const prompt of constraints) {
      expect(['romantic', 'handmade_pasta', 'outdoor_seating']).toContain(
        prompt.dimensions.constraint,
      )
    }
    expect(constraints.some((p) => p.dimensions.constraint === 'kosher')).toBe(false)
  })

  it('generates no constraint prompts when nothing is confirmed', () => {
    const prompts = generatePrompts(rosaInput({ confirmedAttributes: [] }))
    expect(prompts.filter((p) => p.intentCategory === 'CONSTRAINT')).toHaveLength(0)
  })

  it('adds proximity prompts only when neighborhoods are known', () => {
    const without = generatePrompts(rosaInput())
    const with_ = generatePrompts(rosaInput({ neighborhoods: ['Rothschild'] }))
    expect(without.filter((p) => p.intentCategory === 'PROXIMITY')).toHaveLength(0)
    const proximity = with_.filter((p) => p.intentCategory === 'PROXIMITY')
    expect(proximity.length).toBeGreaterThan(0)
    expect(proximity[0]!.localIntent).toBe(1)
  })

  it('produces no duplicate questions', () => {
    const prompts = generatePrompts(rosaInput())
    const keys = prompts.map((p) => `${p.language}:${p.queryText}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('respects the cap and keeps both languages represented', () => {
    const prompts = generatePrompts(rosaInput({ maxPrompts: 10 }))
    expect(prompts.length).toBeLessThanOrEqual(10)
    expect(prompts.some((p) => p.language === 'he')).toBe(true)
    expect(prompts.some((p) => p.language === 'en')).toBe(true)
  })

  it('returns prompts ordered by score', () => {
    const prompts = generatePrompts(rosaInput())
    for (let i = 1; i < prompts.length; i++) {
      expect(prompts[i]!.promptScore).toBeLessThanOrEqual(prompts[i - 1]!.promptScore)
    }
  })

  it('pairs Hebrew and English variants through a shared canonical intent', () => {
    const prompts = generatePrompts(rosaInput({ maxPrompts: 200 }))
    const discovery = prompts.filter((p) => p.canonicalIntent.startsWith('discovery:'))
    const languages = new Set(discovery.map((p) => p.language))
    expect(languages.size).toBe(2)
    expect(new Set(discovery.map((p) => p.canonicalIntent)).size).toBeLessThan(discovery.length)
  })

  it('works for a vertical with no occasions without producing junk', () => {
    const prompts = generatePrompts(rosaInput({ vertical: 'local_business', qualifiers: [] }))
    expect(prompts.length).toBeGreaterThan(0)
    expect(prompts.every((p) => p.queryText.length > 10)).toBe(true)
  })
})

describe('prompt scoring', () => {
  it('rates a local commercial question above a generic informational one', () => {
    const commercial = scorePrompt({
      commercialIntent: 0.95,
      localIntent: 1,
      specificity: 0.8,
      askLikelihood: 0.6,
    })
    const informational = scorePrompt({
      commercialIntent: 0.4,
      localIntent: 0.3,
      specificity: 0.2,
      askLikelihood: 0.6,
    })
    expect(commercial).toBeGreaterThan(informational)
  })

  it('stays within 0..1', () => {
    expect(
      scorePrompt({ commercialIntent: 1, localIntent: 1, specificity: 1, askLikelihood: 1 }),
    ).toBe(1)
    expect(
      scorePrompt({ commercialIntent: 0, localIntent: 0, specificity: 0, askLikelihood: 0 }),
    ).toBe(0)
  })
})

describe('difficulty', () => {
  it('rates broad discovery as harder than a specific constraint', () => {
    expect(estimateDifficulty('DISCOVERY', 0.15, 0)).toBeGreaterThan(
      estimateDifficulty('CONSTRAINT', 0.75, 1),
    )
  })

  it('falls with specificity and with each required attribute', () => {
    expect(estimateDifficulty('OCCASION', 0.8, 2)).toBeLessThan(
      estimateDifficulty('OCCASION', 0.2, 0),
    )
  })
})

describe('territories', () => {
  const prompts = generatePrompts(rosaInput({ maxPrompts: 200, neighborhoods: ['Rothschild'] }))

  it('groups prompts by winnability and explains each tier in plain language', () => {
    const territories = buildTerritories(prompts)
    expect(territories.length).toBeGreaterThan(1)
    for (const territory of territories) {
      expect(territory.prompts.length).toBeGreaterThan(0)
      expect(territory.description.length).toBeGreaterThan(40)
    }
  })

  it('orders tiers from easiest to hardest', () => {
    const territories = buildTerritories(prompts)
    for (let i = 1; i < territories.length; i++) {
      expect(territories[i]!.averageDifficulty).toBeGreaterThan(
        territories[i - 1]!.averageDifficulty,
      )
    }
  })

  it('focuses on winnable prompts we are currently losing', () => {
    const recommended = new Set(prompts.slice(0, 5).map((p) => p.id))
    const focus = focusPrompts(prompts, recommended, 5)
    expect(focus).toHaveLength(5)
    for (const prompt of focus) expect(recommended.has(prompt.id)).toBe(false)
    // Highest expected return first: score weighted by winnability.
    const value = (p: GeneratedPrompt) => p.promptScore * (1 - p.difficulty)
    for (let i = 1; i < focus.length; i++) {
      expect(value(focus[i]!)).toBeLessThanOrEqual(value(focus[i - 1]!))
    }
  })
})

describe('attributeDemand', () => {
  it('counts how many monitored prompts demand each attribute', () => {
    const demand = attributeDemand(generatePrompts(rosaInput({ maxPrompts: 200 })))
    expect(demand.get('romantic')).toBeGreaterThan(0)
    expect(demand.get('nonexistent_attribute')).toBeUndefined()
  })
})
