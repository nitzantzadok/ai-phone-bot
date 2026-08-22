/**
 * The verdict is the only part of the report most readers finish. These tests hold it to
 * what that job requires: it says what happens today, it names the facts that are actually
 * missing from this particular site, and it never claims to predict a recommendation.
 */
import { describe, expect, it } from 'vitest'
import {
  bandOf,
  bandMeaning,
  buildVerdict,
  verticalLabel,
  type VerdictInput,
} from '../src/verdict.ts'

const base: VerdictInput = {
  score: 4,
  businessName: null,
  city: null,
  phone: null,
  address: null,
  vertical: 'מרפאת שיניים',
  pagesRead: 4,
  findingTypes: ['NO_STRUCTURED_DATA', 'MISSING_META_DESCRIPTION', 'TITLE_LENGTH'],
  language: 'he',
}

describe('bands', () => {
  it('splits the scale where the meaning changes, not evenly', () => {
    expect(bandOf(0)).toBe('INVISIBLE')
    expect(bandOf(24)).toBe('INVISIBLE')
    expect(bandOf(25)).toBe('PARTIAL')
    expect(bandOf(49)).toBe('PARTIAL')
    expect(bandOf(50)).toBe('READY')
    expect(bandOf(74)).toBe('READY')
    expect(bandOf(75)).toBe('STRONG')
    expect(bandOf(100)).toBe('STRONG')
  })

  it('explains every band in both languages without promising a recommendation', () => {
    for (const band of ['INVISIBLE', 'PARTIAL', 'READY', 'STRONG'] as const) {
      for (const language of ['he', 'en'] as const) {
        const text = bandMeaning(band, language)
        expect(text.length).toBeGreaterThan(40)
        // A score computed from a website cannot support a probability of being
        // recommended. The moment one is stated, every number on the page becomes a
        // marketing figure and the honest ones lose their meaning too.
        expect(text).not.toMatch(/\d+\s*%/)
      }
    }
  })
})

describe('a business nothing can describe', () => {
  const verdict = buildVerdict(base)

  it('opens with what happens today, not with a number', () => {
    expect(verdict.headline).not.toMatch(/^\d/)
    expect(verdict.headline).toContain('ChatGPT')
  })

  it('names the field and, when known, the city', () => {
    expect(verdict.headline).toContain('מרפאת שיניים')
    expect(buildVerdict({ ...base, city: 'חיפה' }).headline).toContain('בחיפה')
  })

  it('lists exactly the facts that were actually missing', () => {
    expect(verdict.missingFacts).toEqual(['שם העסק', 'העיר', 'מספר טלפון', 'כתובת'])
  })

  it('says how many pages it read, so the reader knows the finding is not a guess', () => {
    expect(verdict.explanation).toContain('4 עמודים')
  })

  it('points at one thing to do first, and it is the one that matters most', () => {
    // Not the crawler's idea of most severe: NO_STRUCTURED_DATA is MEDIUM severity there.
    expect(verdict.startHere?.title).toContain('כרטיס ביקור')
    expect(verdict.startHere?.who).toBe('WEB_PERSON')
  })
})

describe('a business whose details are all present', () => {
  const verdict = buildVerdict({
    ...base,
    score: 82,
    businessName: 'דנטל סנטר הדר',
    city: 'חיפה',
    phone: '04-8123456',
    address: 'הרצל 12, חיפה',
    findingTypes: [],
  })

  it('says so instead of inventing a problem', () => {
    expect(verdict.missingFacts).toEqual([])
    expect(verdict.startHere).toBeNull()
    expect(verdict.band).toBe('STRONG')
  })

  it('uses the real business name rather than a placeholder', () => {
    expect(verdict.headline).toContain('דנטל סנטר הדר')
  })

  it('still tells them what decides things from here', () => {
    expect(bandMeaning('STRONG', 'he')).toContain('שאלות')
  })
})

describe('choosing what comes first', () => {
  it('prefers the more damaging finding over the quicker one', () => {
    const v = buildVerdict({ ...base, findingTypes: ['TITLE_LENGTH', 'CLIENT_RENDERED'] })
    expect(v.startHere?.title).toContain('הדפדפן')
  })

  it('breaks a tie towards the shorter job, so the first item gets finished', () => {
    // MISSING_TITLE (5 min) and NO_STRUCTURED_DATA (20 min) are both critical.
    const v = buildVerdict({ ...base, findingTypes: ['NO_STRUCTURED_DATA', 'MISSING_TITLE'] })
    expect(v.startHere?.minutes).toBe(5)
  })

  it('ignores a finding type it has no explanation for rather than surfacing its code name', () => {
    const v = buildVerdict({ ...base, findingTypes: ['WHATEVER_COMES_NEXT'] })
    expect(v.startHere).toBeNull()
    expect(v.explanation).not.toContain('WHATEVER_COMES_NEXT')
  })
})

describe('English', () => {
  const verdict = buildVerdict({ ...base, language: 'en', vertical: 'a dental clinic' })

  it('is written, not translated at the point of display', () => {
    expect(verdict.headline).toContain('ChatGPT')
    expect(verdict.missingFacts).toEqual([
      'the business name',
      'the city',
      'a phone number',
      'an address',
    ])
    expect(verdict.explanation).not.toMatch(/[֐-׿]/)
  })
})

describe('naming the field the business is in', () => {
  it('never shows the identifier the code uses', () => {
    // "detected field: local_business" was on the page. An underscore in a customer's own
    // report tells them, correctly, that they are reading somebody's debug output.
    for (const vertical of [
      'restaurant',
      'dentist',
      'home_services',
      'local_business',
      'something_we_have_not_seen',
    ]) {
      for (const language of ['he', 'en'] as const) {
        expect(verticalLabel(vertical, language)).not.toMatch(/_/)
      }
    }
  })

  it('falls back to a phrase that still reads as a sentence', () => {
    expect(verticalLabel('unknown_vertical', 'he')).toBe('עסקים בתחום שלכם')
    expect(verticalLabel('unknown_vertical', 'en')).toBe('businesses in your field')
  })
})
