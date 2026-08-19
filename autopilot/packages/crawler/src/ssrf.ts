/**
 * SSRF protection.
 *
 * This module is the security boundary for every customer-supplied URL in the product.
 * The threat is concrete: a customer (or an attacker who signs up) enters a URL, and our
 * crawler — running inside our infrastructure with a network position no outsider has —
 * fetches it. Without these checks that turns the crawler into a proxy for reaching cloud
 * metadata endpoints, internal admin panels and databases.
 *
 * Four defences, all required:
 *  1. scheme and shape validation (no file:, no embedded credentials, no odd ports);
 *  2. every DNS answer checked, not just the first — a hostname with one public and one
 *     private A record must be rejected;
 *  3. the validated IP is PINNED for the connection, so a DNS rebind between our check
 *     and the socket connect cannot swap in 127.0.0.1;
 *  4. every redirect hop re-validated, because "public host 302s to localhost" is the
 *     single most common bypass.
 */
import { lookup } from 'node:dns/promises'
import { isIP, isIPv4 } from 'node:net'
import { AppError } from '@autopilot/shared/errors.ts'

export interface SsrfPolicy {
  readonly allowedSchemes: readonly string[]
  readonly allowedPorts: readonly number[]
  /** Local development only — lets an integration test hit a fixture server on 127.0.0.1. */
  readonly allowPrivateHosts: boolean
  readonly maxRedirects: number
  /** Hostnames refused outright regardless of what they resolve to. */
  readonly blockedHostnames: readonly string[]
}

export const DEFAULT_SSRF_POLICY: SsrfPolicy = {
  allowedSchemes: ['http:', 'https:'],
  allowedPorts: [80, 443, 8080, 8443],
  allowPrivateHosts: false,
  maxRedirects: 5,
  blockedHostnames: [
    'localhost',
    'metadata.google.internal',
    'metadata.goog',
    'instance-data',
    'metadata',
  ],
}

const ipv4ToInt = (ip: string): number => {
  const parts = ip.split('.').map(Number)
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!
}

const cidr4 = (base: string, bits: number): { start: number; end: number } => {
  const start = ipv4ToInt(base)
  const size = 2 ** (32 - bits)
  return { start, end: start + size - 1 }
}

/**
 * Every IPv4 range that must never be reachable from the crawler.
 * Cloud metadata (169.254.169.254, 100.100.100.200) is inside link-local and CGNAT
 * respectively, so blocking those ranges wholesale covers every provider's endpoint
 * rather than a list we would have to keep updating.
 */
const BLOCKED_V4 = [
  cidr4('0.0.0.0', 8), // "this network"
  cidr4('10.0.0.0', 8), // RFC1918
  cidr4('100.64.0.0', 10), // CGNAT — includes Alibaba metadata 100.100.100.200
  cidr4('127.0.0.0', 8), // loopback
  cidr4('169.254.0.0', 16), // link-local — includes 169.254.169.254 metadata
  cidr4('172.16.0.0', 12), // RFC1918
  cidr4('192.0.0.0', 24), // IETF protocol assignments
  cidr4('192.0.2.0', 24), // TEST-NET-1
  cidr4('192.88.99.0', 24), // 6to4 relay anycast
  cidr4('192.168.0.0', 16), // RFC1918
  cidr4('198.18.0.0', 15), // benchmarking
  cidr4('198.51.100.0', 24), // TEST-NET-2
  cidr4('203.0.113.0', 24), // TEST-NET-3
  cidr4('224.0.0.0', 4), // multicast
  cidr4('240.0.0.0', 4), // reserved, includes 255.255.255.255
]

const expandIPv6 = (ip: string): string => {
  const zoneless = ip.split('%')[0]!
  const [head = '', tail = ''] = zoneless.includes('::')
    ? (zoneless.split('::') as [string, string])
    : [zoneless, '']
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = 8 - headParts.length - tailParts.length
  const parts = zoneless.includes('::')
    ? [...headParts, ...Array<string>(Math.max(0, missing)).fill('0'), ...tailParts]
    : headParts
  return parts.map((p) => (p === '' ? '0' : p).padStart(4, '0')).join(':')
}

export const isBlockedIp = (ip: string): boolean => {
  if (isIPv4(ip)) {
    const value = ipv4ToInt(ip)
    return BLOCKED_V4.some((r) => value >= r.start && value <= r.end)
  }

  const full = expandIPv6(ip.toLowerCase())
  const groups = full.split(':')
  if (groups.length !== 8) return true // unparseable: fail closed

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible: judge the embedded address.
  if (groups.slice(0, 5).every((g) => g === '0000')) {
    if (groups[5] === 'ffff' || groups[5] === '0000') {
      const a = Number.parseInt(groups[6]!, 16)
      const b = Number.parseInt(groups[7]!, 16)
      const embedded = `${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`
      if (embedded !== '0.0.0.0' || groups[5] === 'ffff') return isBlockedIp(embedded)
    }
  }

  if (full === '0000:0000:0000:0000:0000:0000:0000:0001') return true // ::1 loopback
  if (full === '0000:0000:0000:0000:0000:0000:0000:0000') return true // ::

  const first = Number.parseInt(groups[0]!, 16)
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (first === 0x2002) return true // 6to4 — can encapsulate a private v4
  if (full.startsWith('0064:ff9b:')) return true // NAT64

  return false
}

export interface ValidatedTarget {
  readonly url: URL
  /** The single address the connection must use. Pinning this defeats DNS rebinding. */
  readonly address: string
  readonly family: 4 | 6
}

/**
 * Full validation of one URL. Throws UNSAFE_URL with a reason; the public message is
 * deliberately vague so the API cannot be used to map our internal network.
 */
export const validateUrl = async (
  input: string,
  policy: SsrfPolicy = DEFAULT_SSRF_POLICY,
  resolver: typeof lookup = lookup,
): Promise<ValidatedTarget> => {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw unsafe('malformed URL', input)
  }

  if (!policy.allowedSchemes.includes(url.protocol)) {
    throw unsafe(`scheme ${url.protocol} is not allowed`, input)
  }
  if (url.username || url.password) {
    throw unsafe('embedded credentials are not allowed', input)
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!policy.allowedPorts.includes(port)) {
    throw unsafe(`port ${port} is not allowed`, input)
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (hostname.length === 0) throw unsafe('empty hostname', input)

  if (!policy.allowPrivateHosts) {
    if (policy.blockedHostnames.includes(hostname)) {
      throw unsafe('hostname is blocked', input)
    }
    // Internal-only TLDs never appear on the public internet.
    if (/\.(local|internal|localdomain|home|lan|corp|intranet)$/.test(hostname)) {
      throw unsafe('internal TLD is blocked', input)
    }
  }

  // An IP literal skips DNS entirely; check it directly.
  const literal = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
  if (isIP(literal) !== 0) {
    if (!policy.allowPrivateHosts && isBlockedIp(literal)) {
      throw unsafe('address is in a blocked range', input)
    }
    return { url, address: literal, family: isIPv4(literal) ? 4 : 6 }
  }

  let addresses: { address: string; family: number }[]
  try {
    addresses = await resolver(hostname, { all: true, verbatim: true })
  } catch {
    throw new AppError({
      code: 'FETCH_FAILED',
      message: `DNS resolution failed for ${hostname}`,
      retryable: true,
      details: { hostname },
    })
  }

  if (addresses.length === 0) throw unsafe('hostname did not resolve', input)

  // Every answer must be safe. One private record among public ones is a rebinding setup.
  if (!policy.allowPrivateHosts) {
    for (const a of addresses) {
      if (isBlockedIp(a.address)) {
        throw unsafe('hostname resolves to a blocked address', input)
      }
    }
  }

  const chosen = addresses[0]!
  return {
    url,
    address: chosen.address,
    family: chosen.family === 6 ? 6 : 4,
  }
}

const unsafe = (reason: string, url: string): AppError =>
  new AppError({
    code: 'UNSAFE_URL',
    message: `Refusing to fetch ${url}: ${reason}`,
    // Public message stays generic: never confirm what exists on the internal network.
    publicMessage: 'That address cannot be analysed.',
    details: { reason },
    retryable: false,
  })

/** Registrable-ish domain, for grouping citations by site. */
export const registrableDomain = (hostname: string): string => {
  const clean = hostname.toLowerCase().replace(/^www\./, '')
  const parts = clean.split('.')
  if (parts.length <= 2) return clean
  // Handles the common multi-part public suffixes this product actually meets.
  const twoPartSuffixes = ['co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'co.uk', 'com.au']
  const lastTwo = parts.slice(-2).join('.')
  const lastThree = parts.slice(-3).join('.')
  return twoPartSuffixes.includes(lastTwo) ? lastThree : lastTwo
}
