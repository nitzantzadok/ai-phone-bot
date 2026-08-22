/**
 * HTML -> structured page facts.
 *
 * Everything extracted here is evidence, not truth: it becomes a fact with a source and a
 * confidence, never a value written straight into the knowledge graph.
 */
import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { detectLanguage } from '@autopilot/shared/locale.ts'

export interface PageHeading {
  readonly level: number
  readonly text: string
}

export interface PageLink {
  readonly href: string
  readonly text: string
  readonly rel?: string
  readonly internal: boolean
}

export interface PageImage {
  readonly src: string
  readonly alt?: string
}

export interface ParsedPage {
  readonly url: string
  readonly title: string | null
  readonly metaDescription: string | null
  readonly canonical: string | null
  readonly robotsMeta: string | null
  readonly indexable: boolean
  readonly h1: string | null
  readonly headings: readonly PageHeading[]
  readonly bodyText: string
  readonly wordCount: number
  /**
   * The page delivered an empty application shell: the content a visitor sees is written
   * by JavaScript after load. Recorded because the audit must not report the consequences
   * ("no heading", "hardly any text") as if they were the problem.
   */
  readonly clientRendered: boolean
  readonly language: string | null
  readonly declaredLanguage: string | null
  readonly links: readonly PageLink[]
  readonly images: readonly PageImage[]
  readonly structuredData: readonly Record<string, unknown>[]
  readonly schemaTypes: readonly string[]
  readonly openGraph: Record<string, string>
  readonly hreflang: Record<string, string>
  readonly contentHash: string
}

/**
 * Resolves a possibly-relative href.
 *
 * Returns null for an absent or empty href rather than resolving it: `new URL('', base)`
 * returns the base itself, which would make a MISSING page element look present. That is
 * exactly the kind of silently-wrong signal that suppresses a real finding.
 */
const absolute = (href: string | undefined, base: string): string | null => {
  if (href === undefined || href.trim() === '') return null
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

/** JSON-LD blocks are frequently malformed in the wild; a bad block must not kill a crawl. */
const extractJsonLd = ($: cheerio.CheerioAPI): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim()
    if (!raw) return
    try {
      const parsed: unknown = JSON.parse(raw)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          // @graph is the common wrapper; flatten it so callers see real entities.
          const graph = record['@graph']
          if (Array.isArray(graph)) {
            for (const node of graph) {
              if (node && typeof node === 'object') out.push(node as Record<string, unknown>)
            }
          } else {
            out.push(record)
          }
        }
      }
    } catch {
      // Malformed JSON-LD is itself a finding; the technical audit reports it.
    }
  })
  return out
}

const schemaTypesOf = (blocks: readonly Record<string, unknown>[]): string[] => {
  const types = new Set<string>()
  for (const block of blocks) {
    const t = block['@type']
    if (typeof t === 'string') types.add(t)
    else if (Array.isArray(t)) for (const v of t) if (typeof v === 'string') types.add(v)
  }
  return [...types]
}

/**
 * Recognises an empty application shell.
 *
 * A React, Vue or Wix Studio site can serve a document containing one empty div and a
 * script tag: everything a customer reads is written after load. To anything that does not
 * execute JavaScript — which includes most of the crawlers that feed AI answers — that
 * page says nothing at all.
 *
 * Two signals must agree: a mount point that frameworks conventionally use, and almost no
 * text outside it. Either alone produces false positives on ordinary pages that happen to
 * be short or happen to use `id="app"`.
 */
const MOUNT_SELECTORS = [
  '#root:empty',
  '#app:empty',
  '#__next:empty',
  '#__nuxt:empty',
  '[data-reactroot]:empty',
  'div[id][class=""]:empty',
]

const looksClientRendered = ($: cheerio.CheerioAPI): boolean => {
  const hasScripts = $('script[src]').length > 0
  if (!hasScripts) return false

  const hasEmptyMount = MOUNT_SELECTORS.some((selector) => $(selector).length > 0)
  const noscriptAsksForJs = /javascript/i.test($('noscript').text())

  const visible = $('body').clone()
  visible.find('script, style, noscript, template, svg').remove()
  const words = visible.text().trim().split(/\s+/).filter(Boolean).length

  // Under ~25 words there is nothing for a reader, human or machine, to learn.
  return words < 25 && (hasEmptyMount || noscriptAsksForJs)
}

export const parseHtml = (html: string, url: string): ParsedPage => {
  const $ = cheerio.load(html)
  const origin = (() => {
    try {
      return new URL(url).origin
    } catch {
      return ''
    }
  })()

  // JSON-LD is read before stripping <script>, which the text extraction below removes.
  const structuredData = extractJsonLd($)

  // Whether this is an application shell has to be decided while the scripts are still in
  // the document, so it is measured here rather than inferred later from thin text alone.
  const clientRendered = looksClientRendered($)

  // Strip non-content elements before reading body text, or navigation dominates the signal.
  $('script, style, noscript, template, svg').remove()

  const headings: PageHeading[] = []
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = (el as { tagName?: string }).tagName ?? 'h6'
    const text = $(el).text().trim().replace(/\s+/g, ' ')
    if (text) headings.push({ level: Number(tag.slice(1)), text })
  })

  const links: PageLink[] = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
    const resolved = absolute(href, url)
    if (!resolved) return
    links.push({
      href: resolved,
      text: $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200),
      rel: $(el).attr('rel'),
      internal: origin !== '' && resolved.startsWith(origin),
    })
  })

  const images: PageImage[] = []
  $('img[src]').each((_, el) => {
    const src = absolute($(el).attr('src'), url)
    if (src) images.push({ src, alt: $(el).attr('alt') })
  })

  const openGraph: Record<string, string> = {}
  $('meta[property^="og:"], meta[name^="og:"]').each((_, el) => {
    const key = $(el).attr('property') ?? $(el).attr('name')
    const content = $(el).attr('content')
    if (key && content) openGraph[key] = content
  })

  const hreflang: Record<string, string> = {}
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang')
    const href = $(el).attr('href')
    if (lang && href) hreflang[lang] = absolute(href, url) ?? href
  })

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  const robotsMeta = $('meta[name="robots"]').attr('content') ?? null
  const declaredLanguage = $('html').attr('lang') ?? null

  return {
    url,
    title: $('title').first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr('content')?.trim() ?? null,
    canonical: absolute($('link[rel="canonical"]').attr('href'), url),
    robotsMeta,
    indexable: !/noindex/i.test(robotsMeta ?? ''),
    h1: headings.find((h) => h.level === 1)?.text ?? null,
    headings,
    bodyText,
    wordCount: bodyText.length === 0 ? 0 : bodyText.split(/\s+/).length,
    clientRendered,
    language: detectLanguage(bodyText),
    declaredLanguage,
    links,
    images,
    structuredData,
    schemaTypes: schemaTypesOf(structuredData),
    openGraph,
    hreflang,
    // Hash of normalised content only: whitespace churn must not read as a change.
    contentHash: createHash('sha256')
      .update([$('title').first().text().trim(), bodyText].join(' '))
      .digest('hex'),
  }
}

/** Extracts URLs from a sitemap or a sitemap index. */
export const parseSitemap = (xml: string): { urls: string[]; sitemaps: string[] } => {
  const $ = cheerio.load(xml, { xml: true })
  const urls: string[] = []
  const sitemaps: string[] = []
  $('urlset > url > loc').each((_, el) => {
    const value = $(el).text().trim()
    if (value) urls.push(value)
  })
  $('sitemapindex > sitemap > loc').each((_, el) => {
    const value = $(el).text().trim()
    if (value) sitemaps.push(value)
  })
  return { urls, sitemaps }
}

/**
 * Heuristic page classification. Used to spot the page types a vertical expects and does
 * not have (service pages for a law firm, a menu for a restaurant), which is one of the
 * most reliable controllable gaps we can find.
 *
 * Hebrew terms are matched alongside English because Israeli sites routinely use Hebrew
 * slugs with Latin transliterations.
 */
const PAGE_TYPE_PATTERNS: readonly { type: string; pattern: RegExp }[] = [
  { type: 'contact', pattern: new RegExp('contact|\\u05e6\\u05d5\\u05e8[-_ ]?\\u05e7\\u05e9\\u05e8|kesher') },
  { type: 'about', pattern: new RegExp('about|\\u05d0\\u05d5\\u05d3\\u05d5\\u05ea\\u05d9\\u05e0\\u05d5|\\u05d0\\u05d5\\u05d3\\u05d5\\u05ea') },
  { type: 'faq', pattern: new RegExp('faq|\\u05e9\\u05d0\\u05dc\\u05d5\\u05ea') },
  { type: 'menu', pattern: new RegExp('menu|\\u05ea\\u05e4\\u05e8\\u05d9\\u05d8') },
  { type: 'blog', pattern: new RegExp('blog|news|article|\\u05d1\\u05dc\\u05d5\\u05d2|\\u05de\\u05d0\\u05de\\u05e8') },
  { type: 'booking', pattern: new RegExp('book|reserve|appointment|\\u05d4\\u05d6\\u05de\\u05e0|\\u05ea\\u05d5\\u05e8') },
  { type: 'service', pattern: new RegExp('service|treatment|\\u05e9\\u05d9\\u05e8\\u05d5\\u05ea|\\u05d8\\u05d9\\u05e4\\u05d5\\u05dc') },
  { type: 'location', pattern: new RegExp('location|branch|\\u05e1\\u05e0\\u05d9\\u05e3|\\u05db\\u05ea\\u05d5\\u05d1\\u05ea') },
]

export const classifyPage = (page: ParsedPage): string => {
  const path = (() => {
    try {
      return new URL(page.url).pathname.toLowerCase()
    } catch {
      return page.url.toLowerCase()
    }
  })()
  if (path === '/' || path === '') return 'home'

  const haystack = `${decodeURIComponent(path)} ${page.title ?? ''} ${page.h1 ?? ''}`.toLowerCase()
  for (const { type, pattern } of PAGE_TYPE_PATTERNS) {
    if (pattern.test(haystack)) return type
  }
  return 'other'
}
