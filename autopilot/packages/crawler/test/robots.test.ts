import { describe, expect, it } from 'vitest'
import { EMPTY_ROBOTS, crawlDelayFor, isAllowed, parseRobotsTxt } from '../src/robots.ts'

const UA = 'AIRecommendationAutopilotBot/0.1'

describe('parseRobotsTxt', () => {
  it('parses groups, rules, crawl-delay and sitemaps', () => {
    const robots = parseRobotsTxt(`
      # comment
      User-agent: *
      Disallow: /admin
      Allow: /admin/public
      Crawl-delay: 2

      User-agent: BadBot
      Disallow: /

      Sitemap: https://example.com/sitemap.xml
      Sitemap: https://example.com/sitemap-news.xml
    `)
    expect(robots.groups).toHaveLength(2)
    expect(robots.sitemaps).toHaveLength(2)
    expect(crawlDelayFor(robots, UA)).toBe(2)
  })

  it('treats consecutive user-agent lines as one group', () => {
    const robots = parseRobotsTxt(`
      User-agent: GoogleBot
      User-agent: BingBot
      Disallow: /private
    `)
    expect(robots.groups).toHaveLength(1)
    expect(robots.groups[0]!.userAgents).toEqual(['googlebot', 'bingbot'])
  })

  it('ignores comments and malformed lines', () => {
    const robots = parseRobotsTxt('# just a comment\nnonsense line\nUser-agent: *\nDisallow: /x')
    expect(robots.groups).toHaveLength(1)
    expect(isAllowed(robots, 'https://e.com/x', UA)).toBe(false)
  })
})

describe('isAllowed', () => {
  it('allows everything when there are no rules', () => {
    expect(isAllowed(EMPTY_ROBOTS, 'https://e.com/anything', UA)).toBe(true)
  })

  it('honours a simple disallow', () => {
    const robots = parseRobotsTxt('User-agent: *\nDisallow: /admin')
    expect(isAllowed(robots, 'https://e.com/admin', UA)).toBe(false)
    expect(isAllowed(robots, 'https://e.com/admin/settings', UA)).toBe(false)
    expect(isAllowed(robots, 'https://e.com/public', UA)).toBe(true)
  })

  it('lets a longer Allow override a shorter Disallow', () => {
    const robots = parseRobotsTxt('User-agent: *\nDisallow: /admin\nAllow: /admin/public')
    expect(isAllowed(robots, 'https://e.com/admin/secret', UA)).toBe(false)
    expect(isAllowed(robots, 'https://e.com/admin/public/page', UA)).toBe(true)
  })

  it('supports wildcards and end anchors', () => {
    const robots = parseRobotsTxt('User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?*')
    expect(isAllowed(robots, 'https://e.com/files/report.pdf', UA)).toBe(false)
    expect(isAllowed(robots, 'https://e.com/files/report.pdf.html', UA)).toBe(true)
    expect(isAllowed(robots, 'https://e.com/search?q=x', UA)).toBe(false)
  })

  it('treats an empty Disallow as allow-all', () => {
    const robots = parseRobotsTxt('User-agent: *\nDisallow:')
    expect(isAllowed(robots, 'https://e.com/anything', UA)).toBe(true)
  })

  it('prefers the most specific matching user-agent group', () => {
    const robots = parseRobotsTxt(
      'User-agent: *\nDisallow: /\n\nUser-agent: airecommendationautopilotbot\nDisallow: /private',
    )
    expect(isAllowed(robots, 'https://e.com/public', UA)).toBe(true)
    expect(isAllowed(robots, 'https://e.com/private', UA)).toBe(false)
    expect(isAllowed(robots, 'https://e.com/public', 'SomeOtherBot')).toBe(false)
  })

  it('blocks our crawler when the site blocks everyone', () => {
    const robots = parseRobotsTxt('User-agent: *\nDisallow: /')
    expect(isAllowed(robots, 'https://e.com/', UA)).toBe(false)
  })
})
