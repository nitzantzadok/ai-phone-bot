/**
 * The line this module must not cross: it reports what a site *links to*, never what a
 * business *has*.
 *
 * A business with a thriving Google profile that simply never linked it, told by us that
 * it has no profile, knows we are wrong — and stops believing the rest of the report,
 * including the parts that were right. Every claim here is therefore about the site's
 * links, and the tests hold that wording as much as the detection.
 */
import { describe, expect, it } from 'vitest'
import { buildOffsite, detectSignals, type OffsiteInput } from '../src/offsite.ts'

const base: OffsiteInput = {
  links: [],
  siteUrl: 'https://dental-hadar.co.il',
  language: 'he',
  verticalLabel: 'מרפאת שיניים',
  city: 'חיפה',
}

const kind = (input: OffsiteInput, k: string) =>
  detectSignals(input).find((s) => s.kind === k)!

describe('what the crawl can actually see', () => {
  it('finds a maps link wherever in the site it sits', () => {
    const s = kind({ ...base, links: ['https://maps.app.goo.gl/abc123'] }, 'MAPS')
    expect(s.status).toBe('LINKED')
    expect(s.links).toEqual(['https://maps.app.goo.gl/abc123'])
  })

  it('finds the social networks Israeli small businesses actually use', () => {
    const s = kind(
      { ...base, links: ['https://www.facebook.com/hadar', 'https://instagram.com/hadar'] },
      'SOCIAL',
    )
    expect(s.status).toBe('LINKED')
    expect(s.links).toHaveLength(2)
  })

  it('finds the Israeli directories by name', () => {
    expect(kind({ ...base, links: ['https://www.d.co.il/biz/1'] }, 'DIRECTORY').status)
      .toBe('LINKED')
    expect(kind({ ...base, links: ['https://easy.co.il/listing/2'] }, 'DIRECTORY').status)
      .toBe('LINKED')
  })

  it('matches on the host, never on the page text', () => {
    // A page that says the word "facebook" in a sentence has not linked a profile, and
    // reporting presence that is not there is the one failure this module exists to avoid.
    const s = kind({ ...base, links: ['https://dental-hadar.co.il/we-are-on-facebook'] }, 'SOCIAL')
    expect(s.status).toBe('NOT_LINKED')
  })

  it('does not count the business linking to itself', () => {
    const s = kind(
      { ...base, links: ['https://dental-hadar.co.il/contact', 'https://www.dental-hadar.co.il/'] },
      'MAPS',
    )
    expect(s.status).toBe('NOT_LINKED')
  })

  it('collapses the same footer link repeated on every page', () => {
    const footerOnEveryPage = Array.from({ length: 40 }, () => 'https://facebook.com/hadar')
    expect(kind({ ...base, links: footerOnEveryPage }, 'SOCIAL').links).toEqual([
      'https://facebook.com/hadar',
    ])
  })

  it('survives a malformed link without throwing', () => {
    expect(() =>
      detectSignals({ ...base, links: ['not a url', '', 'javascript:void(0)', 'mailto:a@b.c'] }),
    ).not.toThrow()
  })
})

describe('the tasks it produces', () => {
  it('leads with the Google profile, which is the one that decides most', () => {
    expect(buildOffsite(base).tasks[0]!.kind).toBe('MAPS')
  })

  it('puts what is missing above what is already linked', () => {
    const report = buildOffsite({
      ...base,
      links: ['https://maps.app.goo.gl/abc'],
    })
    const firstLinkedAt = report.tasks.findIndex((t) => t.alreadyLinked)
    const lastMissingAt = report.tasks.map((t) => t.alreadyLinked).lastIndexOf(false)
    expect(firstLinkedAt).toBeGreaterThan(lastMissingAt)
  })

  it('changes what it asks for when the thing is already linked', () => {
    const missing = buildOffsite(base).tasks.find((t) => t.kind === 'MAPS')!
    const linked = buildOffsite({ ...base, links: ['https://maps.app.goo.gl/x'] }).tasks.find(
      (t) => t.kind === 'MAPS',
    )!
    expect(missing.steps.join(' ')).toContain('business.google.com')
    expect(linked.steps.join(' ')).not.toContain('business.google.com')
    expect(linked.minutes).toBeLessThan(missing.minutes)
  })

  it('never claims the business lacks a profile — only that the site does not link one', () => {
    // The whole credibility of this section rests on this sentence being careful.
    const maps = buildOffsite(base).tasks.find((t) => t.kind === 'MAPS')!
    expect(maps.why).toContain('לא מקושר')
    expect(maps.steps[0]).toContain('אם הוא כבר קיים')
  })

  it('leaves Waze out for a business with no location', () => {
    // A task that cannot apply is filler, and filler teaches a reader to skim the list.
    const noCity = buildOffsite({ ...base, city: null })
    expect(noCity.tasks.some((t) => t.kind === 'NAVIGATION')).toBe(false)
    expect(noCity.totalCount).toBe(4)
  })

  it('tells a business that pays for reviews not to', () => {
    const reviews = buildOffsite(base).tasks.find((t) => t.kind === 'REVIEWS')!
    expect(reviews.steps.join(' ')).toContain('אל תשלמו')
  })
})

describe('the summary line', () => {
  it('says plainly when there is only one source, and what that costs', () => {
    expect(buildOffsite(base).summary).toContain('מקור אחד')
  })

  it('counts correctly when some are linked', () => {
    const report = buildOffsite({
      ...base,
      links: ['https://maps.app.goo.gl/x', 'https://facebook.com/y'],
    })
    expect(report.linkedCount).toBe(2)
    expect(report.summary).toContain('2 מתוך 5')
  })

  it('stops asking when everything is linked', () => {
    const report = buildOffsite({
      ...base,
      links: [
        'https://maps.app.goo.gl/x',
        'https://facebook.com/y',
        'https://d.co.il/biz/1',
        'https://trustpilot.com/review/z',
        'https://waze.com/ul/abc',
      ],
    })
    expect(report.linkedCount).toBe(report.totalCount)
    expect(report.summary).toContain('כמה מלאים')
  })
})

describe('English', () => {
  it('is written throughout, with no Hebrew left in', () => {
    const report = buildOffsite({ ...base, language: 'en', verticalLabel: 'a dental clinic' })
    const all = [report.summary, ...report.tasks.flatMap((t) => [t.title, t.why, ...t.steps])]
    expect(all.join(' ')).not.toMatch(/[֐-׿]/)
  })
})
