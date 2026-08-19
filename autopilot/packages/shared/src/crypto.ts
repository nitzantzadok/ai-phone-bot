/**
 * Envelope encryption for secrets at rest — specifically OAuth refresh tokens, which are
 * long-lived credentials to a customer's Google Business Profile.
 *
 * AES-256-GCM with a random 96-bit IV and an authenticated key version, so a key can be
 * rotated without a migration that decrypts everything at once.
 *
 * The ciphertext format is `v<version>.<iv>.<tag>.<ciphertext>` (base64url), which is
 * self-describing and safe to store in a text column.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'
import { AppError } from './errors.ts'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

export interface EncryptionKeyring {
  /** Key version currently used for new encryptions. */
  readonly currentVersion: number
  /** version -> 32-byte key. Old versions retained so existing rows stay readable. */
  readonly keys: ReadonlyMap<number, Buffer>
}

export const keyringFromEnv = (base64Key: string, version: number): EncryptionKeyring => {
  const key = Buffer.from(base64Key, 'base64')
  if (key.length !== 32) {
    throw new AppError({
      code: 'INTERNAL',
      message: `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}`,
    })
  }
  return { currentVersion: version, keys: new Map([[version, key]]) }
}

export const encryptSecret = (plaintext: string, keyring: EncryptionKeyring): string => {
  const key = keyring.keys.get(keyring.currentVersion)
  if (!key) throw new AppError({ code: 'INTERNAL', message: 'Encryption key version missing' })
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  // Bind the key version into the AAD so a downgraded version cannot be replayed.
  cipher.setAAD(Buffer.from(`v${keyring.currentVersion}`, 'utf8'))
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    `v${keyring.currentVersion}`,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join('.')
}

export const decryptSecret = (ciphertext: string, keyring: EncryptionKeyring): string => {
  const parts = ciphertext.split('.')
  if (parts.length !== 4 || !parts[0]!.startsWith('v')) {
    throw new AppError({ code: 'INTERNAL', message: 'Malformed ciphertext' })
  }
  const version = Number(parts[0]!.slice(1))
  const key = keyring.keys.get(version)
  if (!key) {
    throw new AppError({
      code: 'INTERNAL',
      message: `No decryption key for version ${version}`,
    })
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(parts[1]!, 'base64url'))
  decipher.setAAD(Buffer.from(parts[0]!, 'utf8'))
  decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3]!, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/** Constant-time comparison for webhook signatures and share tokens. */
export const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** HMAC-SHA256 hex signature — used for outbound webhooks and share-link integrity. */
export const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex')

export const verifySignature = (payload: string, secret: string, signature: string): boolean =>
  safeEqual(sign(payload, secret), signature)
