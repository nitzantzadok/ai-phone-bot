/**
 * safeFetch integration tests against a real local HTTP server.
 *
 * The unit tests prove the URL validator's logic; these prove the fetch path actually
 * enforces it — pinned connection, re-validated redirects, streamed byte cap, content-type
 * allowlist and timeout — with real sockets rather than mocks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { safeFetch } from '../src/safe-fetch.ts'
import { DEFAULT_SSRF_POLICY } from '../src/ssrf.ts'

let server: Server
let base: string

/** Local fixtures require the development escape hatch; production forbids it. */
const localPolicy = { ...DEFAULT_SSRF_POLICY, allowPrivateHosts: true, allowedPorts: [] as number[] }

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    switch (url.pathname) {
      case '/':
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<html><head><title>Hello</title></head><body>ok</body></html>')
        return
      case '/redirect':
        res.writeHead(302, { location: '/' })
        res.end()
        return
      case '/redirect-to-file':
        res.writeHead(302, { location: 'file:///etc/passwd' })
        res.end()
        return
      case '/redirect-loop':
        res.writeHead(302, { location: '/redirect-loop' })
        res.end()
        return
      case '/big':
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('x'.repeat(200_000))
        return
      case '/binary':
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end('binary')
        return
      case '/slow':
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'text/html' })
          res.end('late')
        }, 2000)
        return
      case '/notfound':
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('missing')
        return
      default:
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('default')
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  base = `http://127.0.0.1:${address.port}`
  localPolicy.allowedPorts.push(address.port)
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('safeFetch over a real socket', () => {
  it('fetches a page and reports the final URL', async () => {
    const result = await safeFetch(`${base}/`, { policy: localPolicy })
    expect(result.status).toBe(200)
    expect(result.body).toContain('Hello')
    expect(result.contentType).toContain('text/html')
    expect(result.redirects).toHaveLength(0)
  })

  it('follows a redirect and records the hop', async () => {
    const result = await safeFetch(`${base}/redirect`, { policy: localPolicy })
    expect(result.status).toBe(200)
    expect(result.finalUrl).toBe(`${base}/`)
    expect(result.redirects).toEqual([`${base}/redirect`])
  })

  it('re-validates every redirect hop and refuses a dangerous target', async () => {
    // The classic bypass: a reachable host 302s somewhere the validator would have refused.
    await expect(
      safeFetch(`${base}/redirect-to-file`, { policy: localPolicy }),
    ).rejects.toMatchObject({ code: 'UNSAFE_URL' })
  })

  it('bounds a redirect loop instead of spinning', async () => {
    await expect(safeFetch(`${base}/redirect-loop`, { policy: localPolicy })).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    })
  })

  it('truncates a response at the byte cap rather than buffering it whole', async () => {
    const result = await safeFetch(`${base}/big`, { policy: localPolicy, maxBytes: 1000 })
    expect(result.truncated).toBe(true)
    expect(result.bytes).toBe(1000)
    expect(result.body.length).toBe(1000)
  })

  it('rejects a content type outside the allowlist', async () => {
    await expect(safeFetch(`${base}/binary`, { policy: localPolicy })).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    })
  })

  it('times out a slow response', async () => {
    await expect(
      safeFetch(`${base}/slow`, { policy: localPolicy, timeoutMs: 200 }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' })
  })

  it('returns 404 as a result, not an exception, so the audit can report it', async () => {
    const result = await safeFetch(`${base}/notfound`, { policy: localPolicy })
    expect(result.status).toBe(404)
  })

  it('refuses the same local URL under the production policy', async () => {
    await expect(safeFetch(`${base}/`)).rejects.toMatchObject({ code: 'UNSAFE_URL' })
  })
})
