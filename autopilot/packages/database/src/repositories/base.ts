/**
 * Tenant-scoped repository base.
 *
 * Every query built here is `AND organization_id = $ctx`. Callers never write that
 * predicate themselves, so they cannot forget it. `assertOwnership` is the second belt:
 * any row about to be mutated is re-checked, which catches the case where an id was
 * guessed or leaked from another tenant.
 */
import { and, eq, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { forbidden, notFound } from '@autopilot/shared/errors.ts'
import type { Database } from '../client.ts'
import type { TenantContext } from '../tenant.ts'

/** A table that participates in tenancy. Enforced structurally, not by convention. */
export type TenantTable = PgTable & { organizationId: { name: string } }

export abstract class TenantRepository<TTable extends TenantTable> {
  constructor(
    protected readonly db: Database,
    protected readonly ctx: TenantContext,
    protected readonly table: TTable,
  ) {}

  /** The tenant predicate, combined with any caller-supplied conditions. */
  protected scope(...conditions: (SQL | undefined)[]): SQL {
    const tenant = eq(
      // oxlint-disable-next-line no-explicit-any
      (this.table as any).organizationId,
      this.ctx.organizationId,
    ) as SQL
    const extra = conditions.filter((c): c is SQL => c !== undefined)
    return extra.length === 0 ? tenant : (and(tenant, ...extra) as SQL)
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db
      .select()
      // oxlint-disable-next-line no-explicit-any
      .from(this.table as any)
      // oxlint-disable-next-line no-explicit-any
      .where(this.scope(eq((this.table as any).id, id)))
      .limit(1)
    return (rows[0] as Record<string, unknown> | undefined) ?? null
  }

  async requireById(id: string): Promise<Record<string, unknown>> {
    const row = await this.findById(id)
    if (!row) throw notFound(`Record ${id}`, { organizationId: this.ctx.organizationId })
    return row
  }

  /**
   * Confirms a row belongs to this tenant before a mutation. Throws FORBIDDEN rather than
   * NOT_FOUND when the row exists elsewhere, but only ever to internal logs — the public
   * message is identical either way, so the API cannot be used to probe for existence.
   */
  async assertOwnership(id: string): Promise<void> {
    const rows = await this.db
      .select()
      // oxlint-disable-next-line no-explicit-any
      .from(this.table as any)
      // oxlint-disable-next-line no-explicit-any
      .where(eq((this.table as any).id, id))
      .limit(1)
    const row = rows[0] as { organizationId?: string } | undefined
    if (!row) throw notFound(`Record ${id}`)
    if (row.organizationId !== this.ctx.organizationId) {
      throw forbidden('Cross-tenant access attempt', {
        recordId: id,
        expected: this.ctx.organizationId,
      })
    }
  }

  async count(where?: SQL): Promise<number> {
    const rows = await this.db
      .select()
      // oxlint-disable-next-line no-explicit-any
      .from(this.table as any)
      .where(this.scope(where))
    return rows.length
  }
}
