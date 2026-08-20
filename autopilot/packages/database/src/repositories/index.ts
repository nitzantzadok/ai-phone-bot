/**
 * Concrete repositories.
 *
 * Each one is thin on purpose: business logic lives in the domain packages, and this layer
 * exists to guarantee tenancy and to keep query shapes in one place where their indexes
 * can be reasoned about.
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { OrganizationId } from '@autopilot/shared/ids.ts'
import type { Database } from '../client.ts'
import * as s from '../schema/index.ts'
import type { TenantContext } from '../tenant.ts'
import { TenantRepository } from './base.ts'

export class BusinessRepository extends TenantRepository<typeof s.businesses> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.businesses)
  }

  async list(): Promise<(typeof s.businesses.$inferSelect)[]> {
    return this.db
      .select()
      .from(s.businesses)
      .where(this.scope(isNull(s.businesses.deletedAt)))
      .orderBy(desc(s.businesses.createdAt)) as Promise<(typeof s.businesses.$inferSelect)[]>
  }

  async create(
    input: Omit<typeof s.businesses.$inferInsert, 'organizationId'>,
  ): Promise<typeof s.businesses.$inferSelect> {
    const [row] = await this.db
      .insert(s.businesses)
      .values({ ...input, organizationId: this.ctx.organizationId })
      .returning()
    return row as typeof s.businesses.$inferSelect
  }

  async update(
    id: string,
    patch: Partial<typeof s.businesses.$inferInsert>,
  ): Promise<typeof s.businesses.$inferSelect> {
    await this.assertOwnership(id)
    const [row] = await this.db
      .update(s.businesses)
      .set({ ...patch, updatedAt: new Date() })
      .where(this.scope(eq(s.businesses.id, id)))
      .returning()
    return row as typeof s.businesses.$inferSelect
  }
}

export class FactRepository extends TenantRepository<typeof s.businessFacts> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.businessFacts)
  }

  async listActive(businessId: string): Promise<(typeof s.businessFacts.$inferSelect)[]> {
    return this.db
      .select()
      .from(s.businessFacts)
      .where(
        this.scope(
          eq(s.businessFacts.businessId, businessId),
          eq(s.businessFacts.status, 'ACTIVE'),
        ),
      ) as Promise<(typeof s.businessFacts.$inferSelect)[]>
  }

  async byKind(businessId: string, factKind: string) {
    return this.db
      .select()
      .from(s.businessFacts)
      .where(
        this.scope(
          eq(s.businessFacts.businessId, businessId),
          eq(s.businessFacts.factKind, factKind),
          eq(s.businessFacts.status, 'ACTIVE'),
        ),
      )
  }

  async insertMany(rows: Omit<typeof s.businessFacts.$inferInsert, 'organizationId'>[]) {
    if (rows.length === 0) return []
    return this.db
      .insert(s.businessFacts)
      .values(rows.map((r) => ({ ...r, organizationId: this.ctx.organizationId })))
      .returning()
  }

  /** Marks the previous fact of the same kind superseded rather than deleting history. */
  async supersede(oldFactId: string, newFactId: string): Promise<void> {
    await this.assertOwnership(oldFactId)
    await this.db
      .update(s.businessFacts)
      .set({ status: 'SUPERSEDED', supersededByFactId: newFactId, updatedAt: new Date() })
      .where(this.scope(eq(s.businessFacts.id, oldFactId)))
  }
}

export class PromptRepository extends TenantRepository<typeof s.prompts> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.prompts)
  }

  async listBySet(promptSetId: string): Promise<(typeof s.prompts.$inferSelect)[]> {
    return this.db
      .select()
      .from(s.prompts)
      .where(this.scope(eq(s.prompts.promptSetId, promptSetId), eq(s.prompts.active, true)))
      .orderBy(desc(s.prompts.promptScore)) as Promise<(typeof s.prompts.$inferSelect)[]>
  }

  async insertMany(rows: Omit<typeof s.prompts.$inferInsert, 'organizationId'>[]) {
    if (rows.length === 0) return []
    return this.db
      .insert(s.prompts)
      .values(rows.map((r) => ({ ...r, organizationId: this.ctx.organizationId })))
      .onConflictDoNothing()
      .returning()
  }
}

export class ExecutionRepository extends TenantRepository<typeof s.promptExecutions> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.promptExecutions)
  }

  async listInWindow(businessId: string, from: Date, to: Date) {
    return this.db
      .select()
      .from(s.promptExecutions)
      .where(
        this.scope(
          eq(s.promptExecutions.businessId, businessId),
          gte(s.promptExecutions.executedAt, from),
          lte(s.promptExecutions.executedAt, to),
        ),
      )
  }

  /**
   * Deduplication window: an identical (prompt, provider, model, locale) execution inside
   * the TTL is reused instead of re-paying a provider for the same question.
   */
  async findRecentIdentical(params: {
    promptId: string
    provider: 'openai' | 'gemini' | 'anthropic'
    model: string
    locale: string
    since: Date
  }) {
    const rows = await this.db
      .select()
      .from(s.promptExecutions)
      .where(
        this.scope(
          eq(s.promptExecutions.promptId, params.promptId),
          eq(s.promptExecutions.provider, params.provider),
          eq(s.promptExecutions.model, params.model),
          eq(s.promptExecutions.locale, params.locale),
          gte(s.promptExecutions.executedAt, params.since),
          eq(s.promptExecutions.status, 'SUCCEEDED'),
        ),
      )
      .orderBy(desc(s.promptExecutions.executedAt))
      .limit(1)
    return rows[0] ?? null
  }
}

export class RecommendationRepository extends TenantRepository<typeof s.aiRecommendations> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.aiRecommendations)
  }

  async listForExecutions(executionIds: string[]) {
    if (executionIds.length === 0) return []
    return this.db
      .select()
      .from(s.aiRecommendations)
      .where(this.scope(inArray(s.aiRecommendations.executionId, executionIds)))
  }
}

export class OpportunityRepository extends TenantRepository<typeof s.opportunities> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.opportunities)
  }

  async topOpen(businessId: string, limit = 10) {
    return this.db
      .select()
      .from(s.opportunities)
      .where(
        this.scope(
          eq(s.opportunities.businessId, businessId),
          eq(s.opportunities.status, 'OPEN'),
        ),
      )
      .orderBy(desc(s.opportunities.score))
      .limit(limit)
  }

  /** Idempotent: re-running diagnosis refreshes scores instead of duplicating rows. */
  async upsertMany(rows: Omit<typeof s.opportunities.$inferInsert, 'organizationId'>[]) {
    if (rows.length === 0) return []
    return this.db
      .insert(s.opportunities)
      .values(rows.map((r) => ({ ...r, organizationId: this.ctx.organizationId })))
      .onConflictDoUpdate({
        target: [s.opportunities.businessId, s.opportunities.dedupeKey],
        set: {
          score: sql`excluded.score`,
          expectedLift: sql`excluded.expected_lift`,
          confidence: sql`excluded.confidence`,
          promptReach: sql`excluded.prompt_reach`,
          recommendationGap: sql`excluded.recommendation_gap`,
          evidence: sql`excluded.evidence`,
          explanation: sql`excluded.explanation`,
          updatedAt: new Date(),
        },
      })
      .returning()
  }
}

export class ActionRepository extends TenantRepository<typeof s.optimizationActions> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.optimizationActions)
  }

  async listByStatus(businessId: string, status: (typeof s.optimizationActions.$inferSelect)['status']) {
    return this.db
      .select()
      .from(s.optimizationActions)
      .where(
        this.scope(
          eq(s.optimizationActions.businessId, businessId),
          eq(s.optimizationActions.status, status),
        ),
      )
      .orderBy(desc(s.optimizationActions.createdAt))
  }

  async create(row: Omit<typeof s.optimizationActions.$inferInsert, 'organizationId'>) {
    const [created] = await this.db
      .insert(s.optimizationActions)
      .values({ ...row, organizationId: this.ctx.organizationId })
      .returning()
    return created as typeof s.optimizationActions.$inferSelect
  }

  async updateStatus(
    id: string,
    patch: Partial<typeof s.optimizationActions.$inferInsert>,
  ) {
    await this.assertOwnership(id)
    const [row] = await this.db
      .update(s.optimizationActions)
      .set({ ...patch, updatedAt: new Date() })
      .where(this.scope(eq(s.optimizationActions.id, id)))
      .returning()
    return row as typeof s.optimizationActions.$inferSelect
  }
}

export class ScoreRepository extends TenantRepository<typeof s.airsScores> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.airsScores)
  }

  async latest(businessId: string) {
    const rows = await this.db
      .select()
      .from(s.airsScores)
      .where(
        this.scope(eq(s.airsScores.businessId, businessId), isNull(s.airsScores.provider)),
      )
      .orderBy(desc(s.airsScores.calculatedAt))
      .limit(1)
    return rows[0] ?? null
  }

  async history(businessId: string, limit = 30) {
    return this.db
      .select()
      .from(s.airsScores)
      .where(this.scope(eq(s.airsScores.businessId, businessId)))
      .orderBy(desc(s.airsScores.calculatedAt))
      .limit(limit)
  }

  async insert(row: Omit<typeof s.airsScores.$inferInsert, 'organizationId'>) {
    const [created] = await this.db
      .insert(s.airsScores)
      .values({ ...row, organizationId: this.ctx.organizationId })
      .returning()
    return created as typeof s.airsScores.$inferSelect
  }
}

export class CompetitorRepository extends TenantRepository<typeof s.competitors> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.competitors)
  }

  async list(businessId: string) {
    return this.db
      .select()
      .from(s.competitors)
      .where(
        this.scope(
          eq(s.competitors.businessId, businessId),
          eq(s.competitors.dismissed, false),
        ),
      )
      .orderBy(desc(s.competitors.recommendationCount))
  }

  /** Competitors are discovered repeatedly; upsert keeps counts cumulative. */
  async recordSighting(businessId: string, name: string, recommended: boolean, domain?: string) {
    const [row] = await this.db
      .insert(s.competitors)
      .values({
        organizationId: this.ctx.organizationId,
        businessId,
        name,
        domain: domain ?? null,
        mentionCount: 1,
        recommendationCount: recommended ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [s.competitors.businessId, s.competitors.name],
        set: {
          mentionCount: sql`${s.competitors.mentionCount} + 1`,
          recommendationCount: sql`${s.competitors.recommendationCount} + ${recommended ? 1 : 0}`,
          lastSeenAt: new Date(),
        },
      })
      .returning()
    return row as typeof s.competitors.$inferSelect
  }
}

export class ContentVersionRepository extends TenantRepository<typeof s.contentVersions> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.contentVersions)
  }

  async create(row: Omit<typeof s.contentVersions.$inferInsert, 'organizationId'>) {
    const [created] = await this.db
      .insert(s.contentVersions)
      .values({ ...row, organizationId: this.ctx.organizationId })
      .returning()
    return created as typeof s.contentVersions.$inferSelect
  }

  async history(businessId: string, limit = 50) {
    return this.db
      .select()
      .from(s.contentVersions)
      .where(this.scope(eq(s.contentVersions.businessId, businessId)))
      .orderBy(desc(s.contentVersions.createdAt))
      .limit(limit)
  }

  async markPublished(id: string) {
    await this.assertOwnership(id)
    await this.db
      .update(s.contentVersions)
      .set({ publishStatus: 'PUBLISHED', publishedAt: new Date() })
      .where(this.scope(eq(s.contentVersions.id, id)))
  }

  async markRolledBack(id: string) {
    await this.assertOwnership(id)
    await this.db
      .update(s.contentVersions)
      .set({ publishStatus: 'ROLLED_BACK', rolledBackAt: new Date() })
      .where(this.scope(eq(s.contentVersions.id, id)))
  }
}

export class AgentRunRepository extends TenantRepository<typeof s.agentRuns> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.agentRuns)
  }

  async start(row: Omit<typeof s.agentRuns.$inferInsert, 'organizationId'>) {
    const [created] = await this.db
      .insert(s.agentRuns)
      .values({ ...row, organizationId: this.ctx.organizationId })
      .returning()
    return created as typeof s.agentRuns.$inferSelect
  }

  async finish(id: string, patch: Partial<typeof s.agentRuns.$inferInsert>) {
    await this.assertOwnership(id)
    const [row] = await this.db
      .update(s.agentRuns)
      .set({ ...patch, finishedAt: new Date() })
      .where(this.scope(eq(s.agentRuns.id, id)))
      .returning()
    return row as typeof s.agentRuns.$inferSelect
  }

  async addStep(row: Omit<typeof s.agentSteps.$inferInsert, 'organizationId'>) {
    const [created] = await this.db
      .insert(s.agentSteps)
      .values({ ...row, organizationId: this.ctx.organizationId })
      .returning()
    return created as typeof s.agentSteps.$inferSelect
  }

  async steps(agentRunId: string) {
    return this.db
      .select()
      .from(s.agentSteps)
      .where(this.scope(eq(s.agentSteps.agentRunId, agentRunId)))
      .orderBy(s.agentSteps.sequence)
  }

  async recent(businessId: string, limit = 20) {
    return this.db
      .select()
      .from(s.agentRuns)
      .where(this.scope(eq(s.agentRuns.businessId, businessId)))
      .orderBy(desc(s.agentRuns.startedAt))
      .limit(limit)
  }
}

export class ExperimentRepository extends TenantRepository<typeof s.experiments> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.experiments)
  }

  async create(row: Omit<typeof s.experiments.$inferInsert, 'organizationId'>) {
    const [created] = await this.db
      .insert(s.experiments)
      .values({ ...row, organizationId: this.ctx.organizationId })
      .returning()
    return created as typeof s.experiments.$inferSelect
  }

  async update(id: string, patch: Partial<typeof s.experiments.$inferInsert>) {
    await this.assertOwnership(id)
    const [row] = await this.db
      .update(s.experiments)
      .set({ ...patch, updatedAt: new Date() })
      .where(this.scope(eq(s.experiments.id, id)))
      .returning()
    return row as typeof s.experiments.$inferSelect
  }

  async listByBusiness(businessId: string) {
    return this.db
      .select()
      .from(s.experiments)
      .where(this.scope(eq(s.experiments.businessId, businessId)))
      .orderBy(desc(s.experiments.createdAt))
  }
}

export class CostRepository extends TenantRepository<typeof s.apiCostRecords> {
  constructor(db: Database, ctx: TenantContext) {
    super(db, ctx, s.apiCostRecords)
  }

  async record(row: Omit<typeof s.apiCostRecords.$inferInsert, 'organizationId'>) {
    const [created] = await this.db
      .insert(s.apiCostRecords)
      .values({ ...row, organizationId: this.ctx.organizationId })
      .returning()
    return created as typeof s.apiCostRecords.$inferSelect
  }

  async spendSince(since: Date): Promise<number> {
    const rows = (await this.db
      .select()
      .from(s.apiCostRecords)
      .where(this.scope(gte(s.apiCostRecords.createdAt, since)))) as {
      estimatedCostMinor: number
      actualCostMinor: number | null
    }[]
    return rows.reduce((sum, r) => sum + (r.actualCostMinor ?? r.estimatedCostMinor), 0)
  }
}

export class AuditRepository {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
  ) {}

  /** Audit rows are append-only and never filtered out of a tenant's own history. */
  async log(entry: {
    action: string
    actorType: 'USER' | 'AGENT' | 'SYSTEM' | 'ADMIN'
    entityType?: string
    entityId?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.db.insert(s.auditLogs).values({
      organizationId: this.ctx.organizationId,
      actorUserId: this.ctx.userId ?? null,
      actorType: entry.actorType,
      impersonatedOrganizationId: this.ctx.impersonating ? this.ctx.organizationId : null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    })
  }

  async list(limit = 100) {
    return this.db
      .select()
      .from(s.auditLogs)
      .where(eq(s.auditLogs.organizationId, this.ctx.organizationId))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(limit)
  }
}

/** Everything a request handler or job needs, constructed once from a tenant context. */
export interface Repositories {
  readonly businesses: BusinessRepository
  readonly facts: FactRepository
  readonly prompts: PromptRepository
  readonly executions: ExecutionRepository
  readonly recommendations: RecommendationRepository
  readonly opportunities: OpportunityRepository
  readonly actions: ActionRepository
  readonly scores: ScoreRepository
  readonly competitors: CompetitorRepository
  readonly contentVersions: ContentVersionRepository
  readonly agentRuns: AgentRunRepository
  readonly experiments: ExperimentRepository
  readonly costs: CostRepository
  readonly audit: AuditRepository
}

export const createRepositories = (db: Database, ctx: TenantContext): Repositories => ({
  businesses: new BusinessRepository(db, ctx),
  facts: new FactRepository(db, ctx),
  prompts: new PromptRepository(db, ctx),
  executions: new ExecutionRepository(db, ctx),
  recommendations: new RecommendationRepository(db, ctx),
  opportunities: new OpportunityRepository(db, ctx),
  actions: new ActionRepository(db, ctx),
  scores: new ScoreRepository(db, ctx),
  competitors: new CompetitorRepository(db, ctx),
  contentVersions: new ContentVersionRepository(db, ctx),
  agentRuns: new AgentRunRepository(db, ctx),
  experiments: new ExperimentRepository(db, ctx),
  costs: new CostRepository(db, ctx),
  audit: new AuditRepository(db, ctx),
})

export { TenantRepository } from './base.ts'
export type { OrganizationId }
export { and, desc, eq, inArray, isNull, sql }
