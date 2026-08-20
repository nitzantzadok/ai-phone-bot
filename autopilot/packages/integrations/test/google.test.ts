import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { FixedClock } from '@autopilot/shared/clock.ts'
import { keyringFromEnv } from '@autopilot/shared/crypto.ts'
import {
  assertReviewReplyAllowed,
  assertWriteAllowed,
  checkReviewReply,
  disconnectedConnection,
  factsFromLocation,
  findInconsistencies,
  needsRefresh,
  readRefreshToken,
  storeTokens,
  type GoogleLocation,
  type StoredConnection,
} from '../src/google-business-profile.ts'
import { MockGoogleBusinessProfile } from '../src/mock-google.ts'

const keyring = () => keyringFromEnv(randomBytes(32).toString('base64'), 1)

const tokens = {
  accessToken: 'ya29.a0AfH6SMB-should-never-be-stored',
  refreshToken: '1//0g-long-refresh-token',
  expiresAt: new Date('2026-08-19T11:00:00Z'),
  scopes: ['https://www.googleapis.com/auth/business.manage'],
}

const location: GoogleLocation = {
  locationId: 'locations/123',
  placeId: 'ChIJ123',
  title: 'Rosa',
  primaryCategory: 'Italian restaurant',
  categories: ['Italian restaurant', 'Restaurant'],
  phone: '03-1234567',
  websiteUri: 'https://rosa.example.com/',
  address: { locality: 'Tel Aviv', addressLines: ['Rothschild 12'] },
  hours: { monday: '18:00-23:00' },
  attributes: { has_outdoor_seating: true },
  verificationState: 'VERIFIED',
}

describe('token storage', () => {
  it('stores only an encrypted refresh token, and no access token at all', () => {
    const kr = keyring()
    const connection = storeTokens(tokens, kr, 'accounts/9')
    const serialized = JSON.stringify(connection)

    expect(serialized).not.toContain(tokens.refreshToken)
    expect(serialized).not.toContain(tokens.accessToken)
    expect(serialized).not.toContain('accessToken')
    expect(readRefreshToken(connection, kr)).toBe(tokens.refreshToken)
  })

  it('connects READ_ONLY with review replies off, whatever the customer clicked', () => {
    const connection = storeTokens(tokens, keyring(), 'accounts/9')
    expect(connection.automationMode).toBe('READ_ONLY')
    expect(connection.reviewReplyEnabled).toBe(false)
    expect(connection.status).toBe('CONNECTED')
  })

  it('asks the customer to reconnect rather than failing obscurely', () => {
    expect(() => readRefreshToken(disconnectedConnection(), keyring())).toThrow(/refresh token/)
    try {
      readRefreshToken(disconnectedConnection(), keyring())
    } catch (e) {
      expect((e as { publicMessage: string }).publicMessage).toContain('set up again')
    }
  })

  it('refreshes early rather than racing the expiry', () => {
    const clock = new FixedClock(new Date('2026-08-19T10:56:00Z'))
    const connection = storeTokens(tokens, keyring(), 'accounts/9')
    expect(needsRefresh(connection, clock)).toBe(true)

    clock.set(new Date('2026-08-19T10:00:00Z'))
    expect(needsRefresh(connection, clock)).toBe(false)
    expect(needsRefresh(disconnectedConnection(), clock)).toBe(true)
  })
})

describe('write gating', () => {
  const connected = (overrides: Partial<StoredConnection> = {}): StoredConnection => ({
    ...storeTokens(tokens, keyring(), 'accounts/9'),
    ...overrides,
  })

  it('blocks a write while the connection is read-only', () => {
    expect(() => assertWriteAllowed(connected())).toThrow(/automation is disabled/)
    try {
      assertWriteAllowed(connected())
    } catch (e) {
      expect((e as { publicMessage: string }).publicMessage).toContain('only read your Google profile')
    }
  })

  it('allows a write once automation is enabled', () => {
    expect(() => assertWriteAllowed(connected({ automationMode: 'AUTOMATED' }))).not.toThrow()
  })

  it('blocks a write on a disconnected or revoked connection', () => {
    expect(() => assertWriteAllowed(connected({ status: 'REVOKED', automationMode: 'AUTOMATED' })))
      .toThrow(/REVOKED/)
  })

  it('gates review replies separately from other writes', () => {
    const automated = connected({ automationMode: 'AUTOMATED' })
    expect(() => assertWriteAllowed(automated)).not.toThrow()
    expect(() => assertReviewReplyAllowed(automated)).toThrow(/Review replies are not enabled/)
    expect(() =>
      assertReviewReplyAllowed({ ...automated, reviewReplyEnabled: true }),
    ).not.toThrow()
  })
})

describe('review reply checks', () => {
  it('accepts a professional, specific reply', () => {
    const result = checkReviewReply(
      'Thank you for taking the time to write. We are sorry the wait was long on Friday and ' +
        'have added staff to the evening shift. We hope to see you again.',
      'Rosa',
    )
    expect(result.acceptable).toBe(true)
  })

  it.each([
    ['Come back and we will give you a free meal for your trouble.', 'incentive'],
    ['That never happened and this is a fake review.', 'argues'],
    ['Please update your review once you have visited again.', 'asks the customer'],
    ['Thanks!', 'too short'],
  ])('rejects: %s', (reply) => {
    expect(checkReviewReply(reply, 'Rosa').acceptable).toBe(false)
  })

  it('rejects keyword stuffing of the business name', () => {
    const result = checkReviewReply(
      'Thank you for visiting Rosa. At Rosa we care deeply, and Rosa always welcomes feedback about Rosa.',
      'Rosa',
    )
    expect(result.acceptable).toBe(false)
    expect(result.problems.some((p) => p.includes('keyword stuffing'))).toBe(true)
  })

  it('catches an incentive offered in Hebrew', () => {
    const result = checkReviewReply(
      'תודה רבה על הביקורת המפורטת שלכם, נשמח להעניק לכם הנחה בביקור הבא שלכם אצלנו',
      'רוזה',
    )
    expect(result.acceptable).toBe(false)
  })
})

describe('facts from a connected profile', () => {
  it('treats a verified profile as high-confidence owner information', () => {
    const facts = factsFromLocation(location)
    expect(facts.every((f) => f.sourceType === 'OWN_PROPERTY')).toBe(true)
    expect(facts.find((f) => f.factKind === 'phone')!.confidence).toBe('HIGH')
    expect(facts.find((f) => f.factKind === 'opening_hours')!.valueJson).toEqual({
      monday: '18:00-23:00',
    })
  })

  it('downgrades an unverified profile', () => {
    const facts = factsFromLocation({ ...location, verificationState: 'UNVERIFIED' })
    expect(facts.every((f) => f.confidence === 'MEDIUM')).toBe(true)
  })
})

describe('findInconsistencies', () => {
  it('finds a phone number that differs between site and profile, in plain language', () => {
    const found = findInconsistencies(
      [{ factKind: 'phone', value: '03-1234567' }],
      factsFromLocation({ ...location, phone: '03-7654321' }),
    )
    expect(found).toHaveLength(1)
    expect(found[0]!.plainLanguage).toContain('less sure')
    expect(found[0]!.plainLanguage).toContain('03-7654321')
  })

  it('ignores mere formatting differences', () => {
    const found = findInconsistencies(
      [{ factKind: 'phone', value: '(03) 123-4567' }],
      factsFromLocation({ ...location, phone: '031234567' }),
    )
    expect(found).toHaveLength(0)
  })

  it('says nothing when one side has no value', () => {
    expect(findInconsistencies([], factsFromLocation(location))).toHaveLength(0)
  })
})

describe('MockGoogleBusinessProfile', () => {
  it('reads, updates and records replies', async () => {
    const client = new MockGoogleBusinessProfile(
      [location],
      {
        'locations/123': [
          {
            externalId: 'rev-1',
            rating: 4,
            language: 'he',
            comment: 'Lovely food, long wait',
            hasOwnerReply: false,
            reviewedAt: new Date('2026-08-01'),
          },
        ],
      },
    )

    expect(await client.listLocations()).toHaveLength(1)
    const updated = await client.updateLocation('locations/123', { phone: '03-9999999' })
    expect(updated.phone).toBe('03-9999999')

    await client.replyToReview('locations/123', 'rev-1', 'Thank you for the feedback.')
    expect(client.replies).toHaveLength(1)
    expect((await client.listReviews('locations/123'))[0]!.hasOwnerReply).toBe(true)
  })

  it('reports a missing location rather than inventing one', async () => {
    const client = new MockGoogleBusinessProfile()
    expect(await client.getLocation('locations/none')).toBeNull()
    await expect(client.updateLocation('locations/none', {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
