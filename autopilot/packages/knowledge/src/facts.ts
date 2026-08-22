/**
 * Fact extraction from a crawl.
 *
 * Everything here produces a *candidate fact* with a source and a confidence. Nothing
 * becomes a published claim without passing the quality gates, because the failure mode of
 * getting this wrong is writing something untrue onto a customer's website.
 */
import { createHash } from 'node:crypto'
import type { ConfidenceLevel, SourceType } from '@autopilot/shared/domain.ts'
import type { CrawledPage, CrawlResult } from '@autopilot/crawler/crawler.ts'
import { registrableDomain } from '@autopilot/crawler/ssrf.ts'
import { findAttributeEvidence } from './attributes.ts'
import { findCities } from '@autopilot/shared/il-cities.ts'

export interface CandidateFact {
  readonly factKind: string
  readonly value: string | null
  readonly valueJson?: unknown
  readonly language?: string
  readonly confidence: ConfidenceLevel
  readonly sourceType: SourceType
  readonly sourceUrl: string
  /** The text that justifies this fact, shown to the customer during confirmation. */
  readonly excerpt?: string
  /** Set when the fact asserts an attribute, linking it into the evidence graph. */
  readonly attributeKey?: string
}

/** Deduplication key: the same fact from the same source is one fact, not many. */
export const factFingerprint = (fact: CandidateFact): string =>
  createHash('sha256')
    .update([fact.factKind, fact.attributeKey ?? '', fact.value ?? '', fact.sourceUrl].join('|'))
    .digest('hex')
    .slice(0, 32)

const asString = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  return null
}

const jsonLdOfTypes = (
  page: CrawledPage,
  types: readonly string[],
): Record<string, unknown> | undefined =>
  page.structuredData.find((block) => {
    const t = block['@type']
    if (typeof t === 'string') return types.includes(t)
    if (Array.isArray(t)) return t.some((v) => typeof v === 'string' && types.includes(v))
    return false
  })

const BUSINESS_TYPES = [
  'LocalBusiness',
  'Organization',
  'Restaurant',
  'Hotel',
  'LegalService',
  'Dentist',
  'MedicalClinic',
  'HealthAndBeautyBusiness',
  'BeautySalon',
  'SportsActivityLocation',
  'HomeAndConstructionBusiness',
  'RealEstateAgent',
  'ProfessionalService',
  'Store',
]

/**
 * Israeli phone numbers in either local or international form.
 * Kept conservative: a wrong phone number is worse than a missing one.
 */
const IL_PHONE = /(?:\+972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}/g

export interface ExtractionInput {
  readonly crawl: CrawlResult
  readonly vertical: string
  readonly languages?: readonly string[]
}

export const extractFacts = (input: ExtractionInput): CandidateFact[] => {
  const facts: CandidateFact[] = []
  const seen = new Set<string>()
  const add = (fact: CandidateFact): void => {
    const key = factFingerprint(fact)
    if (seen.has(key)) return
    seen.add(key)
    facts.push(fact)
  }

  const home = input.crawl.pages.find((p) => p.pageType === 'home') ?? input.crawl.pages[0]

  for (const page of input.crawl.pages) {
    const business = jsonLdOfTypes(page, BUSINESS_TYPES)

    if (business) {
      // Structured data on the business's own site is the strongest signal available
      // short of the owner confirming it directly.
      const name = asString(business.name)
      if (name) {
        add({
          factKind: 'business_name',
          value: name,
          confidence: 'HIGH',
          sourceType: 'OWN_PROPERTY',
          sourceUrl: page.url,
          excerpt: `schema.org name: ${name}`,
        })
      }

      const entityType = (() => {
        const t = business['@type']
        if (typeof t === 'string') return t
        if (Array.isArray(t)) return t.find((v): v is string => typeof v === 'string')
        return undefined
      })()
      if (entityType) {
        add({
          factKind: 'entity_type',
          value: entityType,
          confidence: 'HIGH',
          sourceType: 'OWN_PROPERTY',
          sourceUrl: page.url,
        })
      }

      const phone = asString(business.telephone)
      if (phone) {
        add({
          factKind: 'phone',
          value: phone,
          confidence: 'HIGH',
          sourceType: 'OWN_PROPERTY',
          sourceUrl: page.url,
        })
      }

      const address = business.address
      if (address && typeof address === 'object') {
        const a = address as Record<string, unknown>
        const parts = [
          asString(a.streetAddress),
          asString(a.addressLocality),
          asString(a.postalCode),
        ].filter((p): p is string => p !== null)
        if (parts.length > 0) {
          add({
            factKind: 'address',
            value: parts.join(', '),
            valueJson: a,
            confidence: 'HIGH',
            sourceType: 'OWN_PROPERTY',
            sourceUrl: page.url,
          })
        }
        const city = asString(a.addressLocality)
        if (city) {
          add({
            factKind: 'city',
            value: city,
            confidence: 'HIGH',
            sourceType: 'OWN_PROPERTY',
            sourceUrl: page.url,
          })
        }
      }

      const hours = business.openingHoursSpecification ?? business.openingHours
      if (hours) {
        add({
          factKind: 'opening_hours',
          value: typeof hours === 'string' ? hours : null,
          valueJson: hours,
          confidence: 'HIGH',
          sourceType: 'OWN_PROPERTY',
          sourceUrl: page.url,
        })
      }

      const priceRange = asString(business.priceRange)
      if (priceRange) {
        add({
          factKind: 'price_range',
          value: priceRange,
          confidence: 'MEDIUM',
          sourceType: 'OWN_PROPERTY',
          sourceUrl: page.url,
        })
      }

      const cuisine = business.servesCuisine
      const cuisines = Array.isArray(cuisine) ? cuisine : cuisine ? [cuisine] : []
      for (const c of cuisines) {
        const value = asString(c)
        if (value) {
          add({
            factKind: 'cuisine',
            value,
            confidence: 'HIGH',
            sourceType: 'OWN_PROPERTY',
            sourceUrl: page.url,
          })
        }
      }
    }

    // Attribute evidence from visible page content. Headings weigh more than body text,
    // because a heading is a claim the business is actually making about itself.
    const headingText = page.headings.map((h) => h.text).join(' ')
    const headingMatches = findAttributeEvidence(headingText, input.vertical, input.languages)
    const bodyMatches = findAttributeEvidence(page.bodyText, input.vertical, input.languages)

    for (const match of bodyMatches) {
      const inHeading = headingMatches.some((h) => h.key === match.key)
      add({
        factKind: 'attribute',
        value: match.key,
        attributeKey: match.key,
        // A single passing mention is weak evidence; a heading or repetition is stronger.
        confidence: inHeading || match.occurrences >= 3 ? 'MEDIUM' : 'LOW',
        sourceType: 'OWN_PROPERTY',
        sourceUrl: page.url,
        excerpt: `matched: ${match.matchedTerms.slice(0, 3).join(', ')}`,
      })
    }

    for (const phone of page.bodyText.match(IL_PHONE) ?? []) {
      add({
        factKind: 'phone',
        value: phone.replace(/[\s-]/g, ''),
        // Text-scraped: plausible, but a number inside a testimonial is not the business's.
        confidence: 'MEDIUM',
        sourceType: 'OWN_PROPERTY',
        sourceUrl: page.url,
        excerpt: phone,
      })
    }
  }

  // The city, read from the words on the page.
  //
  // Structured data gives it to us cleanly, but most small business sites have none — and
  // without a city there is no local question to ask, so the entire measurement half of
  // the product silently switches itself off for the majority of real customers. The page
  // almost always says it ("מוסך בחיפה"); it just does not say it in a machine-readable
  // place. Confidence stays below the structured-data path, and below the threshold that
  // lets a fact be published as an owner-confirmed claim.
  if (!facts.some((f) => f.factKind === 'city')) {
    const headline = [home?.title ?? '', home?.metaDescription ?? '', home?.h1 ?? ''].join(' ')
    const body = input.crawl.pages
      .map((p) => `${p.title ?? ''} ${p.metaDescription ?? ''} ${p.bodyText}`)
      .join(' ')
      .slice(0, 100_000)

    // A city named in the title or description is the business stating where it is. One
    // found only in body text might be a service area, a supplier or a customer story.
    const inHeadline = findCities(headline)[0]
    const inBody = findCities(body)[0]
    const chosen = inHeadline ?? inBody

    if (chosen) {
      add({
        factKind: 'city',
        value: chosen.city,
        confidence: inHeadline ? 'MEDIUM' : 'LOW',
        sourceType: 'OWN_PROPERTY',
        sourceUrl: home?.url ?? input.crawl.rootUrl,
        excerpt: inHeadline ? headline.trim().slice(0, 200) : undefined,
      })
    }
  }

  if (home) {
    if (home.title) {
      add({
        factKind: 'site_title',
        value: home.title,
        confidence: 'HIGH',
        sourceType: 'OWN_PROPERTY',
        sourceUrl: home.url,
      })
    }
    if (home.metaDescription) {
      add({
        factKind: 'site_description',
        value: home.metaDescription,
        confidence: 'MEDIUM',
        sourceType: 'OWN_PROPERTY',
        sourceUrl: home.url,
      })
    }
    // What built the site. Not customer-facing, but it decides which connection guide we
    // show and whether we can offer to fix anything at all.
    const generator = input.crawl.pages.map((page) => page.generator).find(Boolean)
    if (generator) {
      add({
        factKind: 'generator',
        value: generator,
        confidence: 'HIGH',
        sourceType: 'OWN_PROPERTY',
        sourceUrl: home.url,
      })
    }

    if (home.language) {
      add({
        factKind: 'content_language',
        value: home.language,
        // Detected from script distribution, so an inference rather than a declaration.
        confidence: 'MEDIUM',
        sourceType: 'INFERRED',
        sourceUrl: home.url,
      })
    }
    add({
      factKind: 'domain',
      value: registrableDomain(new URL(home.url).hostname),
      confidence: 'HIGH',
      sourceType: 'OWN_PROPERTY',
      sourceUrl: home.url,
    })
  }

  // The page inventory is itself a fact: which page types exist is a controllable signal.
  const pageTypes = [...new Set(input.crawl.pages.map((p) => p.pageType))]
  add({
    factKind: 'page_types',
    value: pageTypes.join(','),
    valueJson: pageTypes,
    confidence: 'HIGH',
    sourceType: 'OWN_PROPERTY',
    sourceUrl: input.crawl.rootUrl,
  })

  return facts
}

/**
 * Facts that contradict each other. Inconsistent business information is one of the most
 * damaging things for entity recognition, and one of the easiest things to fix.
 */
export interface FactConflict {
  readonly factKind: string
  readonly values: readonly { value: string; sourceUrl: string }[]
}

/**
 * Reduces a phone number to the digits that identify the line.
 *
 * "+972-3-555-0123" and "03-555-0123" are one number written two ways, and reporting them
 * as a contradiction sends a customer hunting for a problem that does not exist. Once we
 * have cried wolf on their phone number, the next finding we raise carries less weight —
 * which is why a false positive here is more expensive than a missed one.
 */
const canonicalPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('972')) return `0${digits.slice(3)}`
  if (digits.startsWith('00972')) return `0${digits.slice(5)}`
  return digits.startsWith('0') ? digits : `0${digits}`
}

const canonicalValue = (kind: string, value: string): string =>
  kind === 'phone' ? canonicalPhone(value) : value.toLowerCase().replace(/[\s\-()]/g, '')

export const findConflicts = (facts: readonly CandidateFact[]): FactConflict[] => {
  const singleValued = ['phone', 'address', 'business_name', 'opening_hours', 'price_range']
  const conflicts: FactConflict[] = []

  for (const kind of singleValued) {
    const relevant = facts.filter((f) => f.factKind === kind && f.value !== null)
    const distinct = new Map<string, { value: string; sourceUrl: string }>()
    for (const fact of relevant) {
      const normalized = canonicalValue(kind, fact.value!)
      if (!distinct.has(normalized)) {
        distinct.set(normalized, { value: fact.value!, sourceUrl: fact.sourceUrl })
      }
    }
    if (distinct.size > 1) conflicts.push({ factKind: kind, values: [...distinct.values()] })
  }

  return conflicts
}
