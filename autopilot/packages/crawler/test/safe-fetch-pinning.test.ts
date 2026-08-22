/**
 * Regression tests for connection pinning.
 *
 * These exist because of a bug that every other test in the suite was structurally unable
 * to catch. The pinned `lookup` answered undici with a bare address string, but undici's
 * connector asks with `all: true` and then reads `addresses[0].address` — so it received
 * `undefined` and every connection died with "Invalid IP address: undefined".
 *
 * Nothing caught it because Node's `net.connect` skips DNS entirely for an IP literal, and
 * every existing integration test targets `127.0.0.1`. The pin therefore never ran, and
 * the crawler could not fetch a single real website — a hostname is exactly what every
 * customer URL has.
 *
 * So the rule these tests encode: at least one path through `safeFetch` must go through a
 * hostname, not an address.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { safeFetch } from '../src/safe-fetch.ts'
import { DEFAULT_SSRF_POLICY } from '../src/ssrf.ts'

let server: Server
let port = 0

/**
 * `localhost` is a hostname, so the connector resolves it and the pin runs. It is also on
 * the default blocklist, which is correct in production and has to be lifted here.
 */
const hostnamePolicy = {
  ...DEFAULT_SSRF_POLICY,
  allowPrivateHosts: true,
  blockedHostnames: [] as string[],
  allowedPorts: [] as number[],
}

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<html><head><title>Pinned</title></head><body>reached</body></html>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
  hostnamePolicy.allowedPorts.push(port)
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('pinned connection through a hostname', () => {
  it('reaches a host addressed by name, not only by IP literal', async () => {
    const result = await safeFetch(`http://localhost:${port}/`, { policy: hostnamePolicy })

    expect(result.status).toBe(200)
    expect(result.body).toContain('reached')
  })

  it('still pins: the hostname is resolved once, by us', async () => {
    // Two sequential fetches through the same hostname must both succeed. A pin that
    // answers the connector's contract incorrectly fails on the very first connect, so
    // this also guards the "works once by luck" shape of the bug.
    const first = await safeFetch(`http://localhost:${port}/`, { policy: hostnamePolicy })
    const second = await safeFetch(`http://localhost:${port}/`, { policy: hostnamePolicy })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
  })

  it('refuses a private hostname when the policy does not permit private hosts', async () => {
    await expect(
      safeFetch(`http://localhost:${port}/`, {
        policy: { ...hostnamePolicy, allowPrivateHosts: false },
      }),
    ).rejects.toThrow()
  })
})
