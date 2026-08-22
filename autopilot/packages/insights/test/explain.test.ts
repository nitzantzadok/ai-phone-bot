/**
 * The guarantee this file exists to hold: the crawler cannot emit a finding that the
 * report has no plain-language explanation for.
 *
 * Without this test the failure mode is silent and specific — somebody adds a finding to
 * the audit, it starts appearing in customers' reports in the crawler's own vocabulary,
 * and the only person who ever notices is a business owner who decides the report is not
 * meant for them and does not renew.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { allFixGuides, fixGuide, impactOf, IMPACT_RANK } from '../src/explain.ts'

/** Every findingType literal the audit can produce, read from the audit source itself. */
const emittedFindingTypes = (): string[] => {
  const source = readFileSync(
    fileURLToPath(new URL('../../crawler/src/audit.ts', import.meta.url)),
    'utf8',
  )
  return [...source.matchAll(/findingType: '([A-Z_]+)'/g)].map((m) => m[1]!)
}

describe('coverage', () => {
  it('explains every finding the crawler can produce', () => {
    const missing = emittedFindingTypes().filter((t) => fixGuide(t) === undefined)
    expect(missing).toEqual([])
  })

  it('found a non-trivial number of finding types to check', () => {
    // If the regex above ever stops matching, the test above passes vacuously and the
    // guarantee quietly evaporates.
    expect(emittedFindingTypes().length).toBeGreaterThan(15)
  })

  it('ranks an unknown finding below everything explained, never above', () => {
    expect(IMPACT_RANK[impactOf('SOMETHING_ADDED_LATER')]).toBe(IMPACT_RANK.MINOR)
  })
})

describe('every guide', () => {
  const guides = allFixGuides()

  it.each(guides.map((g) => [g.findingType, g] as const))(
    '%s says what it is, what it costs, and what to do — in both languages',
    (_type, guide) => {
      for (const text of [guide.headline, guide.what, guide.costs]) {
        expect(text.he.length).toBeGreaterThan(10)
        expect(text.en.length).toBeGreaterThan(10)
      }
      expect(guide.steps.length).toBeGreaterThan(0)
      for (const step of guide.steps) {
        expect(step.he.length).toBeGreaterThan(10)
        expect(step.en.length).toBeGreaterThan(10)
      }
    },
  )

  it.each(guides.map((g) => [g.findingType, g] as const))(
    '%s keeps jargon out of the part the owner reads',
    (_type, guide) => {
      // The words that make a reader decide a report is not for them. They are allowed in
      // the steps, where the reader is being told what to say to their web developer, and
      // in `what`, where the whole sentence exists to translate one of them.
      const jargon = /\b(canonical|meta description|structured data|JSON-LD|crawler|SERP|schema\.org|index)\b/i
      expect(guide.headline.he).not.toMatch(jargon)
      expect(guide.headline.en).not.toMatch(jargon)
      expect(guide.costs.he).not.toMatch(jargon)
    },
  )

  it.each(guides.map((g) => [g.findingType, g] as const))(
    '%s answers how long and who',
    (_type, guide) => {
      expect(guide.minutes).toBeGreaterThanOrEqual(0)
      // Half an hour is the honest ceiling for a single task on a list. Anything longer is
      // a project, and a project presented as a task is how a customer stops trusting the
      // estimates on everything else.
      expect(guide.minutes).toBeLessThanOrEqual(30)
      expect(['YOU', 'WEB_PERSON']).toContain(guide.who)
    },
  )

  it('does not tell an owner to do the things only a developer can', () => {
    // The two failure directions cost differently. Telling an owner to edit a rendering
    // strategy wastes their evening; telling them to call their web developer to change a
    // page title wastes their money and makes us look useless.
    expect(fixGuide('CLIENT_RENDERED')!.who).toBe('WEB_PERSON')
    expect(fixGuide('NOINDEX')!.who).toBe('WEB_PERSON')
    expect(fixGuide('MISSING_TITLE')!.who).toBe('YOU')
    expect(fixGuide('MISSING_META_DESCRIPTION')!.who).toBe('YOU')
    expect(fixGuide('THIN_CONTENT')!.who).toBe('YOU')
  })
})

describe('impact, which is not severity', () => {
  it('puts a blank page above a title four characters too long', () => {
    expect(IMPACT_RANK[impactOf('CLIENT_RENDERED')]).toBeLessThan(
      IMPACT_RANK[impactOf('TITLE_LENGTH')],
    )
  })

  it('reserves CRITICAL for content that genuinely cannot enter an answer', () => {
    // CRITICAL carries a sentence that says "there is nothing to read". Only three
    // findings can honestly wear it: a page that asks to be excluded, a page whose text
    // does not exist until a browser draws it, and a page that does not load.
    const critical = allFixGuides().filter((g) => g.impact === 'CRITICAL').map((g) => g.findingType)
    expect(critical.sort()).toEqual(['BROKEN_PAGE', 'CLIENT_RENDERED', 'NOINDEX'])
  })

  it('does not call a missing business card critical, however much it matters', () => {
    // It is the highest-leverage finding in the table and it still is not "you cannot
    // appear": a site with well-written plain text gets recommended without one every
    // day. A customer who fixes an overstated claim and notices it was overstated has
    // learned to discount every other number in the report.
    expect(impactOf('NO_STRUCTURED_DATA')).toBe('IMPORTANT')
    expect(fixGuide('NO_STRUCTURED_DATA')!.leverage).toBeGreaterThan(0.85)
  })

  it('leads its level on leverage, so the honest ranking still reads usefully', () => {
    const important = allFixGuides()
      .filter((g) => g.impact === 'IMPORTANT')
      .sort((a, b) => b.leverage - a.leverage)
      .map((g) => g.findingType)
    expect(important.slice(0, 2)).toEqual(['MISSING_TITLE', 'NO_STRUCTURED_DATA'])
  })

  it('gives every guide a leverage inside the range it is documented as', () => {
    for (const g of allFixGuides()) {
      expect(g.leverage).toBeGreaterThan(0)
      expect(g.leverage).toBeLessThanOrEqual(1)
    }
  })

  it('treats a missing canonical link as minor, though the crawler calls it medium', () => {
    expect(impactOf('MISSING_CANONICAL')).toBe('MINOR')
  })

  it('has at least one finding at each level, so the scale means something', () => {
    const levels = new Set(allFixGuides().map((g) => g.impact))
    expect([...levels].sort()).toEqual(['CRITICAL', 'IMPORTANT', 'MINOR'])
  })
})
