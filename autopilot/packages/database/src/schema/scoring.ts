/**
 * AIRS — the product's primary metric.
 *
 * Every calculation is fully reproducible: the formula version, every input, the prompt
 * set, the engines, the location assumptions and the observation window are stored with
 * the result. The methodology is never changed silently (brief §2).
 */
import { sql } from 'drizzle-orm'
import {
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
import { competitors } from './knowledge.ts'
import { promptSets } from './prompts.ts'
import { confidenceEnum } from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
/** Named timestamp helper — each field gets its own column, never a shared alias. */
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow()

export const airsScores = pgTable(
  'airs_scores',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    promptSetId: uuid('prompt_set_id')
      .notNull()
      .references(() => promptSets.id, { onDelete: 'cascade' }),
    /** Immutable identifier of the scoring methodology, e.g. 'airs-v1'. */
    formulaVersion: text('formula_version').notNull(),
    /** 0..100, rounded for display; components carry the precision. */
    score: real('score').notNull(),
    /** Every component's raw value and weight — the audit trail for the number. */
    components: jsonb('components')
      .$type<Record<string, { value: number; weight: number; contribution: number }>>()
      .notNull(),
    /** The exact counts the components were computed from. */
    inputs: jsonb('inputs').$type<Record<string, number>>().notNull(),
    confidence: confidenceEnum('confidence').notNull(),
    /** Null = aggregate across engines; set = per-engine score. */
    provider: text('provider'),
    /** Null = aggregate across languages; set = language-specific AIRS (brief §28). */
    language: text('language'),
    engines: jsonb('engines').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    locations: jsonb('locations').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    executionCount: integer('execution_count').notNull(),
    /** Set when the score was produced from SYNTHETIC observations (dev/demo runs). */
    simulated: jsonb('simulated').$type<boolean>().notNull().default(sql`'false'::jsonb`),
    calculatedAt: ts('calculated_at'),
  },
  (t) => [
    index('airs_scores_business_time_idx').on(t.businessId, t.calculatedAt),
    index('airs_scores_set_idx').on(t.promptSetId),
    index('airs_scores_org_idx').on(t.organizationId),
  ],
)

/** Recommendation share, per subject, over a declared prompt set and window (brief §52). */
export const recommendationShares = pgTable(
  'recommendation_shares',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** Null = our business; set = this competitor's share on the same prompt set. */
    competitorId: uuid('competitor_id').references(() => competitors.id, { onDelete: 'cascade' }),
    promptSetId: uuid('prompt_set_id')
      .notNull()
      .references(() => promptSets.id, { onDelete: 'cascade' }),
    provider: text('provider'),
    language: text('language'),
    promptsEvaluated: integer('prompts_evaluated').notNull(),
    mentionCount: integer('mention_count').notNull().default(0),
    recommendationCount: integer('recommendation_count').notNull().default(0),
    top3Count: integer('top3_count').notNull().default(0),
    top1Count: integer('top1_count').notNull().default(0),
    citationCount: integer('citation_count').notNull().default(0),
    /** Wilson lower bound on the recommendation rate — what we are willing to defend. */
    recommendationRateLower: real('recommendation_rate_lower').notNull().default(0),
    recommendationRateUpper: real('recommendation_rate_upper').notNull().default(1),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    calculatedAt: ts('calculated_at'),
  },
  (t) => [
    index('recommendation_shares_business_idx').on(t.businessId, t.calculatedAt),
    uniqueIndex('recommendation_shares_unique').on(
      t.promptSetId,
      t.businessId,
      t.competitorId,
      t.provider,
      t.language,
      t.windowStart,
      t.windowEnd,
    ),
  ],
)
