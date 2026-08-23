/**
 * The asymmetry that governs this module: a missing name is a finding the customer needs
 * to see anyway. A *wrong* name propagates into the title we suggest they publish, into
 * the questions we ask engines on their behalf, and into what we tell them their own
 * business is called. So every test here that adds a signal is paired with one that
 * refuses a bad one.
 */
import { describe, expect, it } from 'vitest'
import type { CrawledPage } from '@autopilot/crawler/crawler.ts'
import { brandFromHomeHeading, brandFromHomeLink, detectBrand } from '../src/brand.ts'

const SITE = 'https://roza.co.il'

const page = (
  url: string,
  links: { href: string; text: string }[],
  h1?: string,
): CrawledPage =>
  ({
    url,
    pageType: url === `${SITE}/` ? 'home' : 'other',
    links: links.map((l) => ({ ...l, internal: true })),
    headings: h1 ? [{ level: 1, text: h1 }] : [],
  }) as unknown as CrawledPage

/** What a real small-business site looks like: a logo link home in a shared header. */
const site = (logoText: string, h1?: string) => [
  page(`${SITE}/`, [{ href: '/', text: logoText }, { href: '/about', text: 'אודות' }], h1),
  page(`${SITE}/about`, [{ href: '/', text: logoText }]),
  page(`${SITE}/contact`, [{ href: '/', text: logoText }]),
]

describe('the logo link', () => {
  it('finds the name a site puts in its header on every page', () => {
    const found = brandFromHomeLink(site('מספרת רוזה'), SITE)
    expect(found?.value).toBe('מספרת רוזה')
    expect(found?.source).toBe('HOME_LINK')
    expect(found?.seenOn).toBe(3)
  })

  it('refuses the navigation words that also link home', () => {
    for (const word of ['בית', 'דף הבית', 'Home', 'ראשי', 'לוגו', 'תפריט']) {
      expect(brandFromHomeLink(site(word), SITE)).toBeNull()
    }
  })

  it('requires the text to repeat, so a one-off link in body copy is not a name', () => {
    const pages = [
      page(`${SITE}/`, [{ href: '/', text: 'מספרת רוזה' }]),
      page(`${SITE}/about`, [{ href: '/about', text: 'עוד עלינו' }]),
      page(`${SITE}/contact`, []),
    ]
    expect(brandFromHomeLink(pages, SITE)).toBeNull()
  })

  it('accepts a single-page site, where there is nothing to repeat across', () => {
    const one = [page(`${SITE}/`, [{ href: '/', text: 'מספרת רוזה' }])]
    expect(brandFromHomeLink(one, SITE)?.value).toBe('מספרת רוזה')
  })

  it('counts a header and a footer on one page as one piece of evidence', () => {
    const pages = [
      page(`${SITE}/`, [
        { href: '/', text: 'מספרת רוזה' },
        { href: '/', text: 'מספרת רוזה' },
      ]),
      page(`${SITE}/about`, []),
    ]
    // One page's worth of evidence, and a multi-page site needs two.
    expect(brandFromHomeLink(pages, SITE)).toBeNull()
  })

  it('ignores a link that leaves the site', () => {
    const pages = site('מספרת רוזה').map((p) => ({
      ...p,
      links: [{ href: 'https://facebook.com/', text: 'עמוד הפייסבוק שלנו', internal: false }],
    })) as unknown as CrawledPage[]
    expect(brandFromHomeLink(pages, SITE)).toBeNull()
  })

  it('does not throw on a malformed href', () => {
    const pages = [
      page(`${SITE}/`, [{ href: 'javascript:void(0)', text: 'רוזה' }]),
      page(`${SITE}/a`, [{ href: '::::', text: 'רוזה' }]),
    ]
    expect(() => brandFromHomeLink(pages, SITE)).not.toThrow()
  })
})

describe('the home page heading', () => {
  it('is used when there is no usable logo link', () => {
    const pages = site('בית', 'מספרת רוזה')
    expect(detectBrand(pages, SITE)?.value).toBe('מספרת רוזה')
    expect(detectBrand(pages, SITE)?.source).toBe('HOME_HEADING')
  })

  it('never outranks a logo link that was found', () => {
    const pages = site('מספרת רוזה', 'תספורות במחירים הכי טובים')
    expect(detectBrand(pages, SITE)?.value).toBe('מספרת רוזה')
  })

  it('refuses a heading that is a sentence rather than a name', () => {
    expect(brandFromHomeHeading(site('בית', 'הצוות המקצועי שלנו מחכה לכם כבר היום'))).toBeNull()
    expect(brandFromHomeHeading(site('בית', 'תספורת, צבע והחלקה במחיר משתלם'))).toBeNull()
  })

  it('accepts a heading that names the business and its city', () => {
    expect(brandFromHomeHeading(site('בית', 'מספרת רוזה בפתח תקווה'))?.value).toBe(
      'מספרת רוזה בפתח תקווה',
    )
  })
})

describe('a name with something appended to it', () => {
  /**
   * Logo text and headings use the same "«name» — «city»" and "«name» | «what we do»"
   * shapes titles do. Taking the whole string publishes "מוסך אבי ובניו — חיפה" back at a
   * business as what it is called.
   */
  it('keeps the name and drops what follows the separator', () => {
    expect(brandFromHomeLink(site('מוסך אבי ובניו — חיפה'), SITE)?.value).toBe('מוסך אבי ובניו')
    expect(brandFromHomeLink(site('רוזה | מספרה'), SITE)?.value).toBe('רוזה')
    expect(brandFromHomeLink(site('רוזה - מספרה בתל אביב'), SITE)?.value).toBe('רוזה')
    expect(brandFromHomeHeading(site('בית', 'מוסך אבי ובניו · חיפה'))?.value).toBe('מוסך אבי ובניו')
  })

  it('takes the first segment that reads like a name, not simply the first', () => {
    // Some sites lead with the category and follow with the name.
    expect(brandFromHomeLink(site('בית | מספרת רוזה'), SITE)?.value).toBe('מספרת רוזה')
  })

  it('does not split a name that merely contains a hyphen', () => {
    // "בן-גוריון" is one word to everybody who reads it; only a spaced hyphen separates.
    expect(brandFromHomeLink(site('מוסך בן-גוריון'), SITE)?.value).toBe('מוסך בן-גוריון')
  })
})

describe('what it refuses outright', () => {
  it('rejects anything carrying sentence punctuation', () => {
    for (const bad of ['רוזה, פתח תקווה', 'הכי טוב שיש!', 'בואו אלינו.']) {
      expect(brandFromHomeLink(site(bad), SITE)).toBeNull()
    }
  })

  it('rejects a string with no letters in it', () => {
    for (const bad of ['★', '2024', '—', '»']) {
      expect(brandFromHomeLink(site(bad), SITE)).toBeNull()
    }
  })

  it('rejects something far too long to be a name', () => {
    expect(brandFromHomeLink(site('א'.repeat(80)), SITE)).toBeNull()
  })

  it('returns null rather than a doubtful guess when the site names itself nowhere', () => {
    const anonymous = [
      page(`${SITE}/`, [{ href: '/', text: 'בית' }], 'ברוכים הבאים'),
      page(`${SITE}/about`, [{ href: '/', text: 'בית' }]),
    ]
    expect(detectBrand(anonymous, SITE)).toBeNull()
  })
})
