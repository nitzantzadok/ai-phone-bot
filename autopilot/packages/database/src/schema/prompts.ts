/**
 * Prompt Universe — the demand side of the graph.
 *
 * A prompt is a real customer question, not a keyword. Each carries its intent, its
 * locale assumptions and the attributes an answer would need to satisfy it, which is what
 * lets the diagnosis connect "we lose this prompt" to "we lack evidence for this attribute".
 */
import { relations, sql } from 'drizzle-orm'
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
import { attributes } from './knowledge.ts'
import { languageEnum } from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

/**
 * A named, versioned set of prompts. Scores are only ever comparable within one prompt set
 * and window (brief §52) — this table is what makes that enforceable rather than a footnote.
 */
export const promptSets = pgTable(
  'prompt_sets',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    /** 'ONBOARDING' | 'MONITORING' | 'EXPERIMENT' | 'FREE_SCAN' */
    purpose: text('purpose').notNull().default('MONITORING'),
    generatorVersion: text('generator_version').notNull(),
    active: boolean('active').notNull().default(true),
    promptCount: integer('prompt_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('prompt_sets_business_idx').on(t.businessId),
    uniqueIndex('prompt_sets_business_name_version_key').on(t.businessId, t.name, t.version),
  ],
)

export const prompts = pgTable(
  'prompts',
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
    /** The literal question a customer would ask an AI assistant. */
    queryText: text('query_text').notNull(),
    /** Language-independent identity, so 'best romantic italian TLV' pairs he/en variants. */
    canonicalIntent: text('canonical_intent').notNull(),
    /** 'DISCOVERY' | 'COMPARISON' | 'OCCASION' | 'CONSTRAINT' | 'PROXIMITY' | 'TRANSACTIONAL' | 'INFORMATIONAL' */
    intentCategory: text('intent_category').notNull(),
    vertical: text('vertical').notNull(),
    language: languageEnum('language').notNull(),
    locale: text('locale').notNull(),
    /** Location assumptions this prompt is measured under. */
    country: text('country').notNull(),
    city: text('city'),
    neighborhood: text('neighborhood'),
    /** Dimensions used to build it: audience, occasion, budget, constraint, time, attribute. */
    dimensions: jsonb('dimensions')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** 0..1 sub-scores feeding promptScore; stored so ranking stays explainable. */
    commercialIntent: real('commercial_intent').notNull().default(0),
    localIntent: real('local_intent').notNull().default(0),
    specificity: real('specificity').notNull().default(0),
    askLikelihood: real('ask_likelihood').notNull().default(0),
    /** Composite priority 0..1 — what the measurement budget is spent on first. */
    promptScore: real('prompt_score').notNull().default(0),
    /** 0..1 estimated difficulty of winning it; drives Recommendation Territories (§51). */
    difficulty: real('difficulty').notNull().default(0.5),
    /** Learned from observation: does moving this prompt actually matter? Null until known. */
    observedValue: real('observed_value'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('prompts_set_idx').on(t.promptSetId),
    index('prompts_business_active_idx').on(t.businessId, t.active),
    index('prompts_intent_idx').on(t.canonicalIntent),
    index('prompts_score_idx').on(t.businessId, t.promptScore),
    uniqueIndex('prompts_set_query_key').on(t.promptSetId, t.queryText),
  ],
)

/**
 * Which attributes an answer must plausibly satisfy for this prompt. The join that turns
 * "we lose romantic-dinner prompts" into "we have no evidence for `romantic`".
 */
export const promptAttributes = pgTable(
  'prompt_attributes',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
    /** 0..1 how central the attribute is to satisfying the prompt. */
    weight: real('weight').notNull().default(1),
  },
  (t) => [
    uniqueIndex('prompt_attributes_unique').on(t.promptId, t.attributeId),
    index('prompt_attributes_attribute_idx').on(t.attributeId),
  ],
)

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  promptSet: one(promptSets, { fields: [prompts.promptSetId], references: [promptSets.id] }),
  attributes: many(promptAttributes),
}))

export const promptSetsRelations = relations(promptSets, ({ many }) => ({
  prompts: many(prompts),
}))
