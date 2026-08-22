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
