/**
 * The only outbound HTTP path for customer-supplied URLs.
 *
 * Beyond SSRF validation this enforces the resource limits that keep one hostile or broken
 * site from consuming the crawler: byte cap (streamed, so a 10GB response is aborted
 * rather than buffered), total time cap, content-type allowlist and a bounded, fully
 * re-validated redirect chain.
 */
import { Agent, request } from 'undici'
import type { LookupFunction } from 'node:net'
import { AppError } from '@autopilot/shared/errors.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import { DEFAULT_SSRF_POLICY, validateUrl, type SsrfPolicy, type ValidatedTarget } from './ssrf.ts'

export interface SafeFetchOptions {
  readonly policy?: SsrfPolicy
  readonly userAgent?: string
  readonly timeoutMs?: number
  readonly maxBytes?: number
  readonly acceptTypes?: readonly string[]
  readonly logger?: Logger
  readonly headers?: Record<string, string>
}

export interface SafeFetchResult {
  readonly url: string
  /** The final URL after redirects — what the content actually belongs to. */
  readonly finalUrl: string
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
  readonly contentType: string | null
  readonly bytes: number
  readonly redirects: readonly string[]
  readonly durationMs: number
  readonly truncated: boolean
}

const DEFAULT_ACCEPT = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/xml',
  'text/xml',
  'application/json',
  'application/ld+json',
]

/**
 * Pins the connection to the address we validated. Without this the OS would resolve the
 * hostname again at connect time, reopening the rebinding window we just closed.
 */
const pinnedAgent = (target: ValidatedTarget, timeoutMs: number): Agent => {
  const lookup: LookupFunction = (_hostname, _options, callback) => {
    ;(callback as (err: Error | null, address: string, family: number) => void)(
      null,
      target.address,
      target.family,
    )
  }
  return new Agent({
    connect: { lookup, timeout: timeoutMs },
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  })
}

/**
 * Abandons a response body we are not going to read.
 *
 * `destroy()` makes undici emit an AbortError on the stream; with no listener that becomes
 * an unhandled rejection that can take down a worker. Attaching the no-op handler first is
 * the difference between discarding a body and crashing the process.
 */
const discardBody = (body: { destroy: () => void; on: (event: string, cb: () => void) => void }): void => {
  body.on('error', () => {})
  body.destroy()
}

export const safeFetch = async (
  input: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> => {
  const policy = options.policy ?? DEFAULT_SSRF_POLICY
  const timeoutMs = options.timeoutMs ?? 15_000
  const maxBytes = options.maxBytes ?? 5_000_000
  const accept = options.acceptTypes ?? DEFAULT_ACCEPT
  const logger = options.logger ?? noopLogger
  const started = Date.now()

  const redirects: string[] = []
  let current = input

  for (let hop = 0; hop <= policy.maxRedirects; hop++) {
    // Re-validated on EVERY hop. A public host that redirects to 127.0.0.1 dies here.
    const target = await validateUrl(current, policy)
    const agent = pinnedAgent(target, timeoutMs)

    try {
      const response = await request(target.url.toString(), {
        method: 'GET',
        // The agent has no redirect interceptor, so undici never follows a 3xx itself.
        // Every hop is handled by the loop above and re-validated.
        dispatcher: agent,
        headers: {
          'user-agent': options.userAgent ?? 'AIRecommendationAutopilotBot/0.1',
          accept: accept.join(', '),
          'accept-language': 'he-IL,he;q=0.9,en;q=0.8',
          ...options.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      const headers = normalizeHeaders(response.headers)
      const location = headers.location

      if (response.statusCode >= 300 && response.statusCode < 400 && location) {
        discardBody(response.body)
        if (hop === policy.maxRedirects) {
          throw new AppError({
            code: 'FETCH_FAILED',
            message: `Too many redirects starting at ${input}`,
            details: { redirects },
          })
        }
        redirects.push(current)
        current = new URL(location, target.url).toString()
        continue
      }

      const contentType = headers['content-type'] ?? null
      if (contentType && !accept.some((t) => contentType.includes(t))) {
        discardBody(response.body)
        throw new AppError({
          code: 'FETCH_FAILED',
          message: `Unsupported content type ${contentType}`,
          details: { contentType, url: current },
          retryable: false,
        })
      }

      // Streamed with a running byte count: a huge body is aborted, never buffered whole.
      const chunks: Buffer[] = []
      let bytes = 0
      let truncated = false
      response.body.on('error', () => {})
      for await (const chunk of response.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
        if (bytes + buf.length > maxBytes) {
          chunks.push(buf.subarray(0, maxBytes - bytes))
          bytes = maxBytes
          truncated = true
          break
        }
        chunks.push(buf)
        bytes += buf.length
      }
      if (truncated) discardBody(response.body)

      return {
        url: input,
        finalUrl: target.url.toString(),
        status: response.statusCode,
        headers,
        body: Buffer.concat(chunks).toString('utf8'),
        contentType,
        bytes,
        redirects,
        durationMs: Date.now() - started,
        truncated,
      }
    } catch (e) {
      if (e instanceof AppError) throw e
      const message = e instanceof Error ? e.message : String(e)
      logger.debug('fetch failed', { url: current, err: message })
      throw new AppError({
        code: 'FETCH_FAILED',
        message: `Failed to fetch ${current}: ${message}`,
        retryable: true,
        details: { url: current },
        cause: e,
      })
    } finally {
      void agent.close()
    }
  }

  throw new AppError({ code: 'FETCH_FAILED', message: `Redirect loop for ${input}` })
}

const normalizeHeaders = (
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v
  }
  return out
}
