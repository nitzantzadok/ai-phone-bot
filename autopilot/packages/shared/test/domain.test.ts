import { describe, expect, it } from 'vitest'
import {
  AUTONOMY_MODES,
  RISK_TIERS,
  atLeastConfidence,
  allowsWrites,
  canAutoApply,
  freshnessOf,
  isMentioned,
  isRealObservation,
  isRecommended,
  isTop1,
  isTop3,
  hasRole,
  FRESHNESS_BY_FACT_KIND,
  SOURCE_CONFIDENCE,
} from '../src/domain.ts'

describe('autonomy safety matrix', () => {
  it('never auto-applies a HIGH risk change in any mode', () => {
    for (const mode of AUTONOMY_MODES) {
      expect(canAutoApply(mode, 'HIGH')).toBe(false)
    }
  })

  it('matches the documented mode/risk table exactly', () => {
    const expected: Record<string, Record<string, boolean>> = {
      MONITOR: { LOW: false, MEDIUM: false, HIGH: false },
      RECOMMEND: { LOW: false, MEDIUM: false, HIGH: false },
      AUTO_SAFE: { LOW: true, MEDIUM: false, HIGH: false },
      AUTOPILOT: { LOW: true, MEDIUM: true, HIGH: false },
    }
    for (const mode of AUTONOMY_MODES) {
      for (const risk of RISK_TIERS) {
        expect(canAutoApply(mode, risk), `${mode}/${risk}`).toBe(expected[mode]![risk]!)
      }
    }
  })

  it('only permits writes in the two automating modes', () => {
    expect(allowsWrites('MONITOR')).toBe(false)
    expect(allowsWrites('RECOMMEND')).toBe(false)
    expect(allowsWrites('AUTO_SAFE')).toBe(true)
    expect(allowsWrites('AUTOPILOT')).toBe(true)
  })
})

describe('recommendation classification ordering', () => {
  it('treats only genuine recommendations as recommended', () => {
    expect(isRecommended('NOT_PRESENT')).toBe(false)
    expect(isRecommended('MENTIONED')).toBe(false)
    expect(isRecommended('RELEVANT_RECOMMENDATION')).toBe(true)
    expect(isRecommended('TOP_3')).toBe(true)
    expect(isRecommended('STRONGLY_RECOMMENDED')).toBe(true)
  })

  it('nests top-1 inside top-3 inside mentioned', () => {
    expect(isTop1('TOP_1')).toBe(true)
    expect(isTop3('TOP_1')).toBe(true)
    expect(isMentioned('TOP_1')).toBe(true)
    expect(isTop1('TOP_3')).toBe(false)
    expect(isMentioned('NOT_PRESENT')).toBe(false)
  })
})

describe('provenance honesty', () => {
  it('classifies only real API observations as real', () => {
    expect(isRealObservation('OBSERVED_API')).toBe(true)
    expect(isRealObservation('SEARCH_EVIDENCE')).toBe(true)
    expect(isRealObservation('SYNTHETIC')).toBe(false)
    expect(isRealObservation('INFERRED')).toBe(false)
    expect(isRealObservation('HISTORICAL')).toBe(false)
  })

  it('never grants a synthetic source any confidence', () => {
    expect(SOURCE_CONFIDENCE.SYNTHETIC).toBe('UNKNOWN')
    expect(SOURCE_CONFIDENCE.CUSTOMER_PROVIDED).toBe('HIGH')
    expect(atLeastConfidence(SOURCE_CONFIDENCE.INFERRED, 'MEDIUM')).toBe(false)
  })
})

describe('freshness', () => {
  const now = new Date('2026-08-19T12:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)

  it('grades against the default policy', () => {
    expect(freshnessOf(daysAgo(1), now)).toBe('FRESH')
    expect(freshnessOf(daysAgo(10), now)).toBe('RECENT')
    expect(freshnessOf(daysAgo(45), now)).toBe('AGING')
    expect(freshnessOf(daysAgo(200), now)).toBe('STALE')
  })

  it('ages opening hours faster than a phone number', () => {
    const hours = FRESHNESS_BY_FACT_KIND.opening_hours!
    const phone = FRESHNESS_BY_FACT_KIND.phone!
    expect(freshnessOf(daysAgo(5), now, hours)).toBe('RECENT')
    expect(freshnessOf(daysAgo(5), now, phone)).toBe('FRESH')
    expect(freshnessOf(daysAgo(40), now, hours)).toBe('STALE')
    expect(freshnessOf(daysAgo(40), now, phone)).toBe('RECENT')
  })
})

describe('roles', () => {
  it('ranks roles so a viewer can never pass an editor check', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true)
    expect(hasRole('EDITOR', 'EDITOR')).toBe(true)
    expect(hasRole('VIEWER', 'EDITOR')).toBe(false)
    expect(hasRole('ADMIN', 'OWNER')).toBe(false)
  })
})
