/**
 * Database client construction.
 *
 * Two drivers, one schema: `postgres-js` in production, PGlite (real Postgres compiled to
 * WASM) in tests. Tests therefore exercise actual Postgres semantics — enums, jsonb,
 * constraints, `on conflict` — without Docker, a shared server or port contention.
 */
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.ts'

/**
 * Permissive in the driver's result HKT so both drivers satisfy it; precise in the schema,
 * which is the part every caller actually depends on.
 */
// oxlint-disable-next-line no-explicit-any
export type Database = import('drizzle-orm/pg-core').PgDatabase<any, typeof schema, any>

export interface DbHandle {
  readonly db: Database
  close(): Promise<void>
}

export const createDatabase = (connectionString: string, options?: { max?: number }): DbHandle => {
  const sql = postgres(connectionString, {
    max: options?.max ?? 10,
    // Statement timeout keeps a pathological analytics query from pinning a connection.
    connect_timeout: 10,
    idle_timeout: 30,
    prepare: true,
  })
  const db = drizzlePostgres(sql, { schema, casing: 'snake_case' }) as unknown as Database
  return {
    db,
    close: async () => {
      await sql.end({ timeout: 5 })
    },
  }
}

export { schema }
