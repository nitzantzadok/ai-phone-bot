/**
 * SSRF test suite.
 *
 * These are the tests that decide whether a signed-up attacker can use our crawler to
 * reach our own infrastructure. Each blocked class is asserted explicitly rather than
 * through one representative case, because a regression in any single range is a full
 * compromise of the boundary.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SSRF_POLICY, isBlockedIp, registrableDomain, validateUrl } from '../src/ssrf.ts'

/** Stub resolver: makes DNS behaviour explicit and hermetic. */
const resolverFor = (map: Record<string, string[]>) =>
  (async (hostname: string) => {
    const addresses = map[hostname]
    if (!addresses) throw new Error(`ENOTFOUND ${hostname}`)
    return addresses.map((address) => ({
      address,
      family: address.includes(':') ? 6 : 4,
    }))
    // oxlint-disable-next-line no-explicit-any
  }) as any

describe('isBlockedIp - IPv4', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback range'],
    ['0.0.0.0', 'this network'],
    ['10.0.0.1', 'RFC1918 class A'],
    ['172.16.0.1', 'RFC1918 class B lower'],
    ['172.31.255.255', 'RFC1918 class B upper'],
    ['192.168.1.1', 'RFC1918 class C'],
    ['169.254.169.254', 'cloud metadata'],
    ['169.254.0.1', 'link-local'],
    ['100.64.0.1', 'CGNAT'],
    ['100.100.100.200', 'Alibaba metadata inside CGNAT'],
    ['192.0.0.1', 'IETF assignments'],
    ['192.0.2.1', 'TEST-NET-1'],
    ['198.18.0.1', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(true)
  })

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['93.184.216.34'],
    ['172.32.0.1'],
    ['172.15.255.255'],
    ['11.0.0.1'],
    ['100.63.255.255'],
    ['100.128.0.1'],
  ])('allows public address %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false)
  })

  it('gets the RFC1918 class B boundaries exactly right', () => {
    expect(isBlockedIp('172.15.255.255')).toBe(false)
    expect(isBlockedIp('172.16.0.0')).toBe(true)
    expect(isBlockedIp('172.31.255.255')).toBe(true)
    expect(isBlockedIp('172.32.0.0')).toBe(false)
  })
})

describe('isBlockedIp - IPv6', () => {
  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique local'],
    ['fd00::1', 'unique local'],
    ['fe80::1', 'link-local'],
    ['febf::1', 'link-local upper'],
    ['ff02::1', 'multicast'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['2002:7f00:0001::', '6to4 wrapping loopback'],
    ['64:ff9b::7f00:1', 'NAT64 wrapping loopback'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(true)
  })

  it.each([['2001:4860:4860::8888'], ['2606:4700:4700::1111']])('allows public %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false)
  })

  it('fails closed on an unparseable address', () => {
    expect(isBlockedIp('not:an:address:at:all:x:y:z:q')).toBe(true)
  })
})

describe('validateUrl', () => {
  const publicDns = resolverFor({ 'example.com': ['93.184.216.34'] })

  it('accepts a normal public https URL', async () => {
    const result = await validateUrl('https://example.com/page', DEFAULT_SSRF_POLICY, publicDns)
    expect(result.address).toBe('93.184.216.34')
    expect(result.family).toBe(4)
  })

  it.each([
    ['file:///etc/passwd'],
    ['gopher://example.com/'],
    ['ftp://example.com/'],
    ['data:text/html,<script>1</script>'],
    ['jar:http://example.com/!/'],
  ])('rejects scheme in %s', async (url) => {
    await expect(validateUrl(url, DEFAULT_SSRF_POLICY, publicDns)).rejects.toMatchObject({
      code: 'UNSAFE_URL',
    })
  })

  it('rejects embedded credentials used to confuse host parsing', async () => {
    await expect(
      validateUrl('https://user:pass@example.com/', DEFAULT_SSRF_POLICY, publicDns),
    ).rejects.toMatchObject({ code: 'UNSAFE_URL' })
  })

  it('rejects a non-allowlisted port such as a database', async () => {
    await expect(
      validateUrl('http://example.com:5432/', DEFAULT_SSRF_POLICY, publicDns),
    ).rejects.toMatchObject({ code: 'UNSAFE_URL' })
    await expect(
      validateUrl('http://example.com:6379/', DEFAULT_SSRF_POLICY, publicDns),
    ).rejects.toMatchObject({ code: 'UNSAFE_URL' })
  })

  it('rejects literal internal addresses without any DNS lookup', async () => {
    const noDns = resolverFor({})
    for (const url of [
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://192.168.0.1/admin',
      'http://[::ffff:127.0.0.1]/',
    ]) {
      await expect(validateUrl(url, DEFAULT_SSRF_POLICY, noDns)).rejects.toMatchObject({
        code: 'UNSAFE_URL',
      })
    }
  })

  it('rejects hostnames that resolve to a private address', async () => {
    const rebind = resolverFor({ 'evil.example.com': ['127.0.0.1'] })
    await expect(
      validateUrl('https://evil.example.com/', DEFAULT_SSRF_POLICY, rebind),
    ).rejects.toMatchObject({ code: 'UNSAFE_URL' })
  })

  it('rejects a hostname with one public and one private record', async () => {
    // The classic rebinding setup: the check passes on the first answer, the socket uses
    // the second. Checking every answer is the only correct behaviour.
    const mixed = resolverFor({ 'sneaky.example.com': ['93.184.216.34', '10.0.0.5'] })
    await expect(
      validateUrl('https://sneaky.example.com/', DEFAULT_SSRF_POLICY, mixed),
    ).rejects.toMatchObject({ code: 'UNSAFE_URL' })
  })

  it('rejects blocked hostnames and internal TLDs by name', async () => {
    const dns = resolverFor({
      localhost: ['93.184.216.34'],
      'metadata.google.internal': ['93.184.216.34'],
      'db.internal': ['93.184.216.34'],
      'printer.local': ['93.184.216.34'],
    })
    for (const host of ['localhost', 'metadata.google.internal', 'db.internal', 'printer.local']) {
      await expect(
        validateUrl(`http://${host}/`, DEFAULT_SSRF_POLICY, dns),
      ).rejects.toMatchObject({ code: 'UNSAFE_URL' })
    }
  })

  it('treats a trailing-dot hostname the same as the bare name', async () => {
    const dns = resolverFor({ localhost: ['93.184.216.34'] })
    await expect(validateUrl('http://localhost./', DEFAULT_SSRF_POLICY, dns)).rejects.toMatchObject({
      code: 'UNSAFE_URL',
    })
  })

  it('reports DNS failure as retryable FETCH_FAILED, not as an unsafe URL', async () => {
    await expect(
      validateUrl('https://nowhere.example.com/', DEFAULT_SSRF_POLICY, resolverFor({})),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED', retryable: true })
  })

  it('never leaks internal detail in the customer-facing message', async () => {
    try {
      await validateUrl('http://10.0.0.1/', DEFAULT_SSRF_POLICY, resolverFor({}))
      expect.unreachable('should have thrown')
    } catch (e) {
      const error = e as { publicMessage: string; message: string }
      expect(error.publicMessage).toBe('That address cannot be analysed.')
      expect(error.publicMessage).not.toContain('10.0.0.1')
      expect(error.message).toContain('10.0.0.1') // internal log detail is preserved
    }
  })

  it('allows private hosts only under the explicit development escape hatch', async () => {
    const policy = { ...DEFAULT_SSRF_POLICY, allowPrivateHosts: true }
    const result = await validateUrl('http://127.0.0.1:8080/', policy, resolverFor({}))
    expect(result.address).toBe('127.0.0.1')
  })
})

describe('registrableDomain', () => {
  it.each([
    ['www.rosa.co.il', 'rosa.co.il'],
    ['rosa.co.il', 'rosa.co.il'],
    ['blog.rosa.co.il', 'rosa.co.il'],
    ['www.example.com', 'example.com'],
    ['deep.sub.example.com', 'example.com'],
    ['example.com', 'example.com'],
    ['news.bbc.co.uk', 'bbc.co.uk'],
  ])('reduces %s to %s', (input, expected) => {
    expect(registrableDomain(input)).toBe(expected)
  })
})
