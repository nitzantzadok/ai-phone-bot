/**
 * In-memory site fixture.
 *
 * Lets crawl behaviour be tested against a site with known structure, redirects, errors
 * and robots rules, without a network or a server. The seam is `CrawlOptions.fetcher`, so
 * the code under test is the real crawler, not a stubbed variant of it.
 */
import { AppError } from '@autopilot/shared/errors.ts'
import type { SafeFetchResult } from '../safe-fetch.ts'

export interface FixtureResource {
  readonly body: string
  readonly status?: number
  readonly contentType?: string
  /** When set, the fetcher reports a redirect to this location. */
  readonly redirectTo?: string
}

export type FixtureSite = Record<string, FixtureResource>

export interface FixtureFetcher {
  (url: string, options?: unknown): Promise<SafeFetchResult>
  /** Every URL requested, in order. Lets tests assert politeness and scope. */
  readonly requests: string[]
}

export const createFixtureFetcher = (
  site: FixtureSite,
  options: { readonly failFor?: readonly string[] } = {},
): FixtureFetcher => {
  const requests: string[] = []

  const fetcher = async (url: string): Promise<SafeFetchResult> => {
    requests.push(url)

    if (options.failFor?.includes(url)) {
      throw new AppError({ code: 'FETCH_FAILED', message: `simulated failure for ${url}` })
    }

    // Tolerate trailing-slash differences the way a real server does.
    const resource = site[url] ?? site[url.replace(/\/$/, '')] ?? site[`${url}/`]
    if (!resource) {
      return {
        url,
        finalUrl: url,
        status: 404,
        headers: {},
        body: 'Not found',
        contentType: 'text/html',
        bytes: 9,
        redirects: [],
        durationMs: 1,
        truncated: false,
      }
    }

    const target = resource.redirectTo
    if (target) {
      const destination = site[target]
      if (!destination) {
        return {
          url,
          finalUrl: target,
          status: 404,
          headers: {},
          body: '',
          contentType: 'text/html',
          bytes: 0,
          redirects: [url],
          durationMs: 1,
          truncated: false,
        }
      }
      return {
        url,
        finalUrl: target,
        status: destination.status ?? 200,
        headers: {},
        body: destination.body,
        contentType: destination.contentType ?? 'text/html; charset=utf-8',
        bytes: destination.body.length,
        redirects: [url],
        durationMs: 1,
        truncated: false,
      }
    }

    return {
      url,
      finalUrl: url,
      status: resource.status ?? 200,
      headers: {},
      body: resource.body,
      contentType: resource.contentType ?? 'text/html; charset=utf-8',
      bytes: resource.body.length,
      redirects: [],
      durationMs: 1,
      truncated: false,
    }
  }

  return Object.assign(fetcher, { requests }) as FixtureFetcher
}

/** Convenience builder for fixture HTML pages. */
export const html = (options: {
  title?: string
  description?: string
  h1?: string
  lang?: string
  canonical?: string
  body?: string
  links?: string[]
  jsonLd?: unknown
  noindex?: boolean
}): string => {
  const head = [
    options.title ? `<title>${options.title}</title>` : '',
    options.description ? `<meta name="description" content="${options.description}">` : '',
    options.canonical ? `<link rel="canonical" href="${options.canonical}">` : '',
    options.noindex ? '<meta name="robots" content="noindex">' : '',
    options.jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(options.jsonLd)}</script>`
      : '',
  ].join('')

  const body = [
    options.h1 ? `<h1>${options.h1}</h1>` : '',
    options.body ?? '',
    ...(options.links ?? []).map((href) => `<a href="${href}">${href}</a>`),
  ].join('')

  return `<!doctype html><html lang="${options.lang ?? 'en'}"><head>${head}</head><body>${body}</body></html>`
}
