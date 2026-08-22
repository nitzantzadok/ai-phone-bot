/**
 * What a single request may spend.
 *
 * This file exists because the two most expensive bugs a product like this can ship are
 * invisible in a code review and only show up on a provider invoice a month later:
 *
 *  - a public endpoint that spends money for anyone who types a URL;
 *  - a per-request path handed the plan's *monthly* ceiling, so every refresh is entitled
 *    to a full month of budget.
 *
 * Both were live. Neither throws, neither logs, and both look completely reasonable on the
 * screen. Only an assertion catches them.
 */
import { describe, expect, it } from 'vitest'
import { PLANS } from '@autopilot/billing/plans.ts'
import { dashboardBudget, freeScanBudget } from '../src/lib/spend'

/** Roughly what one search-grounded question costs, in agorot. */
const COST_PER_QUESTION = 15

describe('the public free scan', () => {
  it('never asks a real AI engine', () => {
    // A stranger typing a URL must not be able to spend the owner's provider budget.
    // The rate limit is per instance and in memory; it is a brake, not a wall.
    expect(freeScanBudget().measureAi).toBe(false)
  })

  it('is allowed to spend nothing at all', () => {
    expect(freeScanBudget().maxSpendMinor).toBe(0)
  })

  it('still crawls enough pages to produce a real report', () => {
    // The half that is free is the half that finds the fixes. Cutting it to save money
    // would leave a free scan with nothing in it worth reading.
    expect(freeScanBudget().maxPages).toBeGreaterThanOrEqual(10)
    expect(freeScanBudget().maxPrompts).toBeGreaterThan(0)
  })
})

describe('a signed-in dashboard', () => {
  it('measures, because that is what the plan is for', () => {
    expect(dashboardBudget('GROWTH').measureAi).toBe(true)
  })

  it('never spends a month of budget on one page render', () => {
    // The bug: `maxSpendMinor: plan.limits.monthlySpendCapMinor`. Ten refreshes then cost
    // ten months of allowance, and nothing in the request path notices.
    for (const plan of Object.values(PLANS)) {
      const budget = dashboardBudget(plan.code)
      expect(budget.maxSpendMinor).toBeLessThan(plan.limits.monthlySpendCapMinor)
    }
  })

  it('keeps a single render cheap enough that refreshing cannot matter', () => {
    const budget = dashboardBudget('GROWTH')
    const monthlyRevenue = PLANS.GROWTH.monthlyNet!.amount

    // Under 1% of the plan price, so even a customer who reloads a hundred times in a day
    // stays comfortably inside the margin.
    expect(budget.maxSpendMinor / monthlyRevenue).toBeLessThan(0.01)
  })

  it('sizes the ceiling to what the questions it asks actually cost', () => {
    const budget = dashboardBudget('GROWTH')
    // Enough headroom for the questions it will ask, so a legitimate render is never
    // truncated by its own budget — the ceiling is there for repetition, not for scarcity.
    expect(budget.maxSpendMinor).toBeGreaterThanOrEqual(budget.maxPrompts * COST_PER_QUESTION)
  })

  it('never exceeds what the plan itself permits', () => {
    for (const plan of Object.values(PLANS)) {
      const budget = dashboardBudget(plan.code)
      expect(budget.maxPrompts).toBeLessThanOrEqual(plan.limits.monitored_prompts)
      expect(budget.maxPages).toBeLessThanOrEqual(plan.limits.crawl_page)
    }
  })

  it('does not measure on the free plan', () => {
    // Choosing a plan currently costs nothing, so a free tier that measures makes the
    // dashboard exactly as exposed as the public endpoint. Measuring is what paying buys.
    expect(dashboardBudget('FREE_SCAN').measureAi).toBe(false)
    expect(dashboardBudget('FREE_SCAN').maxSpendMinor).toBe(0)
  })

  it('spends at most a tenth of the month on any single render', () => {
    for (const plan of Object.values(PLANS)) {
      const budget = dashboardBudget(plan.code)
      expect(budget.maxSpendMinor).toBeLessThanOrEqual(plan.limits.monthlySpendCapMinor / 10)
    }
  })
})

describe('the margin these ceilings protect', () => {
  it('leaves a healthy gross margin even at the monthly cap', () => {
    const plan = PLANS.GROWTH
    const revenue = plan.monthlyNet!.amount
    const worstCase = plan.limits.monthlySpendCapMinor

    const margin = (revenue - worstCase) / revenue
    // A customer who somehow burns the entire monthly allowance still leaves 75%+.
    expect(margin).toBeGreaterThan(0.75)
  })

  it('caps AI spend well below the price on every paid plan', () => {
    for (const plan of Object.values(PLANS)) {
      if (!plan.monthlyNet) continue
      expect(plan.limits.monthlySpendCapMinor).toBeLessThan(plan.monthlyNet.amount * 0.3)
    }
  })
})
