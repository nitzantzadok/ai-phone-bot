/**
 * Entity assembly and completeness.
 *
 * "Completeness" is not a vanity metric: it is the share of the information a vertical's
 * customers actually ask about that we can prove the business has. A restaurant without
 * opening hours is invisible for "open now" intents no matter how good its content is.
 */
import type { ConfidenceLevel } from '@autopilot/shared/domain.ts'
import { CONFIDENCE_RANK } from '@autopilot/shared/domain.ts'
import type { CandidateFact } from './facts.ts'

export interface EntityProfile {
  readonly entityType: string
  readonly canonicalName: string | null
  readonly localizedNames: Record<string, string>
  readonly primaryCategory: string | null
  readonly city: string | null
  readonly phone: string | null
  readonly address: string | null
  readonly openingHours: unknown | null
  readonly priceRange: string | null
  readonly shortDescription: string | null
  readonly attributes: readonly string[]
  readonly completeness: number
  readonly missingFields: readonly string[]
}

/** Fields a vertical's customers routinely ask about, weighted by how often it matters. */
const REQUIRED_FIELDS: Record<string, Record<string, number>> = {
  restaurant: {
    canonicalName: 3,
    city: 3,
    phone: 2,
    address: 3,
    openingHours: 3,
    priceRange: 2,
    primaryCategory: 2,
    shortDescription: 2,
    attributes: 3,
  },
  lawyer: {
    canonicalName: 3,
    city: 3,
    phone: 3,
    address: 2,
    primaryCategory: 3,
    shortDescription: 2,
    attributes: 3,
    openingHours: 1,
  },
  hotel: {
    canonicalName: 3,
    city: 3,
    phone: 2,
    address: 3,
    priceRange: 2,
    primaryCategory: 2,
    shortDescription: 2,
    attributes: 3,
  },
  local_business: {
    canonicalName: 3,
    city: 3,
    phone: 2,
    address: 2,
    openingHours: 2,
    primaryCategory: 2,
    shortDescription: 2,
    attributes: 2,
  },
}

const bestFact = (
  facts: readonly CandidateFact[],
  kind: string,
): CandidateFact | undefined =>
  facts
    .filter((f) => f.factKind === kind && (f.value !== null || f.valueJson !== undefined))
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])[0]

/** Minimum confidence a fact needs before it may shape the published entity. */
const MIN_ENTITY_CONFIDENCE: ConfidenceLevel = 'MEDIUM'

/**
 * Titles that are page labels rather than business names.
 *
 * Compared per title segment, since "ברוכים הבאים | דנטל סנטר הדר" is a greeting followed
 * by a real name, and the name is the half worth keeping.
 */
const GENERIC_TITLES = new Set([
  'ברוכים הבאים',
  'ברוכות הבאות',
  'דף הבית',
  'עמוד הבית',
  'ראשי',
  'בית',
  'אודות',
  'צור קשר',
  'welcome',
  'home',
  'home page',
  'homepage',
  'index',
  'main',
  'about',
  'about us',
  'contact',
  'contact us',
  'untitled',
  'my site',
])

const TITLE_SEPARATORS = /[|\u2013\u2014\u00b7]|\s-\s/

const nameFromTitle = (title: string | null | undefined): string | null => {
  if (!title) return null
  const candidate = title
    .split(TITLE_SEPARATORS)
    .map((segment) => segment.trim())
    .find((segment) => segment.length >= 2 && !GENERIC_TITLES.has(segment.toLowerCase()))
  return candidate ?? null
}

export const buildEntity = (
  facts: readonly CandidateFact[],
  vertical: string,
): EntityProfile => {
  const usable = facts.filter(
    (f) => CONFIDENCE_RANK[f.confidence] >= CONFIDENCE_RANK[MIN_ENTITY_CONFIDENCE],
  )

  // A page title is only a name when it reads like one. "ברוכים הבאים" / "Welcome" is the
  // most common home-page title in the country, and publishing it as the business name
  // would put a greeting into every answer we generate about this business. Reporting no
  // name at all is better: that absence is itself the finding the customer needs to see.
  const titleFact = bestFact(usable, 'site_title')?.value
  const name = bestFact(usable, 'business_name')?.value ?? nameFromTitle(titleFact)

  /* `entityType` and `primaryCategory` look like the same thing and are not.
     `entityType` is the schema.org type we will *write* for this business, so a safe
     default is right there. `primaryCategory` is a claim that the site says what kind of
     business this is, and a default is exactly the wrong thing to put in it. */
  const statedType = bestFact(usable, 'entity_type')?.value ?? null
  const entityType = statedType ?? defaultEntityType(vertical)
  const city = bestFact(usable, 'city')?.value ?? null
  const phone = bestFact(usable, 'phone')?.value ?? null
  const address = bestFact(usable, 'address')?.value ?? null
  const hoursFact = bestFact(usable, 'opening_hours')
  const openingHours = hoursFact?.valueJson ?? hoursFact?.value ?? null
  const priceRange = bestFact(usable, 'price_range')?.value ?? null
  const shortDescription = bestFact(usable, 'site_description')?.value ?? null
  /* `local_business` is what the vertical inference returns when it could NOT tell — it is
     the one vertical never matched positively — so its default type is not evidence of
     anything. Crediting the site for it meant a scan that read zero pages still reported a
     category, a completeness of 11% and a readiness score of 4: three numbers about a
     business nothing had been learned about. It also let a real site that never says what
     it does score for saying it. */
  const inferredCategory = vertical === 'local_business' ? null : defaultEntityType(vertical)
  const primaryCategory = bestFact(usable, 'cuisine')?.value ?? statedType ?? inferredCategory

  // Attributes are the exception: LOW-confidence attribute evidence still tells us what
  // the site talks about, which is what the gap analysis needs.
  const attributes = [
    ...new Set(
      facts
        .filter((f) => f.factKind === 'attribute' && f.attributeKey)
        .map((f) => f.attributeKey!),
    ),
  ]

  const values: Record<string, unknown> = {
    canonicalName: name,
    city,
    phone,
    address,
    openingHours,
    priceRange,
    primaryCategory,
    shortDescription,
    attributes: attributes.length > 0 ? attributes : null,
  }

  const weights = REQUIRED_FIELDS[vertical] ?? REQUIRED_FIELDS.local_business!
  let earned = 0
  let possible = 0
  const missingFields: string[] = []
  for (const [field, weight] of Object.entries(weights)) {
    possible += weight
    if (values[field] !== null && values[field] !== undefined) earned += weight
    else missingFields.push(field)
  }

  return {
    entityType,
    canonicalName: name ?? null,
    localizedNames: {},
    primaryCategory,
    city,
    phone,
    address,
    openingHours,
    priceRange,
    shortDescription,
    attributes,
    completeness: possible === 0 ? 0 : earned / possible,
    missingFields,
  }
}

const DEFAULT_ENTITY_TYPES: Record<string, string> = {
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  lawyer: 'LegalService',
  dentist: 'Dentist',
  clinic: 'MedicalClinic',
  salon: 'BeautySalon',
  gym: 'SportsActivityLocation',
  home_services: 'HomeAndConstructionBusiness',
  real_estate: 'RealEstateAgent',
  event: 'EventVenue',
  tourism: 'TouristAttraction',
  local_business: 'LocalBusiness',
}

export const defaultEntityType = (vertical: string): string =>
  DEFAULT_ENTITY_TYPES[vertical] ?? 'LocalBusiness'
