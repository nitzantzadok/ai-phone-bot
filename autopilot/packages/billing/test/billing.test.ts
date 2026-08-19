import { describe, expect, it } from 'vitest'
import { FixedClock } from '@autopilot/shared/clock.ts'
import { IL, resolveVatPeriod } from '@autopilot/shared/country.ts'
import { applyVatToNet, majorUnits } from '@autopilot/shared/money.ts'
import { PLANS, annualSavingMinor, getPlan, purchasablePlans } from '../src/plans.ts'
import { MockPaymentProvider } from '../src/providers/mock.ts'
import {
  GRACE_PERIOD_DAYS,
  MAX_PAYMENT_ATTEMPTS,
  accessFor,
  applyBillingEvent,
  effectiveAutonomy,
  initialState,
  settleState,
  type SubscriptionState,
} from '../src/subscription.ts'
import { UsageMeter, assertQuota, checkQuota } from '../src/metering.ts'
import { API_COST_RATIO_ALERT, contributionMargin, portfolioEconomics } from '../src/economics.ts'
import type { BillingEvent } from '../src/provider.ts'

const clock = () => new FixedClock(new Date('2026-08-19T10:00:00Z'))

const event = (type: BillingEvent['type']): BillingEvent => ({
  id: 'evt_1',
  type,
  occurredAt: new Date('2026-08-19T10:00:00Z'),
  raw: {},
})

describe('plans', () => {
  it('prices the launch plan at the modelled 699 ILS net', () => {
    expect(getPlan('GROWTH').monthlyNet!.amount).toBe(69_900)
    expect(getPlan('GROWTH').annualNet!.amount).toBe(699_000)
  })

  it('quotes net, so the invoice adds VAT on top', () => {
    const plan = getPlan('GROWTH')
    const period = resolveVatPeriod(IL, new Date('2026-08-19'))
    const taxed = applyVatToNet(plan.monthlyNet!, period.rateBps, period.id)
    expect(taxed.net.amount).toBe(69_900)
    expect(taxed.gross.amount).toBe(82_482)
  })

  it('offers an annual saving without inventing a discount off a fake price', () => {
    expect(annualSavingMinor(getPlan('GROWTH'))).toBe(69_900 * 12 - 699_000)
    expect(annualSavingMinor(getPlan('FREE_SCAN'))).toBe(0)
  })

  it('caps AI spend well below net revenue on every paid plan', () => {
    for (const plan of purchasablePlans()) {
      const ratio = plan.limits.monthlySpendCapMinor / plan.monthlyNet!.amount
      expect(ratio, plan.code).toBeLessThan(0.3)
    }
  })

  it('never lets the free scan run up a real bill', () => {
    expect(PLANS.FREE_SCAN.limits.monthlySpendCapMinor).toBeLessThan(1000)
    expect(PLANS.FREE_SCAN.maxAutonomy).toBe('MONITOR')
  })

  it('does not offer autonomy above what the plan allows', () => {
    expect(PLANS.STARTER.maxAutonomy).toBe('RECOMMEND')
    expect(PLANS.GROWTH.maxAutonomy).toBe('AUTOPILOT')
  })
})

describe('subscription lifecycle', () => {
  const now = new Date('2026-08-19T10:00:00Z')

  it('starts a trial and grants full access during it', () => {
    const state = initialState('GROWTH', now)
    expect(state.status).toBe('TRIALING')
    expect(state.trialEndsAt).toEqual(new Date('2026-09-02T10:00:00Z'))
    expect(accessFor(state).canApplyChanges).toBe(true)
  })

  it('expires a trial that ends without a payment rather than assuming payment', () => {
    const state = initialState('GROWTH', now)
    const later = settleState(state, new Date('2026-09-03T10:00:00Z'))
    expect(later.status).toBe('EXPIRED')
    expect(accessFor(later).canUseProduct).toBe(false)
  })

  it('activates on the first paid invoice', () => {
    const state = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    expect(state.status).toBe('ACTIVE')
    expect(state.trialEndsAt).toBeNull()
  })

  it('enters grace on a failed payment, keeping measurement but stopping writes', () => {
    const active = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    const failed = applyBillingEvent(active, event('invoice.payment_failed'), clock())

    expect(failed.status).toBe('GRACE')
    expect(failed.graceEndsAt).toEqual(
      new Date(now.getTime() + GRACE_PERIOD_DAYS * 86_400_000),
    )

    const access = accessFor(failed)
    expect(access.canUseProduct).toBe(true)
    expect(access.canRunMeasurement).toBe(true)
    expect(access.canApplyChanges).toBe(false)
    expect(access.reason).toContain('automatic changes are paused')
  })

  it('does not extend the grace window on each retry', () => {
    const failing = clock()
    let state = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), failing)
    state = applyBillingEvent(state, event('invoice.payment_failed'), failing)
    const firstGraceEnd = state.graceEndsAt

    failing.advanceDays(3)
    state = applyBillingEvent(state, event('invoice.payment_failed'), failing)
    expect(state.graceEndsAt).toEqual(firstGraceEnd)
    expect(state.failedPaymentCount).toBe(2)
  })

  it('expires after the maximum number of failed attempts', () => {
    let state = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    for (let i = 0; i < MAX_PAYMENT_ATTEMPTS; i++) {
      state = applyBillingEvent(state, event('invoice.payment_failed'), clock())
    }
    expect(state.status).toBe('EXPIRED')
  })

  it('expires when the grace period elapses', () => {
    const active = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    const grace = applyBillingEvent(active, event('invoice.payment_failed'), clock())
    const settled = settleState(grace, new Date(now.getTime() + (GRACE_PERIOD_DAYS + 1) * 86_400_000))
    expect(settled.status).toBe('EXPIRED')
  })

  it('recovers fully when a late payment succeeds', () => {
    const active = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    const grace = applyBillingEvent(active, event('invoice.payment_failed'), clock())
    const recovered = applyBillingEvent(grace, event('invoice.paid'), clock())

    expect(recovered.status).toBe('ACTIVE')
    expect(recovered.graceEndsAt).toBeNull()
    expect(recovered.failedPaymentCount).toBe(0)
    expect(accessFor(recovered).canApplyChanges).toBe(true)
  })

  it('pauses and resumes without losing data', () => {
    const active = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    const paused = applyBillingEvent(active, event('subscription.paused'), clock())
    expect(accessFor(paused).canUseProduct).toBe(true)
    expect(accessFor(paused).canRunMeasurement).toBe(false)
    expect(accessFor(paused).reason).toContain('data is kept')

    const resumed = applyBillingEvent(paused, event('subscription.resumed'), clock())
    expect(resumed.status).toBe('ACTIVE')
  })

  it('cancels and removes access, telling the customer their data is retained', () => {
    const active = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    const canceled = applyBillingEvent(active, event('subscription.canceled'), clock())
    expect(canceled.canceledAt).not.toBeNull()
    expect(accessFor(canceled).canUseProduct).toBe(false)
    expect(accessFor(canceled).reason).toContain('30 days')
  })

  it('is idempotent for a webhook delivered twice', () => {
    const active = applyBillingEvent(initialState('GROWTH', now), event('invoice.paid'), clock())
    const twice = applyBillingEvent(active, event('invoice.paid'), clock())
    expect(twice).toEqual(active)
  })
})

describe('effectiveAutonomy', () => {
  const active = (planCode: 'STARTER' | 'GROWTH'): SubscriptionState => ({
    ...initialState(planCode, new Date()),
    status: 'ACTIVE',
    trialEndsAt: null,
  })

  it('clamps a request above what the plan allows', () => {
    expect(effectiveAutonomy('AUTOPILOT', active('STARTER'))).toBe('RECOMMEND')
    expect(effectiveAutonomy('AUTOPILOT', active('GROWTH'))).toBe('AUTOPILOT')
  })

  it('clamps to RECOMMEND while a payment is failing, whatever the plan allows', () => {
    const grace = applyBillingEvent(active('GROWTH'), event('invoice.payment_failed'), clock())
    expect(effectiveAutonomy('AUTOPILOT', grace)).toBe('RECOMMEND')
  })

  it('leaves a lower request alone', () => {
    expect(effectiveAutonomy('MONITOR', active('GROWTH'))).toBe('MONITOR')
  })
})

describe('quota enforcement', () => {
  const usage = (o: Partial<Parameters<typeof checkQuota>[3]> = {}) => ({
    monthly: {},
    hourlyExecutions: 0,
    monthlySpendMinor: 0,
    ...o,
  })

  it('allows work within the plan', () => {
    expect(checkQuota('GROWTH', 'prompt_execution', 10, usage()).allowed).toBe(true)
  })

  it('refuses work beyond the monthly allowance', () => {
    const decision = checkQuota('GROWTH', 'prompt_execution', 1, usage({ monthly: { prompt_execution: 2000 } }))
    expect(decision.allowed).toBe(false)
    expect(decision.boundBy).toBe('MONTHLY_UNITS')
    expect(decision.reason).toContain('2000')
  })

  it('refuses a burst even when the monthly allowance is untouched', () => {
    const decision = checkQuota('GROWTH', 'prompt_execution', 50, usage({ hourlyExecutions: 290 }))
    expect(decision.allowed).toBe(false)
    expect(decision.boundBy).toBe('HOURLY_BURST')
  })

  it('refuses everything once the monthly spend cap is hit, whatever the unit counts say', () => {
    const decision = checkQuota('GROWTH', 'prompt_execution', 1, usage({ monthlySpendMinor: 17_000 }))
    expect(decision.allowed).toBe(false)
    expect(decision.boundBy).toBe('MONTHLY_SPEND')
    expect(decision.reason).toContain('analysis budget')
  })

  it('raises a retryable error for a burst and a hard error for an exhausted plan', () => {
    expect(() => assertQuota('GROWTH', 'prompt_execution', 50, usage({ hourlyExecutions: 290 })))
      .toThrow(/Quota exceeded/)
    try {
      assertQuota('GROWTH', 'prompt_execution', 50, usage({ hourlyExecutions: 290 }))
    } catch (e) {
      expect((e as { code: string; retryable: boolean }).code).toBe('RATE_LIMITED')
      expect((e as { retryable: boolean }).retryable).toBe(true)
    }
    try {
      assertQuota('GROWTH', 'prompt_execution', 1, usage({ monthly: { prompt_execution: 2000 } }))
    } catch (e) {
      expect((e as { code: string }).code).toBe('QUOTA_EXCEEDED')
      expect((e as { retryable: boolean }).retryable).toBe(false)
    }
  })
})

describe('UsageMeter', () => {
  it('accumulates per organization, month and hour', () => {
    const time = clock()
    const meter = new UsageMeter(time)
    meter.record('org-1', 'prompt_execution', 5)
    meter.record('org-1', 'prompt_execution', 3)
    meter.record('org-2', 'prompt_execution', 100)
    meter.recordSpend('org-1', 250)

    const snapshot = meter.snapshot('org-1')
    expect(snapshot.monthly.prompt_execution).toBe(8)
    expect(snapshot.hourlyExecutions).toBe(8)
    expect(snapshot.monthlySpendMinor).toBe(250)
    expect(meter.snapshot('org-2').monthly.prompt_execution).toBe(100)
  })

  it('rolls the hourly burst window forward', () => {
    const time = clock()
    const meter = new UsageMeter(time)
    meter.record('org-1', 'prompt_execution', 10)
    time.advance(60 * 60 * 1000 + 1)
    expect(meter.snapshot('org-1').hourlyExecutions).toBe(0)
    // Monthly consumption persists across the hour boundary.
    expect(meter.snapshot('org-1').monthly.prompt_execution).toBe(10)
  })
})

describe('unit economics', () => {
  const healthy = {
    netRevenueMinor: 69_900,
    aiCostMinor: 8_000,
    searchCostMinor: 3_000,
    infrastructureAllocationMinor: 4_000,
    paymentProcessingMinor: 2_000,
    supportAllocationMinor: 3_000,
  }

  it('computes contribution margin from net revenue, never gross', () => {
    const margin = contributionMargin(healthy)
    expect(margin.netRevenue.amount).toBe(69_900)
    expect(margin.contributionMargin.amount).toBe(69_900 - 20_000)
    expect(margin.marginRatio).toBeGreaterThan(0.7)
    expect(margin.flagged).toBe(false)
  })

  it('flags a customer whose AI spend eats the margin', () => {
    const margin = contributionMargin({ ...healthy, aiCostMinor: 25_000, searchCostMinor: 5_000 })
    expect(margin.apiCostRatio).toBeGreaterThan(API_COST_RATIO_ALERT)
    expect(margin.flagged).toBe(true)
    expect(margin.flagReason).toContain('% of net revenue')
  })

  it('reports a negative margin rather than clamping it to zero', () => {
    const margin = contributionMargin({ ...healthy, aiCostMinor: 90_000 })
    expect(margin.contributionMargin.amount).toBeLessThan(0)
    expect(margin.marginRatio).toBeLessThan(0)
    expect(margin.flagged).toBe(true)
  })

  it('computes portfolio break-even from real contribution, not from revenue', () => {
    const portfolio = portfolioEconomics(Array.from({ length: 10 }, () => healthy), 500_000)
    expect(portfolio.customerCount).toBe(10)
    expect(portfolio.mrrMinor).toBe(699_000)
    expect(portfolio.arrMinor).toBe(699_000 * 12)
    expect(portfolio.blendedMarginRatio).toBeGreaterThan(0.7)
    expect(portfolio.breakEvenCustomers).toBe(11)
  })

  it('reports break-even as unreachable when contribution is negative', () => {
    const portfolio = portfolioEconomics([{ ...healthy, aiCostMinor: 90_000 }], 500_000)
    expect(portfolio.breakEvenCustomers).toBe(Infinity)
  })
})

describe('MockPaymentProvider', () => {
  it('runs a full subscription lifecycle with correctly taxed invoices', async () => {
    const time = clock()
    const provider = new MockPaymentProvider({ clock: time })
    const customer = await provider.createCustomer({
      email: 'owner@rosa.co.il',
      name: 'Rosa',
      taxId: '512345678',
    })
    const subscription = await provider.createSubscription({
      providerCustomerId: customer.providerCustomerId,
      planCode: 'GROWTH',
      interval: 'MONTHLY',
      netAmount: majorUnits(699, 'ILS'),
      trialDays: 14,
    })

    expect(subscription.status).toBe('TRIALING')
    // No invoice during a trial: nothing is owed yet.
    expect(await provider.getInvoice('inv_missing')).toBeNull()

    time.advanceDays(14)
    const { invoice, failed } = provider.renew(subscription.providerSubscriptionId)
    expect(failed).toBe(false)
    expect(invoice!.amount.net.amount).toBe(69_900)
    expect(invoice!.amount.vatRateBps).toBe(1800)
    expect(invoice!.amount.gross.amount).toBe(82_482)
    expect(invoice!.status).toBe('PAID')
  })

  it('simulates a failed charge so the dunning path can be exercised', async () => {
    const provider = new MockPaymentProvider({ clock: clock(), failNextCharge: true })
    const customer = await provider.createCustomer({ email: 'a@b.co.il', name: 'X' })
    const subscription = await provider.createSubscription({
      providerCustomerId: customer.providerCustomerId,
      planCode: 'GROWTH',
      interval: 'MONTHLY',
      netAmount: majorUnits(699, 'ILS'),
      trialDays: 0,
    })
    const result = provider.renew(subscription.providerSubscriptionId)
    expect(result.failed).toBe(true)
    expect(result.invoice).toBeNull()
  })

  it('rejects a webhook whose signature does not verify', async () => {
    const provider = new MockPaymentProvider({ webhookSecret: 'whsec_test' })
    const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' })
    await expect(
      provider.handleWebhook({ payload, signature: 'forged', receivedAt: new Date() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('accepts a correctly signed webhook and normalises it', async () => {
    const provider = new MockPaymentProvider({ webhookSecret: 'whsec_test' })
    const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', subscriptionId: 'sub_1' })
    const parsed = await provider.handleWebhook({
      payload,
      signature: provider.signPayload(payload),
      receivedAt: new Date('2026-08-19T10:00:00Z'),
    })
    expect(parsed.type).toBe('invoice.paid')
    expect(parsed.providerSubscriptionId).toBe('sub_1')
  })

  it('refuses to refund more than was invoiced', async () => {
    const provider = new MockPaymentProvider({ clock: clock() })
    const customer = await provider.createCustomer({ email: 'a@b.co.il', name: 'X' })
    const subscription = await provider.createSubscription({
      providerCustomerId: customer.providerCustomerId,
      planCode: 'GROWTH',
      interval: 'MONTHLY',
      netAmount: majorUnits(699, 'ILS'),
      trialDays: 0,
    })
    const { invoice } = provider.renew(subscription.providerSubscriptionId)
    await expect(
      provider.refund({
        providerInvoiceId: invoice!.providerInvoiceId,
        amount: majorUnits(2000, 'ILS'),
        reason: 'test',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
