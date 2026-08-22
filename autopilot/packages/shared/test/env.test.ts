/**
 * Production configuration invariants.
 *
 * The validator's job is to turn a class of 3am incidents into a refused deploy. That only
 * works if what it demands matches what the deployment actually needs: a check an operator
 * cannot satisfy honestly is a check they will satisfy dishonestly, and a fake
 * `DATABASE_URL` set to get past a guard is worse than no guard.
 */
import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env.ts'

const production = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  APP_URL: 'https://autopilot.example.co.il',
}

const secrets = {
  DATABASE_URL: 'postgres://user:pw@db.example.com:5432/autopilot',
  REDIS_URL: 'redis://cache.example.com:6379',
  ENCRYPTION_KEY: 'a'.repeat(44),
  SESSION_SECRET: 'b'.repeat(44),
}

describe('a full production deployment', () => {
  it('refuses to start without the stores it will write to', () => {
    expect(() => loadEnv(production)).toThrow(/DATABASE_URL/)
    expect(() => loadEnv(production)).toThrow(/REDIS_URL/)
  })

  it('refuses to start without the keys that protect stored data', () => {
    expect(() => loadEnv({ ...production, ...secrets, ENCRYPTION_KEY: undefined })).toThrow(
      /ENCRYPTION_KEY/,
    )
    expect(() => loadEnv({ ...production, ...secrets, SESSION_SECRET: undefined })).toThrow(
      /SESSION_SECRET/,
    )
  })

  it('starts when everything is present', () => {
    const env = loadEnv({ ...production, ...secrets })
    expect(env.DEPLOYMENT_MODE).toBe('full')
  })
})

describe('a scan-only production deployment', () => {
  const scanOnly = { ...production, DEPLOYMENT_MODE: 'scan-only' }

  it('starts with no database, no cache and no secrets', () => {
    // The free scan writes nothing and signs nothing. Requiring a Postgres cluster to
    // serve it would be theatre, and theatre is what teaches people to fake the value.
    const env = loadEnv(scanOnly)
    expect(env.DEPLOYMENT_MODE).toBe('scan-only')
    expect(env.DATABASE_URL).toBeUndefined()
  })

  it('still refuses to reach private hosts', () => {
    // This one is about our own network, not about stored data, so the mode is irrelevant.
    expect(() => loadEnv({ ...scanOnly, CRAWLER_ALLOW_PRIVATE_HOSTS: 'true' })).toThrow(
      /CRAWLER_ALLOW_PRIVATE_HOSTS/,
    )
  })

  it('still refuses to serve simulated answers', () => {
    expect(() => loadEnv({ ...scanOnly, USE_MOCK_PROVIDERS: 'true' })).toThrow(
      /USE_MOCK_PROVIDERS/,
    )
  })

  it('defaults to full, so omitting the variable never weakens a real deployment', () => {
    expect(() => loadEnv(production)).toThrow(/DATABASE_URL/)
  })
})

describe('non-production environments', () => {
  it('need nothing at all', () => {
    const env = loadEnv({})
    expect(env.APP_ENV).toBe('local')
    expect(env.DEPLOYMENT_MODE).toBe('full')
  })
})
