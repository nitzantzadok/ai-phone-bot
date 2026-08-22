/**
 * The only outbound HTTP path for customer-supplied URLs.
 *
 * Beyond SSRF validation this enforces the resource limits that keep one hostile or broken
 * site from consuming the crawler: byte cap (streamed, so a 10GB response is aborted
 * rather than buffered), total time cap, content-type allowlist and a bounded, fully
 * re-validated redirect chain.
 */
import { Agent, ProxyAgent, type Dispatcher, request } from 'undici'
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
  /**
   * Egress proxy to tunnel through, e.g. `http://127.0.0.1:3128`. Defaults to the
   * HTTPS_PROXY environment variable. Pass `null` to force a direct connection even
   * when the environment sets one.
   */
  readonly proxyUrl?: string | null
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
 * Resolves the egress proxy for a host, honouring NO_PROXY.
 *
 * Plenty of production networks — and every locked-down corporate one — refuse direct
 * outbound connections. Without this the crawler simply times out there, which looks
 * like "the customer's site is down" rather than "we cannot reach the internet".
 */
const NO_PROXY_ENTRIES = (process.env.NO_PROXY ?? process.env.no_proxy ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0)

const bypassesProxy = (hostname: string): boolean => {
  const host = hostname.toLowerCase()
  return NO_PROXY_ENTRIES.some((entry) => {
    if (entry === '*') return true
    const bare = entry.startsWith('.') ? entry.slice(1) : entry
    return host === bare || host.endsWith(`.${bare}`)
  })
}

const proxyFor = (target: ValidatedTarget, options: SafeFetchOptions): string | null => {
  if (options.proxyUrl === null) return null
  const configured = options.proxyUrl ?? process.env.HTTPS_PROXY ?? process.env.https_proxy
  if (!configured) return null
  if (bypassesProxy(target.url.hostname)) return null
  return configured
}

/**
 * Pins the connection to the address we validated. Without this the OS would resolve the
 * hostname again at connect time, reopening the rebinding window we just closed.
 *
 * The callback has two shapes and the caller picks which one by setting `all`. undici's
 * connector asks for `all: true` and then reads `addresses[0].address`, so answering that
 * call with a bare string produces "Invalid IP address: undefined" at connect time — the
 * pin silently fails closed and no real host is ever reachable. Both shapes are answered
 * here, from the same validated address.
 */
const pinnedAgent = (target: ValidatedTarget, timeoutMs: number): Agent => {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (typeof options === 'object' && options !== null && options.all === true) {
      ;(
        callback as unknown as (
          err: Error | null,
          addresses: { address: string; family: number }[],
        ) => void
      )(null, [{ address: target.address, family: target.family }])
      return
    }
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
 * Builds the dispatcher for one hop.
 *
 * Through a proxy the IP pin is necessarily given up: the proxy, not us, opens the socket
 * and resolves the name. That is a deliberate trade, and a narrow one — the URL has still
 * been fully validated (scheme, port, hostname, and every DNS answer) before we get here,
 * and an operator who put an egress proxy in the path has substituted their own policy
 * boundary for ours, which is the stronger of the two. What we must not do is pretend the
 * pin still holds, so the proxy in use is logged on every hop.
 */
const dispatcherFor = (
  target: ValidatedTarget,
  timeoutMs: number,
  options: SafeFetchOptions,
  logger: Logger,
): { dispatcher: Dispatcher; close: () => Promise<void> } => {
  const proxy = proxyFor(target, options)
  if (proxy) {
    logger.debug('safe-fetch proxying', { host: target.url.hostname, proxy })
    const agent = new ProxyAgent({
      uri: proxy,
      requestTls: { timeout: timeoutMs },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    })
    return { dispatcher: agent, close: () => agent.close() }
  }
  const agent = pinnedAgent(target, timeoutMs)
  return { dispatcher: agent, close: () => agent.close() }
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

/**
 * Decodes a response body using the charset the server (or the document) declares.
 *
 * Decoding everything as UTF-8 is right almost everywhere and wrong in exactly the market
 * this product launches in: a large number of older Israeli business sites still serve
 * windows-1255. Read as UTF-8 those pages become mojibake, so the business name, the city
 * and every Hebrew attribute silently fail to extract — and the report tells a business
 * with a perfectly good site that it states nothing about itself. A confidently false
 * report is worse than none, so the declared charset is honoured.
 *
 * The header wins when it names a charset. Otherwise the first bytes are sniffed for a
 * meta declaration, which is where a page served without one puts it.
 */
const META_CHARSET = /<meta[^>]+charset=["']?\s*([\w-]+)/i
const META_HTTP_EQUIV = /<meta[^>]+content=["'][^"']*charset=\s*([\w-]+)/i

const charsetFrom = (contentType: string | null, head: Buffer): string => {
  const declared = contentType?.match(/charset=\s*"?([\w-]+)"?/i)?.[1]
  if (declared) return declared.toLowerCase()

  // Latin-1 never fails, and the meta tag is ASCII in every encoding we care about.
  const ascii = head.toString('latin1')
  const sniffed = ascii.match(META_CHARSET)?.[1] ?? ascii.match(META_HTTP_EQUIV)?.[1]
  return (sniffed ?? 'utf-8').toLowerCase()
}

const decodeBody = (buffer: Buffer, contentType: string | null, logger: Logger): string => {
  const charset = charsetFrom(contentType, buffer.subarray(0, 2048))
  if (charset === 'utf-8' || charset === 'utf8') return buffer.toString('utf8')
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    // An unknown label is not a reason to fail the fetch; UTF-8 is the better guess than
    // nothing, and the page may well be UTF-8 with a mislabelled header.
    logger.debug('unknown charset, falling back to utf-8', { charset })
    return buffer.toString('utf8')
  }
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
    const { dispatcher: agent } = dispatcherFor(target, timeoutMs, options, logger)

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
        body: decodeBody(Buffer.concat(chunks), contentType, logger),
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
