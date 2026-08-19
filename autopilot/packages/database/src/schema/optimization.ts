/**
 * Diagnosis → opportunity → action → experiment.
 *
 * The chain is explicit so the product can always answer "why are we doing this?" with a
 * row rather than a rationalisation (brief §80).
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
import { businesses, organizations, users } from './tenancy.ts'
import { attributes } from './knowledge.ts'
import { promptSets } from './prompts.ts'
import {
  actionCategoryEnum,
  actionStatusEnum,
  agentRunStatusEnum,
  controllabilityEnum,
  experimentStatusEnum,
  opportunityStatusEnum,
  riskTierEnum,
} from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
/** Named timestamp helper — each field gets its own column, never a shared alias. */
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow()
const createdAt = () => ts('created_at')
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

/**
 * A diagnosed, quantified gap worth closing.
 * `controllability` decides whether the agent may act at all; an EXTERNAL AUTHORITY GAP is
 * surfaced honestly rather than dressed up as an action item.
 */
export const opportunities = pgTable(
  'opportunities',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** Stable key so the same gap is not re-created every diagnosis run. */
    dedupeKey: text('dedupe_key').notNull(),
    title: text('title').notNull(),
    /** Plain-language explanation for a non-technical business owner (brief §82). */
    explanation: text('explanation').notNull(),
    category: actionCategoryEnum('category').notNull(),
    controllability: controllabilityEnum('controllability').notNull(),
    riskTier: riskTierEnum('risk_tier').notNull().default('LOW'),
    status: opportunityStatusEnum('status').notNull().default('OPEN'),
    /* Opportunity = BusinessValue × PromptReach × Gap × ExpectedLift × Confidence × Controllability ÷ Cost */
    businessValue: real('business_value').notNull().default(0),
    promptReach: integer('prompt_reach').notNull().default(0),
    recommendationGap: real('recommendation_gap').notNull().default(0),
    expectedLift: real('expected_lift').notNull().default(0),
    confidence: real('confidence').notNull().default(0),
    controllabilityFactor: real('controllability_factor').notNull().default(1),
    estimatedCost: real('estimated_cost').notNull().default(1),
    /** Final ranking score; recomputed each diagnosis, history kept via updatedAt. */
    score: real('score').notNull().default(0),
    /** Evidence that produced this: prompt ids, attribute keys, competitor ids, finding ids. */
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    attributeId: uuid('attribute_id').references(() => attributes.id, { onDelete: 'set null' }),
    autoFixable: boolean('auto_fixable').notNull().default(false),
    dismissedReason: text('dismissed_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('opportunities_dedupe_key').on(t.businessId, t.dedupeKey),
    index('opportunities_business_score_idx').on(t.businessId, t.status, t.score),
  ],
)

/** A bounded unit of optimization work: one plan, many actions. */
export const optimizationJobs = pgTable(
  'optimization_jobs',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    agentRunId: uuid('agent_run_id'),
    title: text('title').notNull(),
    diagnosis: text('diagnosis').notNull(),
    status: text('status').notNull().default('PLANNED'),
    plannedActions: integer('planned_actions').notNull().default(0),
    appliedActions: integer('applied_actions').notNull().default(0),
    failedActions: integer('failed_actions').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('optimization_jobs_business_idx').on(t.businessId, t.createdAt)],
)

export const optimizationActions = pgTable(
  'optimization_actions',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => optimizationJobs.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    experimentId: uuid('experiment_id'),
    /** e.g. 'FIX_METADATA', 'ADD_SCHEMA', 'ADD_FAQ_SECTION', 'FIX_CANONICAL'. */
    actionType: text('action_type').notNull(),
    category: actionCategoryEnum('category').notNull(),
    riskTier: riskTierEnum('risk_tier').notNull(),
    status: actionStatusEnum('status').notNull().default('PROPOSED'),
    /** What will change, in plain language, for the approval screen. */
    summary: text('summary').notNull(),
    rationale: text('rationale').notNull(),
    expectedImpact: real('expected_impact').notNull().default(0),
    /** Connector-agnostic instruction payload; validated by the connector before applying. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Fact ids grounding every factual claim in the payload. Empty = cannot publish. */
    groundedFactIds: jsonb('grounded_fact_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    targetUrl: text('target_url'),
    contentVersionId: uuid('content_version_id'),
    /** Quality-gate outcome. Recorded even on success, so a pass is auditable too. */
    qualityGate: jsonb('quality_gate').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    approvalRequired: boolean('approval_required').notNull().default(true),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedReason: text('rejected_reason'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('optimization_actions_business_status_idx').on(t.businessId, t.status),
    index('optimization_actions_job_idx').on(t.jobId),
    index('optimization_actions_experiment_idx').on(t.experimentId),
  ],
)

/**
 * An experiment is how the product earns the right to say a change helped.
 * Control and treatment prompt sets are recorded up front so the analysis cannot be
 * retrofitted to a flattering conclusion.
 */
export const experiments = pgTable(
  'experiments',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    promptSetId: uuid('prompt_set_id').references(() => promptSets.id, { onDelete: 'set null' }),
    hypothesis: text('hypothesis').notNull(),
    /** Intervention taxonomy key — the unit the learning system aggregates over (§32). */
    interventionType: text('intervention_type').notNull(),
    vertical: text('vertical').notNull(),
    status: experimentStatusEnum('status').notNull().default('DRAFT'),
    treatmentPromptIds: jsonb('treatment_prompt_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    controlPromptIds: jsonb('control_prompt_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    affectedUrls: jsonb('affected_urls').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /* Pre/post counts, stored as counts (not rates) so significance is recomputable. */
    preTreatmentTrials: integer('pre_treatment_trials').notNull().default(0),
    preTreatmentSuccesses: integer('pre_treatment_successes').notNull().default(0),
    postTreatmentTrials: integer('post_treatment_trials').notNull().default(0),
    postTreatmentSuccesses: integer('post_treatment_successes').notNull().default(0),
    preControlTrials: integer('pre_control_trials').notNull().default(0),
    preControlSuccesses: integer('pre_control_successes').notNull().default(0),
    postControlTrials: integer('post_control_trials').notNull().default(0),
    postControlSuccesses: integer('post_control_successes').notNull().default(0),
    pValue: real('p_value'),
    /** 'NO_EVIDENCE' | 'ASSOCIATED_POSITIVE' | 'ASSOCIATED_NEGATIVE' | 'INCONCLUSIVE' */
    conclusion: text('conclusion'),
    /** Cautious language only — never "caused" without support (brief §53). */
    conclusionText: text('conclusion_text'),
    confounders: jsonb('confounders').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    observationWindowDays: integer('observation_window_days').notNull().default(14),
    changeAppliedAt: timestamp('change_applied_at', { withTimezone: true }),
    concludedAt: timestamp('concluded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('experiments_business_idx').on(t.businessId, t.status),
    index('experiments_intervention_idx').on(t.interventionType, t.vertical),
  ],
)

/** Bounded agent execution record. One row per run; steps below. */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** 'ONBOARDING_SCAN' | 'OPTIMIZATION_CYCLE' | 'RETEST' | 'DIAGNOSIS' | 'ASK' */
    runType: text('run_type').notNull(),
    status: agentRunStatusEnum('status').notNull().default('RUNNING'),
    autonomyMode: text('autonomy_mode').notNull(),
    /** The budget envelope this run was created with — reconstructable after the fact. */
    limits: jsonb('limits').$type<Record<string, number>>().notNull(),
    iterationsUsed: integer('iterations_used').notNull().default(0),
    toolCallsUsed: integer('tool_calls_used').notNull().default(0),
    tokensUsed: integer('tokens_used').notNull().default(0),
    spendMinor: integer('spend_minor').notNull().default(0),
    publishOperations: integer('publish_operations').notNull().default(0),
    /** Why it ended: 'COMPLETED' | 'MAX_ITERATIONS' | 'MAX_SPEND' | 'MAX_TIME' | 'NO_WORK' | 'ERROR' */
    stopReason: text('stop_reason'),
    summary: text('summary'),
    errorMessage: text('error_message'),
    startedAt: ts('started_at'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('agent_runs_business_idx').on(t.businessId, t.startedAt)],
)

export const agentSteps = pgTable(
  'agent_steps',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentRunId: uuid('agent_run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    /** 'TOOL_CALL' | 'DECISION' | 'OBSERVATION' | 'ERROR' | 'LIMIT' */
    stepType: text('step_type').notNull(),
    toolName: text('tool_name'),
    /** Arguments and result, redacted by the logger's rules before storage. */
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    /** Why the agent did this. Populated for every DECISION step, no exceptions. */
    reason: text('reason'),
    durationMs: integer('duration_ms'),
    costMinor: integer('cost_minor').notNull().default(0),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('agent_steps_run_seq_key').on(t.agentRunId, t.sequence)],
)
