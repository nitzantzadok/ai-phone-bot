/**
 * Hebrew agreement for generated questions.
 *
 * Hebrew adjectives and interrogatives agree with the gender of the noun, and the product
 * generates questions from a vocabulary where gender varies inside a single vertical:
 * "מרפאת שיניים" is feminine, "רופא שיניים" is masculine. A template that hard-codes one
 * of them produces "איזו רופא שיניים מתאימה" — which no Israeli would ever type, and
 * therefore measures a question nobody asks. For an Israel-first product that is not a
 * cosmetic defect; it invalidates the measurement.
 *
 * The rule below is the standard one (a noun ending in ה or ת is usually feminine) applied
 * to the head noun, with an explicit table for the words where the rule is wrong. The
 * table is the honest part: the heuristic is good, not perfect, and the exceptions are
 * listed rather than hidden.
 */

export type HebrewGender = 'M' | 'F'

/**
 * Words the ה/ת rule gets wrong. Mostly masculine agent nouns ending in ה
 * ("רואה חשבון", "מורה") and a few feminine nouns that end in a consonant.
 */
const GENDER_OVERRIDES: Record<string, HebrewGender> = {
  רואה: 'M',
  מורה: 'M',
  מאמן: 'M',
  מנקה: 'M',
  קבלן: 'M',
  שירותי: 'M',
  בית: 'M',
  סטודיו: 'M',
  מכון: 'M',
  משרד: 'M',
  צוות: 'M',
  אולם: 'M',
  חנות: 'F',
  מסגרת: 'F',
  קליניקה: 'F',
  פיצוציה: 'F',
  דלת: 'F',
  כיתה: 'F',
}

/** The word that carries the gender: the first, since Hebrew compounds are head-initial. */
const headNoun = (term: string): string => term.trim().split(/[\s-]+/)[0] ?? term

export const hebrewGender = (term: string): HebrewGender => {
  const head = headNoun(term)
  const override = GENDER_OVERRIDES[head]
  if (override) return override
  return /[הת]$/.test(head) ? 'F' : 'M'
}

/** Picks the form that agrees with the term. */
export const agree = (term: string, forms: { m: string; f: string }): string =>
  hebrewGender(term) === 'F' ? forms.f : forms.m

export const WHICH = { m: 'איזה', f: 'איזו' } as const
export const SUITABLE = { m: 'מתאים', f: 'מתאימה' } as const
export const PREFERABLE = { m: 'עדיף', f: 'עדיפה' } as const
export const RECOMMENDED = { m: 'מומלץ', f: 'מומלצת' } as const
export const GOOD = { m: 'טוב', f: 'טובה' } as const
