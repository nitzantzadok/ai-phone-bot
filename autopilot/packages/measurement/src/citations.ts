/**
 * Citation and source analysis.
 *
 * The question this answers is not "who links to whom" but "what information is being
 * corroborated, and by whom". A competitor winning date-night prompts because three
 * independent sources describe their room as intimate is a different problem from one
 * winning because their own site says so clearly — the first we cannot fix, the second we
 * can, and conflating them is how customers get sold work that cannot succeed.
 */
import { registrableDomain } from '@autopilot/crawler/ssrf.ts'
import type { ProviderCitation } from '@autopilot/providers/types.ts'

export type SourceKind =
  | 'own_website'
  | 'google_business_profile'
  | 'directory'
  | 'review_site'
  | 'editorial'
  | 'social'
  | 'other'

const DIRECTORY_DOMAINS = ['yad2.co.il', 'zap.co.il', 'dapey.co.il', 'b144.co.il', 'madlan.co.il']
const REVIEW_DOMAINS = ['tripadvisor.com', 'yelp.com', 'restaurants.co.il', 'rest.co.il']
const SOCIAL_DOMAINS = ['facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com']
const GOOGLE_DOMAINS = ['google.com', 'business.google.com', 'maps.google.com']

const normalizeHost = (host: string): string =>
  host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')

/**
 * Is this URL on the business's own site?
 *
 * Compared by HOSTNAME, not by registrable domain. Collapsing to the registrable domain
 * looks harmless until two customers are hosted on the same platform: `alice.wixsite.com`
 * and `bob.wixsite.com` share a registrable domain, and each would then treat the other's
 * pages as its own website — silently classifying a competitor's content as controllable.
 * Subdomains of the business's own host still count, so `blog.rosa.co.il` is ours.
 */
export const isSameSite = (hostname: string, ownHostname: string): boolean => {
  const host = normalizeHost(hostname)
  const own = normalizeHost(ownHostname)
  return host === own || host.endsWith(`.${own}`)
}

export const classifySource = (url: string, ownHostname: string | null): SourceKind => {
  let hostname: string
  let domain: string
  try {
    hostname = new URL(url).hostname
    domain = registrableDomain(hostname)
  } catch {
    return 'other'
  }
  if (ownHostname && isSameSite(hostname, ownHostname)) return 'own_website'
  if (GOOGLE_DOMAINS.some((d) => domain.endsWith(d))) return 'google_business_profile'
  if (DIRECTORY_DOMAINS.includes(domain)) return 'directory'
  if (REVIEW_DOMAINS.includes(domain)) return 'review_site'
  if (SOCIAL_DOMAINS.includes(domain)) return 'social'
  return 'editorial'
}

/** How much independent weight a source class carries. Own content corroborates nothing. */
const KIND_AUTHORITY: Record<SourceKind, number> = {
  own_website: 0.2,
  google_business_profile: 0.7,
  review_site: 0.75,
  editorial: 0.8,
  directory: 0.5,
  social: 0.35,
  other: 0.3,
}

export interface AnalyzedCitation {
  readonly url: string
  readonly domain: string
  readonly title: string | undefined
  readonly position: number
  readonly kind: SourceKind
  readonly authority: number
  /** True when the cited page mentions our business. */
  readonly referencesBusiness: boolean
  /** Competitor names the cited page mentions, when we know its content. */
  readonly referencedCompetitors: readonly string[]
  /** Whether this source is something we could realistically influence. */
  readonly controllable: boolean
}

export interface CitationAnalysisInput {
  readonly citations: readonly ProviderCitation[]
  /** The business's own website hostname, e.g. `rosa.co.il`. */
  readonly ownDomain: string | null
  /** Page text keyed by URL, when we have crawled or been given it. */
  readonly knownContent?: Readonly<Record<string, string>>
  readonly businessNames: readonly string[]
  readonly competitorNames: readonly string[]
}

export const analyzeCitations = (input: CitationAnalysisInput): AnalyzedCitation[] =>
  input.citations.map((citation) => {
    const kind = classifySource(citation.url, input.ownDomain)
    const content = input.knownContent?.[citation.url] ?? citation.snippet ?? citation.title ?? ''
    const haystack = content.toLowerCase()

    return {
      url: citation.url,
      domain: safeDomain(citation.url),
      title: citation.title,
      position: citation.position,
      kind,
      authority: KIND_AUTHORITY[kind],
      referencesBusiness: input.businessNames.some((n) => haystack.includes(n.toLowerCase())),
      referencedCompetitors: input.competitorNames.filter((n) =>
        haystack.includes(n.toLowerCase()),
      ),
      // Our own site and our own connected profile are the only sources we control.
      controllable: kind === 'own_website' || kind === 'google_business_profile',
    }
  })

const safeDomain = (url: string): string => {
  try {
    return registrableDomain(new URL(url).hostname)
  } catch {
    return 'unknown'
  }
}

export interface CitationGap {
  /** Sources supporting competitors that say nothing about us. */
  readonly missingCorroboration: readonly { domain: string; kind: SourceKind; authority: number }[]
  readonly ourCitationCount: number
  readonly competitorCitationCount: number
  /** True when closing the gap needs third-party coverage we cannot create. */
  readonly externalAuthorityGap: boolean
  readonly plainLanguage: string
}

/**
 * Citation Gap Analysis.
 *
 * The important output is the honest label at the end: when a competitor's advantage is
 * independent editorial coverage, we say so and say we cannot manufacture it. The product
 * never turns that into a "get backlinks" task.
 */
export const analyzeCitationGap = (
  ours: readonly AnalyzedCitation[],
  theirs: readonly AnalyzedCitation[],
  competitorName: string,
): CitationGap => {
  const ourDomains = new Set(ours.filter((c) => c.referencesBusiness).map((c) => c.domain))
  const missing = theirs
    .filter((c) => !ourDomains.has(c.domain) && !c.controllable)
    .map((c) => ({ domain: c.domain, kind: c.kind, authority: c.authority }))

  const uniqueMissing = [...new Map(missing.map((m) => [m.domain, m])).values()].sort(
    (a, b) => b.authority - a.authority,
  )

  const ourCount = ours.filter((c) => c.referencesBusiness).length
  const theirCount = theirs.length
  const externalAuthorityGap =
    uniqueMissing.filter((m) => m.kind === 'editorial' || m.kind === 'review_site').length >= 2

  const plainLanguage = externalAuthorityGap
    ? `${competitorName} is described by ${uniqueMissing.length} independent sources that do not mention you. ` +
      'We cannot create independent coverage on your behalf, and we will not pretend otherwise. ' +
      'What we can do is make your own information unmistakable, which is what AI systems fall back on.'
    : uniqueMissing.length > 0
      ? `${competitorName} appears on ${uniqueMissing.length} source(s) where you do not. ` +
        'Several are listings you can claim or correct yourself.'
      : 'You appear alongside this competitor in the sources behind these answers.'

  return {
    missingCorroboration: uniqueMissing,
    ourCitationCount: ourCount,
    competitorCitationCount: theirCount,
    externalAuthorityGap,
    plainLanguage,
  }
}

/** Share of monitored answers whose cited sources reference us at all. */
export const citationPresenceRate = (
  analysed: readonly (readonly AnalyzedCitation[])[],
): number => {
  if (analysed.length === 0) return 0
  const withUs = analysed.filter((set) => set.some((c) => c.referencesBusiness)).length
  return withUs / analysed.length
}
