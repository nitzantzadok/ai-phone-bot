/**
 * Bounds on the public scan endpoint.
 *
 * `/scan` fetches a URL a stranger typed, from our infrastructure. The SSRF layer decides
 * *where* it may go; this decides *how often*, because an unbounded public crawler is a
 * denial-of-service tool with our return address on it — pointed either at someone else's
 * website or at our own hosting bill.
 *
 * The counter is per-instance and in-memory, which is honest about what it is: a brake on
 * casual abuse, not a distributed rate limiter. On a platform that runs several instances
 * the real ceiling is this times the instance count. When the product has Redis in front
 * of it, this moves there; until then a small ceiling per instance is much better than
 * none, and the failure mode (a legitimate user occasionally told to wait) is mild.
 */
export interface RateLimitVerdict {
  readonly allowed: boolean
  /** Seconds until the caller may try again. Only meaningful when `allowed` is false. */
  readonly retryAfterSeconds: number
}

const WINDOW_MS = 10 * 60 * 1000

/**
 * Two ceilings, because there are two different things to protect and only one of them was
 * being protected.
 *
 * The per-caller limit is about our own bill: one person cannot spend our crawl budget all
 * afternoon. That is the limit that existed.
 *
 * The per-target limit is about somebody else's website — which is what the page has always
 * told the customer the limit was for. It was not true. A per-caller counter does nothing
 * against the case that actually matters: many callers, from many addresses, all pointed at
 * one small business's shared hosting. That is a distributed load on a stranger's site with
 * our return address on it, and it is the shape abuse actually takes on a public scanner.
 *
 * The per-caller ceiling is the more generous of the two: somebody scanning their own site,
 * then a competitor's, then their own again after a fix is a good afternoon for this
 * product, not abuse.
 */
const MAX_PER_CALLER = 8
const MAX_PER_TARGET = 4

const callers = new Map<string, number[]>()
const targets = new Map<string, number[]>()

/** Keeps a map from growing without bound on a long-lived instance. */
const prune = (map: Map<string, number[]>, now: number): void => {
  if (map.size < 1000) return
  for (const [key, times] of map) {
    const live = times.filter((t) => now - t < WINDOW_MS)
    if (live.length === 0) map.delete(key)
    else map.set(key, live)
  }
}

const check = (
  map: Map<string, number[]>,
  key: string,
  ceiling: number,
  now: number,
): RateLimitVerdict => {
  prune(map, now)
  const recent = (map.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= ceiling) {
    const oldest = recent[0]!
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    }
  }
  recent.push(now)
  map.set(key, recent)
  return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * The site a scan is pointed at, which is the thing a per-target ceiling protects.
 *
 * The port is part of the identity. In production it never appears — anything but 80 or
 * 443 is refused at the field — but in local development every fixture server lives on
 * `127.0.0.1` at a different port, and keying on the hostname alone made three separate
 * test sites share one budget, so a walk through the product ran out of allowance
 * scanning its own fixtures.
 */
const targetKey = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.port === '' ? parsed.hostname.toLowerCase() : `${parsed.hostname.toLowerCase()}:${parsed.port}`
  } catch {
    return url.toLowerCase()
  }
}

/**
 * Whether this scan may run.
 *
 * Charged against the caller first. A caller who is already over their own ceiling must not
 * also consume the target's allowance on the way to being refused — otherwise one person
 * hammering refresh locks a business's own site out of being scanned by anybody.
 */
export const checkRateLimit = (
  key: string,
  targetUrl = '',
  now = Date.now(),
): RateLimitVerdict => {
  const caller = check(callers, key, MAX_PER_CALLER, now)
  if (!caller.allowed) return caller
  if (targetUrl === '') return caller
  return check(targets, targetKey(targetUrl), MAX_PER_TARGET, now)
}

/** Test seam. */
export const resetRateLimits = (): void => {
  callers.clear()
  targets.clear()
}

/**
 * Whatever a person typed, classified.
 *
 * Lives in `@autopilot/insights` rather than here: it carries the customer-facing sentence
 * for every way an address can fail, which is the same job the rest of that package does,
 * and it has to be identical in the web app and on the command line.
 */
export { classifySiteUrl, explainSiteUrl, normalizeSiteUrl } from '@autopilot/insights/site-url.ts'
export type { SiteUrlProblem, SiteUrlVerdict } from '@autopilot/insights/site-url.ts'
