/**
 * Business Knowledge Graph + Evidence Graph — the core proprietary structure.
 *
 * The shape that matters:
 *
 *   Business ──has──▶ Fact ──supported_by──▶ Source
 *                      │
 *                      └──evidences──▶ Attribute ◀──requires── Prompt(intent)
 *
 * It is deliberately relational rather than a JSON blob, because the question the product
 * exists to answer — "which attribute does the competitor have evidence for that we do
 * not?" — must be a join the database can answer, not something an LLM guesses at.
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
import { confidenceEnum, controllabilityEnum, factStatusEnum, sourceTypeEnum } from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
/** Named timestamp helper — each field gets its own column, never a shared alias. */
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow()
const createdAt = () => ts('created_at')
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

/**
 * Canonical attribute vocabulary — cross-tenant on purpose. "Romantic" must mean the same
 * thing for every restaurant, otherwise the learning dataset (brief §87) is worthless.
 * Contains no tenant data.
 */
export const attributes = pgTable(
  'attributes',
  {
    id: id(),
    /** Stable machine key, e.g. 'romantic', 'handmade_pasta', 'wheelchair_accessible'. */
    key: text('key').notNull(),
    /** Which vertical this attribute belongs to; null = applies to any business. */
    vertical: text('vertical'),
    /** 'ambience' | 'service' | 'audience' | 'use_case' | 'amenity' | 'quality' | 'price' | 'access' */
    category: text('category').notNull(),
    /** Localised labels: { he: 'רומנטי', en: 'Romantic' }. */
    labels: jsonb('labels').$type<Record<string, string>>().notNull(),
    /** Phrases that count as evidence for this attribute, per language. */
    evidenceTerms: jsonb('evidence_terms')
      .$type<Record<string, string[]>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('attributes_key_vertical_key').on(t.key, t.vertical),
    index('attributes_category_idx').on(t.category),
  ],
)

/**
 * A source of information: a web page, a connected profile, a directory listing.
 * Cross-tenant (a review site is the same site for everyone) and free of tenant data, so
 * source authority learning compounds across the customer base.
 */
export const sources = pgTable(
  'sources',
  {
    id: id(),
    url: text('url').notNull(),
    domain: text('domain').notNull(),
    /** 'own_website' | 'google_business_profile' | 'directory' | 'editorial' | 'social' | 'review_site' | 'other' */
    sourceKind: text('source_kind').notNull().default('other'),
    title: text('title'),
    language: text('language'),
    /** 0..1 heuristic. Learned over time; never presented as an absolute authority ranking. */
    authorityScore: real('authority_score'),
    firstSeenAt: ts('first_seen_at'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    /** Publication/modification date when the source declares one. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sources_url_key').on(t.url),
    index('sources_domain_idx').on(t.domain),
    index('sources_kind_idx').on(t.sourceKind),
  ],
)

/** One canonical entity record per business — the "who is this, in machine terms" row. */
export const businessEntities = pgTable(
  'business_entities',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** schema.org type we would legitimately publish, e.g. 'Restaurant', 'LegalService'. */
    entityType: text('entity_type').notNull(),
    canonicalName: text('canonical_name').notNull(),
    /** Names in other languages/scripts: { he: 'רוזה', en: 'Rosa' }. */
    localizedNames: jsonb('localized_names')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    primaryCategory: text('primary_category'),
    secondaryCategories: jsonb('secondary_categories')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    shortDescription: text('short_description'),
    /** 0..1 — how much of the vertical's expected entity information we actually hold. */
    completeness: real('completeness').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('business_entities_business_key').on(t.businessId),
    index('business_entities_org_idx').on(t.organizationId),
  ],
)

/**
 * A fact is never a bare value. It carries where it came from, how sure we are, and when
 * it was last checked — because publishing an unverified "fact" to a customer's website is
 * the single most damaging thing this product could do.
 */
export const businessFacts = pgTable(
  'business_facts',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** e.g. 'opening_hours', 'phone', 'address', 'cuisine', 'price_range', 'service', 'attribute'. */
    factKind: text('fact_kind').notNull(),
    /** Scalar/textual value as displayed. */
    value: text('value'),
    /** Structured value when the fact is not a scalar (hours, geo, service list). */
    valueJson: jsonb('value_json').$type<unknown>(),
    language: text('language'),
    confidence: confidenceEnum('confidence').notNull().default('UNKNOWN'),
    status: factStatusEnum('status').notNull().default('ACTIVE'),
    controllability: controllabilityEnum('controllability').notNull().default('CONTROLLED'),
    /** Set when this fact is an attribute claim, linking into the evidence graph. */
    attributeId: uuid('attribute_id').references(() => attributes.id, { onDelete: 'set null' }),
    discoveredAt: ts('discovered_at'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).notNull().defaultNow(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    /** Set when a newer fact replaced this one; keeps the history queryable. */
    supersededByFactId: uuid('superseded_by_fact_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('business_facts_business_kind_idx').on(t.businessId, t.factKind),
    index('business_facts_org_idx').on(t.organizationId),
    index('business_facts_attribute_idx').on(t.attributeId),
    index('business_facts_status_idx').on(t.businessId, t.status),
  ],
)

/** Fact ⇄ Source, with the excerpt that justifies the link. This is the evidence edge. */
export const factSources = pgTable(
  'fact_sources',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    factId: uuid('fact_id')
      .notNull()
      .references(() => businessFacts.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    sourceType: sourceTypeEnum('source_type').notNull(),
    confidence: confidenceEnum('confidence').notNull().default('LOW'),
    /** Short supporting quotation. Kept minimal — we analyse, we do not republish. */
    excerpt: text('excerpt'),
    observedAt: ts('observed_at'),
  },
  (t) => [
    uniqueIndex('fact_sources_unique').on(t.factId, t.sourceId),
    index('fact_sources_source_idx').on(t.sourceId),
    index('fact_sources_org_idx').on(t.organizationId),
  ],
)

/**
 * Materialised evidence strength per (business, attribute). Derived from facts + sources,
 * refreshed by the knowledge builder, so gap queries stay a single indexed read.
 */
export const businessAttributes = pgTable(
  'business_attributes',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
    /** 0..1 strength of evidence that this business genuinely has this attribute. */
    evidenceStrength: real('evidence_strength').notNull().default(0),
    supportingFactCount: integer('supporting_fact_count').notNull().default(0),
    distinctSourceCount: integer('distinct_source_count').notNull().default(0),
    /** True when the business itself confirmed it — the strongest signal we can act on. */
    ownerConfirmed: boolean('owner_confirmed').notNull().default(false),
    /** True when our own site states it. If false, that is a CONTROLLED gap. */
    presentOnOwnWebsite: boolean('present_on_own_website').notNull().default(false),
    computedAt: ts('computed_at'),
  },
  (t) => [
    uniqueIndex('business_attributes_unique').on(t.businessId, t.attributeId),
    index('business_attributes_org_idx').on(t.organizationId),
  ],
)

/**
 * Competitors are discovered from AI answers and search evidence, not scraped wholesale.
 * We record what is publicly observable and analyse patterns; we never copy their content.
 */
export const competitors = pgTable(
  'competitors',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameAliases: jsonb('name_aliases').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    domain: text('domain'),
    city: text('city'),
    /** How we found them: 'AI_RECOMMENDATION' | 'SEARCH' | 'CATEGORY' | 'CUSTOMER'. */
    discoverySource: text('discovery_source').notNull().default('AI_RECOMMENDATION'),
    /** Times seen recommended across this business's monitored prompt set. */
    recommendationCount: integer('recommendation_count').notNull().default(0),
    mentionCount: integer('mention_count').notNull().default(0),
    firstSeenAt: ts('first_seen_at'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Customer can dismiss a false positive; dismissed competitors stop affecting scores. */
    dismissed: boolean('dismissed').notNull().default(false),
  },
  (t) => [
    uniqueIndex('competitors_business_name_key').on(t.businessId, t.name),
    index('competitors_org_idx').on(t.organizationId),
    index('competitors_business_idx').on(t.businessId),
  ],
)

export const competitorFacts = pgTable(
  'competitor_facts',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    factKind: text('fact_kind').notNull(),
    value: text('value'),
    attributeId: uuid('attribute_id').references(() => attributes.id, { onDelete: 'set null' }),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
    sourceType: sourceTypeEnum('source_type').notNull(),
    confidence: confidenceEnum('confidence').notNull().default('LOW'),
    observedAt: ts('observed_at'),
  },
  (t) => [
    index('competitor_facts_competitor_idx').on(t.competitorId),
    index('competitor_facts_attribute_idx').on(t.attributeId),
    index('competitor_facts_org_idx').on(t.organizationId),
  ],
)

export const businessFactsRelations = relations(businessFacts, ({ one, many }) => ({
  business: one(businesses, { fields: [businessFacts.businessId], references: [businesses.id] }),
  attribute: one(attributes, { fields: [businessFacts.attributeId], references: [attributes.id] }),
  sources: many(factSources),
}))

export const factSourcesRelations = relations(factSources, ({ one }) => ({
  fact: one(businessFacts, { fields: [factSources.factId], references: [businessFacts.id] }),
  source: one(sources, { fields: [factSources.sourceId], references: [sources.id] }),
}))

export const competitorsRelations = relations(competitors, ({ one, many }) => ({
  business: one(businesses, { fields: [competitors.businessId], references: [businesses.id] }),
  facts: many(competitorFacts),
}))
