import { describe, expect, it } from 'vitest'
import { isUuid, isUuidV7, secureToken, uuidV7Timestamp, uuidv7 } from '../src/ids.ts'

describe('uuidv7', () => {
  it('produces valid v7 UUIDs', () => {
    for (let i = 0; i < 100; i++) {
      const id = uuidv7()
      expect(isUuid(id)).toBe(true)
      expect(isUuidV7(id)).toBe(true)
    }
  })

  it('sorts lexicographically in creation order, keeping index writes local', () => {
    const early = uuidv7(new Date('2026-01-01T00:00:00Z').getTime())
    const late = uuidv7(new Date('2026-08-19T00:00:00Z').getTime())
    expect(early < late).toBe(true)
  })

  it('embeds a recoverable creation timestamp', () => {
    const when = new Date('2026-08-19T12:34:56.000Z')
    expect(uuidV7Timestamp(uuidv7(when.getTime()))?.getTime()).toBe(when.getTime())
    expect(uuidV7Timestamp('not-a-uuid')).toBeNull()
  })

  it('is collision-free across a large batch', () => {
    const ids = new Set(Array.from({ length: 20_000 }, () => uuidv7()))
    expect(ids.size).toBe(20_000)
  })
})

describe('secureToken', () => {
  it('is url-safe and unpredictable', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => secureToken(16)))
    expect(tokens.size).toBe(1000)
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
