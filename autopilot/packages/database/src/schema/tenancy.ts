/**
 * Tenancy.
 *
 * `organizations` is the tenant boundary. Every tenant-owned table below carries
 * `organization_id`, and the repository layer applies that predicate — see
 * `src/repositories/base.ts` and the tenant-isolation suite.
 */
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from '@autopilot/shared/ids.ts'
import { autonomyModeEnum, countryEnum, languageEnum, roleEnum } from './enums.ts'

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    country: countryEnum('country').notNull().default('IL'),
    /** UI language for this organization's members. Content language is per-business. */
    locale: text('locale').notNull().default('he-IL'),
    timezone: text('timezone').notNull().default('Asia/Jerusalem'),
    /** Agency mode hook: an agency org owns child orgs. Unused in MVP, schema-ready (brief §85). */
    parentOrganizationId: uuid('parent_organization_id'),
    acquisitionSource: text('acquisition_source'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('organizations_slug_key').on(t.slug),
    index('organizations_parent_idx').on(t.parentOrganizationId),
  ],
)

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    name: text('name'),
    /** Argon2id/bcrypt hash. Null when the account is federated-only. */
    passwordHash: text('password_hash'),
    /** MFA-ready: encrypted TOTP secret, null until enrolled. */
    mfaSecretEncrypted: text('mfa_secret_encrypted'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    preferredLanguage: languageEnum('preferred_language').notNull().default('he'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Platform staff flag. Orthogonal to organization roles. */
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)],
)

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('VIEWER'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('memberships_org_user_key').on(t.organizationId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
)

export const businesses = pgTable(
  'businesses',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Display name as the customer writes it — may be Hebrew, Latin or mixed. */
    name: text('name').notNull(),
    /** Alternate spellings/transliterations. Critical for Hebrew↔English mention matching. */
    nameAliases: jsonb('name_aliases').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    websiteUrl: text('website_url').notNull(),
    /** Registrable domain, used to attribute citations to this business. */
    primaryDomain: text('primary_domain').notNull(),
    /** Vertical id from @autopilot/prompts, e.g. 'restaurant'. Drives templates, not logic. */
    vertical: text('vertical').notNull().default('local_business'),
    country: countryEnum('country').notNull().default('IL'),
    /** Content languages this business actually serves customers in. */
    contentLanguages: jsonb('content_languages')
      .$type<string[]>()
      .notNull()
      .default(sql`'["he","en"]'::jsonb`),
    autonomyMode: autonomyModeEnum('autonomy_mode').notNull().default('RECOMMEND'),
    /** Free-text goals from onboarding, surfaced to the agent as context (never as facts). */
    goals: text('goals'),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('businesses_org_idx').on(t.organizationId),
    index('businesses_domain_idx').on(t.primaryDomain),
  ],
)

export const businessLocations = pgTable(
  'business_locations',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    label: text('label'),
    street: text('street'),
    houseNumber: text('house_number'),
    /** City exactly as the customer states it. Never defaulted to Tel Aviv (brief §27). */
    city: text('city').notNull(),
    neighborhood: text('neighborhood'),
    postalCode: text('postal_code'),
    country: countryEnum('country').notNull().default('IL'),
    latitude: text('latitude'),
    longitude: text('longitude'),
    phone: text('phone'),
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('business_locations_business_idx').on(t.businessId),
    index('business_locations_org_idx').on(t.organizationId),
  ],
)

/**
 * Customer-authored constraints the agent must obey (brief §77/§78).
 * Evaluated as a hard gate before quality gates — a rule violation blocks an action even
 * if every other signal says it is a good idea.
 */
export const businessRules = pgTable(
  'business_rules',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** DO_NOT_CLAIM | ALWAYS_MENTION | DO_NOT_CREATE | APPROVAL_REQUIRED | TARGET_AUDIENCE | TARGET_LANGUAGE */
    ruleType: text('rule_type').notNull(),
    value: text('value').notNull(),
    note: text('note'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('business_rules_business_idx').on(t.businessId),
    uniqueIndex('business_rules_unique').on(t.businessId, t.ruleType, t.value),
  ],
)

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  businesses: many(businesses),
}))

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}))

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}))

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [businesses.organizationId],
    references: [organizations.id],
  }),
  locations: many(businessLocations),
  rules: many(businessRules),
}))
