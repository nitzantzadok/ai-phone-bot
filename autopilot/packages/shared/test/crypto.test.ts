import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  decryptSecret,
  encryptSecret,
  keyringFromEnv,
  safeEqual,
  sign,
  verifySignature,
} from '../src/crypto.ts'

const keyring = (version = 1) => keyringFromEnv(randomBytes(32).toString('base64'), version)

describe('token encryption', () => {
  it('round-trips an OAuth refresh token', () => {
    const kr = keyring()
    const token = '1//0gLongGoogleRefreshTokenValue_with-symbols'
    expect(decryptSecret(encryptSecret(token, kr), kr)).toBe(token)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    const kr = keyring()
    expect(encryptSecret('same', kr)).not.toBe(encryptSecret('same', kr))
  })

  it('never leaves the plaintext visible in the stored value', () => {
    const kr = keyring()
    expect(encryptSecret('super-secret-token', kr)).not.toContain('super-secret-token')
  })

  it('rejects tampered ciphertext instead of returning garbage', () => {
    const kr = keyring()
    const ct = encryptSecret('token', kr)
    const parts = ct.split('.')
    const tampered = [parts[0], parts[1], parts[2], Buffer.from('evil').toString('base64url')].join('.')
    expect(() => decryptSecret(tampered, kr)).toThrow()
  })

  it('refuses a key of the wrong length rather than silently padding', () => {
    expect(() => keyringFromEnv(Buffer.from('short').toString('base64'), 1)).toThrow(/32 bytes/)
  })

  it('cannot decrypt with an unknown key version', () => {
    const a = keyring(1)
    const b = keyring(2)
    expect(() => decryptSecret(encryptSecret('x', a), b)).toThrow(/No decryption key/)
  })

  it('rejects malformed ciphertext', () => {
    expect(() => decryptSecret('garbage', keyring())).toThrow(/Malformed/)
  })
})

describe('signatures', () => {
  it('verifies a correct webhook signature and rejects a wrong one', () => {
    const payload = '{"event":"invoice.paid"}'
    const secret = 'whsec_test'
    expect(verifySignature(payload, secret, sign(payload, secret))).toBe(true)
    expect(verifySignature(payload, secret, sign(payload, 'other'))).toBe(false)
    expect(verifySignature('{"event":"tampered"}', secret, sign(payload, secret))).toBe(false)
  })

  it('compares safely across differing lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('abc', 'abc')).toBe(true)
  })
})
