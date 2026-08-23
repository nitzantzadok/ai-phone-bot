/**
 * The first thing a business owner reads.
 *
 * A report that opens with "4 / 100" has told the reader a number and nothing else. They
 * do not know whether 4 is bad, what a good score looks like, what produced it, or what to
 * do about it — and the three progress bars underneath do not answer any of those either.
 * By the time they reach the part of the page that would have helped, most of them have
 * decided the report is for somebody more technical than them.
 *
 * So the report opens in sentences instead. What happens today when a customer asks an
 * assistant about a business like theirs, why it happens, and the one thing to do first.
 * The number stays in the report — it is real and it is how progress gets measured — but
 * it appears after the explanation rather than in place of it.
 *
 * Every sentence here is built from what the scan actually read. Nothing is generic, and
 * where a fact is missing the verdict says it is missing rather than filling it in.
 */
import { fixGuide, IMPACT_RANK, type Bilingual, type FixGuide, type Language } from './explain.ts'


/** Coarse bands, because a two-point difference is not a finding. */
export type Band = 'INVISIBLE' | 'PARTIAL' | 'READY' | 'STRONG'

export interface VerdictInput {
  readonly score: number
  readonly businessName: string | null
  readonly city: string | null
  readonly phone: string | null
  readonly address: string | null
  /** The customer-facing name of the field the business is in, already localized. */
  readonly vertical: string
  readonly pagesRead: number
  /** Finding types present, in any order. Duplicates are fine. */
  readonly findingTypes: readonly string[]
  readonly language: Language
}

export interface Verdict {
  readonly band: Band
  /** One line naming the situation. */
  readonly headline: string
  /** Two or three sentences: what happens today, and why. */
  readonly explanation: string
  /** The single most valuable thing to do first, or null when nothing is wrong. */
  readonly startHere: {
    readonly title: string
    readonly why: string
    readonly minutes: number
    readonly who: 'YOU' | 'WEB_PERSON'
  } | null
  /** The facts an assistant needs and could not find. Empty when all four are present. */
  readonly missingFacts: readonly string[]
}

const BAND_LABEL: Readonly<Record<Band, Bilingual>> = {
  INVISIBLE: {
    he: 'המערכות כמעט לא יכולות לתאר אתכם',
    en: 'The systems can barely describe you',
  },
  PARTIAL: {
    he: 'חלק ממה שצריך נמצא, וחלק חסר',
    en: 'Some of what is needed is there, some is missing',
  },
  READY: {
    he: 'הבסיס קיים',
    en: 'The groundwork is in place',
  },
  STRONG: {
    he: 'האתר שלכם מוכן',
    en: 'Your site is ready',
  },
}

export const bandOf = (score: number): Band =>
  score >= 75 ? 'STRONG' : score >= 50 ? 'READY' : score >= 25 ? 'PARTIAL' : 'INVISIBLE'

export const bandLabel = (band: Band, language: Language): string =>
  language === 'he' ? BAND_LABEL[band].he : BAND_LABEL[band].en

/**
 * What a score means, stated as a range rather than a promise.
 *
 * Deliberately never phrased as a probability of being recommended. Nothing computable
 * from a website alone supports that claim, and the moment a report makes it, every number
 * on the page becomes a marketing figure.
 */
export const bandMeaning = (band: Band, language: Language): string => {
  const he = language === 'he'
  switch (band) {
    case 'INVISIBLE':
      return he
        ? 'מערכת AI שקוראת את האתר שלכם לא מצליחה להרכיב ממנו תשובה על העסק. זה לא אומר שהעסק לא טוב — זה אומר שמה שיודעים עליו לא כתוב במקום שהמערכת קוראת.'
        : 'An AI reading your site cannot assemble an answer about the business from it. That is not a statement about the business — it means what is known about it is not written where the system reads.'
    case 'PARTIAL':
      return he
        ? 'המערכת מזהה חלק מהפרטים ומפספסת אחרים. בפועל זה אומר שהיא עשויה להזכיר אתכם בשאלות כלליות, אבל תיפול לשאלות ספציפיות — ורוב השאלות של לקוחות הן ספציפיות.'
        : 'The system picks up some details and misses others. In practice it may mention you for broad questions and fail on specific ones — and most customer questions are specific.'
    case 'READY':
      return he
        ? 'המערכת מסוגלת לזהות אתכם ולתאר אתכם נכון. מכאן ההבדל הוא כבר לא טכני אלא תוכני: האם כתוב באתר מה שלקוחות באמת שואלים עליו.'
        : 'The system can identify you and describe you correctly. From here the difference is no longer technical but editorial: whether the site says what customers actually ask about.'
    case 'STRONG':
      return he
        ? 'הצד הטכני סגור. מה שיקבע מכאן זה כמה מהשאלות שלקוחות שואלים בתחום שלכם נענות באתר במפורש.'
        : 'The technical side is closed. What matters from here is how many of the questions customers ask in your field are answered on the site explicitly.'
  }
}

/* ------------------------------------------------------------- the vertical -- */

/**
 * What to call the field the business is in, in a sentence.
 *
 * The scan's `vertical` is an identifier — `local_business`, `home_services` — and it was
 * appearing verbatim in the report, under the heading "detected field". Nobody reading
 * that learns anything, and a customer who sees an underscore in their own report
 * correctly concludes they are looking at somebody's debug output.
 */
const VERTICAL_LABEL: Readonly<Record<string, Bilingual>> = {
  restaurant: { he: 'מסעדות', en: 'restaurants' },
  hotel: { he: 'מלונות', en: 'hotels' },
  lawyer: { he: 'עורכי דין', en: 'lawyers' },
  dentist: { he: 'מרפאות שיניים', en: 'dental clinics' },
  clinic: { he: 'מרפאות', en: 'clinics' },
  salon: { he: 'מספרות וטיפוח', en: 'salons' },
  gym: { he: 'חדרי כושר', en: 'gyms' },
  home_services: { he: 'בעלי מקצוע לבית', en: 'home services' },
  real_estate: { he: 'תיווך נדל״ן', en: 'estate agents' },
  event: { he: 'אולמות ואירועים', en: 'event venues' },
  tourism: { he: 'אטרקציות ותיירות', en: 'tourist attractions' },
  local_business: { he: 'עסקים בתחום שלכם', en: 'businesses in your field' },
}

export const verticalLabel = (vertical: string, language: Language): string => {
  const label = VERTICAL_LABEL[vertical] ?? VERTICAL_LABEL.local_business!
  return language === 'he' ? label.he : label.en
}

/* --------------------------------------------------------------- the facts --- */

const FACT_LABEL = {
  name: { he: 'שם העסק', en: 'the business name' },
  city: { he: 'העיר', en: 'the city' },
  phone: { he: 'מספר טלפון', en: 'a phone number' },
  address: { he: 'כתובת', en: 'an address' },
} as const

const missingFactsOf = (input: VerdictInput): string[] => {
  const he = input.language === 'he'
  const missing: string[] = []
  if (!input.businessName) missing.push(he ? FACT_LABEL.name.he : FACT_LABEL.name.en)
  if (!input.city) missing.push(he ? FACT_LABEL.city.he : FACT_LABEL.city.en)
  if (!input.phone) missing.push(he ? FACT_LABEL.phone.he : FACT_LABEL.phone.en)
  if (!input.address) missing.push(he ? FACT_LABEL.address.he : FACT_LABEL.address.en)
  return missing
}

/**
 * Joins a list for the sentence it sits in.
 *
 * `negative` matters only in English, where a list under a negation takes "or": "could not
 * find the name, the city, a phone number or an address". With "and" the sentence reads as
 * though all four together were missing but some individually might not be — the opposite
 * of what the scan found. Hebrew takes ו either way.
 */
const list = (items: readonly string[], language: Language, negative = false): string => {
  if (items.length <= 1) return items[0] ?? ''
  const last = items[items.length - 1]!
  const rest = items.slice(0, -1).join(', ')
  if (language === 'he') return `${rest} ו${last}`
  return `${rest} ${negative ? 'or' : 'and'} ${last}`
}

/* ---------------------------------------------------------- what to do first -- */

/**
 * The one thing to do first.
 *
 * A list of nine tasks and a list of one task produce very different behaviour from the
 * same person. Whichever guide is worst wins; ties break towards the one that takes less
 * time, because the first item being finishable is what makes the second one happen.
 */
const chooseFirst = (findingTypes: readonly string[]): FixGuide | null => {
  const guides = [...new Set(findingTypes)]
    .map((t) => fixGuide(t))
    .filter((g): g is FixGuide => g !== undefined)

  if (guides.length === 0) return null

  return guides.sort((a, b) => {
    const byImpact = IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]
    if (byImpact !== 0) return byImpact
    // Inside a level, the one that moves the needle most. Only then the shorter job.
    const byLeverage = b.leverage - a.leverage
    return byLeverage !== 0 ? byLeverage : a.minutes - b.minutes
  })[0]!
}

/* ------------------------------------------------------------- the verdict --- */

export const buildVerdict = (input: VerdictInput): Verdict => {
  const he = input.language === 'he'
  const band = bandOf(input.score)
  const missing = missingFactsOf(input)
  const first = chooseFirst(input.findingTypes)
  const name = input.businessName ?? (he ? 'העסק שלכם' : 'your business')

  /* The headline names the situation. It never opens with a number, and never opens with
     praise it has not earned. */
  const headline = ((): string => {
    if (band === 'INVISIBLE') {
      return he
        ? `היום, אם לקוח ישאל את ChatGPT על ${input.vertical}${input.city ? ` ב${input.city}` : ''}, אין כמעט סיכוי שהתשובה תזכיר אתכם.`
        : `Today, if a customer asks ChatGPT about ${input.vertical}${input.city ? ` in ${input.city}` : ''}, there is almost no chance the answer mentions you.`
    }
    if (band === 'PARTIAL') {
      return he
        ? `${name} מזוהה חלקית. בשאלות כלליות יש סיכוי שתופיעו; בשאלות ספציפיות — הרבה פחות.`
        : `${name} is partly identifiable. On broad questions you have a chance; on specific ones, much less.`
    }
    if (band === 'READY') {
      return he
        ? `מערכת AI שקוראת את האתר של ${name} מבינה מי אתם ומה אתם עושים.`
        : `An AI reading ${name}’s site understands who you are and what you do.`
    }
    return he
      ? `האתר של ${name} כתוב כך שמערכת AI יכולה לתאר אתכם נכון.`
      : `${name}’s site is written so an AI can describe you correctly.`
  })()

  /* Then why, from the actual facts. The missing ones are named — a business owner who
     reads "we could not find your phone number anywhere on the site" reacts to that
     sentence in a way no score moves them to. */
  const explanation = ((): string => {
    const parts: string[] = []

    if (missing.length > 0) {
      parts.push(
        he
          ? `קראנו ${input.pagesRead} עמודים באתר ולא הצלחנו למצוא בהם ${list(missing, 'he')}.`
          : `We read ${input.pagesRead} pages of the site and could not find ${list(missing, 'en', true)} on them.`,
      )
      parts.push(
        he
          ? 'מערכת AI לא ממציאה פרטים שהיא לא מצאה, והיא גם לא מנחשת. כשחסר לה מידע על עסק אחד, היא עונה על העסק שעליו יש לה מידע מלא.'
          : 'An AI does not invent details it did not find, and it does not guess. When it is short of information about one business, it answers about the business it has complete information on.',
      )
    } else {
      parts.push(
        he
          ? `קראנו ${input.pagesRead} עמודים באתר ומצאנו בהם את כל הפרטים הבסיסיים: שם, עיר, טלפון וכתובת.`
          : `We read ${input.pagesRead} pages and found all the basics on them: name, city, phone and address.`,
      )
    }

    /* Deliberately no "and the biggest thing we found is X" here. `startHere` names X
       immediately below with the time and the owner attached, and the action list opens
       with X in full — a reader who meets the same sentence three times in fifteen lines
       stops reading sentences. */

    return parts.join(' ')
  })()

  return {
    band,
    headline,
    explanation,
    startHere: first
      ? {
          title: he ? first.headline.he : first.headline.en,
          why: he ? first.costs.he : first.costs.en,
          minutes: first.minutes,
          who: first.who,
        }
      : null,
    missingFacts: missing,
  }
}
