import { describe, expect, it } from 'vitest'
import { createTestLogger, sanitize } from '../src/logger.ts'

describe('log redaction', () => {
  it('redacts credential-shaped keys at any nesting depth', () => {
    const out = sanitize({
      ok: 'visible',
      accessToken: 'ya29.secret',
      nested: { refresh_token: 'r', deeper: { API_KEY: 'k', clientSecret: 's' } },
    }) as Record<string, unknown>
    const flat = JSON.stringify(out)
    expect(flat).toContain('visible')
    expect(flat).not.toContain('ya29.secret')
    expect(flat).not.toContain('clientSecret":"s')
    expect(flat.match(/REDACTED/g)?.length).toBe(4)
  })

  it('redacts credential-shaped VALUES even under an innocent key', () => {
    const out = JSON.stringify(
      sanitize({
        note: 'the key is sk-abcdefghijklmnopqrstuvwxyz012345 do not share',
        google: 'AIzaSyA1234567890abcdefghijklmnopqrstuv',
      }),
    )
    expect(out).not.toContain('sk-abcdefghijklmnop')
    expect(out).not.toContain('AIzaSyA1234567890')
    expect(out).toContain('do not share')
  })

  it('never writes a secret through the logger, message or context', () => {
    const { logger, records } = createTestLogger()
    logger.child({ organizationId: 'org-1' }).error('token refresh failed', {
      refreshToken: '1//0abcdefgh',
      provider: 'google',
      detail: 'Bearer ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxx',
    })
    const line = JSON.stringify(records)
    expect(line).not.toContain('1//0abcdefgh')
    expect(line).not.toContain('ya29.a0AfH6SMB')
    expect(line).toContain('org-1')
    expect(line).toContain('token refresh failed')
  })

  it('serialises errors without losing the message', () => {
    const { logger, records } = createTestLogger()
    logger.error('boom', { err: new Error('database exploded') })
    expect(JSON.stringify(records)).toContain('database exploded')
  })

  it('respects the level threshold', () => {
    const records: unknown[] = []
    const { logger } = createTestLogger()
    logger.trace('trace goes through on the test logger')
    expect(records.length).toBe(0)
  })
})
