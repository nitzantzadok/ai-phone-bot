import { describe, expect, it } from 'vitest'
import { crawlSite } from '@autopilot/crawler/crawler.ts'
import { createFixtureFetcher, html, type FixtureSite } from '@autopilot/crawler/testing/fixture-site.ts'
import { attributeLabel, attributesForVertical, findAttributeEvidence } from '../src/attributes.ts'
import { extractFacts, findConflicts } from '../src/facts.ts'
import { buildEntity } from '../src/entity.ts'
import {
  analyzeGaps,
  attributeMatchScore,
  computeEvidenceStrength,
  type AttributeEvidence,
} from '../src/evidence.ts'

const ROOT = 'https://rosa.example.com'
const HE_ROMANTIC = 'רומנטי' // romantic
const HE_PASTA = 'פסטה בעבודת יד' // handmade pasta

describe('attribute vocabulary', () => {
  it('includes universal attributes in every vertical', () => {
    const restaurant = attributesForVertical('restaurant').map((a) => a.key)
    const lawyer = attributesForVertical('lawyer').map((a) => a.key)
    expect(restaurant).toContain('wheelchair_accessible')
    expect(lawyer).toContain('wheelchair_accessible')
    expect(restaurant).toContain('romantic')
    expect(lawyer).not.toContain('romantic')
  })

  it('labels attributes in Hebrew and English', () => {
    expect(attributeLabel('romantic', 'en')).toBe('Romantic')
    expect(attributeLabel('romantic', 'he')).toBe(HE_ROMANTIC)
    expect(attributeLabel('unknown_key', 'en')).toBe('unknown key')
  })

  it('finds evidence in both languages and counts occurrences', () => {
    const matches = findAttributeEvidence(
      `A romantic room. Perfect for date night. ${HE_PASTA} served daily.`,
      'restaurant',
    )
    const byKey = Object.fromEntries(matches.map((m) => [m.key, m]))
    expect(byKey.romantic).toBeDefined()
    expect(byKey.romantic!.occurrences).toBeGreaterThanOrEqual(2)
    expect(byKey.handmade_pasta).toBeDefined()
  })

  it('finds nothing in unrelated text', () => {
    expect(findAttributeEvidence('The quick brown fox.', 'restaurant')).toHaveLength(0)
  })
})

const rosaSite = (options: { withSchema?: boolean; romantic?: boolean } = {}): FixtureSite => ({
  [`${ROOT}/`]: {
    body: html({
      title: 'Rosa - Italian restaurant in Tel Aviv',
      description: 'Italian cooking in central Tel Aviv.',
      h1: 'Rosa',
      canonical: `${ROOT}/`,
      links: [`${ROOT}/menu`],
      body: `<p>We serve handmade pasta. Call 03-1234567.${
        options.romantic ? ' A romantic room for date night.' : ''
      }</p>`,
      jsonLd: options.withSchema
        ? {
            '@context': 'https://schema.org',
            '@type': 'Restaurant',
            name: 'Rosa',
            telephone: '03-1234567',
            priceRange: '$$$',
            servesCuisine: 'Italian',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Rothschild 12',
              addressLocality: 'Tel Aviv',
              postalCode: '6688218',
            },
            openingHoursSpecification: [
              { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '18:00', closes: '23:00' },
            ],
          }
        : undefined,
    }),
  },
  [`${ROOT}/menu`]: {
    body: html({ title: 'Menu', h1: 'Our handmade pasta', body: '<p>Fresh pasta daily.</p>' }),
  },
})

const crawlRosa = (options?: { withSchema?: boolean; romantic?: boolean }) =>
  crawlSite(`${ROOT}/`, {
    fetcher: createFixtureFetcher(rosaSite(options)),
    requestsPerSecond: 1000,
  })

describe('extractFacts', () => {
  it('reads structured business data at HIGH confidence', async () => {
    const facts = extractFacts({ crawl: await crawlRosa({ withSchema: true }), vertical: 'restaurant' })
    const byKind = (kind: string) => facts.filter((f) => f.factKind === kind)

    expect(byKind('business_name')[0]).toMatchObject({ value: 'Rosa', confidence: 'HIGH' })
    expect(byKind('entity_type')[0]!.value).toBe('Restaurant')
    expect(byKind('city')[0]!.value).toBe('Tel Aviv')
    expect(byKind('cuisine')[0]!.value).toBe('Italian')
    expect(byKind('price_range')[0]!.value).toBe('$$$')
    expect(byKind('opening_hours')[0]!.valueJson).toBeDefined()
    expect(byKind('address')[0]!.value).toContain('Rothschild 12')
  })

  it('never marks anything OBSERVED_API or SYNTHETIC when reading a website', async () => {
    const facts = extractFacts({ crawl: await crawlRosa({ withSchema: true }), vertical: 'restaurant' })
    for (const fact of facts) {
      expect(['OWN_PROPERTY', 'INFERRED']).toContain(fact.sourceType)
    }
  })

  it('extracts an Israeli phone number from page text', async () => {
    const facts = extractFacts({ crawl: await crawlRosa(), vertical: 'restaurant' })
    const phone = facts.find((f) => f.factKind === 'phone')
    expect(phone?.value).toBe('031234567')
  })

  it('rates attribute evidence higher when it appears in a heading', async () => {
    const facts = extractFacts({ crawl: await crawlRosa(), vertical: 'restaurant' })
    const pasta = facts.filter((f) => f.attributeKey === 'handmade_pasta')
    expect(pasta.length).toBeGreaterThan(0)
    // "Our handmade pasta" is an H1 on the menu page, so at least one is MEDIUM.
    expect(pasta.some((f) => f.confidence === 'MEDIUM')).toBe(true)
  })

  it('finds no romantic evidence when the site never mentions it', async () => {
    const facts = extractFacts({ crawl: await crawlRosa(), vertical: 'restaurant' })
    expect(facts.some((f) => f.attributeKey === 'romantic')).toBe(false)
  })

  it('finds romantic evidence once the site says it', async () => {
    const facts = extractFacts({ crawl: await crawlRosa({ romantic: true }), vertical: 'restaurant' })
    expect(facts.some((f) => f.attributeKey === 'romantic')).toBe(true)
  })

  it('deduplicates identical facts from the same source', async () => {
    const facts = extractFacts({ crawl: await crawlRosa({ withSchema: true }), vertical: 'restaurant' })
    const fingerprints = facts.map((f) => `${f.factKind}|${f.value}|${f.sourceUrl}`)
    expect(new Set(fingerprints).size).toBe(fingerprints.length)
  })

  it('records the page inventory so missing page types can be detected', async () => {
    const facts = extractFacts({ crawl: await crawlRosa(), vertical: 'restaurant' })
    const inventory = facts.find((f) => f.factKind === 'page_types')
    expect(inventory?.valueJson).toContain('home')
    expect(inventory?.valueJson).toContain('menu')
  })
})

describe('findConflicts', () => {
  it('detects contradictory phone numbers across sources', () => {
    const conflicts = findConflicts([
      { factKind: 'phone', value: '03-1234567', confidence: 'HIGH', sourceType: 'OWN_PROPERTY', sourceUrl: 'a' },
      { factKind: 'phone', value: '03-7654321', confidence: 'HIGH', sourceType: 'THIRD_PARTY', sourceUrl: 'b' },
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.factKind).toBe('phone')
  })

  it('treats formatting differences as the same value, not a conflict', () => {
    const conflicts = findConflicts([
      { factKind: 'phone', value: '03-1234567', confidence: 'HIGH', sourceType: 'OWN_PROPERTY', sourceUrl: 'a' },
      { factKind: 'phone', value: '031234567', confidence: 'HIGH', sourceType: 'OWN_PROPERTY', sourceUrl: 'b' },
    ])
    expect(conflicts).toHaveLength(0)
  })
})

describe('buildEntity', () => {
  it('assembles a complete entity from structured data', async () => {
    const facts = extractFacts({ crawl: await crawlRosa({ withSchema: true }), vertical: 'restaurant' })
    const entity = buildEntity(facts, 'restaurant')
    expect(entity.canonicalName).toBe('Rosa')
    expect(entity.entityType).toBe('Restaurant')
    expect(entity.city).toBe('Tel Aviv')
    expect(entity.completeness).toBeGreaterThan(0.9)
    expect(entity.missingFields).toHaveLength(0)
  })

  it('reports low completeness and names what is missing without schema', async () => {
    const facts = extractFacts({ crawl: await crawlRosa(), vertical: 'restaurant' })
    const entity = buildEntity(facts, 'restaurant')
    expect(entity.completeness).toBeLessThan(0.6)
    expect(entity.missingFields).toContain('openingHours')
    expect(entity.missingFields).toContain('address')
  })

  it('refuses to build the entity from LOW-confidence facts', () => {
    const entity = buildEntity(
      [{ factKind: 'business_name', value: 'Guess', confidence: 'LOW', sourceType: 'INFERRED', sourceUrl: 'x' }],
      'restaurant',
    )
    expect(entity.canonicalName).toBeNull()
  })

  it('falls back to a sensible schema type per vertical', () => {
    expect(buildEntity([], 'lawyer').entityType).toBe('LegalService')
    expect(buildEntity([], 'unknown_vertical').entityType).toBe('LocalBusiness')
  })
})

describe('computeEvidenceStrength', () => {
  const ev = (o: Partial<Parameters<typeof computeEvidenceStrength>[0][number]>) => ({
    attributeKey: 'romantic',
    confidence: 'MEDIUM' as const,
    sourceUrl: 'https://a.example.com/1',
    ownWebsite: false,
    ...o,
  })

  it('returns null with no inputs', () => {
    expect(computeEvidenceStrength([])).toBeNull()
  })

  it('rises with confidence, corroboration, own-site presence and owner confirmation', () => {
    const weak = computeEvidenceStrength([ev({ confidence: 'LOW' })])!
    const better = computeEvidenceStrength([ev({ confidence: 'HIGH' })])!
    const corroborated = computeEvidenceStrength([
      ev({ confidence: 'HIGH' }),
      ev({ confidence: 'HIGH', sourceUrl: 'https://b.example.com/1' }),
    ])!
    const onSite = computeEvidenceStrength([ev({ confidence: 'HIGH', ownWebsite: true })])!
    const confirmed = computeEvidenceStrength([
      ev({ confidence: 'HIGH', ownWebsite: true, ownerConfirmed: true }),
    ])!

    expect(weak.strength).toBeLessThan(better.strength)
    expect(better.strength).toBeLessThan(corroborated.strength)
    expect(better.strength).toBeLessThan(onSite.strength)
    expect(onSite.strength).toBeLessThan(confirmed.strength)
    expect(confirmed.strength).toBeLessThanOrEqual(1)
  })

  it('never lets weak repetition beat one confirmed fact', () => {
    const spam = computeEvidenceStrength(
      Array.from({ length: 10 }, (_, i) =>
        ev({ confidence: 'LOW', sourceUrl: `https://x${i}.example.com/` }),
      ),
    )!
    const confirmed = computeEvidenceStrength([
      ev({ confidence: 'HIGH', ownWebsite: true, ownerConfirmed: true }),
    ])!
    expect(spam.strength).toBeLessThan(confirmed.strength)
  })
})

describe('analyzeGaps', () => {
  const evidence = (key: string, strength: number, onSite: boolean): AttributeEvidence => ({
    attributeKey: key,
    strength,
    supportingFactCount: 1,
    distinctSourceCount: 1,
    ownerConfirmed: false,
    presentOnOwnWebsite: onSite,
    bestConfidence: 'MEDIUM',
    sourceUrls: ['https://rosa.example.com/'],
  })

  it('ignores attributes nobody asks about', () => {
    const gaps = analyzeGaps({
      ourEvidence: new Map([['kosher', evidence('kosher', 0, false)]]),
      competitorEvidence: [
        { competitorId: 'c1', competitorName: 'Vito', attributeKey: 'kosher', strength: 0.9, distinctSourceCount: 3, externalSources: true },
      ],
      promptDemand: new Map(),
    })
    expect(gaps).toHaveLength(0)
  })

  it('calls a confirmed-but-unstated attribute CONTROLLED', () => {
    const gaps = analyzeGaps({
      ourEvidence: new Map(),
      competitorEvidence: [
        { competitorId: 'c1', competitorName: 'Vito', attributeKey: 'romantic', strength: 0.85, distinctSourceCount: 3, externalSources: true },
      ],
      promptDemand: new Map([['romantic', 12]]),
      ownerConfirmedAttributes: new Set(['romantic']),
    })
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.controllability).toBe('CONTROLLED')
    expect(gaps[0]!.reason).toContain('your website never says so')
  })

  it('calls an independent-corroboration advantage NOT_CONTROLLED and says so plainly', () => {
    const gaps = analyzeGaps({
      ourEvidence: new Map([['romantic', evidence('romantic', 0.5, true)]]),
      competitorEvidence: [
        { competitorId: 'c1', competitorName: 'Vito', attributeKey: 'romantic', strength: 0.95, distinctSourceCount: 6, externalSources: true },
      ],
      promptDemand: new Map([['romantic', 12]]),
      ownerConfirmedAttributes: new Set(['romantic']),
    })
    expect(gaps[0]!.controllability).toBe('NOT_CONTROLLED')
    expect(gaps[0]!.reason).toContain('external authority gap')
  })

  it('never asserts an unconfirmed attribute, it asks', () => {
    const gaps = analyzeGaps({
      ourEvidence: new Map(),
      competitorEvidence: [
        { competitorId: 'c1', competitorName: 'Vito', attributeKey: 'romantic', strength: 0.85, distinctSourceCount: 2, externalSources: false },
      ],
      promptDemand: new Map([['romantic', 12]]),
      ownerConfirmedAttributes: new Set(),
    })
    expect(gaps[0]!.controllability).toBe('INFLUENCEABLE')
    expect(gaps[0]!.reason).toContain('If it is true')
  })

  it('ranks controllable, high-demand gaps first', () => {
    const gaps = analyzeGaps({
      ourEvidence: new Map(),
      competitorEvidence: [
        { competitorId: 'c1', competitorName: 'Vito', attributeKey: 'romantic', strength: 0.9, distinctSourceCount: 5, externalSources: true },
        { competitorId: 'c1', competitorName: 'Vito', attributeKey: 'outdoor_seating', strength: 0.9, distinctSourceCount: 5, externalSources: true },
      ],
      promptDemand: new Map([
        ['romantic', 20],
        ['outdoor_seating', 2],
      ]),
      ownerConfirmedAttributes: new Set(['romantic', 'outdoor_seating']),
    })
    expect(gaps[0]!.attributeKey).toBe('romantic')
  })

  it('does not report a gap where we are already strong', () => {
    const gaps = analyzeGaps({
      ourEvidence: new Map([['romantic', evidence('romantic', 0.9, true)]]),
      competitorEvidence: [
        { competitorId: 'c1', competitorName: 'Vito', attributeKey: 'romantic', strength: 0.92, distinctSourceCount: 2, externalSources: false },
      ],
      promptDemand: new Map([['romantic', 10]]),
    })
    expect(gaps).toHaveLength(0)
  })
})

describe('attributeMatchScore', () => {
  it('is 0 when nothing is demanded', () => {
    expect(attributeMatchScore(new Map(), new Map())).toBe(0)
  })

  it('weights by how many prompts demand each attribute', () => {
    const strong: AttributeEvidence = {
      attributeKey: 'romantic',
      strength: 1,
      supportingFactCount: 1,
      distinctSourceCount: 1,
      ownerConfirmed: true,
      presentOnOwnWebsite: true,
      bestConfidence: 'HIGH',
      sourceUrls: [],
    }
    const score = attributeMatchScore(
      new Map([['romantic', strong]]),
      new Map([
        ['romantic', 9],
        ['outdoor_seating', 1],
      ]),
    )
    expect(score).toBeCloseTo(0.9, 5)
  })
})
