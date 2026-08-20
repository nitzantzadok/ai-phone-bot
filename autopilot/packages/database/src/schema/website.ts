/**
 * The customer's website as we observe it, and every change we make to it.
 *
 * Snapshots exist so that "what changed since last crawl?" and "restore the exact previous
 * version" are both answerable from the database rather than from hope.
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

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
/** Named timestamp helper — each field gets its own column, never a shared alias. */
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow()
const createdAt = () => ts('created_at')

export const websiteCrawls = pgTable(
  'website_crawls',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    rootUrl: text('root_url').notNull(),
    status: text('status').notNull().default('RUNNING'),
    pagesDiscovered: integer('pages_discovered').notNull().default(0),
    pagesFetched: integer('pages_fetched').notNull().default(0),
    robotsTxtFound: boolean('robots_txt_found').notNull().default(false),
    sitemapFound: boolean('sitemap_found').notNull().default(false),
    /** Technical findings summary: status codes, missing canonicals, broken links… */
    audit: jsonb('audit').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    errorMessage: text('error_message'),
    startedAt: ts('started_at'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('website_crawls_business_idx').on(t.businessId, t.startedAt)],
)

export const websitePages = pgTable(
  'website_pages',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url'),
    /** 'home' | 'service' | 'location' | 'about' | 'contact' | 'faq' | 'menu' | 'blog' | 'other' */
    pageType: text('page_type').notNull().default('other'),
    title: text('title'),
    metaDescription: text('meta_description'),
    h1: text('h1'),
    language: text('language'),
    statusCode: integer('status_code'),
    indexable: boolean('indexable').notNull().default(true),
    wordCount: integer('word_count').notNull().default(0),
    /** Detected JSON-LD @types on the page. */
    schemaTypes: jsonb('schema_types').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('website_pages_business_url_key').on(t.businessId, t.url),
    index('website_pages_business_type_idx').on(t.businessId, t.pageType),
  ],
)

export const websiteSnapshots = pgTable(
  'website_snapshots',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => websitePages.id, { onDelete: 'cascade' }),
    crawlId: uuid('crawl_id').references(() => websiteCrawls.id, { onDelete: 'set null' }),
    /** SHA-256 of the normalised content — cheap change detection between crawls. */
    contentHash: text('content_hash').notNull(),
    title: text('title'),
    metaDescription: text('meta_description'),
    headings: jsonb('headings').$type<{ level: number; text: string }[]>().notNull().default(sql`'[]'::jsonb`),
    bodyText: text('body_text'),
    structuredData: jsonb('structured_data').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    links: jsonb('links').$type<{ href: string; text: string; rel?: string }[]>().notNull().default(sql`'[]'::jsonb`),
    images: jsonb('images').$type<{ src: string; alt?: string }[]>().notNull().default(sql`'[]'::jsonb`),
    openGraph: jsonb('open_graph').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    hreflang: jsonb('hreflang').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    capturedAt: ts('captured_at'),
  },
  (t) => [
    index('website_snapshots_page_time_idx').on(t.pageId, t.capturedAt),
    index('website_snapshots_hash_idx').on(t.contentHash),
  ],
)

/**
 * Every automated change, with the exact before/after needed for rollback.
 * No write to a customer property happens without a row here first.
 */
export const contentVersions = pgTable(
  'content_versions',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => websitePages.id, { onDelete: 'set null' }),
    /** Which optimization action produced this version. */
    actionId: uuid('action_id'),
    agentRunId: uuid('agent_run_id'),
    /** 'CONTENT' | 'METADATA' | 'SCHEMA' | 'TECHNICAL' | 'PROFILE' */
    changeTarget: text('change_target').notNull(),
    beforeContent: jsonb('before_content').$type<Record<string, unknown>>().notNull(),
    afterContent: jsonb('after_content').$type<Record<string, unknown>>().notNull(),
    /** Unified diff for human review — the customer sees this, not raw JSON. */
    diff: text('diff').notNull(),
    reason: text('reason').notNull(),
    hypothesis: text('hypothesis'),
    /** 'DRAFT' | 'AWAITING_APPROVAL' | 'PUBLISHED' | 'REJECTED' | 'ROLLED_BACK' | 'FAILED' */
    publishStatus: text('publish_status').notNull().default('DRAFT'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    rollbackOfVersionId: uuid('rollback_of_version_id'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    connectorId: text('connector_id').notNull(),
    /** Connector-specific handle needed to undo the write (revision id, draft id…). */
    connectorRef: jsonb('connector_ref').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    index('content_versions_business_idx').on(t.businessId, t.createdAt),
    index('content_versions_page_idx').on(t.pageId),
    index('content_versions_status_idx').on(t.businessId, t.publishStatus),
    index('content_versions_action_idx').on(t.actionId),
  ],
)

/** Structured data we generated or validated, kept separate from page content. */
export const structuredData = pgTable(
  'structured_data',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => websitePages.id, { onDelete: 'cascade' }),
    schemaType: text('schema_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Every property must trace to a fact id — no schema for information not on the page. */
    groundedFactIds: jsonb('grounded_fact_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    valid: boolean('valid').notNull().default(false),
    validationErrors: jsonb('validation_errors').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('structured_data_business_idx').on(t.businessId),
    index('structured_data_page_idx').on(t.pageId),
  ],
)

/** Technical audit findings, one row per issue instance, so they can be tracked to closure. */
export const technicalFindings = pgTable(
  'technical_findings',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => websitePages.id, { onDelete: 'cascade' }),
    crawlId: uuid('crawl_id').references(() => websiteCrawls.id, { onDelete: 'cascade' }),
    /** e.g. 'MISSING_TITLE', 'MISSING_CANONICAL', 'NO_SITEMAP', 'INVALID_SCHEMA', 'BROKEN_LINK' */
    findingType: text('finding_type').notNull(),
    severity: text('severity').notNull().default('MEDIUM'),
    detail: text('detail'),
    /** 0..1 — how confident we are this is genuinely a problem worth fixing. */
    confidence: real('confidence').notNull().default(1),
    autoFixable: boolean('auto_fixable').notNull().default(false),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('technical_findings_business_idx').on(t.businessId, t.findingType),
    index('technical_findings_open_idx').on(t.businessId, t.resolvedAt),
  ],
)
