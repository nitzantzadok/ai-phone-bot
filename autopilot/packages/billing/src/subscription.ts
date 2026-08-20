/**
 * Subscription lifecycle.
 *
 * A pure state machine over the normalised billing events. Keeping it pure means the
 * awkward cases — a failed payment during a trial, a cancellation while paused, a webhook
 * arriving twice — are testable exhaustively rather than discovered in production by a
 * customer who lost access they had paid for.
 *
 * The bias throughout is toward the customer: a failed payment starts a grace period with
 * degraded automation rather than an immediate shutdown, because a card that expired on a
 * Friday should not silently stop a business's optimization over the weekend.
 */
import type { Clock } from '@autopilot/shared/clock.ts'
import type { AutonomyMode } from '@autopilot/shared/domain.ts'
import type { BillingEvent } from './provider.ts'
import { getPlan, type PlanCode } from './plans.ts'

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'GRACE'
  | 'PAUSED'
  | 'CANCELED'
  | 'EXPIRED'

export interface SubscriptionState {
  readonly planCode: PlanCode
  readonly status: SubscriptionStatus
  readonly currentPeriodStart: Date | null
  readonly currentPeriodEnd: Date | null
  readonly trialEndsAt: Date | null
  readonly graceEndsAt: Date | null
  readonly canceledAt: Date | null
  readonly cancelAtPeriodEnd: boolean
  readonly failedPaymentCount: number
}

/** Days of continued service after a failed payment before access is suspended. */
export const GRACE_PERIOD_DAYS = 7
/** Failed attempts before we stop retrying and expire the subscription. */
export const MAX_PAYMENT_ATTEMPTS = 4

export const initialState = (planCode: PlanCode, now: Date): SubscriptionState => {
  const plan = getPlan(planCode)
  const trialEndsAt =
    plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 86_400_000) : null
  return {
    planCode,
    status: trialEndsAt ? 'TRIALING' : 'ACTIVE',
    currentPeriodStart: now,
    currentPeriodEnd: null,
    trialEndsAt,
    graceEndsAt: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    failedPaymentCount: 0,
  }
}

export const applyBillingEvent = (
  state: SubscriptionState,
  event: BillingEvent,
  clock: Clock,
): SubscriptionState => {
  const now = clock.now()

  switch (event.type) {
    case 'subscription.created':
      return { ...state, status: state.trialEndsAt ? 'TRIALING' : 'ACTIVE' }

    case 'invoice.paid':
      // A successful payment always clears dunning, whatever state we were in.
      return {
        ...state,
        status: state.cancelAtPeriodEnd ? state.status : 'ACTIVE',
        trialEndsAt: null,
        graceEndsAt: null,
        failedPaymentCount: 0,
      }

    case 'invoice.payment_failed': {
      const attempts = state.failedPaymentCount + 1
      if (attempts >= MAX_PAYMENT_ATTEMPTS) {
        return { ...state, status: 'EXPIRED', failedPaymentCount: attempts, graceEndsAt: null }
      }
      return {
        ...state,
        status: 'GRACE',
        failedPaymentCount: attempts,
        // The grace window starts at the FIRST failure and is not extended by retries.
        graceEndsAt: state.graceEndsAt ?? new Date(now.getTime() + GRACE_PERIOD_DAYS * 86_400_000),
      }
    }

    case 'subscription.renewed':
      return { ...state, status: 'ACTIVE', graceEndsAt: null, failedPaymentCount: 0 }

    case 'subscription.paused':
      return { ...state, status: 'PAUSED' }

    case 'subscription.resumed':
      return { ...state, status: 'ACTIVE', graceEndsAt: null }

    case 'subscription.canceled':
      return { ...state, status: 'CANCELED', canceledAt: now }

    case 'refund.issued':
      return state
  }
}

/** Time-driven transitions, applied on read so a stale row cannot grant access. */
export const settleState = (state: SubscriptionState, now: Date): SubscriptionState => {
  if (state.status === 'TRIALING' && state.trialEndsAt && now >= state.trialEndsAt) {
    // A trial that ends without a payment expires; it does not silently become paid.
    return { ...state, status: 'EXPIRED', trialEndsAt: state.trialEndsAt }
  }
  if (state.status === 'GRACE' && state.graceEndsAt && now >= state.graceEndsAt) {
    return { ...state, status: 'EXPIRED' }
  }
  if (
    state.cancelAtPeriodEnd &&
    state.currentPeriodEnd &&
    now >= state.currentPeriodEnd &&
    state.status !== 'CANCELED'
  ) {
    return { ...state, status: 'CANCELED', canceledAt: now }
  }
  return state
}

export interface AccessDecision {
  readonly canUseProduct: boolean
  readonly canRunMeasurement: boolean
  readonly canApplyChanges: boolean
  readonly maxAutonomy: AutonomyMode
  /** Plain-language explanation for the UI banner. */
  readonly reason: string
}

/**
 * What a subscription in this state is allowed to do.
 *
 * During grace the customer keeps measurement — losing their history because a card
 * expired would be punitive — but automated writes stop, because we should not be editing
 * a website for an account we are not being paid for.
 */
export const accessFor = (state: SubscriptionState): AccessDecision => {
  const plan = getPlan(state.planCode)

  switch (state.status) {
    case 'TRIALING':
    case 'ACTIVE':
      return {
        canUseProduct: true,
        canRunMeasurement: true,
        canApplyChanges: true,
        maxAutonomy: plan.maxAutonomy,
        reason: state.status === 'TRIALING' ? 'Trial in progress.' : 'Subscription active.',
      }

    case 'GRACE':
    case 'PAST_DUE':
      return {
        canUseProduct: true,
        canRunMeasurement: true,
        canApplyChanges: false,
        maxAutonomy: 'RECOMMEND',
        reason:
          'We could not take payment. Everything keeps running and we will keep measuring, ' +
          'but automatic changes are paused until the payment goes through.',
      }

    case 'PAUSED':
      return {
        canUseProduct: true,
        canRunMeasurement: false,
        canApplyChanges: false,
        maxAutonomy: 'MONITOR',
        reason: 'Your subscription is paused. Your data is kept and nothing is being changed.',
      }

    case 'CANCELED':
    case 'EXPIRED':
      return {
        canUseProduct: false,
        canRunMeasurement: false,
        canApplyChanges: false,
        maxAutonomy: 'MONITOR',
        reason:
          'Your subscription has ended. Your data is kept for 30 days if you want to come back.',
      }
  }
}

/** Clamps a requested autonomy mode to what the plan and billing state permit. */
export const effectiveAutonomy = (
  requested: AutonomyMode,
  state: SubscriptionState,
): AutonomyMode => {
  const order: AutonomyMode[] = ['MONITOR', 'RECOMMEND', 'AUTO_SAFE', 'AUTOPILOT']
  const ceiling = accessFor(state).maxAutonomy
  return order.indexOf(requested) <= order.indexOf(ceiling) ? requested : ceiling
}
