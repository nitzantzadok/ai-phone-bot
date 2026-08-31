/**
 * Two ways a knowledge graph can lie to a customer.
 *
 * The first is publishing something that is not a fact: a page greeting reported as the
 * business name. The second is raising a contradiction that is not one: the same phone
 * number written two ways. Both are worse than saying nothing, because both spend the
 * customer's trust on a finding they will check and discover to be wrong.
 */
import { describe, expect, it } from 'vitest'
import type { CandidateFact } from '../src/facts.ts'
import { findConflicts } from '../src/facts.ts'
import { buildEntity } from '../src/entity.ts'

const fact = (factKind: string, value: string, url = 'https://example.co.il/'): CandidateFact => ({
  factKind,
  value,
  confidence: 'HIGH',
  sourceType: 'OWN_PROPERTY',
  sourceUrl: url,
})

describe('the business name', () => {
  it('is taken from a structured business name when there is one', () => {
    const entity = buildEntity(
      [fact('business_name', 'דנטל סנטר הדר'), fact('site_title', 'ברוכים הבאים')],
      'dentist',
    )
    expect(entity.canonicalName).toBe('דנטל סנטר הדר')
  })

  it('is not a page greeting', () => {
    for (const greeting of ['ברוכים הבאים', 'דף הבית', 'Welcome', 'Home', 'Untitled']) {
      const entity = buildEntity([fact('site_title', greeting)], 'dentist')
      expect(entity.canonicalName).toBeNull()
    }
  })

  it('is recovered from the informative half of a split title', () => {
    const entity = buildEntity([fact('site_title', 'ברוכים הבאים | דנטל סנטר הדר')], 'dentist')
    expect(entity.canonicalName).toBe('דנטל סנטר הדר')
  })

  it('falls back to a real title when there is no structured name', () => {
    const entity = buildEntity([fact('site_title', 'מוסך אבי ובניו')], 'other')
    expect(entity.canonicalName).toBe('מוסך אבי ובניו')
  })
})

describe('contradictions', () => {
  it('does not report one phone number written two ways', () => {
    const conflicts = findConflicts([
      fact('phone', '+972-3-555-0123'),
      fact('phone', '03-555-0123', 'https://example.co.il/contact'),
      fact('phone', '035550123', 'https://example.co.il/about'),
    ])
    expect(conflicts).toHaveLength(0)
  })

  it('still reports two genuinely different phone numbers', () => {
    const conflicts = findConflicts([
      fact('phone', '03-555-0123'),
      fact('phone', '03-555-9999', 'https://example.co.il/contact'),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.factKind).toBe('phone')
    expect(conflicts[0]!.values).toHaveLength(2)
  })

  it('reports a real disagreement about the address', () => {
    const conflicts = findConflicts([
      fact('address', 'חובבי ציון 14, פתח תקווה'),
      fact('address', 'ז׳בוטינסקי 3, פתח תקווה', 'https://example.co.il/contact'),
    ])
    expect(conflicts.some((c) => c.factKind === 'address')).toBe(true)
  })
})

/**
 * A default is not a fact.
 *
 * `buildEntity` used to fill `primaryCategory` from the vertical's default schema.org type.
 * Since `local_business` is what the vertical inference returns when it could *not* tell —
 * it is the one vertical never matched positively — that meant a scan which read nothing at
 * all still reported a category, 11% information completeness and a readiness score of 4:
 * three numbers about a business nothing had been learned about. On a real site it meant a
 * business that never says what it does was scored as though it had.
 */
describe('a category the site never stated', () => {
  it('is not invented from the fallback vertical', () => {
    const entity = buildEntity([], 'local_business')

    expect(entity.primaryCategory).toBeNull()
    expect(entity.missingFields).toContain('primaryCategory')
    expect(entity.completeness).toBe(0)
  })

  it('still gives the generated markup a safe @type to write', () => {
    // The type we *write* for a business and the claim that the site *states* a category
    // are different things, and only the second one is a measurement.
    expect(buildEntity([], 'local_business').entityType).toBe('LocalBusiness')
  })

  it('is kept when the vertical was genuinely recognised from the site', () => {
    const entity = buildEntity([], 'restaurant')

    expect(entity.primaryCategory).not.toBeNull()
    expect(entity.missingFields).not.toContain('primaryCategory')
  })

  it('is kept when the site states it in structured data', () => {
    const entity = buildEntity([fact('entity_type', 'Dentist')], 'local_business')

    expect(entity.primaryCategory).toBe('Dentist')
  })
})
