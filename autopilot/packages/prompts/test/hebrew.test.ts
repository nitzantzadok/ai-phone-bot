/**
 * Hebrew agreement.
 *
 * A generated question with the wrong gender is not a typo — it is a question no Hebrew
 * speaker would type, so measuring it measures demand that does not exist. These cases are
 * the real service terms from the vertical catalogue.
 */
import { describe, expect, it } from 'vitest'
import { agree, hebrewGender, GOOD, RECOMMENDED, SUITABLE, WHICH } from '../src/hebrew.ts'
import { generatePrompts } from '../src/generator.ts'
import { newId } from '@autopilot/shared/ids.ts'

describe('hebrewGender', () => {
  it('reads feminine nouns from their ending', () => {
    for (const term of ['מרפאת שיניים', 'מספרה', 'מסעדה', 'קליניקה', 'חנות', 'פיצרייה']) {
      expect(hebrewGender(term)).toBe('F')
    }
  })

  it('reads masculine nouns from their ending', () => {
    for (const term of ['רופא שיניים', 'מוסך', 'עורך דין', 'בית קפה', 'סטודיו', 'אורתודונט']) {
      expect(hebrewGender(term)).toBe('M')
    }
  })

  it('knows the words the ending rule gets wrong', () => {
    // Masculine agent nouns that end in ה.
    expect(hebrewGender('רואה חשבון')).toBe('M')
    expect(hebrewGender('מורה פרטי')).toBe('M')
  })

  it('takes gender from the head noun of a compound', () => {
    // "בית קפה" is masculine because "בית" is, not because "קפה" is last.
    expect(hebrewGender('בית קפה')).toBe('M')
    expect(hebrewGender('מרפאת שיניים')).toBe('F')
  })
})

describe('agree', () => {
  it('picks the agreeing form', () => {
    expect(agree('רופא שיניים', WHICH)).toBe('איזה')
    expect(agree('מרפאת שיניים', WHICH)).toBe('איזו')
    expect(agree('רופא שיניים', SUITABLE)).toBe('מתאים')
    expect(agree('מרפאת שיניים', SUITABLE)).toBe('מתאימה')
    expect(agree('מוסך', RECOMMENDED)).toBe('מומלץ')
    expect(agree('מספרה', GOOD)).toBe('טובה')
  })
})

describe('generated Hebrew questions', () => {
  const prompts = generatePrompts({
    businessId: newId<'BusinessId'>(),
    vertical: 'dentist',
    city: 'פתח תקווה',
    country: 'IL',
    languages: ['he'],
    cityNames: { he: 'פתח תקווה' },
    maxPrompts: 40,
  })

  it('never disagrees with its own noun', () => {
    for (const p of prompts) {
      // The two shapes the old templates produced for a masculine service term.
      expect(p.queryText).not.toMatch(/איזו רופא/)
      expect(p.queryText).not.toMatch(/רופא שיניים[^?]*מתאימה/)
      expect(p.queryText).not.toMatch(/רופא שיניים[^?]*עדיפה/)
    }
  })

  it('agrees correctly for a masculine service term', () => {
    const masculine = prompts.filter((p) => p.queryText.includes('רופא שיניים'))
    expect(masculine.length).toBeGreaterThan(0)
    for (const p of masculine) {
      if (p.queryText.startsWith('איז')) expect(p.queryText).toMatch(/^איזה /)
    }
  })
})
