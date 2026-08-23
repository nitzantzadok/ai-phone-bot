/**
 * Finding the business's name when the site never says it in a machine-readable way.
 *
 * Structured data carries the name outright, and where it exists nothing here is needed.
 * Most Israeli small-business sites do not have it, and for those the name used to come
 * from one place only: the home page `<title>`. On a site whose home page is titled
 * "ברוכים הבאים" — which is the most common home-page title in the country — that yields
 * nothing, and the report tells a business with its name written across every page in
 * 40-point type that we could not find its name.
 *
 * That is not merely embarrassing. The name gates real behaviour downstream: no name means
 * no measurement (an answer naming the business cannot be recognised), and no suggested
 * title or description (there is nothing true to build one from). One weak extractor was
 * quietly switching off half the product.
 *
 * Two signals fix most of it, and both are things a human uses without thinking:
 *
 *  1. **The logo link.** Nearly every site makes its name, top-left or top-right, a link
 *     back to the home page. Its text is the business name, and because it sits in a
 *     shared header it repeats on every page — which is what makes it checkable rather
 *     than a guess.
 *  2. **The home page's main heading.** When a site bothers to write an H1 at all, it is
 *     usually "«name» in «city»" or the name alone.
 *
 * Both are reported at MEDIUM confidence, below structured data, and both are refused when
 * the candidate looks like navigation rather than a name. The asymmetry that governs every
 * decision here: a missing name is a finding the customer needs to see anyway, while a
 * *wrong* name propagates into generated titles, into the questions we ask engines, and
 * into what we tell them to publish about themselves.
 */
import type { CrawledPage } from '@autopilot/crawler/crawler.ts'

/**
 * Words that are navigation, not names.
 *
 * Deliberately not the same list the title extractor uses: this one sees link text and
 * headings, where "בית", "ראשי" and "Menu" are common and mean nothing.
 */
const NOT_A_NAME = new Set([
  'בית',
  'דף הבית',
  'עמוד הבית',
  'ראשי',
  'לדף הבית',
  'חזרה',
  'תפריט',
  'ברוכים הבאים',
  'ברוכות הבאות',
  'אודות',
  'צור קשר',
  'צרו קשר',
  'הזמנת תור',
  'לוגו',
  'home',
  'home page',
  'homepage',
  'main',
  'menu',
  'back',
  'welcome',
  'logo',
  'about',
  'about us',
  'contact',
  'contact us',
  'skip to content',
])

/** Long enough to be a name, short enough not to be a sentence or a slogan. */
const MIN_LENGTH = 2
const MAX_LENGTH = 60

/**
 * The separators a site uses to append something to its name.
 *
 * Logo text and headings carry the same "«name» — «city»" and "«name» | «what we do»"
 * patterns titles do, and the part before the separator is the name. Taking the whole
 * string instead yields "מוסך אבי ובניו — חיפה", which then gets published back at the
 * business as what it is called.
 */
const SEPARATORS = /[|\u2013\u2014\u00b7]|\s-\s/

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** The first segment that reads like a name, or null if none of them do. */
const firstNameLike = (text: string): string | null =>
  clean(text)
    .split(SEPARATORS)
    .map(clean)
    .find(plausible) ?? null

/**
 * Whether a string could be a business name at all.
 *
 * Rejects anything with sentence punctuation: a real name does not contain a full stop or
 * a comma, and something that does is a tagline the site put in its header.
 */
const plausible = (candidate: string): boolean => {
  const value = clean(candidate)
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) return false
  if (NOT_A_NAME.has(value.toLowerCase())) return false
  if (/[.!?,;:|]/.test(value)) return false
  // A name is a few words. Six or more is a sentence somebody styled as a heading.
  if (value.split(' ').length > 5) return false
  // Pure punctuation, digits, or an icon font's leftover glyph.
  if (!/[\p{L}]{2}/u.test(value)) return false
  return true
}

/** Whether a link points at the site's own root. */
const isHomeLink = (href: string, origin: string): boolean => {
  try {
    const url = new URL(href, origin)
    return url.origin === new URL(origin).origin && url.pathname.replace(/\/$/, '') === ''
  } catch {
    return false
  }
}

export interface BrandCandidate {
  readonly value: string
  /** How it was found, for the fact's excerpt. */
  readonly source: 'HOME_LINK' | 'HOME_HEADING'
  /** On how many pages the same text was seen. Repetition is what makes it credible. */
  readonly seenOn: number
}

/**
 * The text of the link that points home, when the same text appears on more than one page.
 *
 * The repetition requirement is what separates a header logo from an incidental link in
 * body copy. On a single-page site it is relaxed, because there is nothing to repeat
 * across — and a one-page site's home link is its header by definition.
 */
export const brandFromHomeLink = (
  pages: readonly CrawledPage[],
  siteUrl: string,
): BrandCandidate | null => {
  const counts = new Map<string, number>()

  for (const page of pages) {
    // Once per page: a footer and a header both linking home is one piece of evidence
    // about the name, not two.
    const onThisPage = new Set<string>()
    for (const link of page.links) {
      if (!isHomeLink(link.href, siteUrl)) continue
      const text = firstNameLike(link.text ?? '')
      if (text === null) continue
      onThisPage.add(text)
    }
    for (const text of onThisPage) counts.set(text, (counts.get(text) ?? 0) + 1)
  }

  if (counts.size === 0) return null

  const [best, seenOn] = [...counts].sort((a, b) => b[1] - a[1])[0]!
  const required = pages.length > 1 ? 2 : 1
  if (seenOn < required) return null

  return { value: best, source: 'HOME_LINK', seenOn }
}

/**
 * The home page's main heading, when it reads like a name.
 *
 * Weaker than the logo link — an H1 is often a slogan or a service description — so it is
 * only consulted when the link yielded nothing, and it is held to the same plausibility
 * bar.
 */
export const brandFromHomeHeading = (pages: readonly CrawledPage[]): BrandCandidate | null => {
  const home = pages.find((p) => p.pageType === 'home') ?? pages[0]
  const heading = home?.headings.find((h) => h.level === 1)?.text
  if (!heading) return null

  const value = firstNameLike(heading)
  if (value === null) return null

  return { value, source: 'HOME_HEADING', seenOn: 1 }
}

/**
 * The best name the site's own markup offers, short of structured data.
 *
 * Returns null rather than a doubtful guess. Everything downstream treats a missing name
 * as a finding to report, which is the correct outcome for a site that genuinely never
 * writes its own name down.
 */
export const detectBrand = (
  pages: readonly CrawledPage[],
  siteUrl: string,
): BrandCandidate | null => brandFromHomeLink(pages, siteUrl) ?? brandFromHomeHeading(pages)
