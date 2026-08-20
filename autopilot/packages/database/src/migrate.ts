/**
 * Migration runner for real deployments.
 *
 * Deliberately a plain script rather than an ORM lifecycle hook: migrations run as an
 * explicit, observable deployment step that can be executed against a maintenance
 * connection and rolled forward independently of the application image.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { loadEnv } from '@autopilot/shared/env.ts'
import { createLogger } from '@autopilot/shared/logger.ts'

const log = createLogger({ base: { component: 'migrate' } })

const run = async (): Promise<void> => {
  const env = loadEnv()
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required to run migrations')

  const sql = postgres(env.DATABASE_URL, { max: 1 })
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

  await sql`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`

  const applied = new Set(
    (await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name),
  )
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) {
      log.debug('migration already applied', { file })
      continue
    }
    log.info('applying migration', { file })
    const content = readFileSync(join(dir, file), 'utf8')
    // One transaction per migration file: a partial migration is never left behind.
    await sql.begin(async (tx) => {
      for (const statement of content.split('--> statement-breakpoint')) {
        const trimmed = statement.trim()
        if (trimmed.length > 0) await tx.unsafe(trimmed)
      }
      await tx`insert into _migrations (name) values (${file})`
    })
    log.info('migration applied', { file })
  }

  await sql.end()
  log.info('migrations up to date', { count: files.length })
}

run().catch((e: unknown) => {
  log.fatal('migration failed', { err: e })
  process.exitCode = 1
})
