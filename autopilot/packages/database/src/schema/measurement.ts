/**
 * Observation layer.
 *
 * Every stored observation carries an explicit `sourceType`. A mock/simulated response is
 * stored as SYNTHETIC and is structurally excluded from customer-facing scoring — the
 * product must never show a simulation as a real engine answer (brief §10).
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
import { competitors, sources } from './knowledge.ts'
import { prompts, promptSets } from './prompts.ts'
import {
  accuracyClassEnum,
  confidenceEnum,
  providerEnum,
  recommendationClassEnum,
  sourceTypeEnum,
} from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
/** Named timestamp helper — each field gets its own column, never a shared alias. */
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow()
const createdAt = () => ts('created_at')

/** One execution of one prompt against one engine under one set of assumptions. */
export const promptExecutions = pgTable(
  'prompt_executions',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    promptSetId: uuid('prompt_set_id')
      .notNull()
      .references(() => promptSets.id, { onDelete: 'cascade' }),
    provider: providerEnum('provider').notNull(),
    model: text('model').notNull(),
    /** Whether official grounding/web search was enabled for this call. */
    searchEnabled: boolean('search_enabled').notNull().default(false),
    sourceType: sourceTypeEnum('source_type').notNull(),
    /* Location & language assumptions — recorded because they change the answer. */
    country: text('country').notNull(),
    city: text('city'),
    language: text('language').notNull(),
    locale: text('locale').notNull(),
    timezone: text('timezone').notNull(),
    latitude: text('latitude'),
    longitude: text('longitude'),
    /** Cache hit means we reused a recent identical execution instead of paying again. */
    cacheHit: boolean('cache_hit').notNull().default(false),
    status: text('status').notNull().default('SUCCEEDED'),
    errorCode: text('error_code'),
    latencyMs: integer('latency_ms'),
    /** Cost in minor units of the platform accounting currency. */
    costMinor: integer('cost_minor').notNull().default(0),
    agentRunId: uuid('agent_run_id'),
    executedAt: ts('executed_at'),
  },
  (t) => [
    index('prompt_executions_business_time_idx').on(t.businessId, t.executedAt),
    index('prompt_executions_prompt_idx').on(t.promptId, t.executedAt),
    index('prompt_executions_set_idx').on(t.promptSetId),
    index('prompt_executions_org_idx').on(t.organizationId),
  ],
)

export const aiResponses = pgTable(
  'ai_responses',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => promptExecutions.id, { onDelete: 'cascade' }),
    /** Raw answer text. Retention-governed as AI_OUTPUT (see RETENTION_DAYS). */
    responseText: text('response_text').notNull(),
    /** Search queries the engine reported issuing, when the API exposes them. */
    searchQueries: jsonb('search_queries').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    /** Ordered list of businesses the answer named, as extracted by the evaluator. */
    extractedEntities: jsonb('extracted_entities')
      .$type<{ name: string; position: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    receivedAt: ts('received_at'),
  },
  (t) => [
    uniqueIndex('ai_responses_execution_key').on(t.executionId),
    index('ai_responses_org_idx').on(t.organizationId),
  ],
)

/**
 * The evaluated outcome for OUR business in one response. Separate from ai_responses so a
 * re-evaluation (evaluator v2) can be stored without touching the immutable observation.
 */
export const aiRecommendations = pgTable(
  'ai_recommendations',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => promptExecutions.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    /** Null subject = our business; set = a competitor's outcome in the same answer. */
    competitorId: uuid('competitor_id').references(() => competitors.id, { onDelete: 'cascade' }),
    classification: recommendationClassEnum('classification').notNull(),
    /** 1-based rank in the answer's list, when the answer is ordered. */
    position: integer('position'),
    accuracy: accuracyClassEnum('accuracy').notNull().default('UNKNOWN'),
    /** Attributes the answer credited to this subject. */
    recognizedAttributes: jsonb('recognized_attributes')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Verbatim sentence supporting the classification — the "show your work" field. */
    evidenceQuote: text('evidence_quote'),
    evaluatorVersion: text('evaluator_version').notNull(),
    confidence: confidenceEnum('confidence').notNull().default('MEDIUM'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_recommendations_business_idx').on(t.businessId, t.createdAt),
    index('ai_recommendations_execution_idx').on(t.executionId),
    index('ai_recommendations_prompt_idx').on(t.promptId),
    index('ai_recommendations_competitor_idx').on(t.competitorId),
    uniqueIndex('ai_recommendations_unique_subject').on(
      t.executionId,
      t.businessId,
      t.competitorId,
      t.evaluatorVersion,
    ),
  ],
)

/** Sources the engine cited, linked to what they support. Drives citation gap analysis. */
export const citations = pgTable(
  'citations',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => promptExecutions.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    position: integer('position'),
    /** Does the cited source mention us / a competitor? Drives the source matrix (§54). */
    referencesBusiness: boolean('references_business').notNull().default(false),
    referencedCompetitorId: uuid('referenced_competitor_id').references(() => competitors.id, {
      onDelete: 'set null',
    }),
    supportsAttributeKeys: jsonb('supports_attribute_keys')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    relevance: real('relevance'),
    createdAt: createdAt(),
  },
  (t) => [
    index('citations_execution_idx').on(t.executionId),
    index('citations_source_idx').on(t.sourceId),
    index('citations_org_idx').on(t.organizationId),
  ],
)

/**
 * Detected misinformation about the business in an AI answer.
 * A valuable product on its own, independent of ranking (brief §30).
 */
export const hallucinations = pgTable(
  'hallucinations',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => promptExecutions.id, { onDelete: 'cascade' }),
    /** Which fact the answer got wrong: 'opening_hours', 'address', 'phone', 'category'… */
    factKind: text('fact_kind').notNull(),
    statedValue: text('stated_value'),
    actualValue: text('actual_value'),
    /** 'WRONG' | 'OUTDATED' | 'FABRICATED' | 'CLOSED_REPORTED_OPEN' | 'UNVERIFIABLE' */
    issueType: text('issue_type').notNull(),
    severity: text('severity').notNull().default('MEDIUM'),
    /** We only claim a hallucination when our own fact is at least MEDIUM confidence. */
    groundingConfidence: confidenceEnum('grounding_confidence').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('hallucinations_business_idx').on(t.businessId, t.createdAt),
    index('hallucinations_execution_idx').on(t.executionId),
  ],
)

export const promptExecutionsRelations = relations(promptExecutions, ({ one, many }) => ({
  prompt: one(prompts, { fields: [promptExecutions.promptId], references: [prompts.id] }),
  response: one(aiResponses),
  recommendations: many(aiRecommendations),
  citations: many(citations),
}))

export const aiResponsesRelations = relations(aiResponses, ({ one }) => ({
  execution: one(promptExecutions, {
    fields: [aiResponses.executionId],
    references: [promptExecutions.id],
  }),
}))
