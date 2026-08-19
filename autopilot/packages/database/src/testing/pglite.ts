/**
 * In-process Postgres for tests.
 *
 * PGlite is real Postgres compiled to WASM, so tests exercise genuine enum types, jsonb
 * behaviour, unique constraints and `on conflict` semantics. Each call gets its own
 * isolated instance: no shared fixture database, no cleanup ordering, no cross-test bleed,
 * and the suite runs with zero infrastructure.
 */
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from '../client.ts'
import * as schema from '../schema/index.ts'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

let cachedSql: string | null = null

/** Migration SQL is read once per process; every test database replays the same statements. */
const migrationSql = (): string => {
  if (cachedSql !== null) return cachedSql
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  cachedSql = files.map((f) => readFileSync(join(migrationsDir, f), 'utf8')).join('\n')
  return cachedSql
}

export interface TestDatabase {
  readonly db: Database
  readonly raw: PGlite
  close(): Promise<void>
  /** Truncates every table, keeping the schema. Faster than rebuilding for reuse. */
  reset(): Promise<void>
}

/**
 * Applying 50 tables of DDL takes seconds; doing it once per test file would dominate the
 * suite. We migrate a throwaway instance once per process, dump its data directory, and
 * clone that snapshot for every subsequent database — schema setup becomes a memcpy.
 */
let schemaSnapshot: Promise<Blob> | null = null

const buildSnapshot = async (): Promise<Blob> => {
  const seed = new PGlite()
  for (const statement of migrationSql().split('--> statement-breakpoint')) {
    const sql = statement.trim()
    if (sql.length === 0) continue
    await seed.exec(sql)
  }
  const dump = await seed.dumpDataDir('none')
  await seed.close()
  return dump
}

export const createTestDatabase = async (): Promise<TestDatabase> => {
  schemaSnapshot ??= buildSnapshot()
  const client = await PGlite.create({ loadDataDir: await schemaSnapshot })
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Database

  return {
    db,
    raw: client,
    close: async () => {
      await client.close()
    },
    reset: async () => {
      const { rows } = await client.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public'`,
      )
      if (rows.length === 0) return
      const list = rows.map((r) => `"${r.tablename}"`).join(', ')
      await client.exec(`truncate table ${list} restart identity cascade`)
    },
  }
}
