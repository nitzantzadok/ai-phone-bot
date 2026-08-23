/**
 * The rule this file exists to hold: a suggestion is either true of this business, or it
 * is not offered.
 *
 * A suggested sentence is the one thing in the report a customer will paste onto their
 * live website without reading twice. Everything else they weigh; this they copy. So a
 * template filled with plausible-sounding filler is not a minor blemish here — it puts a
 * false claim about a real business on that business's own home page, under our
 * instruction.
 */
import { describe, expect, it } from 'vitest'
import { locate, locateAll, pageName, type BusinessFacts } from '../src/locate.ts'

const full: BusinessFacts = {
  name: 'דנטל סנטר הדר',
  city: 'חיפה',
  phone: '04-8123456',
  address: 'הרצל 12',
  verticalLabel: 'מרפאת שיניים',
  attributes: ['חניה חופשית', 'מקבלים ילדים', 'נגיש לכיסא גלגלים'],
}

const bare: BusinessFacts = {
  name: null,
  city: null,
  phone: null,
  address: null,
  verticalLabel: 'עסקים בתחום שלכם',
  attributes: [],
}

const finding = (over: Partial<Parameters<typeof locate>[0]> = {}) => ({
  findingType: 'MISSING_TITLE',
  url: 'https://x.co.il/about',
  where: { he: 'בלשונית הדפדפן', en: 'in the browser tab' },
  current: null,
  ...over,
})

describe('naming a page the way a person does', () => {
  it('recognises the pages every small business site has', () => {
    expect(pageName('https://x.co.il/', 'he')).toBe('עמוד הבית')
    expect(pageName('https://x.co.il', 'he')).toBe('עמוד הבית')
    expect(pageName('https://x.co.il/about', 'he')).toBe('עמוד "אודות"')
    expect(pageName('https://x.co.il/contact', 'en')).toBe('the Contact page')
    expect(pageName('https://x.co.il/services/', 'en')).toBe('the Services page')
  })

  it('sees through the file extension a site builder appends', () => {
    expect(pageName('https://x.co.il/contact.html', 'he')).toBe('עמוד "צרו קשר"')
    expect(pageName('https://x.co.il/about.php', 'en')).toBe('the About page')
  })

  it('names an unfamiliar page by its path, never by the whole URL', () => {
    // Nine wrapped absolute URLs in a list are nine identical grey blocks.
    const named = pageName('https://x.co.il/treatments/kids', 'he')
    expect(named).toBe('העמוד /treatments/kids')
    expect(named).not.toContain('https://')
  })

  it('does not throw on something that is not a URL', () => {
    expect(() => pageName('/sitemap.xml', 'he')).not.toThrow()
  })
})

describe('a suggestion is true, or it is absent', () => {
  it('writes nothing at all when the scan never learned the name', () => {
    // Everything downstream keys off the name. Without it there is no true sentence to
    // write, and a template would be pure invention.
    expect(locate(finding(), bare, 'he').suggested).toBeNull()
  })

  it('refuses a description that would only repeat the name', () => {
    const nameOnly: BusinessFacts = { ...bare, name: 'רוזה' }
    const l = locate(finding({ findingType: 'MISSING_META_DESCRIPTION' }), nameOnly, 'he')
    expect(l.suggested).toBeNull()
  })

  it('never invents a city, a phone number or a selling point', () => {
    const nameAndCity: BusinessFacts = { ...bare, name: 'רוזה', city: 'תל אביב' }
    const l = locate(finding({ findingType: 'MISSING_META_DESCRIPTION' }), nameAndCity, 'he')
    expect(l.suggested).toContain('תל אביב')
    expect(l.suggested).not.toMatch(/\d{2,3}-\d{7}|טלפון/)
    expect(l.suggested).not.toMatch(/חניה|מקבלים|נגיש/)
  })

  it('builds a home page title from name, field and city', () => {
    const l = locate(finding({ url: 'https://x.co.il/' }), full, 'he')
    expect(l.suggested).toBe('דנטל סנטר הדר – מרפאת שיניים בחיפה')
  })

  it('gives an inner page its own subject rather than repeating the home title', () => {
    // A site that ships one title on nine pages looks to a reader like one page copied.
    const home = locate(finding({ url: 'https://x.co.il/' }), full, 'he').suggested
    const about = locate(finding({ url: 'https://x.co.il/about' }), full, 'he').suggested
    expect(about).not.toBe(home)
    expect(about).toContain('אודות')
  })

  it('keeps a title inside the length the platforms will show', () => {
    const long: BusinessFacts = {
      ...full,
      name: 'מרפאת השיניים המשפחתית הוותיקה של משפחת כהן בשכונת הדר',
    }
    const l = locate(finding({ url: 'https://x.co.il/' }), long, 'he')
    expect(l.suggested!.length).toBeLessThanOrEqual(60)
  })

  it('builds a description from the facts, most identifying first', () => {
    const l = locate(finding({ findingType: 'MISSING_META_DESCRIPTION' }), full, 'he')
    expect(l.suggested).toContain('דנטל סנטר הדר')
    expect(l.suggested).toContain('חיפה')
    expect(l.suggested!.length).toBeLessThanOrEqual(150)
  })

  it('suggests a heading only for the home page, where the subject is the business', () => {
    expect(locate(finding({ findingType: 'MISSING_H1', url: 'https://x.co.il/' }), full, 'he')
      .suggested).toBe('מרפאת שיניים בחיפה')
    // An inner page's heading is about that page's own content, which we have not read
    // closely enough to write for them.
    expect(locate(finding({ findingType: 'MISSING_H1', url: 'https://x.co.il/about' }), full, 'he')
      .suggested).toBeNull()
  })

  it('offers no suggestion for a finding that is not about a piece of text', () => {
    for (const type of ['NO_SITEMAP', 'CLIENT_RENDERED', 'MISSING_IMAGE_ALT', 'NOINDEX']) {
      expect(locate(finding({ findingType: type }), full, 'he').suggested).toBeNull()
    }
  })
})

describe('showing what is there now', () => {
  it('quotes the current value back so the reader recognises their own site', () => {
    const l = locate(
      finding({ findingType: 'TITLE_LENGTH', current: 'ברוכים הבאים' }),
      full,
      'he',
    )
    expect(l.current).toBe('ברוכים הבאים')
  })

  it('trims a very long value rather than filling the card with it', () => {
    const l = locate(finding({ findingType: 'TITLE_LENGTH', current: 'א'.repeat(300) }), full, 'he')
    expect(l.current!.length).toBeLessThanOrEqual(90)
    expect(l.current!.endsWith('…')).toBe(true)
  })

  it('carries the location in the reader’s language', () => {
    expect(locate(finding(), full, 'he').where).toBe('בלשונית הדפדפן')
    expect(locate(finding(), full, 'en').where).toBe('in the browser tab')
  })
})

describe('a finding seen on many pages', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    finding({ url: `https://x.co.il/page-${i}` }),
  )

  it('shows a readable number of them and counts the rest', () => {
    const { located, more } = locateAll(many, full, 'he')
    expect(located).toHaveLength(8)
    expect(more).toBe(32)
  })

  it('reports no remainder when everything fits', () => {
    const { located, more } = locateAll(many.slice(0, 3), full, 'he')
    expect(located).toHaveLength(3)
    expect(more).toBe(0)
  })
})

describe('what goes onto the customer’s live website', () => {
  /**
   * These strings are the one thing in the report a customer copies without reading twice.
   * A stand-in label, an unformatted number, or the same sentence three times all end up
   * published under our instruction.
   */
  const unknownField: BusinessFacts = { ...full, verticalLabel: null }

  it('says less rather than pasting a stand-in for a field it could not identify', () => {
    // "מספרת רוזה — עסקים בתחום שלכם בחיפה" is our fallback label on a real home page.
    const title = locate(finding({ url: 'https://x.co.il/' }), unknownField, 'he').suggested
    expect(title).toBe('דנטל סנטר הדר בחיפה')
    expect(title).not.toContain('עסקים בתחום שלכם')
  })

  it('withholds a heading entirely when the field is unknown', () => {
    // Unlike a title, a heading has nothing left to say once the field is gone: the name
    // is already in the title directly above it.
    expect(
      locate(finding({ findingType: 'MISSING_H1', url: 'https://x.co.il/' }), unknownField, 'he')
        .suggested,
    ).toBeNull()
  })

  it('writes a phone number the way a person writes one', () => {
    const digits: BusinessFacts = { ...full, phone: '048123456' }
    const described = locate(
      finding({ findingType: 'MISSING_META_DESCRIPTION', url: 'https://x.co.il/' }),
      digits,
      'he',
    ).suggested
    expect(described).toContain('04-8123456')
    expect(described).not.toContain('048123456')
  })

  it('handles a mobile number and an international prefix', () => {
    for (const [input, expected] of [
      ['0521234567', '052-1234567'],
      ['+972521234567', '052-1234567'],
      ['972-3-9123456', '03-9123456'],
    ] as const) {
      const out = locate(
        finding({ findingType: 'MISSING_META_DESCRIPTION', url: 'https://x.co.il/' }),
        { ...full, phone: input },
        'he',
      ).suggested
      expect(out).toContain(expected)
    }
  })

  it('leaves a number it does not recognise exactly as it found it', () => {
    // Reformatting something we have not understood is how a wrong phone number gets
    // published. Passing it through unchanged is the safe failure.
    const out = locate(
      finding({ findingType: 'MISSING_META_DESCRIPTION', url: 'https://x.co.il/' }),
      { ...full, phone: '*6000' },
      'he',
    ).suggested
    expect(out).toContain('*6000')
  })

  it('does not suggest the same description for three different pages', () => {
    // The report tells them elsewhere that duplicate descriptions make pages look alike.
    // Suggesting one sentence for every page would contradict the card below it.
    const pages = ['https://x.co.il/', 'https://x.co.il/about', 'https://x.co.il/contact']
    const suggestions = pages.map(
      (url) => locate(finding({ findingType: 'MISSING_META_DESCRIPTION', url }), full, 'he').suggested,
    )
    expect(new Set(suggestions).size).toBe(3)
  })
})
