/**
 * Everything that decides whether an assistant recommends a business, that is not the
 * business's website.
 *
 * The site half of this product answers "can a machine read you and describe you
 * correctly". That is necessary and it is not sufficient, and pretending otherwise is the
 * central dishonesty of every tool in this category. When an assistant answers "a good
 * dentist in Haifa", it is not reading one website and ranking it. It is assembling an
 * answer from the places that agree about a business — a maps listing, a directory, a
 * page of reviews, somebody else's article — and a business that exists in exactly one of
 * those places is a business it has one source for. One source is a business it mentions
 * cautiously or not at all.
 *
 * So this module asks the second question. It is bounded by something important:
 *
 * **We only report what we can see.** From a crawl we can see, with certainty, which
 * external profiles a site links to — a maps link in the footer, a Facebook icon in the
 * header, a reviews widget. We cannot see whether an unlinked profile exists, and we do
 * not guess. Every finding here therefore says "your site does not point at X", never
 * "you do not have X", and the difference is not pedantry: a business with a thriving
 * Google profile that simply never linked it would otherwise be told it has no profile,
 * would know that was wrong, and would stop believing the rest of the report.
 *
 * What that limitation costs us is small, because the recommendation is nearly the same
 * either way. If the profile exists and is unlinked, linking it is the fix. If it does not
 * exist, creating it is the fix. Both are on the list, and the item says which is which.
 */
import type { Bilingual, Language } from './explain.ts'

/** The kinds of corroboration an assistant actually draws on. */
export type OffsiteKind =
  | 'MAPS' // Google Business Profile / Google Maps
  | 'REVIEWS' // anywhere a customer's own words are published
  | 'DIRECTORY' // a listing site for the vertical or the country
  | 'SOCIAL' // Facebook, Instagram — where Israeli small businesses actually post
  | 'NAVIGATION' // Waze, in Israel specifically

export type OffsiteStatus = 'LINKED' | 'NOT_LINKED'

export interface OffsiteSignal {
  readonly kind: OffsiteKind
  readonly status: OffsiteStatus
  /** The external addresses the site links to for this, if any. */
  readonly links: readonly string[]
}

export interface OffsiteTask {
  readonly id: string
  readonly kind: OffsiteKind
  readonly title: string
  /** Why this changes whether an assistant names them. */
  readonly why: string
  readonly steps: readonly string[]
  readonly minutes: number
  /** True when the site already links to one of these and this is a strengthening step. */
  readonly alreadyLinked: boolean
  /** Ordered by how much it moves an answer, most first. */
  readonly leverage: number
}

/* ------------------------------------------------------------- what we can see --- */

/**
 * Host patterns per kind.
 *
 * Matched against the link's host, never the whole URL: a page that merely mentions the
 * word "facebook" in its text is not a linked profile, and matching loosely would report
 * presence that is not there — the one failure this module is built to avoid.
 */
const HOST_PATTERNS: Readonly<Record<OffsiteKind, readonly RegExp[]>> = {
  MAPS: [/(^|\.)google\.[a-z.]+$/, /(^|\.)goo\.gl$/, /(^|\.)maps\.app\.goo\.gl$/],
  REVIEWS: [
    /(^|\.)trustpilot\.com$/,
    /(^|\.)yelp\.[a-z.]+$/,
    /(^|\.)tripadvisor\.[a-z.]+$/,
    /(^|\.)zap\.co\.il$/,
    /(^|\.)rest\.co\.il$/,
    /(^|\.)mitchatnim\.co\.il$/,
  ],
  DIRECTORY: [
    /(^|\.)d\.co\.il$/, // דפי זהב
    /(^|\.)dapey-zahav\.co\.il$/,
    /(^|\.)easy\.co\.il$/,
    /(^|\.)b144\.co\.il$/,
    /(^|\.)zap\.co\.il$/,
    /(^|\.)yad2\.co\.il$/,
  ],
  SOCIAL: [
    /(^|\.)facebook\.com$/,
    /(^|\.)fb\.com$/,
    /(^|\.)instagram\.com$/,
    /(^|\.)tiktok\.com$/,
    /(^|\.)linkedin\.com$/,
    /(^|\.)youtube\.com$/,
    /(^|\.)youtu\.be$/,
  ],
  NAVIGATION: [/(^|\.)waze\.com$/],
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface OffsiteInput {
  /** Every link the crawl saw, internal ones included; they are filtered here. */
  readonly links: readonly string[]
  /** The business's own host, so its own pages never count as external corroboration. */
  readonly siteUrl: string
  readonly language: Language
  /** Customer-facing name of the field, for writing the tasks. */
  readonly verticalLabel: string
  readonly city: string | null
}

export const detectSignals = (input: OffsiteInput): readonly OffsiteSignal[] => {
  const ownHost = hostOf(input.siteUrl)

  const external = input.links
    .map((url) => ({ url, host: hostOf(url) }))
    .filter((l): l is { url: string; host: string } => l.host !== null && l.host !== ownHost)

  return (Object.keys(HOST_PATTERNS) as OffsiteKind[]).map((kind) => {
    const patterns = HOST_PATTERNS[kind]
    const matches = external.filter((l) => patterns.some((p) => p.test(l.host)))
    // Same profile linked from every page in the footer is one profile, not forty.
    const links = [...new Set(matches.map((m) => m.url))].slice(0, 3)
    return { kind, status: links.length > 0 ? 'LINKED' : 'NOT_LINKED', links } as const
  })
}

/* ------------------------------------------------------------------- tasks --- */

const t = (value: Bilingual, language: Language) => (language === 'he' ? value.he : value.en)

interface TaskTemplate {
  readonly id: string
  readonly kind: OffsiteKind
  readonly leverage: number
  readonly minutes: number
  readonly title: Bilingual
  readonly whyMissing: Bilingual
  readonly whyLinked: Bilingual
  readonly stepsMissing: readonly Bilingual[]
  readonly stepsLinked: readonly Bilingual[]
}

const TEMPLATES: readonly TaskTemplate[] = [
  {
    id: 'offsite-maps',
    kind: 'MAPS',
    leverage: 1,
    minutes: 25,
    title: {
      he: 'פרופיל Google של העסק — הדבר החשוב ביותר מחוץ לאתר',
      en: 'Your Google Business Profile — the most important thing outside the site',
    },
    whyMissing: {
      he: 'כששואלים מערכת AI על עסק מקומי, הפרופיל בגוגל הוא לרוב המקור הראשון שהיא בודקת — שם יושבות שעות הפתיחה, הכתובת, הטלפון והביקורות במקום אחד שהיא סומכת עליו. עסק שאין לו פרופיל כזה, או שיש לו והוא לא מקושר מהאתר, נשען על מקור אחד בלבד: האתר שלו. מקור אחד זה עסק שהמערכת מזכירה בזהירות, אם בכלל.',
      en: 'When an assistant is asked about a local business, the Google profile is usually the first source it checks — hours, address, phone and reviews in one place it trusts. A business with no such profile, or with one the site never links, is leaning on a single source: its own website. One source is a business that gets mentioned cautiously, if at all.',
    },
    whyLinked: {
      he: 'האתר שלכם מקשר לגוגל, וזה טוב. מה שקובע מכאן זה כמה הפרופיל עצמו מלא — פרופיל חלקי שווה הרבה פחות מפרופיל שלם.',
      en: 'Your site links to Google, which is good. What matters from here is how complete the profile itself is — a half-filled profile is worth much less than a full one.',
    },
    stepsMissing: [
      {
        he: 'היכנסו ל-business.google.com וחפשו את העסק שלכם. אם הוא כבר קיים — תבקשו בעלות ("Claim this business"). אם לא — צרו פרופיל חדש.',
        en: 'Go to business.google.com and search for your business. If it already exists, claim it. If not, create a new profile.',
      },
      {
        he: 'מלאו הכול: קטגוריה, כתובת מדויקת, טלפון, שעות פתיחה, אתר. שעות מיוחדות בחגים — גם.',
        en: 'Fill in everything: category, exact address, phone, opening hours, website. Holiday hours too.',
      },
      {
        he: 'ודאו שהשם, הטלפון והכתובת שם זהים בדיוק למה שכתוב באתר שלכם. סתירה בין השניים מורידה את הביטחון של המערכת בשניהם.',
        en: 'Make sure the name, phone and address there match your site exactly. A contradiction between them lowers the system’s confidence in both.',
      },
      {
        he: 'הוסיפו קישור לפרופיל מהאתר שלכם — בדרך כלל בעמוד "צרו קשר" או בתחתית העמוד.',
        en: 'Add a link to the profile from your site — usually on the Contact page or in the footer.',
      },
    ],
    stepsLinked: [
      {
        he: 'פתחו את הפרופיל ובדקו שכל שדה מלא: קטגוריה, שעות, תיאור, תמונות עדכניות.',
        en: 'Open the profile and check every field is filled: category, hours, description, current photos.',
      },
      {
        he: 'השוו שם, טלפון וכתובת מול האתר. כל הבדל — גם בפורמט — כדאי ליישר.',
        en: 'Compare name, phone and address against the site. Straighten out any difference, formatting included.',
      },
    ],
  },
  {
    id: 'offsite-reviews',
    kind: 'REVIEWS',
    leverage: 0.9,
    minutes: 20,
    title: {
      he: 'ביקורות אמיתיות — מה שאתם אומרים על עצמכם שווה פחות ממה שאחרים אומרים',
      en: 'Real reviews — what others say about you outweighs what you say about yourself',
    },
    whyMissing: {
      he: 'מערכת AI מתייחסת אחרת למשפט שכתבתם על עצמכם ("שירות מעולה") ולמשפט שלקוח כתב עליכם. הראשון הוא שיווק, השני הוא ראיה. כששתי מרפאות נראות זהות באתר שלהן, מה שמכריע זו זו שיש עליה עשרים ביקורות שמזכירות "מקבלים ילדים בלי תור" — כי המילים האלה נמצאות איפשהו, כתובות בידי מישהו אחר.',
      en: 'An assistant treats a sentence you wrote about yourself ("excellent service") differently from a sentence a customer wrote about you. The first is marketing, the second is evidence. When two clinics look identical on their own sites, what decides it is the one with twenty reviews mentioning "sees children without an appointment" — because those words exist somewhere, written by somebody else.',
    },
    whyLinked: {
      he: 'יש לכם ביקורות מקושרות. השאלה מכאן היא כמה, וכמה עדכניות — ביקורות מלפני ארבע שנים שוות פחות מביקורות מהחודש.',
      en: 'You have reviews linked. The question from here is how many, and how recent — reviews from four years ago count for less than reviews from this month.',
    },
    stepsMissing: [
      {
        he: 'בקשו מעשרה לקוחות מרוצים שאתם מכירים אישית לכתוב ביקורת בגוגל. שלחו להם קישור ישיר — לא "תחפשו אותנו".',
        en: 'Ask ten satisfied customers you know personally to leave a Google review. Send them a direct link — not "look us up".',
      },
      {
        he: 'אל תשלמו על ביקורות ואל תכתבו אותן בעצמכם. זה מזוהה, וזה מוחק את האמון שבניתם.',
        en: 'Never pay for reviews and never write them yourself. It gets detected, and it erases the trust you built.',
      },
      {
        he: 'ענו לכל ביקורת, גם לשלילית. תשובה עניינית לביקורת רעה שווה יותר מביקורת טובה נוספת.',
        en: 'Reply to every review, negative ones included. A level-headed reply to a bad review is worth more than one more good one.',
      },
    ],
    stepsLinked: [
      {
        he: 'המשיכו לבקש ביקורות באופן קבוע — קצב הוא מה שנספר, לא רק הכמות הכוללת.',
        en: 'Keep asking for reviews steadily — the rate counts, not only the total.',
      },
    ],
  },
  {
    id: 'offsite-directory',
    kind: 'DIRECTORY',
    leverage: 0.6,
    minutes: 30,
    title: {
      he: 'מדריכים ואינדקסים בתחום שלכם',
      en: 'Directories and indexes for your field',
    },
    whyMissing: {
      he: 'כל מדריך שמפרט אתכם הוא מקור נוסף שמאשר את אותם פרטים. זה לא הדבר החזק ביותר ברשימה, אבל הוא בשליטה מלאה שלכם והוא לרוב חינם.',
      en: 'Every directory listing you is one more source confirming the same details. Not the strongest thing on this list, but entirely within your control and usually free.',
    },
    whyLinked: {
      he: 'אתם כבר מופיעים באינדקס אחד לפחות. שווה לוודא שהפרטים שם מעודכנים — רישום ישן עם טלפון שהתחלף מזיק יותר משהוא מועיל.',
      en: 'You already appear in at least one index. Worth checking the details there are current — an old listing with a changed phone number does more harm than good.',
    },
    stepsMissing: [
      {
        he: 'הירשמו לדפי זהב (d.co.il) ולאיזי (easy.co.il). שניהם חינם ומוכרים היטב בישראל.',
        en: 'Register on d.co.il and easy.co.il. Both are free and well-known in Israel.',
      },
      {
        he: 'חפשו את המדריך הספציפי לתחום שלכם — לכל תחום יש אחד או שניים שכולם מכירים.',
        en: 'Find the directory specific to your field — every field has one or two everyone knows.',
      },
      {
        he: 'בכל רישום: אותו שם בדיוק, אותו טלפון, אותה כתובת. זה כל העניין.',
        en: 'In every listing: the exact same name, phone and address. That is the entire point.',
      },
    ],
    stepsLinked: [
      {
        he: 'עברו על הרישומים הקיימים ותקנו כל פרט שהתיישן.',
        en: 'Go through the existing listings and correct anything that has gone stale.',
      },
    ],
  },
  {
    id: 'offsite-social',
    kind: 'SOCIAL',
    leverage: 0.4,
    minutes: 15,
    title: {
      he: 'עמוד פייסבוק או אינסטגרם מקושר מהאתר',
      en: 'A Facebook or Instagram page linked from the site',
    },
    whyMissing: {
      he: 'לא כל מערכת AI קוראת רשתות חברתיות, ולכן ההשפעה כאן בינונית. מה שכן — עמוד פעיל עם אותם פרטי קשר הוא עוד מקום שבו הפרטים שלכם מופיעים באופן עקבי, וזה נספר.',
      en: 'Not every assistant reads social networks, so the effect here is moderate. What does count: an active page carrying the same contact details is one more place your information appears consistently.',
    },
    whyLinked: {
      he: 'מקושר. ודאו שפרטי הקשר שם זהים לאלה שבאתר.',
      en: 'Linked. Check the contact details there match the site.',
    },
    stepsMissing: [
      {
        he: 'קשרו מהאתר לעמוד הפעיל שלכם. אם אין עמוד פעיל — עדיף לא לפתוח אחד ולנטוש אותו.',
        en: 'Link from the site to your active page. If you have no active page, better not to open one and abandon it.',
      },
      {
        he: 'ודאו ששם העסק, הטלפון והכתובת שם זהים לאתר.',
        en: 'Make sure the business name, phone and address there match the site.',
      },
    ],
    stepsLinked: [
      {
        he: 'בדקו שהפרטים בעמוד עדכניים.',
        en: 'Check the details on the page are current.',
      },
    ],
  },
  {
    id: 'offsite-waze',
    kind: 'NAVIGATION',
    leverage: 0.3,
    minutes: 10,
    title: { he: 'Waze — רלוונטי לעסקים שמגיעים אליהם', en: 'Waze — for businesses people drive to' },
    whyMissing: {
      he: 'בישראל, Waze הוא איך שאנשים מגיעים למקום. אם העסק לא מופיע שם נכון, לקוח שקיבל את ההמלצה עדיין לא מוצא אתכם — וזה הפסד של לקוח אחרי שכבר זכיתם בו.',
      en: 'In Israel, Waze is how people get somewhere. If the business is not correctly listed, a customer who got the recommendation still cannot find you — losing a customer after you had already won them.',
    },
    whyLinked: { he: 'מקושר. ודאו שהסיכה במקום הנכון.', en: 'Linked. Check the pin is in the right place.' },
    stepsMissing: [
      {
        he: 'חפשו את העסק ב-Waze. אם הוא לא שם או שהסיכה במקום הלא נכון — אפשר לתקן דרך waze.com/he/business.',
        en: 'Search for the business in Waze. If it is missing or the pin is wrong, fix it at waze.com/business.',
      },
      {
        he: 'רלוונטי בעיקר לעסקים עם כתובת פיזית שלקוחות מגיעים אליה.',
        en: 'Mostly relevant to businesses with a physical address customers travel to.',
      },
    ],
    stepsLinked: [{ he: 'ודאו שהסיכה מדויקת.', en: 'Check the pin is accurate.' }],
  },
]

/**
 * Which kinds are worth raising for this business.
 *
 * Waze only matters to somewhere you drive to; raising it for a business with no address
 * is filler, and filler in a task list teaches the reader to skim the whole list.
 */
const applies = (kind: OffsiteKind, input: OffsiteInput): boolean =>
  kind !== 'NAVIGATION' || input.city !== null

export interface OffsiteReport {
  readonly signals: readonly OffsiteSignal[]
  readonly tasks: readonly OffsiteTask[]
  /** How many kinds the site links to at all. */
  readonly linkedCount: number
  readonly totalCount: number
  /** One line summarising where the business stands outside its own site. */
  readonly summary: string
}

export const buildOffsite = (input: OffsiteInput): OffsiteReport => {
  const signals = detectSignals(input)
  const byKind = new Map(signals.map((s) => [s.kind, s]))
  const language = input.language

  const tasks = TEMPLATES.filter((template) => applies(template.kind, input))
    .map((template) => {
      const signal = byKind.get(template.kind)
      const linked = signal?.status === 'LINKED'
      return {
        id: template.id,
        kind: template.kind,
        title: t(template.title, language),
        why: t(linked ? template.whyLinked : template.whyMissing, language),
        steps: (linked ? template.stepsLinked : template.stepsMissing).map((s) => t(s, language)),
        minutes: linked ? Math.round(template.minutes / 2) : template.minutes,
        alreadyLinked: linked,
        leverage: template.leverage,
      }
    })
    // Unlinked first — that is where the work is — then by leverage within each group.
    .sort((a, b) => {
      if (a.alreadyLinked !== b.alreadyLinked) return a.alreadyLinked ? 1 : -1
      return b.leverage - a.leverage
    })

  const relevant = signals.filter((s) => applies(s.kind, input))
  const linkedCount = relevant.filter((s) => s.status === 'LINKED').length

  const he = language === 'he'
  const summary =
    linkedCount === 0
      ? he
        ? 'האתר שלכם לא מקשר לאף מקום חיצוני. מבחינת מערכת AI, כל מה שידוע עליכם מגיע ממקור אחד — מכם. עסק עם מקור אחד הוא עסק שמזכירים בזהירות.'
        : 'Your site links to no external place at all. As far as an assistant is concerned, everything known about you comes from one source — you. A business with one source is one that gets mentioned cautiously.'
      : linkedCount === relevant.length
        ? he
          ? 'האתר מקשר לכל סוגי המקורות החיצוניים שבדקנו. מכאן זה כבר לא שאלה של האם — אלא של כמה מלאים ומעודכנים המקומות האלה.'
          : 'The site links to every kind of external source we check for. From here it is no longer whether, but how complete and current those places are.'
        : he
          ? `האתר מקשר ל-${linkedCount} מתוך ${relevant.length} סוגי מקורות חיצוניים. כל אחד שחסר הוא מקום שבו מערכת AI הייתה יכולה לאמת אתכם, ולא מצאה כלום.`
          : `The site links to ${linkedCount} of ${relevant.length} kinds of external source. Each missing one is a place an assistant could have corroborated you, and found nothing.`

  return { signals, tasks, linkedCount, totalCount: relevant.length, summary }
}
