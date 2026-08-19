/**
 * Crawl orchestration.
 *
 * Bounded on every axis that can run away: pages, bytes, time, concurrency and per-host
 * request rate. A crawler without those bounds is a denial-of-service tool pointed at a
 * customer's own website, which is a memorable way to lose a customer.
 */
import { TokenBucket } from '@autopilot/shared/resilience.ts'
import { isAppError } from '@autopilot/shared/errors.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import { safeFetch, type SafeFetchOptions } from './safe-fetch.ts'
import { EMPTY_ROBOTS, crawlDelayFor, isAllowed, parseRobotsTxt, type RobotsTxt } from './robots.ts'
import { classifyPage, parseHtml, parseSitemap, type ParsedPage } from './parse.ts'
import { auditSite, discoverabilityScore, type TechnicalFinding } from './audit.ts'

export interface CrawlOptions extends SafeFetchOptions {
  readonly maxPages?: number
  readonly maxDurationMs?: number
  readonly concurrency?: number
  /** Requests per second per host, before robots.txt Crawl-delay is applied. */
  readonly requestsPerSecond?: number
  readonly respectRobots?: boolean
  readonly logger?: Logger
  /** Injection seam for tests: substitute the network without touching crawl logic. */
  readonly fetcher?: typeof safeFetch
}

export interface CrawledPage extends ParsedPage {
  readonly status: number
  readonly pageType: string
  readonly fetchedAt: Date
  readonly durationMs: number
}

export interface CrawlResult {
  readonly rootUrl: string
  readonly pages: readonly CrawledPage[]
  readonly findings: readonly TechnicalFinding[]
  readonly robotsTxtFound: boolean
  readonly sitemapFound: boolean
  readonly sitemapUrls: readonly string[]
  readonly discoverability: number
  readonly errors: readonly { url: string; code: string; message: string }[]
  readonly stoppedBecause: 'COMPLETE' | 'MAX_PAGES' | 'MAX_DURATION'
  readonly startedAt: Date
  readonly finishedAt: Date
}

const normalizeUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw)
    url.hash = ''
    // Tracking parameters create infinite crawl surface for zero information gain.
    // The keys are materialised first because we delete from the same collection.
    // oxlint-disable-next-line no-useless-spread
    for (const p of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|msclkid|mc_|ref)/i.test(p)) url.searchParams.delete(p)
    }
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1)
    }
    return url.toString()
  } catch {
    return null
  }
}

const isCrawlableAsset = (url: string): boolean =>
  !/\.(jpe?g|png|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|eot|pdf|zip|mp4|mp3|avi|dmg|exe)(\?|$)/i.test(
    url,
  )

export const crawlSite = async (rootUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> => {
  const logger = options.logger ?? noopLogger
  const fetcher = options.fetcher ?? safeFetch
  const maxPages = options.maxPages ?? 120
  const maxDurationMs = options.maxDurationMs ?? 120_000
  const concurrency = Math.max(1, options.concurrency ?? 3)
  const respectRobots = options.respectRobots ?? true
  const userAgent = options.userAgent ?? 'AIRecommendationAutopilotBot/0.1'

  const startedAt = new Date()
  const deadline = startedAt.getTime() + maxDurationMs

  const origin = new URL(rootUrl).origin
  const errors: { url: string; code: string; message: string }[] = []
  const statusByUrl = new Map<string, number>()
  const pages: CrawledPage[] = []
  const visited = new Set<string>()

  // robots.txt first: everything below obeys it.
  let robots: RobotsTxt = EMPTY_ROBOTS
  let robotsTxtFound = false
  try {
    const res = await fetcher(new URL('/robots.txt', origin).toString(), {
      ...options,
      acceptTypes: ['text/plain', 'text/html'],
    })
    if (res.status === 200) {
      robots = parseRobotsTxt(res.body)
      robotsTxtFound = true
    }
  } catch (e) {
    logger.debug('robots.txt unavailable', { origin, err: e })
  }

  const perSecond = (() => {
    const configured = options.requestsPerSecond ?? 2
    const delay = crawlDelayFor(robots, userAgent)
    // Crawl-delay is a ceiling we honour even when it is slower than our own limit.
    return delay && delay > 0 ? Math.min(configured, 1 / delay) : configured
  })()
  const bucket = new TokenBucket(Math.max(1, Math.ceil(perSecond)), perSecond)

  // Sitemap discovery: robots.txt declarations first, then the conventional locations.
  const sitemapUrls: string[] = []
  let sitemapFound = false
  const sitemapCandidates = [
    ...robots.sitemaps,
    new URL('/sitemap.xml', origin).toString(),
    new URL('/sitemap_index.xml', origin).toString(),
  ]
  for (const candidate of sitemapCandidates.slice(0, 5)) {
    try {
      const res = await fetcher(candidate, {
        ...options,
        acceptTypes: ['application/xml', 'text/xml', 'text/html'],
      })
      if (res.status !== 200) continue
      const parsed = parseSitemap(res.body)
      if (parsed.urls.length > 0 || parsed.sitemaps.length > 0) {
        sitemapFound = true
        sitemapUrls.push(...parsed.urls)
        // One level of sitemap-index expansion: enough in practice, bounded by design.
        for (const child of parsed.sitemaps.slice(0, 5)) {
          try {
            const childRes = await fetcher(child, {
              ...options,
              acceptTypes: ['application/xml', 'text/xml'],
            })
            sitemapUrls.push(...parseSitemap(childRes.body).urls)
          } catch {
            // A broken child sitemap is a finding, not a crawl failure.
          }
        }
        break
      }
    } catch {
      // An absent sitemap is normal.
    }
  }

  const queue: string[] = []
  const enqueue = (raw: string): void => {
    const url = normalizeUrl(raw)
    if (!url) return
    if (!url.startsWith(origin)) return
    if (visited.has(url) || queue.includes(url)) return
    if (!isCrawlableAsset(url)) return
    if (respectRobots && !isAllowed(robots, url, userAgent)) return
    queue.push(url)
  }

  enqueue(rootUrl)
  for (const url of sitemapUrls.slice(0, maxPages * 2)) enqueue(url)

  let stoppedBecause: CrawlResult['stoppedBecause'] = 'COMPLETE'

  const fetchOne = async (url: string): Promise<void> => {
    // Politeness: wait for a token rather than bursting at the customer's server.
    for (;;) {
      if (bucket.tryConsume()) break
      const wait = bucket.waitTimeMs()
      if (Date.now() + wait > deadline) return
      await new Promise((r) => setTimeout(r, Math.min(wait, 1000)))
    }

    const started = Date.now()
    try {
      const res = await fetcher(url, options)
      statusByUrl.set(url, res.status)
      if (res.status >= 400) {
        errors.push({ url, code: `HTTP_${res.status}`, message: `status ${res.status}` })
        return
      }
      if (!res.contentType?.includes('html')) return

      const parsed = parseHtml(res.body, res.finalUrl)
      pages.push({
        ...parsed,
        status: res.status,
        pageType: classifyPage(parsed),
        fetchedAt: new Date(),
        durationMs: Date.now() - started,
      })
      for (const link of parsed.links) if (link.internal) enqueue(link.href)
    } catch (e) {
      const code = isAppError(e) ? e.code : 'FETCH_FAILED'
      errors.push({ url, code, message: e instanceof Error ? e.message : String(e) })
      logger.debug('page fetch failed', { url, code })
    }
  }

  while (queue.length > 0) {
    if (pages.length >= maxPages) {
      stoppedBecause = 'MAX_PAGES'
      break
    }
    if (Date.now() > deadline) {
      stoppedBecause = 'MAX_DURATION'
      break
    }

    const batch = queue.splice(0, Math.min(concurrency, maxPages - pages.length))
    for (const url of batch) visited.add(url)
    await Promise.all(batch.map(fetchOne))
  }

  const findings = auditSite({ pages, robotsTxtFound, sitemapFound, statusByUrl })

  return {
    rootUrl,
    pages,
    findings,
    robotsTxtFound,
    sitemapFound,
    sitemapUrls,
    discoverability: discoverabilityScore(findings, pages.length),
    errors,
    stoppedBecause,
    startedAt,
    finishedAt: new Date(),
  }
}
