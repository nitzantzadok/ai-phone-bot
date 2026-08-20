/**
 * Technical audit.
 *
 * Findings are deliberately conservative and each one carries `autoFixable`, because the
 * agent is allowed to fix exactly these without asking. A false positive here becomes an
 * unwanted automatic edit to a customer's website, so anything ambiguous is reported at
 * lower confidence and routed to a human instead.
 */
import type { ParsedPage } from './parse.ts'

export interface TechnicalFinding {
  readonly findingType: string
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH'
  readonly url: string
  readonly detail: string
  /** Plain language for a business owner, never SEO jargon (brief §82). */
  readonly plainLanguage: string
  readonly confidence: number
  readonly autoFixable: boolean
}

export interface SiteAuditInput {
  readonly pages: readonly ParsedPage[]
  readonly robotsTxtFound: boolean
  readonly sitemapFound: boolean
  readonly statusByUrl: ReadonlyMap<string, number>
}

const TITLE_MIN = 15
const TITLE_MAX = 65
const DESCRIPTION_MIN = 50
const DESCRIPTION_MAX = 165
const THIN_CONTENT_WORDS = 120

export const auditSite = (input: SiteAuditInput): TechnicalFinding[] => {
  const findings: TechnicalFinding[] = []
  const add = (f: TechnicalFinding) => findings.push(f)

  if (!input.robotsTxtFound) {
    add({
      findingType: 'NO_ROBOTS_TXT',
      severity: 'LOW',
      url: '/robots.txt',
      detail: 'No robots.txt was found at the site root.',
      plainLanguage:
        'Your site has no robots.txt file. It tells search and AI crawlers what they may read.',
      confidence: 1,
      autoFixable: false,
    })
  }

  if (!input.sitemapFound) {
    add({
      findingType: 'NO_SITEMAP',
      severity: 'MEDIUM',
      url: '/sitemap.xml',
      detail: 'No XML sitemap was discovered via robots.txt or the common locations.',
      plainLanguage:
        'Your site has no sitemap, so crawlers have to guess which pages exist. Adding one helps them find everything.',
      confidence: 1,
      autoFixable: true,
    })
  }

  const titles = new Map<string, string[]>()
  const descriptions = new Map<string, string[]>()

  for (const page of input.pages) {
    const status = input.statusByUrl.get(page.url)

    if (status !== undefined && status >= 400) {
      add({
        findingType: 'BROKEN_PAGE',
        severity: 'HIGH',
        url: page.url,
        detail: `Page returned HTTP ${status}.`,
        plainLanguage: 'This page is not loading for visitors or crawlers.',
        confidence: 1,
        autoFixable: false,
      })
      continue
    }

    if (!page.title) {
      add({
        findingType: 'MISSING_TITLE',
        severity: 'HIGH',
        url: page.url,
        detail: 'Page has no <title>.',
        plainLanguage:
          'This page has no title. AI systems and search engines use it to understand what the page is about.',
        confidence: 1,
        autoFixable: true,
      })
    } else {
      titles.set(page.title, [...(titles.get(page.title) ?? []), page.url])
      if (page.title.length < TITLE_MIN || page.title.length > TITLE_MAX) {
        add({
          findingType: 'TITLE_LENGTH',
          severity: 'LOW',
          url: page.url,
          detail: `Title is ${page.title.length} characters (recommended ${TITLE_MIN}-${TITLE_MAX}).`,
          plainLanguage: 'This page title is unusually short or long, so it may be cut off.',
          confidence: 0.6,
          autoFixable: true,
        })
      }
    }

    if (!page.metaDescription) {
      add({
        findingType: 'MISSING_META_DESCRIPTION',
        severity: 'MEDIUM',
        url: page.url,
        detail: 'Page has no meta description.',
        plainLanguage:
          'This page has no short summary. It is one of the first things an AI reads to decide what you offer.',
        confidence: 1,
        autoFixable: true,
      })
    } else {
      descriptions.set(page.metaDescription, [
        ...(descriptions.get(page.metaDescription) ?? []),
        page.url,
      ])
      if (
        page.metaDescription.length < DESCRIPTION_MIN ||
        page.metaDescription.length > DESCRIPTION_MAX
      ) {
        add({
          findingType: 'META_DESCRIPTION_LENGTH',
          severity: 'LOW',
          url: page.url,
          detail: `Meta description is ${page.metaDescription.length} characters.`,
          plainLanguage: 'This page summary is unusually short or long.',
          confidence: 0.5,
          autoFixable: true,
        })
      }
    }

    if (!page.canonical) {
      add({
        findingType: 'MISSING_CANONICAL',
        severity: 'MEDIUM',
        url: page.url,
        detail: 'Page has no canonical link.',
        plainLanguage:
          'This page does not state its official address, so crawlers may treat duplicates as separate pages.',
        confidence: 0.9,
        autoFixable: true,
      })
    }

    if (!page.h1) {
      add({
        findingType: 'MISSING_H1',
        severity: 'MEDIUM',
        url: page.url,
        detail: 'Page has no H1 heading.',
        plainLanguage: 'This page has no main heading, which makes its topic harder to identify.',
        confidence: 0.9,
        autoFixable: false,
      })
    }

    if (!page.indexable) {
      add({
        findingType: 'NOINDEX',
        severity: 'HIGH',
        url: page.url,
        detail: `Page carries robots meta "${page.robotsMeta}".`,
        plainLanguage:
          'This page tells search engines not to list it. If that is not intentional, it is invisible to AI too.',
        confidence: 1,
        // Never auto-flip: a deliberate noindex (thank-you pages, staging) is common.
        autoFixable: false,
      })
    }

    if (page.wordCount < THIN_CONTENT_WORDS && page.wordCount > 0) {
      add({
        findingType: 'THIN_CONTENT',
        severity: 'LOW',
        url: page.url,
        detail: `Page has only ${page.wordCount} words.`,
        plainLanguage:
          'This page has very little text, so there is not much for an AI to learn from it.',
        confidence: 0.7,
        autoFixable: false,
      })
    }

    if (page.structuredData.length === 0) {
      add({
        findingType: 'NO_STRUCTURED_DATA',
        severity: 'MEDIUM',
        url: page.url,
        detail: 'Page has no JSON-LD structured data.',
        plainLanguage:
          'This page has no machine-readable business information, which AI systems rely on to describe you accurately.',
        confidence: 1,
        autoFixable: true,
      })
    }

    if (page.declaredLanguage === null) {
      add({
        findingType: 'MISSING_LANG_ATTRIBUTE',
        severity: 'LOW',
        url: page.url,
        detail: 'The <html> element has no lang attribute.',
        plainLanguage:
          'This page does not declare its language, which matters for a bilingual Hebrew and English site.',
        confidence: 1,
        autoFixable: true,
      })
    } else if (
      page.language !== null &&
      !page.declaredLanguage.toLowerCase().startsWith(page.language)
    ) {
      add({
        findingType: 'LANGUAGE_MISMATCH',
        severity: 'MEDIUM',
        url: page.url,
        detail: `Declared "${page.declaredLanguage}" but the content reads as "${page.language}".`,
        plainLanguage:
          'This page says it is in one language but is written in another, which confuses AI systems.',
        confidence: 0.7,
        autoFixable: true,
      })
    }

    const missingAlt = page.images.filter((i) => !i.alt || i.alt.trim() === '').length
    if (missingAlt > 0 && page.images.length > 0) {
      add({
        findingType: 'MISSING_IMAGE_ALT',
        severity: 'LOW',
        url: page.url,
        detail: `${missingAlt} of ${page.images.length} images have no alt text.`,
        plainLanguage: 'Some images have no description, so their content is invisible to AI.',
        confidence: 1,
        autoFixable: false,
      })
    }
  }

  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      add({
        findingType: 'DUPLICATE_TITLE',
        severity: 'MEDIUM',
        url: urls[0]!,
        detail: `${urls.length} pages share the title "${title}".`,
        plainLanguage:
          'Several pages have the same title, so they look like the same page to an AI.',
        confidence: 1,
        autoFixable: false,
      })
    }
  }

  for (const [, urls] of descriptions) {
    if (urls.length > 2) {
      add({
        findingType: 'DUPLICATE_META_DESCRIPTION',
        severity: 'LOW',
        url: urls[0]!,
        detail: `${urls.length} pages share the same meta description.`,
        plainLanguage: 'Several pages have identical summaries.',
        confidence: 1,
        autoFixable: false,
      })
    }
  }

  const internalTargets = new Set(
    input.pages.flatMap((p) => p.links.filter((l) => l.internal).map((l) => l.href)),
  )
  for (const target of internalTargets) {
    const status = input.statusByUrl.get(target)
    if (status !== undefined && status >= 400) {
      add({
        findingType: 'BROKEN_LINK',
        severity: 'MEDIUM',
        url: target,
        detail: `Internal link target returned HTTP ${status}.`,
        plainLanguage: 'A link on your site points to a page that no longer works.',
        confidence: 1,
        autoFixable: false,
      })
    }
  }

  return findings
}

/** 0..1 technical discoverability, a component of AIRS. Severity-weighted, page-normalised. */
export const discoverabilityScore = (
  findings: readonly TechnicalFinding[],
  pageCount: number,
): number => {
  if (pageCount === 0) return 0
  const weight = { HIGH: 3, MEDIUM: 1.5, LOW: 0.5 } as const
  const penalty = findings.reduce((sum, f) => sum + weight[f.severity] * f.confidence, 0)
  // Roughly: a clean site scores 1; ~4 weighted issues per page floors the score.
  return Math.max(0, Math.min(1, 1 - penalty / (pageCount * 4)))
}
