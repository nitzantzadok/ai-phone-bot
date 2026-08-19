/**
 * Google Business Profile connector.
 *
 * Three rules govern this integration, all of them non-negotiable.
 *
 * We never ask for a customer's password. Access is OAuth only, and the refresh token is
 * stored encrypted; access tokens live in memory and are never persisted or logged.
 *
 * The default is READ_ONLY. Writing to a business's Google profile is a materially
 * different act from editing their own website — it affects what appears in Maps and Search
 * — so automation is opt-in, per business, and revocable.
 *
 * Review replies are off by default and gated separately, because a bot replying to a
 * customer's reviewers in their name is the single most reputationally dangerous thing
 * this product could do.
 */
import { AppError } from '@autopilot/shared/errors.ts'
import { decryptSecret, encryptSecret, type EncryptionKeyring } from '@autopilot/shared/crypto.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import type { ConfidenceLevel } from '@autopilot/shared/domain.ts'

export type AutomationMode = 'READ_ONLY' | 'SUGGEST' | 'AUTOMATED'

/**
 * Scopes requested. Deliberately minimal: the business.manage scope is what the Business
 * Profile APIs require, and we ask for nothing beyond it.
 */
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/business.manage'] as const

export interface GoogleTokens {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: Date
  readonly scopes: readonly string[]
}

export interface StoredConnection {
  readonly googleAccountId: string | null
  /** Ciphertext only. There is deliberately no field for an access token. */
  readonly refreshTokenEncrypted: string | null
  readonly scopes: readonly string[]
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'REVOKED'
  readonly automationMode: AutomationMode
  readonly reviewReplyEnabled: boolean
  readonly tokenExpiresAt: Date | null
  readonly lastSyncAt: Date | null
  readonly lastError: string | null
}

export const disconnectedConnection = (): StoredConnection => ({
  googleAccountId: null,
  refreshTokenEncrypted: null,
  scopes: [],
  status: 'DISCONNECTED',
  automationMode: 'READ_ONLY',
  reviewReplyEnabled: false,
  tokenExpiresAt: null,
  lastSyncAt: null,
  lastError: null,
})

export const storeTokens = (
  tokens: GoogleTokens,
  keyring: EncryptionKeyring,
  googleAccountId: string,
): StoredConnection => ({
  googleAccountId,
  refreshTokenEncrypted: encryptSecret(tokens.refreshToken, keyring),
  scopes: tokens.scopes,
  status: 'CONNECTED',
  // Connecting never grants write access; the customer enables that separately.
  automationMode: 'READ_ONLY',
  reviewReplyEnabled: false,
  tokenExpiresAt: tokens.expiresAt,
  lastSyncAt: null,
  lastError: null,
})

export const readRefreshToken = (
  connection: StoredConnection,
  keyring: EncryptionKeyring,
): string => {
  if (!connection.refreshTokenEncrypted) {
    throw new AppError({
      code: 'UNAUTHENTICATED',
      message: 'No Google refresh token stored for this business',
      publicMessage: 'Your Google connection needs to be set up again.',
    })
  }
  return decryptSecret(connection.refreshTokenEncrypted, keyring)
}

export interface GoogleLocation {
  readonly locationId: string
  readonly placeId: string | null
  readonly title: string
  readonly primaryCategory: string | null
  readonly categories: readonly string[]
  readonly phone: string | null
  readonly websiteUri: string | null
  readonly address: Record<string, unknown>
  readonly hours: Record<string, unknown>
  readonly attributes: Record<string, unknown>
  readonly verificationState: string | null
}

export interface GoogleReview {
  readonly externalId: string
  readonly rating: number | null
  readonly language: string | null
  /** Retained for theme analysis only; reviewer identity is deliberately not stored. */
  readonly comment: string | null
  readonly hasOwnerReply: boolean
  readonly reviewedAt: Date | null
}

export interface LocationUpdate {
  readonly phone?: string
  readonly websiteUri?: string
  readonly hours?: Record<string, unknown>
  readonly categories?: readonly string[]
}

/**
 * The capability surface.
 *
 * Note what is missing: no delete, no category change without approval, no bulk update.
 * The interface is the permission model.
 */
export interface GoogleBusinessProfileClient {
  listLocations(): Promise<readonly GoogleLocation[]>
  getLocation(locationId: string): Promise<GoogleLocation | null>
  updateLocation(locationId: string, update: LocationUpdate): Promise<GoogleLocation>
  listReviews(locationId: string): Promise<readonly GoogleReview[]>
  replyToReview(locationId: string, reviewId: string, reply: string): Promise<void>
}

/** Guard applied before any write, regardless of what the caller believes it may do. */
export const assertWriteAllowed = (connection: StoredConnection): void => {
  if (connection.status !== 'CONNECTED') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: `Google connection is ${connection.status}`,
      publicMessage: 'Your Google Business Profile is not connected.',
    })
  }
  if (connection.automationMode === 'READ_ONLY') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Google automation is disabled for this business',
      publicMessage:
        'We only read your Google profile at the moment. You can enable automatic updates in settings.',
    })
  }
}

export const assertReviewReplyAllowed = (connection: StoredConnection): void => {
  assertWriteAllowed(connection)
  if (!connection.reviewReplyEnabled) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Review replies are not enabled for this business',
      publicMessage:
        'Replying to reviews on your behalf is turned off. You can enable it in settings.',
    })
  }
}

/**
 * Rules for a generated review reply.
 *
 * A reply is a public statement in the business owner's voice, so it may not invent facts,
 * offer incentives, argue with the reviewer or stuff keywords. These checks run before any
 * reply is shown, let alone sent.
 */
export interface ReviewReplyCheck {
  readonly acceptable: boolean
  readonly problems: readonly string[]
}

const INCENTIVE_PATTERNS = [
  /\bfree\s+(meal|drink|dessert|night|session)\b/i,
  /\bdiscount\b/i,
  /\bvoucher\b/i,
  /\bin exchange for\b/i,
  new RegExp('\\u05de\\u05ea\\u05e0\\u05d4'), // "gift"
  new RegExp('\\u05d4\\u05e0\\u05d7\\u05d4'), // "discount"
]

const HOSTILE_PATTERNS = [
  /\byou are wrong\b/i,
  /\blying\b/i,
  /\bnever happened\b/i,
  /\bfake review\b/i,
  /\bridiculous\b/i,
]

export const checkReviewReply = (
  reply: string,
  businessName: string,
): ReviewReplyCheck => {
  const problems: string[] = []

  if (reply.trim().length < 15) problems.push('The reply is too short to be meaningful.')
  if (reply.length > 800) problems.push('The reply is too long for a review response.')

  if (INCENTIVE_PATTERNS.some((p) => p.test(reply))) {
    problems.push('The reply offers an incentive, which review platforms prohibit.')
  }
  if (HOSTILE_PATTERNS.some((p) => p.test(reply))) {
    problems.push('The reply argues with the reviewer.')
  }

  // Keyword stuffing: the business name repeated is the classic tell.
  const nameCount = (reply.toLowerCase().match(new RegExp(escapeRegex(businessName.toLowerCase()), 'g')) ?? []).length
  if (nameCount > 2) {
    problems.push('The reply repeats the business name in a way that reads as keyword stuffing.')
  }

  if (/\bplease (leave|update|change) (a|your) review\b/i.test(reply)) {
    problems.push('The reply asks the customer to change their review.')
  }

  return { acceptable: problems.length === 0, problems }
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Facts derived from a connected profile, at the confidence a verified profile earns. */
export interface ProfileFact {
  readonly factKind: string
  readonly value: string | null
  readonly valueJson?: unknown
  readonly confidence: ConfidenceLevel
  readonly sourceType: 'OWN_PROPERTY'
}

export const factsFromLocation = (location: GoogleLocation): ProfileFact[] => {
  const facts: ProfileFact[] = []
  const add = (factKind: string, value: string | null, valueJson?: unknown): void => {
    if (value === null && valueJson === undefined) return
    facts.push({
      factKind,
      value,
      valueJson,
      // A verified profile the owner controls is as strong as their own website.
      confidence: location.verificationState === 'VERIFIED' ? 'HIGH' : 'MEDIUM',
      sourceType: 'OWN_PROPERTY',
    })
  }

  add('business_name', location.title)
  add('phone', location.phone)
  add('primary_category', location.primaryCategory)
  if (Object.keys(location.hours).length > 0) add('opening_hours', null, location.hours)
  if (Object.keys(location.address).length > 0) {
    const locality = location.address.locality
    add('address', typeof locality === 'string' ? locality : null, location.address)
  }
  return facts
}

/**
 * Detects information that differs between the website and the Google profile.
 *
 * Inconsistent details are one of the most damaging and most fixable problems a local
 * business has, and this is the cheapest place to find them.
 */
export interface ProfileInconsistency {
  readonly factKind: string
  readonly websiteValue: string
  readonly googleValue: string
  readonly plainLanguage: string
}

export const findInconsistencies = (
  websiteFacts: readonly { factKind: string; value: string | null }[],
  profileFacts: readonly ProfileFact[],
): ProfileInconsistency[] => {
  const out: ProfileInconsistency[] = []
  const normalize = (value: string): string => value.toLowerCase().replace(/[\s\-()]/g, '')

  for (const kind of ['phone', 'business_name', 'address']) {
    const website = websiteFacts.find((f) => f.factKind === kind && f.value)?.value
    const google = profileFacts.find((f) => f.factKind === kind && f.value)?.value
    if (!website || !google) continue
    if (normalize(website) === normalize(google)) continue
    out.push({
      factKind: kind,
      websiteValue: website,
      googleValue: google,
      plainLanguage:
        `Your ${kind.replace('_', ' ')} is "${website}" on your website but "${google}" on ` +
        'your Google profile. AI systems use both, and the difference makes them less sure ' +
        'the two describe the same business.',
    })
  }

  return out
}

/** Token lifetime helper. Refresh early rather than racing an expiry mid-job. */
export const needsRefresh = (
  connection: StoredConnection,
  clock: Clock = systemClock,
  marginMs = 5 * 60 * 1000,
): boolean => {
  if (!connection.tokenExpiresAt) return true
  return connection.tokenExpiresAt.getTime() - clock.timestamp() < marginMs
}
