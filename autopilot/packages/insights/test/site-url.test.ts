/**
 * The first field anybody touches.
 *
 * Every case here was previously accepted, crawled for thirty seconds, and answered with
 * "we could not reach the site" — the worst available response, because it is slow, wrong,
 * and leaves the customer believing the tool is broken when in fact they typed an email
 * address. Two of them are not input errors at all: a business whose only presence is a
 * Facebook page has just been handed the most useful thing this product knows.
 */
import { describe, expect, it } from 'vitest'
import {
  classifySiteUrl,
  explainSiteUrl,
  isSiteUrlProblem,
  type SiteUrlProblem,
} from '../src/site-url.ts'

const problemOf = (raw: string): SiteUrlProblem | 'OK' => {
  const v = classifySiteUrl(raw)
  return v.ok ? 'OK' : v.problem
}
const urlOf = (raw: string): string | null => {
  const v = classifySiteUrl(raw)
  return v.ok ? v.url : null
}

describe('what a person actually types', () => {
  it('accepts the ordinary forms of the same address', () => {
    expect(urlOf('example.co.il')).toBe('https://example.co.il/')
    expect(urlOf('  Example.CO.IL  ')).toBe('https://example.co.il/')
    expect(urlOf('www.example.co.il/')).toBe('https://www.example.co.il/')
    expect(urlOf('http://example.co.il')).toBe('http://example.co.il/')
  })

  it('keeps a deep link, because a person pastes the page they were looking at', () => {
    expect(urlOf('https://example.co.il/about')).toBe('https://example.co.il/about')
  })

  it('accepts a Hebrew domain', () => {
    expect(urlOf('מוסך.co.il')).toBe('https://xn--9dbkkn.co.il/')
  })

  it('accepts a site on a builder’s subdomain, which is a real website', () => {
    // A false positive here refuses to scan a real customer's real site.
    expect(problemOf('https://avigarage.wixsite.com/garage')).toBe('OK')
    expect(problemOf('https://mygarage.business.site')).toBe('OK')
  })
})

describe('cleaning the address that gets shown back', () => {
  it('drops tracking parameters', () => {
    expect(urlOf('https://example.co.il/x?utm_source=fb&utm_medium=cpc&id=7')).toBe(
      'https://example.co.il/x?id=7',
    )
    expect(urlOf('https://example.co.il/?fbclid=IwAR3xyz')).toBe('https://example.co.il/')
  })

  it('drops the fragment, which no server ever sees', () => {
    expect(urlOf('https://example.co.il/about#contact')).toBe('https://example.co.il/about')
  })

  it('strips credentials rather than sending a password to a host', () => {
    expect(urlOf('https://user:secret@example.co.il/')).toBe('https://example.co.il/')
  })
})

describe('things that are not a website', () => {
  it('recognises an email address, with or without mailto:', () => {
    expect(problemOf('avi@garage.co.il')).toBe('EMAIL')
    expect(problemOf('mailto:avi@garage.co.il')).toBe('EMAIL')
  })

  it('recognises a social page on every host people paste', () => {
    for (const raw of [
      'https://www.facebook.com/mygarage',
      'https://m.facebook.com/mygarage',
      'https://instagram.com/mygarage',
      'https://www.tiktok.com/@mygarage',
      'https://wa.me/972501234567',
    ]) {
      expect(problemOf(raw), raw).toBe('SOCIAL_PAGE')
    }
  })

  it('recognises a listing on a marketplace or a map', () => {
    expect(problemOf('https://www.yad2.co.il/item/123')).toBe('MARKETPLACE')
    expect(problemOf('https://www.zap.co.il/model.aspx?modelid=1')).toBe('MARKETPLACE')
    expect(problemOf('https://maps.app.goo.gl/abc123')).toBe('MARKETPLACE')
    expect(problemOf('https://www.google.com/maps/place/x')).toBe('MARKETPLACE')
  })

  it('recognises a link hub', () => {
    expect(problemOf('https://linktr.ee/mygarage')).toBe('LINK_HUB')
  })

  it('recognises an address nothing outside a private network can reach', () => {
    for (const raw of ['192.168.1.10', '10.0.0.5', '127.0.0.1', '169.254.169.254', 'localhost']) {
      expect(problemOf(raw), raw).toBe('NOT_PUBLIC')
    }
  })

  it('recognises a port no crawler will try', () => {
    expect(problemOf('https://example.co.il:8080/')).toBe('ODD_PORT')
    expect(problemOf('https://example.co.il:22/')).toBe('ODD_PORT')
    // The standard ports are not odd, even when written out.
    expect(problemOf('https://example.co.il:443/')).toBe('OK')
    expect(problemOf('http://example.co.il:80/')).toBe('OK')
  })

  it('refuses gibberish and non-web schemes', () => {
    expect(problemOf('example')).toBe('NOT_A_URL')
    expect(problemOf('')).toBe('EMPTY')
    expect(problemOf('   ')).toBe('EMPTY')
    expect(problemOf('javascript:alert(1)')).toBe('NOT_A_URL')
    expect(problemOf('file:///etc/passwd')).toBe('NOT_A_URL')
    expect(problemOf('ftp://example.co.il')).toBe('NOT_A_URL')
  })
})

describe('what the customer is told', () => {
  const problems: SiteUrlProblem[] = [
    'EMPTY',
    'NOT_A_URL',
    'EMAIL',
    'SOCIAL_PAGE',
    'MARKETPLACE',
    'LINK_HUB',
    'NOT_PUBLIC',
    'ODD_PORT',
  ]

  it('says something in both languages for every case', () => {
    for (const problem of problems) {
      for (const language of ['he', 'en'] as const) {
        const m = explainSiteUrl(problem, 'facebook.com', language)
        expect(m.title.length, `${problem}/${language}`).toBeGreaterThan(4)
        expect(m.body.length, `${problem}/${language}`).toBeGreaterThan(0)
        for (const p of m.body) expect(p.length).toBeGreaterThan(20)
      }
    }
  })

  it('treats a social page and a listing as findings, not as typos', () => {
    // The difference decides whether the page apologises or explains. Somebody with only a
    // Facebook page did not make a mistake; they were just told why they are invisible.
    expect(explainSiteUrl('SOCIAL_PAGE', 'facebook.com', 'he').isFinding).toBe(true)
    expect(explainSiteUrl('MARKETPLACE', 'yad2.co.il', 'he').isFinding).toBe(true)
    expect(explainSiteUrl('LINK_HUB', 'linktr.ee', 'he').isFinding).toBe(true)
    expect(explainSiteUrl('EMAIL', null, 'he').isFinding).toBe(false)
    expect(explainSiteUrl('NOT_A_URL', null, 'he').isFinding).toBe(false)
  })

  it('names the host it is talking about', () => {
    expect(explainSiteUrl('SOCIAL_PAGE', 'instagram.com', 'he').body.join(' ')).toContain(
      'instagram.com',
    )
    expect(explainSiteUrl('MARKETPLACE', 'yad2.co.il', 'en').body.join(' ')).toContain('yad2.co.il')
  })

  it('never leaves a null host as a hole in the sentence', () => {
    for (const problem of problems) {
      for (const language of ['he', 'en'] as const) {
        const text = explainSiteUrl(problem, null, language).body.join(' ')
        expect(text, `${problem}/${language}`).not.toContain('null')
        expect(text).not.toContain('undefined')
      }
    }
  })
})

describe('a problem code arriving from a query string', () => {
  // It travels through a URL, so anybody can write one by hand. Casting it straight back
  // into the union let `?problem=whatever` fall past every branch of the explanation and
  // return nothing, which crashes the page rendering it.
  it('accepts only codes we produce', () => {
    expect(isSiteUrlProblem('SOCIAL_PAGE')).toBe(true)
    expect(isSiteUrlProblem('EMAIL')).toBe(true)
    expect(isSiteUrlProblem('whatever')).toBe(false)
    expect(isSiteUrlProblem('')).toBe(false)
    expect(isSiteUrlProblem('__proto__')).toBe(false)
  })

  it('covers every problem the classifier can return', () => {
    const produced = new Set<SiteUrlProblem>()
    for (const raw of [
      '',
      'example',
      'avi@garage.co.il',
      'https://facebook.com/x',
      'https://yad2.co.il/x',
      'https://linktr.ee/x',
      '192.168.1.1',
      'https://example.co.il:22/',
    ]) {
      const v = classifySiteUrl(raw)
      if (!v.ok) produced.add(v.problem)
    }
    for (const problem of produced) expect(isSiteUrlProblem(problem)).toBe(true)
    expect(produced.size).toBe(8)
  })
})

describe('the local-development seam', () => {
  // The crawler already has this switch, and production refuses it. Having the field
  // enforce a stricter rule than the fetcher would leave a local checkout unable to point
  // the product at its own fixture server — which is how the product gets tested at all.
  it('accepts a fixture server only when explicitly allowed', () => {
    expect(classifySiteUrl('http://127.0.0.1:54321/').ok).toBe(false)
    expect(classifySiteUrl('http://127.0.0.1:54321/', { allowLocalTargets: true })).toEqual({
      ok: true,
      url: 'http://127.0.0.1:54321/',
    })
    expect(classifySiteUrl('http://localhost:3100/', { allowLocalTargets: true }).ok).toBe(true)
  })

  it('still refuses what is not a website, even locally', () => {
    expect(classifySiteUrl('avi@garage.co.il', { allowLocalTargets: true }).ok).toBe(false)
    expect(classifySiteUrl('https://facebook.com/x', { allowLocalTargets: true }).ok).toBe(false)
  })
})
