import { newId, type OrganizationId } from '@autopilot/shared/ids.ts'
import { createTestDatabase, type TestDatabase } from '../src/testing/pglite.ts'
import { createRepositories, type Repositories } from '../src/repositories/index.ts'
import { tenantContext } from '../src/tenant.ts'
import * as s from '../src/schema/index.ts'

export interface Tenant {
  readonly organizationId: OrganizationId
  readonly businessId: string
  readonly repos: Repositories
}

export const seedTenant = async (
  tdb: TestDatabase,
  name: string,
  overrides: Partial<typeof s.businesses.$inferInsert> = {},
): Promise<Tenant> => {
  const organizationId = newId<'OrganizationId'>()
  await tdb.db.insert(s.organizations).values({
    id: organizationId,
    name,
    slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${organizationId.slice(0, 8)}`,
  })

  const repos = createRepositories(tdb.db, tenantContext(organizationId))
  const business = await repos.businesses.create({
    name: `${name} Business`,
    websiteUrl: `https://${name.toLowerCase()}.example.com`,
    primaryDomain: `${name.toLowerCase()}.example.com`,
    vertical: 'restaurant',
    ...overrides,
  })

  return { organizationId, businessId: business.id, repos }
}

export { createTestDatabase }
export type { TestDatabase }
