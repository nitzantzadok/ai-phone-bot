/**
 * In-memory Google Business Profile client.
 *
 * Lets the full connected-profile path — reading locations, deriving facts, detecting
 * inconsistencies against the website, drafting a review reply — be developed and tested
 * without a Google account or a verified listing, neither of which exists on day one.
 */
import { notFound } from '@autopilot/shared/errors.ts'
import type {
  GoogleBusinessProfileClient,
  GoogleLocation,
  GoogleReview,
  LocationUpdate,
} from './google-business-profile.ts'

export class MockGoogleBusinessProfile implements GoogleBusinessProfileClient {
  private readonly locations = new Map<string, GoogleLocation>()
  private readonly reviews = new Map<string, GoogleReview[]>()
  readonly replies: { locationId: string; reviewId: string; reply: string }[] = []

  constructor(
    locations: readonly GoogleLocation[] = [],
    reviews: Readonly<Record<string, readonly GoogleReview[]>> = {},
  ) {
    for (const location of locations) this.locations.set(location.locationId, location)
    for (const [locationId, list] of Object.entries(reviews)) {
      this.reviews.set(locationId, [...list])
    }
  }

  async listLocations(): Promise<readonly GoogleLocation[]> {
    return [...this.locations.values()]
  }

  async getLocation(locationId: string): Promise<GoogleLocation | null> {
    return this.locations.get(locationId) ?? null
  }

  async updateLocation(locationId: string, update: LocationUpdate): Promise<GoogleLocation> {
    const existing = this.locations.get(locationId)
    if (!existing) throw notFound(`Google location ${locationId}`)
    const updated: GoogleLocation = {
      ...existing,
      phone: update.phone ?? existing.phone,
      websiteUri: update.websiteUri ?? existing.websiteUri,
      hours: update.hours ?? existing.hours,
      categories: update.categories ?? existing.categories,
    }
    this.locations.set(locationId, updated)
    return updated
  }

  async listReviews(locationId: string): Promise<readonly GoogleReview[]> {
    return this.reviews.get(locationId) ?? []
  }

  async replyToReview(locationId: string, reviewId: string, reply: string): Promise<void> {
    const list = this.reviews.get(locationId) ?? []
    const review = list.find((r) => r.externalId === reviewId)
    if (!review) throw notFound(`Review ${reviewId}`)
    this.replies.push({ locationId, reviewId, reply })
    this.reviews.set(
      locationId,
      list.map((r) => (r.externalId === reviewId ? { ...r, hasOwnerReply: true } : r)),
    )
  }
}
