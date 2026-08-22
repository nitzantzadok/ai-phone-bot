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
const MAX_PER_WINDOW = 5

const hits = new Map<string, number[]>()

/** Keeps the map from growing without bound on a long-lived instance. */
const prune = (now: number): void => {
  if (hits.size < 1000) return
  for (const [key, times] of hits) {
    const live = times.filter((t) => now - t < WINDOW_MS)
    if (live.length === 0) hits.delete(key)
    else hits.set(key, live)
  }
}

export const checkRateLimit = (key: string, now = Date.now()): RateLimitVerdict => {
  prune(now)
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)

  if (recent.length >= MAX_PER_WINDOW) {
    const oldest = recent[0]!
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    }
  }

  recent.push(now)
  hits.set(key, recent)
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Test seam. */
export const resetRateLimits = (): void => {
  hits.clear()
}

/**
 * Normalises whatever a person typed into a URL we can attempt.
 *
 * People type "example.co.il", "www.example.co.il/", and "Example.CO.IL " — none of which
 * parse as a URL, and all of which mean the same site. Refusing them would lose real
 * customers at the first field of the funnel.
 */
export const normalizeSiteUrl = (raw: string): string | null => {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 2000) return null

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}
