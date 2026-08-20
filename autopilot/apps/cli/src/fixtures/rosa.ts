/**
 * The acceptance-test world: Rosa, an Italian restaurant in Tel Aviv.
 *
 * Rosa genuinely is quiet, romantic and makes pasta by hand — the owner confirms all
 * three. Its website barely says so. Two competitors say it loudly and are corroborated by
 * independent coverage. That is the exact situation this product exists to fix, and it
 * separates the part we can fix (Rosa's own site) from the part we cannot (Vito's press).
 *
 * Crucially, the simulated engines' view of the world is DERIVED from these sites rather
 * than hard-coded. When the agent adds a section to Rosa's site, re-deriving the world
 * changes what the engines see. The loop closes for a real reason, not because the demo
 * script says so.
 */
import { html, type FixtureSite } from '@autopilot/crawler/testing/fixture-site.ts'
import { findAttributeEvidence } from '@autopilot/knowledge/attributes.ts'
import type { MockBusinessProfile, MockWorld } from '@autopilot/providers/adapters/mock.ts'

export const ROSA_ORIGIN = 'https://rosa.example.co.il'

export interface SitePage {
  readonly url: string
  title: string | null
  metaDescription: string | null
  lang: string | null
  canonical: string | null
  content: string
  structuredData: Record<string, unknown>[]
}

/**
 * Rosa's site as it stands at onboarding: real business, thin web presence.
 * No canonical, no structured data, no meta description, and nothing that says what the
 * room is actually like.
 */
export const initialRosaPages = (): SitePage[] => [
  {
    url: `${ROSA_ORIGIN}/`,
    title: 'Rosa',
    metaDescription: null,
    lang: null,
    canonical: null,
    content:
      '<p>Rosa is an Italian kitchen on Rothschild Boulevard in Tel Aviv. ' +
      'We open in the evenings. Call 03-5551234 to book.</p>',
    structuredData: [],
  },
  {
    url: `${ROSA_ORIGIN}/menu`,
    title: 'Menu',
    metaDescription: null,
    lang: null,
    canonical: null,
    content:
      '<p>Our pasta is made in house each morning. Antipasti, primi, secondi and dolci.</p>',
    structuredData: [],
  },
  {
    url: `${ROSA_ORIGIN}/contact`,
    title: 'Contact',
    metaDescription: null,
    lang: null,
    canonical: null,
    content: '<p>Rothschild 12, Tel Aviv. Telephone 03-5551234.</p>',
    structuredData: [],
  },
]

/** Renders the current page state as a crawlable site. */
export const siteFrom = (pages: readonly SitePage[]): FixtureSite => {
  const site: FixtureSite = {
    [`${ROSA_ORIGIN}/robots.txt`]: {
      body: `User-agent: *\nAllow: /`,
      contentType: 'text/plain',
    },
  }

  for (const page of pages) {
    site[page.url] = {
      body: html({
        title: page.title ?? undefined,
        description: page.metaDescription ?? undefined,
        canonical: page.canonical ?? undefined,
        lang: page.lang ?? undefined,
        h1: page.title ?? undefined,
        body: page.content,
        links: pages.filter((p) => p.url !== page.url).map((p) => p.url),
        jsonLd: page.structuredData.length > 0 ? page.structuredData[0] : undefined,
      }),
    }
  }

  return site
}

/**
 * The competitive landscape, as the wider web describes it.
 *
 * Vito is corroborated by two independent publications. That advantage is real, and the
 * product must not pretend it can manufacture the same.
 */
interface CompetitorFixture {
  readonly name: string
  readonly city: string
  readonly domain: string
  readonly siteText: string
  readonly authority: number
  readonly sources: { url: string; title: string }[]
}

export const COMPETITORS: readonly CompetitorFixture[] = [
  {
    name: 'Vito',
    city: 'Tel Aviv',
    domain: 'vito.example.co.il',
    siteText:
      'Vito is a romantic Italian dining room in Tel Aviv, made for date night. ' +
      'Intimate dinner for couples, handmade pasta, a quiet corner table and a short wine list.',
    authority: 0.75,
    sources: [
      { url: 'https://vito.example.co.il/date-night', title: 'Date night at Vito' },
      { url: 'https://timeout.example.com/tlv/romantic', title: 'The most romantic tables in Tel Aviv' },
      { url: 'https://mako.example.co.il/food/vito', title: 'Vito reviewed' },
    ],
  },
  {
    name: 'Bella Napoli',
    city: 'Tel Aviv',
    domain: 'bellanapoli.example.co.il',
    siteText:
      'Bella Napoli is a family friendly Italian restaurant in Tel Aviv with a kids menu, ' +
      'affordable prices and handmade pasta. Children welcome.',
    authority: 0.55,
    sources: [
      { url: 'https://bellanapoli.example.co.il/', title: 'Bella Napoli' },
      { url: 'https://zap.co.il/bellanapoli', title: 'Bella Napoli listing' },
    ],
  },
  {
    name: 'Trattoria Yafo',
    city: 'Tel Aviv',
    domain: 'trattoriayafo.example.co.il',
    siteText:
      'Trattoria Yafo offers outdoor seating on a terrace in Jaffa, a romantic setting and ' +
      'a fine dining menu.',
    authority: 0.5,
    sources: [{ url: 'https://trattoriayafo.example.co.il/', title: 'Trattoria Yafo' }],
  },
]

/**
 * Derives what the simulated engines believe, from what each business's web presence
 * actually says. This is the mechanism that makes the before/after real: strengthen the
 * evidence on the page and the derived strength rises.
 */
const strengthsFrom = (text: string): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const match of findAttributeEvidence(text, 'restaurant')) {
    // Repetition and distinct phrasings both count, with diminishing returns, so a single
    // passing mention never reads as a strong claim.
    const distinct = new Set(match.matchedTerms).size
    out[match.key] = Math.min(0.95, 0.25 + distinct * 0.2 + Math.min(0.3, match.occurrences * 0.08))
  }
  return out
}

export const buildWorld = (rosaPages: readonly SitePage[]): MockWorld => {
  const rosaText = rosaPages
    .map((p) => `${p.title ?? ''} ${p.metaDescription ?? ''} ${stripTags(p.content)}`)
    .join(' ')

  const rosa: MockBusinessProfile = {
    name: 'Rosa',
    aliases: ['רוזה', 'Rosa Tel Aviv'],
    city: 'Tel Aviv',
    domain: 'rosa.example.co.il',
    attributes: strengthsFrom(rosaText),
    authority: 0.4,
    sources: rosaPages.map((p) => ({ url: p.url, title: p.title ?? 'Rosa' })),
  }

  return {
    // Engines disagree with each other, as they do in reality.
    providerBias: { openai: 0.5, gemini: -0.3, anthropic: 0.8 },
    businesses: [
      rosa,
      ...COMPETITORS.map(
        (c): MockBusinessProfile => ({
          name: c.name,
          city: c.city,
          domain: c.domain,
          attributes: strengthsFrom(c.siteText),
          authority: c.authority,
          sources: [...c.sources],
        }),
      ),
    ],
  }
}

const stripTags = (html: string): string => html.replace(/<[^>]*>/g, ' ')

/** What the owner confirmed during onboarding. Only these may be written about. */
export const OWNER_CONFIRMED_ATTRIBUTES = ['romantic', 'quiet', 'handmade_pasta'] as const

export const ROSA_BUSINESS = {
  name: 'Rosa',
  aliases: ['רוזה', 'Rosa Tel Aviv'],
  city: 'Tel Aviv',
  /** Hebrew speakers ask about "תל אביב"; measuring the English string would measure a
   * question nobody types. */
  cityHe: 'תל אביב',
  cuisineHe: 'איטלקית',
  vertical: 'restaurant',
  websiteUrl: `${ROSA_ORIGIN}/`,
  domain: 'rosa.example.co.il',
  phone: '03-5551234',
  address: 'Rothschild 12, Tel Aviv',
  cuisine: 'Italian',
} as const
