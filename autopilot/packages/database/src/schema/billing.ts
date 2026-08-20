/**
 * Commerce and unit economics.
 *
 * Two rules encoded here:
 *  - money is integer minor units with an explicit currency, never a float;
 *  - VAT is stored with the period id that produced it, so an old invoice reproduces
 *    exactly even after the statutory rate changes.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from '@autopilot/shared/ids.ts'
import { businesses, organizations } from './tenancy.ts'
import { currencyEnum, providerEnum, subscriptionStatusEnum } from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const plans = pgTable(
  'plans',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** NET price in minor units — the "+ VAT" convention (brief §6). */
    monthlyNetMinor: integer('monthly_net_minor').notNull(),
    annualNetMinor: integer('annual_net_minor'),
    currency: currencyEnum('currency').notNull().default('ILS'),
    trialDays: integer('trial_days').notNull().default(0),
    /** Hard plan limits enforced by the quota layer, not just displayed on a pricing page. */
    limits: jsonb('limits').$type<Record<string, number>>().notNull(),
    features: jsonb('features').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('plans_code_key').on(t.code)],
)

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: subscriptionStatusEnum('status').notNull().default('TRIALING'),
    interval: text('interval').notNull().default('MONTHLY'),
    /** Provider-agnostic external reference. The provider itself is swappable. */
    providerName: text('provider_name').notNull().default('mock'),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    /** Set when a failed payment starts the dunning window. */
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    failedPaymentCount: integer('failed_payment_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_org_idx').on(t.organizationId),
    index('subscriptions_status_idx').on(t.status),
  ],
)

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    number: text('number').notNull(),
    currency: currencyEnum('currency').notNull().default('ILS'),
    netMinor: integer('net_minor').notNull(),
    vatMinor: integer('vat_minor').notNull(),
    grossMinor: integer('gross_minor').notNull(),
    vatRateBps: integer('vat_rate_bps').notNull(),
    /** Which CountryConfig VAT period was in force. Never recomputed from today's rate. */
    vatPeriodId: text('vat_period_id').notNull(),
    discountMinor: integer('discount_minor').notNull().default(0),
    refundedMinor: integer('refunded_minor').notNull().default(0),
    status: text('status').notNull().default('DRAFT'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    providerInvoiceId: text('provider_invoice_id'),
    lineItems: jsonb('line_items').$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('invoices_number_key').on(t.number),
    index('invoices_org_idx').on(t.organizationId, t.issuedAt),
  ],
)

/** Metered usage per tenant per period — the input to quota enforcement and margin. */
export const usageRecords = pgTable(
  'usage_records',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    /** 'prompt_execution' | 'crawl_page' | 'ai_tokens' | 'search_query' | 'optimization' */
    metric: text('metric').notNull(),
    quantity: integer('quantity').notNull(),
    /** Bucket start — hourly for burst control, rolled up daily for reporting. */
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('usage_records_org_metric_idx').on(t.organizationId, t.metric, t.periodStart),
    uniqueIndex('usage_records_bucket_key').on(
      t.organizationId,
      t.businessId,
      t.metric,
      t.periodStart,
    ),
  ],
)

/**
 * Every external API call, costed. This is what makes gross margin a queryable fact rather
 * than a monthly surprise on a provider invoice.
 */
export const apiCostRecords = pgTable(
  'api_cost_records',
  {
    id: id(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    provider: providerEnum('provider'),
    /** Free-text for non-AI providers (search, maps, payment). */
    providerName: text('provider_name').notNull(),
    endpoint: text('endpoint').notNull(),
    model: text('model'),
    /** 'generate' | 'structured' | 'evaluate' | 'search' | 'embed' */
    requestType: text('request_type').notNull(),
    jobId: uuid('job_id'),
    agentRunId: uuid('agent_run_id'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    searchCount: integer('search_count').notNull().default(0),
    /** Estimated at call time from the model's price table. */
    estimatedCostMinor: integer('estimated_cost_minor').notNull().default(0),
    /** Reconciled later against provider billing where an API exposes it. */
    actualCostMinor: integer('actual_cost_minor'),
    currency: currencyEnum('currency').notNull().default('ILS'),
    durationMs: integer('duration_ms'),
    status: text('status').notNull().default('SUCCEEDED'),
    errorCode: text('error_code'),
    createdAt: createdAt(),
  },
  (t) => [
    index('api_cost_records_org_time_idx').on(t.organizationId, t.createdAt),
    index('api_cost_records_provider_idx').on(t.providerName, t.createdAt),
    index('api_cost_records_run_idx').on(t.agentRunId),
  ],
)

/** Spend ceilings. The ledger refuses the call that would breach one. */
export const budgets = pgTable(
  'budgets',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    /** 'DAILY' | 'MONTHLY' | 'RUN' */
    scope: text('scope').notNull(),
    limitMinor: integer('limit_minor').notNull(),
    currency: currencyEnum('currency').notNull().default('ILS'),
    /** Fraction of the limit at which the admin alert fires, e.g. 0.8. */
    alertThreshold: real('alert_threshold').notNull().default(0.8),
    spentMinor: integer('spent_minor').notNull().default(0),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    alertedAt: timestamp('alerted_at', { withTimezone: true }),
    exceededAt: timestamp('exceeded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('budgets_org_scope_idx').on(t.organizationId, t.scope, t.periodStart),
    uniqueIndex('budgets_unique').on(t.organizationId, t.businessId, t.scope, t.periodStart),
  ],
)
