import { describe, expect, it } from 'vitest'
import {
  MIN_REPORTABLE_TRIALS,
  proportionConfidence,
  twoProportionPValue,
  wilsonInterval,
} from '../src/stats.ts'

describe('Wilson interval', () => {
  it('is wide and honest at tiny sample sizes', () => {
    const small = wilsonInterval(1, 2)
    expect(small.upper - small.lower).toBeGreaterThan(0.6)
  })

  it('tightens as evidence accumulates', () => {
    const widths = [10, 50, 200, 1000].map((n) => {
      const i = wilsonInterval(Math.round(n * 0.3), n)
      return i.upper - i.lower
    })
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeLessThan(widths[i - 1]!)
    }
  })

  it('stays inside [0,1] at the extremes, unlike the normal approximation', () => {
    const zero = wilsonInterval(0, 12)
    const all = wilsonInterval(12, 12)
    expect(zero.lower).toBe(0)
    expect(zero.upper).toBeGreaterThan(0)
    expect(zero.upper).toBeLessThan(0.35)
    expect(all.upper).toBe(1)
    expect(all.lower).toBeLessThan(1)
  })

  it('brackets the point estimate', () => {
    const i = wilsonInterval(27, 100)
    expect(i.lower).toBeLessThan(0.27)
    expect(i.upper).toBeGreaterThan(0.27)
  })
})

describe('proportionConfidence', () => {
  it('reports UNKNOWN with no trials rather than 0%', () => {
    expect(proportionConfidence(0, 0).confidence).toBe('UNKNOWN')
  })

  it('refuses to call a handful of prompts high confidence', () => {
    expect(proportionConfidence(2, MIN_REPORTABLE_TRIALS - 1).confidence).toBe('LOW')
  })

  it('reaches HIGH confidence only with a real sample', () => {
    expect(proportionConfidence(120, 400).confidence).toBe('HIGH')
  })
})

describe('two-proportion test', () => {
  it('finds no significance in a small before/after swing', () => {
    // 3/10 → 5/10 is the kind of move that looks exciting on a dashboard and means nothing.
    expect(twoProportionPValue(3, 10, 5, 10)).toBeGreaterThan(0.05)
  })

  it('detects a real shift on a large sample', () => {
    expect(twoProportionPValue(60, 300, 120, 300)).toBeLessThan(0.001)
  })

  it('returns 1 when a side has no observations', () => {
    expect(twoProportionPValue(0, 0, 5, 10)).toBe(1)
  })

  it('is symmetric in direction', () => {
    const a = twoProportionPValue(30, 100, 50, 100)
    const b = twoProportionPValue(50, 100, 30, 100)
    expect(a).toBeCloseTo(b, 10)
  })
})
