/**
 * Integrations, notifications, audit and job bookkeeping.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from '@autopilot/shared/ids.ts'
import { businesses, organizations, users } from './tenancy.ts'
import { dataClassEnum, jobStatusEnum } from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
/** Named timestamp helper — each field gets its own column, never a shared alias. */
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow()
const createdAt = () => ts('created_at')
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

/**
 * Google Business Profile OAuth connection.
 * The refresh token is stored ONLY as ciphertext produced by @autopilot/shared/crypto.
 * There is deliberately no column for an access token: they are short-lived and kept in
 * memory, never persisted, never logged.
 */
export const googleConnections = pgTable(
  'google_connections',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    googleAccountId: text('google_account_id'),
    /** AES-256-GCM envelope ciphertext, key version encoded in the value. */
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    /** 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'REVOKED' */
    status: text('status').notNull().default('DISCONNECTED'),
    /** READ_ONLY until the customer explicitly enables automation (brief §23). */
    automationMode: text('automation_mode').notNull().default('READ_ONLY'),
    reviewReplyEnabled: boolean('review_reply_enabled').notNull().default(false),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('google_connections_business_key').on(t.businessId),
    index('google_connections_org_idx').on(t.organizationId),
  ],
)

export const googleLocations = pgTable(
  'google_locations',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleConnections.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    locationId: text('location_id').notNull(),
    placeId: text('place_id'),
    title: text('title'),
    primaryCategory: text('primary_category'),
    categories: jsonb('categories').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    hours: jsonb('hours').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    phone: text('phone'),
    websiteUri: text('website_uri'),
    address: jsonb('address').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    verificationState: text('verification_state'),
    syncedAt: ts('synced_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('google_locations_connection_location_key').on(t.connectionId, t.locationId),
    index('google_locations_business_idx').on(t.businessId),
  ],
)

/**
 * Review metadata only. We store what is needed to analyse themes and (when explicitly
 * enabled) draft a reply. We never fabricate, solicit or incentivise reviews.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    googleLocationId: uuid('google_location_id').references(() => googleLocations.id, {
      onDelete: 'cascade',
    }),
    externalId: text('external_id').notNull(),
    rating: integer('rating'),
    language: text('language'),
    /** Themes extracted for analysis. Reviewer identity is deliberately not stored. */
    themes: jsonb('themes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sentiment: text('sentiment'),
    hasOwnerReply: boolean('has_owner_reply').notNull().default(false),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reviews_external_key').on(t.businessId, t.externalId),
    index('reviews_business_idx').on(t.businessId, t.reviewedAt),
  ],
)

export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    jobType: text('job_type').notNull(),
    status: jobStatusEnum('status').notNull().default('QUEUED'),
    /** Idempotency key — re-enqueuing the same logical work is a no-op, not a double spend. */
    dedupeKey: text('dedupe_key'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    result: jsonb('result').$type<Record<string, unknown>>(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    /** Per-job spend ceiling; the cost ledger refuses calls beyond it. */
    maxSpendMinor: integer('max_spend_minor'),
    spendMinor: integer('spend_minor').notNull().default(0),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: createdAt(),
  },
  (t) => [
    index('jobs_status_idx').on(t.status, t.scheduledFor),
    index('jobs_business_idx').on(t.businessId, t.createdAt),
    uniqueIndex('jobs_dedupe_key').on(t.dedupeKey),
  ],
)

/** Append-only audit trail. Written for every privileged or customer-visible action. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 'USER' | 'AGENT' | 'SYSTEM' | 'ADMIN' */
    actorType: text('actor_type').notNull(),
    /** Set when a platform admin acted while impersonating a customer (brief §38). */
    impersonatedOrganizationId: uuid('impersonated_organization_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    dataClass: dataClassEnum('data_class').notNull().default('LOG_DATA'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_org_time_idx').on(t.organizationId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** 'WEEKLY_REPORT' | 'ALERT' | 'APPROVAL_REQUEST' | 'BILLING' | 'SYSTEM' */
    kind: text('kind').notNull(),
    severity: text('severity').notNull().default('INFO'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    /** Digest key — non-critical notifications coalesce instead of spamming (brief §37). */
    digestKey: text('digest_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_org_idx').on(t.organizationId, t.createdAt),
    index('notifications_unread_idx').on(t.userId, t.readAt),
  ],
)

export const featureFlagOverrides = pgTable(
  'feature_flag_overrides',
  {
    id: id(),
    flag: text('flag').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    enabled: boolean('enabled'),
    rolloutPercent: integer('rollout_percent'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('feature_flag_overrides_key').on(t.flag, t.organizationId)],
)

/** Right-to-erasure queue. A deletion request is a tracked job, not an ad-hoc SQL session. */
export const deletionRequests = pgTable(
  'deletion_requests',
  {
    id: id(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 'USER' | 'ORGANIZATION' | 'BUSINESS' */
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    requestedByUserId: uuid('requested_by_user_id'),
    reason: text('reason'),
    status: text('status').notNull().default('PENDING'),
    /** Statutory records (invoices) survive erasure; this records what was retained and why. */
    retainedData: jsonb('retained_data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('deletion_requests_status_idx').on(t.status, t.scheduledFor)],
)
