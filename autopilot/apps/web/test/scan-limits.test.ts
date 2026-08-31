/**
 * Two ceilings on a public scanner, because there are two different things to protect.
 *
 * The per-caller one guards our own crawl budget. The per-target one guards a stranger's
 * website — which is what the page has always told the customer the limit was for, and
 * which a per-caller counter does nothing about: many callers from many addresses, all
 * pointed at one small business's shared hosting, is the shape abuse actually takes.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { checkRateLimit, resetRateLimits } from '@/lib/scan-limits'

const AT = 1_700_000_000_000

describe('the per-caller ceiling', () => {
  beforeEach(resetRateLimits)

  it('lets an ordinary afternoon through', () => {
    // Their own site, a competitor's, their own again after a fix. That is a good day for
    // this product, not abuse.
    for (const host of ['a.co.il', 'b.co.il', 'a.co.il', 'c.co.il']) {
      expect(checkRateLimit('1.2.3.4', `https://${host}/`, AT).allowed).toBe(true)
    }
  })

  it('stops one caller running scans all day', () => {
    for (let i = 0; i < 8; i++) {
      expect(checkRateLimit('1.2.3.4', `https://site-${i}.co.il/`, AT).allowed).toBe(true)
    }
    const refused = checkRateLimit('1.2.3.4', 'https://site-9.co.il/', AT)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('does not hold one caller against another', () => {
    for (let i = 0; i < 8; i++) checkRateLimit('1.2.3.4', `https://site-${i}.co.il/`, AT)
    expect(checkRateLimit('5.6.7.8', 'https://other.co.il/', AT).allowed).toBe(true)
  })

  it('forgets once the window has passed', () => {
    for (let i = 0; i < 8; i++) checkRateLimit('1.2.3.4', `https://site-${i}.co.il/`, AT)
    expect(checkRateLimit('1.2.3.4', 'https://x.co.il/', AT).allowed).toBe(false)
    expect(checkRateLimit('1.2.3.4', 'https://x.co.il/', AT + 11 * 60 * 1000).allowed).toBe(true)
  })
})

describe('the per-target ceiling', () => {
  beforeEach(resetRateLimits)

  it('protects one site from many callers at once', () => {
    const victim = 'https://small-garage.co.il/'
    let allowed = 0
    for (let i = 0; i < 10; i++) {
      if (checkRateLimit(`caller-${i}`, victim, AT).allowed) allowed++
    }
    expect(allowed).toBe(4)
  })

  it('counts a host once however the address is written', () => {
    for (const url of [
      'https://garage.co.il/',
      'https://garage.co.il/about',
      'http://GARAGE.co.il/contact',
      'https://garage.co.il/x?y=1',
    ]) {
      checkRateLimit(`caller-${url}`, url, AT)
    }
    expect(checkRateLimit('someone-else', 'https://garage.co.il/', AT).allowed).toBe(false)
  })

  it('treats www and the apex as the sites they are', () => {
    // Different hostnames are different origins and are served separately; conflating them
    // would refuse a scan of a site that has received none.
    for (let i = 0; i < 4; i++) checkRateLimit(`c${i}`, 'https://garage.co.il/', AT)
    expect(checkRateLimit('x', 'https://www.garage.co.il/', AT).allowed).toBe(true)
  })
})

describe('how the two interact', () => {
  beforeEach(resetRateLimits)

  it('does not let a refused caller spend the target’s allowance', () => {
    // Otherwise one person hammering refresh locks a business's own site out of being
    // scanned by anybody else.
    const victim = 'https://garage.co.il/'
    for (let i = 0; i < 8; i++) checkRateLimit('flooder', `https://site-${i}.co.il/`, AT)
    for (let i = 0; i < 20; i++) expect(checkRateLimit('flooder', victim, AT).allowed).toBe(false)

    expect(checkRateLimit('the-owner', victim, AT).allowed).toBe(true)
  })

  it('still answers when no target is known', () => {
    expect(checkRateLimit('1.2.3.4', '', AT).allowed).toBe(true)
  })
})
