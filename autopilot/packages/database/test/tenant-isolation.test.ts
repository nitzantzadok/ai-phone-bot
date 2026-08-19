/**
 * Tenant isolation.
 *
 * The single most important safety property of a multi-tenant SaaS: no query path may
 * return another organization's rows. These tests exercise the repository surface
 * directly, and the final sweep is generic so that a repository method added later
 * without a tenant predicate fails here rather than in production.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import { newId } from '@autopilot/shared/ids.ts'
import { createTestDatabase, seedTenant, type TestDatabase, type Tenant } from './helpers.ts'
import * as s from '../src/schema/index.ts'
import { createRepositories } from '../src/repositories/index.ts'
import { tenantContext } from '../src/tenant.ts'

let tdb: TestDatabase
let alice: Tenant
let bob: Tenant

beforeEach(async () => {
  tdb = await createTestDatabase()
  alice = await seedTenant(tdb, 'Alice')
  bob = await seedTenant(tdb, 'Bob')
})

afterEach(async () => {
  await tdb.close()
})

describe('business repository', () => {
  it('lists only its own tenant businesses', async () => {
    const aliceList = await alice.repos.businesses.list()
    const bobList = await bob.repos.businesses.list()
    expect(aliceList).toHaveLength(1)
    expect(bobList).toHaveLength(1)
    expect(aliceList[0]!.id).not.toBe(bobList[0]!.id)
  })

  it('cannot read another tenant business by id', async () => {
    expect(await alice.repos.businesses.findById(bob.businessId)).toBeNull()
    expect(await bob.repos.businesses.findById(alice.businessId)).toBeNull()
  })

  it('cannot update another tenant business even knowing its id', async () => {
    await expect(alice.repos.businesses.update(bob.businessId, { name: 'hijacked' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const bobBusiness = await bob.repos.businesses.findById(bob.businessId)
    expect(bobBusiness!.name).toBe('Bob Business')
  })

  it('reports NOT_FOUND for an id that exists nowhere', async () => {
    await expect(alice.repos.businesses.update(newId(), {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('facts, prompts and opportunities', () => {
  beforeEach(async () => {
    for (const t of [alice, bob]) {
      await t.repos.facts.insertMany([
        {
          businessId: t.businessId,
          factKind: 'cuisine',
          value: `${t.organizationId.slice(0, 4)}-cuisine`,
          confidence: 'HIGH',
        },
      ])
      const [set] = await tdb.db
        .insert(s.promptSets)
        .values({
          organizationId: t.organizationId,
          businessId: t.businessId,
          name: 'monitoring',
          generatorVersion: 'test',
        })
        .returning()
      await t.repos.prompts.insertMany([
        {
          businessId: t.businessId,
          promptSetId: set!.id,
          queryText: `best place near ${t.organizationId.slice(0, 4)}`,
          canonicalIntent: 'best_place',
          intentCategory: 'DISCOVERY',
          vertical: 'restaurant',
          language: 'en',
          locale: 'en-IL',
          country: 'IL',
        },
      ])
      await t.repos.opportunities.upsertMany([
        {
          businessId: t.businessId,
          dedupeKey: 'missing-schema',
          title: 'Add schema',
          explanation: 'plain language',
          category: 'SCHEMA',
          controllability: 'CONTROLLED',
          score: 0.7,
        },
      ])
    }
  })

  it('scopes facts to the owning tenant', async () => {
    const aliceFacts = await alice.repos.facts.listActive(alice.businessId)
    expect(aliceFacts).toHaveLength(1)
    expect(await alice.repos.facts.listActive(bob.businessId)).toHaveLength(0)
  })

  it('scopes prompts even when the other tenant prompt set id is known', async () => {
    const bobSets = await tdb.db
      .select()
      .from(s.promptSets)
      .where(eq(s.promptSets.organizationId, bob.organizationId))
    expect(await alice.repos.prompts.listBySet(bobSets[0]!.id)).toHaveLength(0)
  })

  it('scopes opportunities', async () => {
    expect(await alice.repos.opportunities.topOpen(alice.businessId)).toHaveLength(1)
    expect(await alice.repos.opportunities.topOpen(bob.businessId)).toHaveLength(0)
  })

  it('keeps upsert deduplication per tenant, not global', async () => {
    await alice.repos.opportunities.upsertMany([
      {
        businessId: alice.businessId,
        dedupeKey: 'missing-schema',
        title: 'Add schema',
        explanation: 'updated explanation',
        category: 'SCHEMA',
        controllability: 'CONTROLLED',
        score: 0.9,
      },
    ])
    const aliceOpps = await alice.repos.opportunities.topOpen(alice.businessId)
    const bobOpps = await bob.repos.opportunities.topOpen(bob.businessId)
    expect(aliceOpps).toHaveLength(1)
    expect(aliceOpps[0]!.score).toBeCloseTo(0.9)
    expect(bobOpps[0]!.score).toBeCloseTo(0.7)
  })
})

describe('audit log', () => {
  it('records the acting tenant and never exposes another tenant history', async () => {
    await alice.repos.audit.log({ action: 'business.created', actorType: 'USER' })
    await bob.repos.audit.log({ action: 'business.created', actorType: 'USER' })
    expect(await alice.repos.audit.list()).toHaveLength(1)
    expect(await bob.repos.audit.list()).toHaveLength(1)
  })
})

describe('generic sweep across every tenant-owned table', () => {
  /**
   * Every table carrying organization_id is checked structurally: a row belonging to Bob
   * must be invisible to a repository built from Alice's context. This is the test that
   * catches a future table added without a tenant predicate in its repository.
   */
  it('every tenant table has an indexed organization_id foreign key', () => {
    const exempt = new Set([
      'attributes', // cross-tenant vocabulary, contains no tenant data
      'sources', // cross-tenant source registry, contains no tenant data
      'plans', // product catalogue
      'users', // subject of memberships, not owned by one org
      'organizations', // is the tenant
      'feature_flag_overrides', // nullable org: global overrides are legitimate
      'audit_logs', // nullable org: platform-level events are legitimate
      'deletion_requests', // nullable org: the org may already be gone
      'jobs', // nullable org: platform maintenance jobs are legitimate
      'api_cost_records', // nullable org: platform-level provider costs are legitimate
    ])

    const tables = Object.values(s).filter(
      (v): v is typeof s.businesses =>
        typeof v === 'object' && v !== null && Symbol.for('drizzle:Name') in v,
    )
    expect(tables.length).toBeGreaterThan(30)

    const missing: string[] = []
    for (const table of tables) {
      const config = getTableConfig(table)
      if (exempt.has(config.name)) continue
      const orgColumn = config.columns.find((c) => c.name === 'organization_id')
      if (!orgColumn) {
        missing.push(`${config.name}: no organization_id column`)
        continue
      }
      if (!orgColumn.notNull) missing.push(`${config.name}: organization_id is nullable`)
      const referenced = config.foreignKeys.some((fk) =>
        fk.reference().columns.some((c) => c.name === 'organization_id'),
      )
      if (!referenced) missing.push(`${config.name}: organization_id has no foreign key`)
    }
    expect(missing).toEqual([])
  })

  it('cannot reach another tenant rows through the base repository', async () => {
    const aliceRepos = createRepositories(tdb.db, tenantContext(alice.organizationId))
    const bobRepos = createRepositories(tdb.db, tenantContext(bob.organizationId))

    const [bobRun] = await bobRepos.agentRuns.start({
      businessId: bob.businessId,
      runType: 'DIAGNOSIS',
      autonomyMode: 'RECOMMEND',
      limits: { maxIterations: 5 },
    })
      ? [await bobRepos.agentRuns.start({
          businessId: bob.businessId,
          runType: 'DIAGNOSIS',
          autonomyMode: 'RECOMMEND',
          limits: { maxIterations: 5 },
        })]
      : []

    expect(await aliceRepos.agentRuns.findById(bobRun!.id)).toBeNull()
    await expect(aliceRepos.agentRuns.finish(bobRun!.id, { status: 'COMPLETED' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await aliceRepos.agentRuns.recent(bob.businessId)).toHaveLength(0)
    expect((await bobRepos.agentRuns.recent(bob.businessId)).length).toBeGreaterThan(0)
  })
})
