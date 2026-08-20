/**
 * Postgres enums derived from the single source of truth in @autopilot/shared.
 *
 * Deriving rather than re-declaring means adding a value to the domain vocabulary and
 * forgetting the database is a type error, not a runtime surprise in production.
 */
import { pgEnum } from 'drizzle-orm/pg-core'
import {
  ACCURACY_CLASSES,
  ACTION_CATEGORIES,
  ACTION_STATUSES,
  AUTONOMY_MODES,
  CONFIDENCE_LEVELS,
  CONTROLLABILITY,
  DATA_CLASSES,
  PROVIDER_IDS,
  RECOMMENDATION_CLASSES,
  RISK_TIERS,
  ROLES,
  SOURCE_TYPES,
} from '@autopilot/shared/domain.ts'

export const sourceTypeEnum = pgEnum('source_type', SOURCE_TYPES)
export const controllabilityEnum = pgEnum('controllability', CONTROLLABILITY)
export const confidenceEnum = pgEnum('confidence_level', CONFIDENCE_LEVELS)
export const recommendationClassEnum = pgEnum('recommendation_class', RECOMMENDATION_CLASSES)
export const accuracyClassEnum = pgEnum('accuracy_class', ACCURACY_CLASSES)
export const riskTierEnum = pgEnum('risk_tier', RISK_TIERS)
export const autonomyModeEnum = pgEnum('autonomy_mode', AUTONOMY_MODES)
export const actionCategoryEnum = pgEnum('action_category', ACTION_CATEGORIES)
export const actionStatusEnum = pgEnum('action_status', ACTION_STATUSES)
export const roleEnum = pgEnum('member_role', ROLES)
export const dataClassEnum = pgEnum('data_class', DATA_CLASSES)
export const providerEnum = pgEnum('provider_id', PROVIDER_IDS)

export const languageEnum = pgEnum('language_code', ['he', 'en', 'ar', 'ru'])
export const countryEnum = pgEnum('country_code', ['IL', 'US', 'GB', 'DE'])
export const currencyEnum = pgEnum('currency_code', ['ILS', 'USD', 'EUR', 'GBP'])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE',
  'PAUSED',
  'CANCELED',
  'EXPIRED',
])

export const jobStatusEnum = pgEnum('job_status', [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'BUDGET_EXCEEDED',
])

export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'RUNNING',
  'COMPLETED',
  'STOPPED_LIMIT',
  'STOPPED_BUDGET',
  'FAILED',
  'CANCELED',
])

export const experimentStatusEnum = pgEnum('experiment_status', [
  'DRAFT',
  'RUNNING',
  'OBSERVING',
  'CONCLUDED',
  'ABANDONED',
])

export const opportunityStatusEnum = pgEnum('opportunity_status', [
  'OPEN',
  'PLANNED',
  'IN_PROGRESS',
  'DONE',
  'DISMISSED',
  'BLOCKED',
])

export const factStatusEnum = pgEnum('fact_status', [
  'ACTIVE',
  'SUPERSEDED',
  'DISPUTED',
  'RETRACTED',
])
