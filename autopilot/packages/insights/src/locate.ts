/**
 * Pointing at the thing.
 *
 * A report can name a problem, explain the problem, and still leave its reader unable to
 * act, because it never answers the question they are actually holding: *which* bit of my
 * site, and what am I looking for when I get there.
 *
 * "Four pages have no short description" sends somebody hunting through a site editor for
 * a field they have never noticed. "On your Services page — the grey sentence under your
 * name in Google, currently empty — write this:" does not. It is the same finding. One of
 * them gets fixed.
 *
 * Three things make the difference, and this module assembles all three:
 *
 *  1. **Which page**, by the name a person calls it, not by URL. `/about` is "the About
 *     page"; a URL is something to squint at.
 *  2. **What is there now**, verbatim. A reader who sees «ברוכים הבאים» quoted back at
 *     them recognises their own site instantly and stops doubting the finding.
 *  3. **What to put instead** — an actual sentence, built from the facts this scan read
 *     off their site, ready to paste.
 *
 * The third one is where a suggestion can do harm, so it is bounded: a suggestion is
 * offered only when the scan holds enough real facts to write one that is true. We never
 * invent a city, a service, or a selling point to fill a template. A business that pastes
 * a confident sentence about itself that is subtly wrong has been damaged by us, and would
 * be right to say so.
 */
import type { Bilingual, Language } from './explain.ts'

/** Everything the scan knows about the business, for writing suggestions from. */
export interface BusinessFacts {
  readonly name: string | null
  readonly city: string | null
  readonly phone: string | null
  readonly address: string | null
  /**
   * Customer-facing name of the field, already localized — or null when the scan could
   * not tell what field this is.
   *
   * Null rather than a generic stand-in, because these strings go into sentences the
   * customer pastes onto their own website. "מספרת רוזה — עסקים בתחום שלכם בפתח תקווה" is
   * not a description, it is our fallback label leaking onto a real business's home page.
   */
  readonly verticalLabel: string | null
  /** What the site says it is good for. */
  readonly attributes: readonly string[]
}

export interface Located {
  /** "the About page", "your home page". */
  readonly page: string
  /** The address, for anyone who wants to click it. */
  readonly url: string
  /** Where on that page to look. */
  readonly where: string | null
  /** What is there right now, trimmed for display. */
  readonly current: string | null
  /** A ready sentence to put there, when one can be written truthfully. */
  readonly suggested: string | null
}

/* ------------------------------------------------------------- naming a page --- */

const PAGE_NAMES: Readonly<Record<string, Bilingual>> = {
  '': { he: 'עמוד הבית', en: 'your home page' },
  about: { he: 'עמוד "אודות"', en: 'the About page' },
  services: { he: 'עמוד השירותים', en: 'the Services page' },
  service: { he: 'עמוד השירותים', en: 'the Services page' },
  contact: { he: 'עמוד "צרו קשר"', en: 'the Contact page' },
  products: { he: 'עמוד המוצרים', en: 'the Products page' },
  shop: { he: 'החנות', en: 'the Shop page' },
  blog: { he: 'הבלוג', en: 'the Blog' },
  faq: { he: 'עמוד השאלות והתשובות', en: 'the FAQ page' },
  gallery: { he: 'הגלריה', en: 'the Gallery' },
  prices: { he: 'עמוד המחירים', en: 'the Prices page' },
  pricing: { he: 'עמוד המחירים', en: 'the Pricing page' },
}

/**
 * What to call a page in a sentence.
 *
 * Falls back to the last path segment rather than the whole URL: a reader scanning a list
 * of nine items should be able to tell them apart at a glance, and nine wrapped absolute
 * URLs are nine identical grey blocks.
 */
export const pageName = (url: string, language: Language): string => {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    path = url
  }

  const segments = path.split('/').filter(Boolean)
  const last = (segments[segments.length - 1] ?? '').toLowerCase()
  const key = last.replace(/\.(html?|php|aspx?)$/, '')

  const known = PAGE_NAMES[key]
  if (known) return language === 'he' ? known.he : known.en

  if (segments.length === 0) {
    return language === 'he' ? PAGE_NAMES['']!.he : PAGE_NAMES['']!.en
  }

  // An unrecognised page: name it by its own path, which is what the customer sees in
  // their editor's page list anyway.
  return language === 'he' ? `העמוד /${segments.join('/')}` : `the /${segments.join('/')} page`
}

/* ---------------------------------------------------------------- suggesting --- */

/** Long enough to be useful, short enough that the platform will not cut it. */
const TITLE_MAX = 60
const DESCRIPTION_TARGET = 150

const trimTo = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

/**
 * A page title, built from facts we actually read.
 *
 * Needs a name at minimum; without one there is nothing true to say. The city is included
 * when known because a local question is the one this whole product is about.
 */
const suggestTitle = (
  facts: BusinessFacts,
  url: string,
  language: Language,
): string | null => {
  if (!facts.name) return null
  const he = language === 'he'
  const name = facts.name

  let path = ''
  try {
    path = new URL(url).pathname.replace(/\/$/, '')
  } catch {
    /* An unparseable URL just means we treat it as the home page. */
  }

  // Inner pages get their own subject, so the site does not ship one title nine times.
  const segments = path.split('/').filter(Boolean)
  const isHome = segments.length === 0
  const section = isHome ? null : pageName(url, language)

  const place = facts.city ? (he ? ` ב${facts.city}` : ` in ${facts.city}`) : ''

  if (isHome) {
    // Without a known field there is nothing true to put between the name and the city,
    // so the title simply says less rather than saying something invented.
    const what = facts.verticalLabel ? ` – ${facts.verticalLabel}` : ''
    return trimTo(`${name}${what}${place}`, TITLE_MAX)
  }
  return trimTo(`${section} | ${name}${place}`, TITLE_MAX)
}

/**
 * A short description, built from facts we actually read.
 *
 * Requires a name and at least one more real fact. A sentence containing only the business
 * name is not worth the paste, and padding it out with adjectives nobody verified is how a
 * tool starts writing marketing copy that its customer then has to live with.
 */
/**
 * Israeli phone numbers, written the way people write them.
 *
 * The extractor normalises to digits so two spellings of one number compare equal. That is
 * right for comparison and wrong for a sentence somebody is about to publish: "039123456"
 * in a page description looks like a typo, because it is one.
 */
const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '').replace(/^972/, '0')
  if (/^0[23489]\d{7}$/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  if (/^0(5\d|7\d)\d{7}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return phone
}

const suggestDescription = (
  facts: BusinessFacts,
  url: string,
  language: Language,
): string | null => {
  if (!facts.name) return null
  const he = language === 'he'

  // The name plus at least one more thing we actually read. A sentence carrying only the
  // business name is a label, not a description, and pasting it helps nobody — but name
  // and city together already answer the question a local search is asking, so the bar is
  // "one real fact beyond the name", not "several".
  const extras = [facts.city, facts.address, facts.phone, facts.attributes[0]].filter(Boolean)
  if (extras.length === 0) return null

  /* Each page gets its own opening, because a site shipping one description on every page
     is a finding this very report raises elsewhere — suggesting the identical sentence
     three times would contradict our own advice on the next card down. */
  let isHome = true
  try {
    isHome = new URL(url).pathname.replace(/\/$/, '') === ''
  } catch {
    /* treat as home */
  }

  const what = facts.verticalLabel ? ` — ${facts.verticalLabel}` : ''
  const place = facts.city ? (he ? ` ב${facts.city}` : ` in ${facts.city}`) : ''

  const parts: string[] = []
  parts.push(
    isHome
      ? `${facts.name}${what}${place}.`
      : he
        ? `${pageName(url, language)} של ${facts.name}${place}.`
        : `${pageName(url, language)} of ${facts.name}${place}.`,
  )

  if (facts.attributes.length > 0) parts.push(`${facts.attributes.slice(0, 3).join(', ')}.`)
  if (facts.address) parts.push(`${facts.address}.`)
  if (facts.phone) {
    parts.push(he ? `טלפון ${formatPhone(facts.phone)}.` : `Phone ${formatPhone(facts.phone)}.`)
  }

  return trimTo(parts.join(' '), DESCRIPTION_TARGET)
}

/** A main heading. The page's subject, stated plainly. */
const suggestHeading = (
  facts: BusinessFacts,
  url: string,
  language: Language,
): string | null => {
  if (!facts.name) return null
  const he = language === 'he'
  let isHome = true
  try {
    isHome = new URL(url).pathname.replace(/\/$/, '') === ''
  } catch {
    /* treat as home */
  }
  if (!isHome) return null

  // With no known field there is no honest heading to write: "עסקים בתחום שלכם בחיפה" is
  // not a heading, and the business's own name is already in the title above it.
  if (!facts.verticalLabel) return null

  return facts.city
    ? he
      ? `${facts.verticalLabel} ב${facts.city}`
      : `${facts.verticalLabel} in ${facts.city}`
    : facts.verticalLabel
}

const SUGGESTERS: Readonly<
  Record<string, (facts: BusinessFacts, url: string, language: Language) => string | null>
> = {
  MISSING_TITLE: suggestTitle,
  TITLE_LENGTH: suggestTitle,
  DUPLICATE_TITLE: suggestTitle,
  MISSING_META_DESCRIPTION: suggestDescription,
  META_DESCRIPTION_LENGTH: suggestDescription,
  DUPLICATE_META_DESCRIPTION: suggestDescription,
  MISSING_H1: suggestHeading,
}

/* ---------------------------------------------------------------- assembling --- */

export interface FindingLike {
  readonly findingType: string
  readonly url: string
  readonly where?: { he: string; en: string }
  readonly current?: string | null
}

/** How much of a current value to show before it stops being a glance. */
const CURRENT_MAX = 90

export const locate = (
  finding: FindingLike,
  facts: BusinessFacts,
  language: Language,
): Located => ({
  page: pageName(finding.url, language),
  url: finding.url,
  where: finding.where ? (language === 'he' ? finding.where.he : finding.where.en) : null,
  current: finding.current ? trimTo(finding.current, CURRENT_MAX) : null,
  suggested: SUGGESTERS[finding.findingType]?.(facts, finding.url, language) ?? null,
})

/**
 * The same, for every page a finding was seen on.
 *
 * Capped, because a finding on forty pages is one instruction and forty addresses, and a
 * reader who has to scroll past thirty-eight of them to reach the next task has been given
 * a worse report than one that said "and 38 more".
 */
export const locateAll = (
  findings: readonly FindingLike[],
  facts: BusinessFacts,
  language: Language,
  max = 8,
): { readonly located: readonly Located[]; readonly more: number } => {
  const located = findings.slice(0, max).map((f) => locate(f, facts, language))
  return { located, more: Math.max(0, findings.length - max) }
}
