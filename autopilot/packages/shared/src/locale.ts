/**
 * Language / direction / formatting. RTL is a first-class property, not a stylesheet
 * afterthought: it flows from the language of the *content*, which for this product can
 * differ per prompt, per page and per generated artefact within one tenant.
 */
export type LanguageCode = 'he' | 'en' | 'ar' | 'ru'
export type TextDirection = 'ltr' | 'rtl'

export interface LanguageInfo {
  readonly code: LanguageCode
  readonly nativeName: string
  readonly englishName: string
  readonly direction: TextDirection
  readonly defaultLocale: string
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  he: {
    code: 'he',
    nativeName: 'עברית',
    englishName: 'Hebrew',
    direction: 'rtl',
    defaultLocale: 'he-IL',
  },
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    direction: 'ltr',
    defaultLocale: 'en-US',
  },
  ar: {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    direction: 'rtl',
    defaultLocale: 'ar-IL',
  },
  ru: {
    code: 'ru',
    nativeName: 'Русский',
    englishName: 'Russian',
    direction: 'ltr',
    defaultLocale: 'ru-RU',
  },
}

export const directionOf = (lang: LanguageCode): TextDirection => LANGUAGES[lang].direction

export const isRtl = (lang: LanguageCode): boolean => directionOf(lang) === 'rtl'

const HEBREW_RANGE = /[֐-׿]/
const ARABIC_RANGE = /[؀-ۿ]/
const CYRILLIC_RANGE = /[Ѐ-ӿ]/

/**
 * Best-effort script detection for crawled content. Deliberately conservative: it reports
 * what script dominates, and callers treat it as evidence (with confidence), never as a
 * confirmed business fact.
 */
export const detectLanguage = (text: string): LanguageCode | null => {
  const sample = text.slice(0, 4000)
  const counts = {
    he: (sample.match(new RegExp(HEBREW_RANGE, 'g')) ?? []).length,
    ar: (sample.match(new RegExp(ARABIC_RANGE, 'g')) ?? []).length,
    ru: (sample.match(new RegExp(CYRILLIC_RANGE, 'g')) ?? []).length,
    en: (sample.match(/[A-Za-z]/g) ?? []).length,
  }
  const total = counts.he + counts.ar + counts.ru + counts.en
  if (total < 20) return null
  const [top] = (Object.entries(counts) as [LanguageCode, number][]).sort((a, b) => b[1] - a[1])
  if (!top) return null
  return top[1] / total >= 0.3 ? top[0] : null
}

/** Israeli businesses routinely mix scripts ("Rosa רוזה"). Detect rather than assume. */
export const isMixedScript = (text: string): boolean => {
  const hasHebrew = HEBREW_RANGE.test(text)
  const hasLatin = /[A-Za-z]/.test(text)
  return hasHebrew && hasLatin
}

export const formatDateTime = (d: Date, locale: string, timezone: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(d)

export const formatDate = (d: Date, locale: string, timezone: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone }).format(d)

export const formatPercent = (ratio: number, locale: string, digits = 0): string =>
  new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(ratio)
