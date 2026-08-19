/**
 * PaymentProvider abstraction.
 *
 * The product deliberately does not build a payment processor, and equally deliberately
 * does not marry one. Israeli SaaS payment providers differ substantially from the
 * international ones, and the right choice depends on facts (card mix, invoicing
 * obligations, FX) that are decided at go-live rather than at design time.
 *
 * So billing logic talks to this interface, a fully working mock ships with the MVP, and
 * integrating a real provider means writing one adapter — not rewriting subscription
 * handling, VAT, dunning or invoicing.
 */
import type { Money, TaxedAmount } from '@autopilot/shared/money.ts'
import type { PlanCode } from './plans.ts'

export type BillingInterval = 'MONTHLY' | 'ANNUAL'

export interface CustomerRef {
  readonly providerCustomerId: string
  readonly email: string
  readonly name: string
  /** Israeli company or dealer number, required on a tax invoice. */
  readonly taxId?: string
}

export interface SubscriptionRef {
  readonly providerSubscriptionId: string
  readonly status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'
  readonly currentPeriodStart: Date
  readonly currentPeriodEnd: Date
  readonly trialEndsAt: Date | null
}

export interface ProviderInvoice {
  readonly providerInvoiceId: string
  readonly number: string
  readonly amount: TaxedAmount
  readonly status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE'
  readonly issuedAt: Date
  readonly paidAt: Date | null
  readonly hostedUrl?: string
}

/**
 * Webhook events, normalised.
 *
 * Every provider names these differently; the state machine only ever sees this vocabulary,
 * which is what keeps subscription handling provider-agnostic.
 */
export type BillingEventType =
  | 'subscription.created'
  | 'subscription.renewed'
  | 'subscription.canceled'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'refund.issued'

export interface BillingEvent {
  readonly id: string
  readonly type: BillingEventType
  readonly providerSubscriptionId?: string
  readonly providerCustomerId?: string
  readonly providerInvoiceId?: string
  readonly amount?: Money
  readonly occurredAt: Date
  readonly raw: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: string

  createCustomer(input: {
    email: string
    name: string
    taxId?: string
    organizationId: string
  }): Promise<CustomerRef>

  createSubscription(input: {
    providerCustomerId: string
    planCode: PlanCode
    interval: BillingInterval
    netAmount: Money
    trialDays: number
  }): Promise<SubscriptionRef>

  cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<SubscriptionRef>
  pauseSubscription(providerSubscriptionId: string): Promise<SubscriptionRef>
  resumeSubscription(providerSubscriptionId: string): Promise<SubscriptionRef>

  refund(input: { providerInvoiceId: string; amount: Money; reason: string }): Promise<void>

  getInvoice(providerInvoiceId: string): Promise<ProviderInvoice | null>
  listInvoices(providerCustomerId: string): Promise<readonly ProviderInvoice[]>

  /**
   * Verifies the signature and returns the normalised event.
   * Throws rather than returning null on a bad signature: an unverifiable webhook is an
   * attack until proven otherwise.
   */
  handleWebhook(input: {
    payload: string
    signature: string
    receivedAt: Date
  }): Promise<BillingEvent>
}
