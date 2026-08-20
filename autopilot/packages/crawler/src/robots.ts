/**
 * robots.txt parsing and compliance.
 *
 * Respecting robots.txt is not optional for a product whose value proposition is being a
 * good citizen of the web. It is also the first thing a customer's SEO agency will check.
 */
export interface RobotsRule {
  readonly allow: boolean
  readonly path: string
}

export interface RobotsGroup {
  readonly userAgents: string[]
  readonly rules: RobotsRule[]
  readonly crawlDelaySeconds?: number
}

export interface RobotsTxt {
  readonly groups: RobotsGroup[]
  readonly sitemaps: string[]
  readonly raw: string
}

export const parseRobotsTxt = (content: string): RobotsTxt => {
  const groups: RobotsGroup[] = []
  const sitemaps: string[] = []
  let current: { userAgents: string[]; rules: RobotsRule[]; crawlDelaySeconds?: number } | null = null
  let lastWasUserAgent = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]!.trim()
    if (line.length === 0) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const field = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    switch (field) {
      case 'user-agent':
        // Consecutive User-agent lines share one group, per the specification.
        if (!lastWasUserAgent || current === null) {
          current = { userAgents: [], rules: [] }
          groups.push(current as RobotsGroup)
        }
        current.userAgents.push(value.toLowerCase())
        lastWasUserAgent = true
        break
      case 'disallow':
        if (current) current.rules.push({ allow: false, path: value })
        lastWasUserAgent = false
        break
      case 'allow':
        if (current) current.rules.push({ allow: true, path: value })
        lastWasUserAgent = false
        break
      case 'crawl-delay': {
        const delay = Number(value)
        if (current && Number.isFinite(delay)) current.crawlDelaySeconds = delay
        lastWasUserAgent = false
        break
      }
      case 'sitemap':
        sitemaps.push(value)
        lastWasUserAgent = false
        break
      default:
        lastWasUserAgent = false
    }
  }

  return { groups, sitemaps, raw: content }
}

const matchesPattern = (path: string, pattern: string): boolean => {
  if (pattern === '') return false
  const anchoredEnd = pattern.endsWith('$')
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern
  const segments = body.split('*')

  let index = 0
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!
    if (segment === '') continue
    const found = i === 0 ? (path.startsWith(segment) ? 0 : -1) : path.indexOf(segment, index)
    if (found === -1) return false
    index = found + segment.length
  }
  if (anchoredEnd && index !== path.length) return false
  return true
}

const groupFor = (robots: RobotsTxt, userAgent: string): RobotsGroup | null => {
  const ua = userAgent.toLowerCase()
  let wildcard: RobotsGroup | null = null
  let best: { group: RobotsGroup; length: number } | null = null

  for (const group of robots.groups) {
    for (const agent of group.userAgents) {
      if (agent === '*') {
        wildcard ??= group
      } else if (ua.includes(agent) && (!best || agent.length > best.length)) {
        // Most specific matching agent wins.
        best = { group, length: agent.length }
      }
    }
  }
  return best?.group ?? wildcard
}

/** Longest matching rule wins; Allow beats Disallow at equal length (Google's behaviour). */
export const isAllowed = (robots: RobotsTxt, url: string, userAgent: string): boolean => {
  const group = groupFor(robots, userAgent)
  if (!group) return true

  const path = (() => {
    try {
      const parsed = new URL(url)
      return parsed.pathname + parsed.search
    } catch {
      return url
    }
  })()

  let decision: { allow: boolean; length: number } | null = null
  for (const rule of group.rules) {
    if (!matchesPattern(path, rule.path)) continue
    const length = rule.path.length
    if (!decision || length > decision.length || (length === decision.length && rule.allow)) {
      decision = { allow: rule.allow, length }
    }
  }
  return decision?.allow ?? true
}

export const crawlDelayFor = (robots: RobotsTxt, userAgent: string): number | undefined =>
  groupFor(robots, userAgent)?.crawlDelaySeconds

/** Permissive default used when robots.txt is absent or unreachable — as crawlers do. */
export const EMPTY_ROBOTS: RobotsTxt = { groups: [], sitemaps: [], raw: '' }
