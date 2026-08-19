/**
 * Tenant context and authorization.
 *
 * A repository cannot be constructed without one of these, and the organization predicate
 * is applied inside the repository rather than by callers — the one design decision that
 * makes cross-tenant leakage a compile-time impossibility for ordinary code paths rather
 * than a code-review responsibility.
 */
import { forbidden } from '@autopilot/shared/errors.ts'
import type { OrganizationId, UserId } from '@autopilot/shared/ids.ts'
import type { Role } from '@autopilot/shared/domain.ts'
import { hasRole } from '@autopilot/shared/domain.ts'

export interface TenantContext {
  readonly organizationId: OrganizationId
  readonly userId?: UserId
  readonly role: Role
  /** True when a platform admin is acting inside a customer tenant. Always audit-logged. */
  readonly impersonating?: boolean
}

export const tenantContext = (
  organizationId: OrganizationId,
  role: Role = 'OWNER',
  userId?: UserId,
): TenantContext => ({ organizationId, role, userId })

export const requireRole = (ctx: TenantContext, required: Role): void => {
  if (!hasRole(ctx.role, required)) {
    throw forbidden(`Requires ${required} role`, {
      required,
      actual: ctx.role,
      organizationId: ctx.organizationId,
    })
  }
}

export const canWrite = (ctx: TenantContext): boolean => hasRole(ctx.role, 'EDITOR')
export const canAdminister = (ctx: TenantContext): boolean => hasRole(ctx.role, 'ADMIN')
