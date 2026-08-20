/**
 * Fully functional in-memory payment provider.
 *
 * Not a stub: it maintains real subscription state, issues invoices with correctly
 * computed VAT, fails payments on demand and signs its own webhooks. That makes the entire
 * billing lifecycle — trial, renewal, failed payment, grace, cancellation, refund —
 * exercisable in tests and in the demo without a merchant account.
 */
import { randomUUID } from 'node:crypto'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import { AppError } from '@autopilot/shared/errors.ts'
import { sign, verifySignature } from '@autopilot/shared/crypto.ts'
import { applyVatToNet, type Money } from '@autopilot/shared/money.ts'
import { IL, resolveVatPeriod } from '@autopilot/shared/country.ts'
import type {
  BillingEvent,
  BillingInterval,
  CustomerRef,
  PaymentProvider,
  ProviderInvoice,
  SubscriptionRef,
} from '../provider.ts'
import type { PlanCode } from '../plans.ts'

interface StoredSubscription {
  id: string
  customerId: string
  planCode: PlanCode
  interval: BillingInterval
  netAmount: Money
  status: SubscriptionRef['status']
  currentPeriodStart: Date
  currentPeriodEnd: Date
  trialEndsAt: Date | null
  paused: boolean
}

export interface MockPaymentProviderOptions {
  readonly clock?: Clock
  readonly webhookSecret?: string
  /** Makes the next charge fail, for exercising the dunning path. */
  failNextCharge?: boolean
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'

  private readonly customers = new Map<string, CustomerRef>()
  private readonly subscriptions = new Map<string, StoredSubscription>()
  private readonly invoices = new Map<string, ProviderInvoice>()
  private invoiceCounter = 1000
  private readonly clock: Clock

  constructor(private readonly options: MockPaymentProviderOptions = {}) {
    this.clock = options.clock ?? systemClock
  }

  async createCustomer(input: {
    email: string
    name: string
    taxId?: string
  }): Promise<CustomerRef> {
    const ref: CustomerRef = {
      providerCustomerId: `cus_${randomUUID().slice(0, 12)}`,
      email: input.email,
      name: input.name,
      ...(input.taxId ? { taxId: input.taxId } : {}),
    }
    this.customers.set(ref.providerCustomerId, ref)
    return ref
  }

  async createSubscription(input: {
    providerCustomerId: string
    planCode: PlanCode
    interval: BillingInterval
    netAmount: Money
    trialDays: number
  }): Promise<SubscriptionRef> {
    if (!this.customers.has(input.providerCustomerId)) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Unknown customer' })
    }

    const now = this.clock.now()
    const trialEndsAt =
      input.trialDays > 0 ? new Date(now.getTime() + input.trialDays * 86_400_000) : null
    const periodStart = trialEndsAt ?? now
    const periodEnd = addInterval(periodStart, input.interval)

    const subscription: StoredSubscription = {
      id: `sub_${randomUUID().slice(0, 12)}`,
      customerId: input.providerCustomerId,
      planCode: input.planCode,
      interval: input.interval,
      netAmount: input.netAmount,
      status: trialEndsAt ? 'TRIALING' : 'ACTIVE',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialEndsAt,
      paused: false,
    }
    this.subscriptions.set(subscription.id, subscription)

    // A trial issues no invoice: nothing is owed until it converts.
    if (!trialEndsAt) this.issueInvoice(subscription)

    return toRef(subscription)
  }

  async cancelSubscription(id: string, atPeriodEnd: boolean): Promise<SubscriptionRef> {
    const subscription = this.require(id)
    subscription.status = 'CANCELED'
    if (!atPeriodEnd) subscription.currentPeriodEnd = this.clock.now()
    return toRef(subscription)
  }

  async pauseSubscription(id: string): Promise<SubscriptionRef> {
    const subscription = this.require(id)
    subscription.paused = true
    return toRef(subscription)
  }

  async resumeSubscription(id: string): Promise<SubscriptionRef> {
    const subscription = this.require(id)
    subscription.paused = false
    subscription.status = 'ACTIVE'
    return toRef(subscription)
  }

  async refund(input: { providerInvoiceId: string; amount: Money; reason: string }): Promise<void> {
    const invoice = this.invoices.get(input.providerInvoiceId)
    if (!invoice) throw new AppError({ code: 'NOT_FOUND', message: 'Unknown invoice' })
    if (input.amount.amount > invoice.amount.gross.amount) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Refund exceeds the invoiced amount',
      })
    }
    this.invoices.set(input.providerInvoiceId, { ...invoice, status: 'VOID' })
  }

  async getInvoice(id: string): Promise<ProviderInvoice | null> {
    return this.invoices.get(id) ?? null
  }

  async listInvoices(customerId: string): Promise<readonly ProviderInvoice[]> {
    const subscriptionIds = new Set(
      [...this.subscriptions.values()].filter((s) => s.customerId === customerId).map((s) => s.id),
    )
    return [...this.invoices.values()].filter((i) => subscriptionIds.has(i.number.split(':')[1] ?? ''))
  }

  async handleWebhook(input: {
    payload: string
    signature: string
    receivedAt: Date
  }): Promise<BillingEvent> {
    const secret = this.options.webhookSecret
    if (secret && !verifySignature(input.payload, secret, input.signature)) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Webhook signature verification failed',
        details: { provider: this.name },
      })
    }
    const parsed = JSON.parse(input.payload) as Record<string, unknown>
    return {
      id: String(parsed.id ?? randomUUID()),
      type: parsed.type as BillingEvent['type'],
      providerSubscriptionId: parsed.subscriptionId as string | undefined,
      providerCustomerId: parsed.customerId as string | undefined,
      providerInvoiceId: parsed.invoiceId as string | undefined,
      occurredAt: input.receivedAt,
      raw: parsed,
    }
  }

  /* ------------------------------------------------ test and demo helpers ----- */

  /** Advances a subscription to its next period, as a renewal webhook would. */
  renew(subscriptionId: string): { invoice: ProviderInvoice | null; failed: boolean } {
    const subscription = this.require(subscriptionId)
    subscription.currentPeriodStart = subscription.currentPeriodEnd
    subscription.currentPeriodEnd = addInterval(
      subscription.currentPeriodEnd,
      subscription.interval,
    )
    subscription.trialEndsAt = null

    if (this.options.failNextCharge) {
      this.options.failNextCharge = false
      subscription.status = 'PAST_DUE'
      return { invoice: null, failed: true }
    }

    subscription.status = 'ACTIVE'
    return { invoice: this.issueInvoice(subscription), failed: false }
  }

  signPayload(payload: string): string {
    return sign(payload, this.options.webhookSecret ?? '')
  }

  private issueInvoice(subscription: StoredSubscription): ProviderInvoice {
    const issuedAt = this.clock.now()
    // VAT resolved for the ISSUE DATE, never from today's rate.
    const period = resolveVatPeriod(IL, issuedAt)
    const amount = applyVatToNet(subscription.netAmount, period.rateBps, period.id)
    const invoice: ProviderInvoice = {
      providerInvoiceId: `inv_${randomUUID().slice(0, 12)}`,
      number: `IL-${this.invoiceCounter++}:${subscription.id}`,
      amount,
      status: 'PAID',
      issuedAt,
      paidAt: issuedAt,
    }
    this.invoices.set(invoice.providerInvoiceId, invoice)
    return invoice
  }

  private require(id: string): StoredSubscription {
    const subscription = this.subscriptions.get(id)
    if (!subscription) throw new AppError({ code: 'NOT_FOUND', message: 'Unknown subscription' })
    return subscription
  }
}

const addInterval = (from: Date, interval: BillingInterval): Date => {
  const next = new Date(from)
  if (interval === 'ANNUAL') next.setUTCFullYear(next.getUTCFullYear() + 1)
  else next.setUTCMonth(next.getUTCMonth() + 1)
  return next
}

const toRef = (s: StoredSubscription): SubscriptionRef => ({
  providerSubscriptionId: s.id,
  status: s.status,
  currentPeriodStart: s.currentPeriodStart,
  currentPeriodEnd: s.currentPeriodEnd,
  trialEndsAt: s.trialEndsAt,
})
