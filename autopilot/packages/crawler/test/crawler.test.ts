import { describe, expect, it } from 'vitest'
import { crawlSite } from '../src/crawler.ts'
import { createFixtureFetcher, html, type FixtureSite } from '../src/testing/fixture-site.ts'

const ROOT = 'https://rosa.example.com'

const site = (): FixtureSite => ({
  [`${ROOT}/robots.txt`]: {
    body: `User-agent: *\nDisallow: /admin\nSitemap: ${ROOT}/sitemap.xml`,
    contentType: 'text/plain',
  },
  [`${ROOT}/sitemap.xml`]: {
    body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>${ROOT}/</loc></url>
      <url><loc>${ROOT}/menu</loc></url>
    </urlset>`,
    contentType: 'application/xml',
  },
  [`${ROOT}/`]: {
    body: html({
      title: 'Rosa - Italian restaurant in Tel Aviv',
      description: 'Handmade pasta in central Tel Aviv, open every evening.',
      h1: 'Rosa',
      canonical: `${ROOT}/`,
      links: [`${ROOT}/menu`, `${ROOT}/contact`, `${ROOT}/admin`, 'https://external.example.com/'],
      body: '<p>Handmade pasta since 2011.</p>',
    }),
  },
  [`${ROOT}/menu`]: {
    body: html({ title: 'Menu', h1: 'Menu', links: [`${ROOT}/`] }),
  },
  [`${ROOT}/contact`]: {
    body: html({ title: 'Contact Rosa', h1: 'Contact', links: [`${ROOT}/gone`] }),
  },
  [`${ROOT}/gone`]: { body: 'gone', status: 404 },
  [`${ROOT}/admin`]: { body: html({ title: 'Admin', h1: 'Admin' }) },
  [`${ROOT}/old-menu`]: { body: '', redirectTo: `${ROOT}/menu` },
})

describe('crawlSite', () => {
  it('crawls a small site, following internal links only', async () => {
    const fetcher = createFixtureFetcher(site())
    const result = await crawlSite(`${ROOT}/`, { fetcher, requestsPerSecond: 1000 })

    const urls = result.pages.map((p) => p.url).sort()
    expect(urls).toContain(`${ROOT}/`)
    expect(urls).toContain(`${ROOT}/menu`)
    expect(urls).toContain(`${ROOT}/contact`)
    expect(result.pages.some((p) => p.url.includes('external.example.com'))).toBe(false)
    expect(result.stoppedBecause).toBe('COMPLETE')
  })

  it('respects robots.txt Disallow', async () => {
    const fetcher = createFixtureFetcher(site())
    const result = await crawlSite(`${ROOT}/`, { fetcher, requestsPerSecond: 1000 })
    expect(result.robotsTxtFound).toBe(true)
    expect(result.pages.some((p) => p.url.endsWith('/admin'))).toBe(false)
    expect(fetcher.requests).not.toContain(`${ROOT}/admin`)
  })

  it('can be told to ignore robots for a customer own verified property', async () => {
    const fetcher = createFixtureFetcher(site())
    const result = await crawlSite(`${ROOT}/`, {
      fetcher,
      requestsPerSecond: 1000,
      respectRobots: false,
    })
    expect(result.pages.some((p) => p.url.endsWith('/admin'))).toBe(true)
  })

  it('discovers the sitemap declared in robots.txt', async () => {
    const result = await crawlSite(`${ROOT}/`, {
      fetcher: createFixtureFetcher(site()),
      requestsPerSecond: 1000,
    })
    expect(result.sitemapFound).toBe(true)
    expect(result.sitemapUrls).toContain(`${ROOT}/menu`)
  })

  it('records broken pages as findings and errors rather than crashing', async () => {
    const result = await crawlSite(`${ROOT}/`, {
      fetcher: createFixtureFetcher(site()),
      requestsPerSecond: 1000,
    })
    expect(result.errors.some((e) => e.url.endsWith('/gone'))).toBe(true)
    expect(result.findings.some((f) => f.findingType === 'BROKEN_LINK')).toBe(true)
  })

  it('honours maxPages', async () => {
    const result = await crawlSite(`${ROOT}/`, {
      fetcher: createFixtureFetcher(site()),
      requestsPerSecond: 1000,
      maxPages: 2,
    })
    expect(result.pages.length).toBeLessThanOrEqual(2)
    expect(result.stoppedBecause).toBe('MAX_PAGES')
  })

  it('never fetches the same URL twice', async () => {
    const fetcher = createFixtureFetcher(site())
    await crawlSite(`${ROOT}/`, { fetcher, requestsPerSecond: 1000 })
    const pageRequests = fetcher.requests.filter((u) => !u.includes('robots') && !u.includes('sitemap'))
    expect(new Set(pageRequests).size).toBe(pageRequests.length)
  })

  it('strips tracking parameters so one page is not crawled many times', async () => {
    const withTracking = site()
    withTracking[`${ROOT}/`] = {
      body: html({
        title: 'Rosa',
        h1: 'Rosa',
        links: [`${ROOT}/menu?utm_source=fb`, `${ROOT}/menu?utm_source=google`, `${ROOT}/menu`],
      }),
    }
    const fetcher = createFixtureFetcher(withTracking)
    await crawlSite(`${ROOT}/`, { fetcher, requestsPerSecond: 1000 })
    expect(fetcher.requests.filter((u) => u.includes('/menu')).length).toBe(1)
  })

  it('skips binary assets', async () => {
    const withAssets = site()
    withAssets[`${ROOT}/`] = {
      body: html({
        title: 'Rosa',
        h1: 'Rosa',
        links: [`${ROOT}/hero.jpg`, `${ROOT}/app.js`, `${ROOT}/brochure.pdf`, `${ROOT}/menu`],
      }),
    }
    const fetcher = createFixtureFetcher(withAssets)
    await crawlSite(`${ROOT}/`, { fetcher, requestsPerSecond: 1000 })
    expect(fetcher.requests.some((u) => u.endsWith('.jpg'))).toBe(false)
    expect(fetcher.requests.some((u) => u.endsWith('.pdf'))).toBe(false)
  })

  it('survives a site with no robots.txt and no sitemap', async () => {
    const bare: FixtureSite = {
      [`${ROOT}/`]: { body: html({ title: 'Bare', h1: 'Bare' }) },
    }
    const result = await crawlSite(`${ROOT}/`, {
      fetcher: createFixtureFetcher(bare),
      requestsPerSecond: 1000,
    })
    expect(result.robotsTxtFound).toBe(false)
    expect(result.sitemapFound).toBe(false)
    expect(result.pages).toHaveLength(1)
    expect(result.findings.some((f) => f.findingType === 'NO_SITEMAP')).toBe(true)
  })

  it('continues when individual pages fail', async () => {
    const fetcher = createFixtureFetcher(site(), { failFor: [`${ROOT}/menu`] })
    const result = await crawlSite(`${ROOT}/`, { fetcher, requestsPerSecond: 1000 })
    expect(result.errors.some((e) => e.url === `${ROOT}/menu`)).toBe(true)
    expect(result.pages.length).toBeGreaterThan(0)
  })

  it('classifies page types so missing page types can be detected', async () => {
    const result = await crawlSite(`${ROOT}/`, {
      fetcher: createFixtureFetcher(site()),
      requestsPerSecond: 1000,
    })
    const types = new Set(result.pages.map((p) => p.pageType))
    expect(types.has('home')).toBe(true)
    expect(types.has('menu')).toBe(true)
    expect(types.has('contact')).toBe(true)
  })
})
