/**
 * The version of the report meant for whoever built the site.
 *
 * A report can be perfectly clear and still change nothing. Roughly half of what a scan
 * finds cannot be fixed from inside a site editor by the person who owns the business —
 * a rendering strategy, a canonical tag, a lang attribute. Telling that owner, kindly and
 * in plain Hebrew, about a problem they cannot touch converts into exactly one action:
 * they forward it to their web developer. Every report of this kind relies on that
 * forward, and none of them make it easy.
 *
 * So we write the forward. Plain text, no styling, technically precise — the vocabulary
 * the owner-facing report deliberately avoids is correct here, because the reader is
 * someone who edits HTML for a living and does not want an analogy about a shop sign.
 *
 * The JSON-LD block is generated from the facts this scan actually read, so it is not a
 * template with placeholders somebody has to fill in and probably will not. Fields the
 * scan could not find are left out entirely rather than stubbed: a business card that
 * confidently states the wrong phone number is worse than one missing a line, and a
 * developer who pastes `"telephone": "TODO"` into production has been failed by us.
 */
import { fixGuide, IMPACT_RANK, type FixGuide, type Impact, type Language } from './explain.ts'
import { answerCrawlerAgents } from './unblock.ts'


export interface HandoffInput {
  readonly siteUrl: string
  readonly businessName: string | null
  readonly city: string | null
  readonly phone: string | null
  readonly address: string | null
  /** schema.org type, e.g. LocalBusiness / Dentist / Restaurant. */
  readonly entityType: string
  readonly openingHours?: readonly string[]
  /** Finding types, with the affected page addresses for each. */
  readonly findings: readonly { readonly findingType: string; readonly urls: readonly string[] }[]
  readonly language: Language
}

export interface Handoff {
  /** Plain text, ready to paste into an email or WhatsApp. */
  readonly text: string
  /** The JSON-LD block on its own, for a copy button next to it. */
  readonly jsonLd: string | null
  /** How many of the findings in this handoff genuinely need a developer. */
  readonly developerItems: number
}

/* -------------------------------------------------------------- structured --- */

/**
 * The business card, built only from facts that were read.
 *
 * Returns null when there is not enough to identify the business at all. A JSON-LD block
 * carrying nothing but `@type` is not a starting point, it is noise that looks like work.
 */
export const buildJsonLd = (input: HandoffInput): string | null => {
  if (!input.businessName) return null

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': input.entityType || 'LocalBusiness',
    name: input.businessName,
    url: input.siteUrl,
  }

  if (input.phone) node.telephone = input.phone

  if (input.address || input.city) {
    const address: Record<string, string> = { '@type': 'PostalAddress', addressCountry: 'IL' }
    if (input.address) address.streetAddress = input.address
    if (input.city) address.addressLocality = input.city
    node.address = address
  }

  if (input.openingHours && input.openingHours.length > 0) {
    node.openingHours = [...input.openingHours]
  }

  return `<script type="application/ld+json">\n${JSON.stringify(node, null, 2)}\n</script>`
}

/* ------------------------------------------------------------------- text --- */

/** What the developer needs to hear, per finding. Terse and exact; no analogies. */
const DEV_INSTRUCTION: Readonly<Record<string, { he: string; en: string }>> = {
  NOINDEX: {
    he: 'להסיר את meta robots noindex מהעמודים הבאים (אלא אם זה מכוון).',
    en: 'Remove the noindex robots meta from the pages below (unless it is deliberate).',
  },
  CLIENT_RENDERED: {
    he: 'התוכן מוזרק ב-JavaScript ולא קיים ב-HTML הראשוני. צריך SSR או pre-rendering לעמודים הציבוריים.',
    en: 'Content is injected by JavaScript and absent from the initial HTML. The public pages need SSR or pre-rendering.',
  },
  BROKEN_PAGE: {
    he: 'העמודים הבאים מחזירים 4xx/5xx. לתקן או להפנות ב-301.',
    en: 'The pages below return 4xx/5xx. Fix them or 301 them.',
  },
  MISSING_TITLE: {
    he: 'להוסיף <title> ייחודי לכל עמוד, בתבנית: שם העסק – תחום – עיר.',
    en: 'Add a unique <title> per page, in the pattern: business name – field – city.',
  },
  NO_STRUCTURED_DATA: {
    he: 'להוסיף JSON-LD מסוג LocalBusiness. הבלוק המוכן מצורף למטה — לשים אותו ב-<head> של עמוד הבית לפחות.',
    en: 'Add LocalBusiness JSON-LD. The ready block is attached below — put it in the <head> of at least the home page.',
  },
  MISSING_META_DESCRIPTION: {
    he: 'להוסיף meta description ייחודי לכל עמוד, 50–160 תווים.',
    en: 'Add a unique meta description per page, 50–160 characters.',
  },
  MISSING_CANONICAL: {
    he: 'להוסיף rel="canonical" מוחלט לכל עמוד.',
    en: 'Add an absolute rel="canonical" to every page.',
  },
  MISSING_H1: {
    he: 'לכל עמוד צריך H1 אחד עם נושא העמוד.',
    en: 'Every page needs exactly one H1 carrying the page topic.',
  },
  NO_SITEMAP: {
    he: 'לייצר sitemap.xml ולהצהיר עליו ב-robots.txt.',
    en: 'Generate sitemap.xml and declare it in robots.txt.',
  },
  NO_ROBOTS_TXT: {
    he: `להוסיף robots.txt בשורש שלא חוסם את הסורקים האלה: ${answerCrawlerAgents()}.`,
    en: `Add robots.txt at the root that does not block these crawlers: ${answerCrawlerAgents()}.`,
  },
  MISSING_LANG_ATTRIBUTE: {
    he: 'להוסיף lang ל-<html>. בעמודים בעברית: lang="he" dir="rtl".',
    en: 'Add lang to <html>. On Hebrew pages: lang="he" dir="rtl".',
  },
  LANGUAGE_MISMATCH: {
    he: 'ה-lang שמוצהר לא תואם את שפת התוכן בעמודים הבאים.',
    en: 'The declared lang does not match the content language on the pages below.',
  },
  DUPLICATE_TITLE: {
    he: 'כמה עמודים חולקים <title> זהה. לייחד.',
    en: 'Several pages share an identical <title>. Make them unique.',
  },
  DUPLICATE_META_DESCRIPTION: {
    he: 'כמה עמודים חולקים meta description זהה. לייחד.',
    en: 'Several pages share an identical meta description. Make them unique.',
  },
  TITLE_LENGTH: {
    he: 'אורך ה-<title> מחוץ לטווח 15–65 תווים בעמודים הבאים.',
    en: 'Title length is outside 15–65 characters on the pages below.',
  },
  META_DESCRIPTION_LENGTH: {
    he: 'אורך ה-meta description מחוץ לטווח 50–165 תווים.',
    en: 'Meta description length is outside 50–165 characters.',
  },
  MISSING_IMAGE_ALT: {
    he: 'להוסיף alt לתמונות תוכן. חשוב במיוחד: פרטי קשר שמופיעים רק בתוך תמונה צריכים להיכתב גם כטקסט.',
    en: 'Add alt to content images. Most important: contact details that appear only inside an image must also exist as text.',
  },
  BROKEN_LINK: {
    he: 'קישורים פנימיים שבורים.',
    en: 'Broken internal links.',
  },
  THIN_CONTENT: {
    he: 'תוכן דל (מתחת ל-120 מילים). זו החלטה של בעל העסק, לא שלכם — מצורף לידיעה.',
    en: 'Thin content (under 120 words). That is the owner’s call, not yours — included for awareness.',
  },
}

const IMPACT_HEADING: Readonly<Record<Impact, { he: string; en: string }>> = {
  CRITICAL: { he: 'חוסם', en: 'Blocking' },
  IMPORTANT: { he: 'משמעותי', en: 'Significant' },
  MINOR: { he: 'קטן', en: 'Minor' },
}

/** Enough addresses to locate the problem; the full list belongs in the report, not an email. */
const MAX_URLS_PER_ITEM = 6

export const buildHandoff = (input: HandoffInput): Handoff => {
  const he = input.language === 'he'

  const items = input.findings
    .map((f) => ({ finding: f, guide: fixGuide(f.findingType) }))
    .filter((x): x is { finding: (typeof input.findings)[number]; guide: FixGuide } =>
      x.guide !== undefined && DEV_INSTRUCTION[x.finding.findingType] !== undefined,
    )
    .sort((a, b) => IMPACT_RANK[a.guide.impact] - IMPACT_RANK[b.guide.impact])

  const jsonLd = buildJsonLd(input)
  const needsJsonLd = items.some((i) => i.finding.findingType === 'NO_STRUCTURED_DATA')

  const lines: string[] = []

  lines.push(
    he
      ? `היי — הרצנו בדיקה על ${input.siteUrl} כדי לראות אם מערכות AI (ChatGPT, Gemini, Claude) מסוגלות לקרוא את האתר ולתאר את העסק נכון. אלה הממצאים, לפי סדר חשיבות.`
      : `Hi — we ran a check on ${input.siteUrl} to see whether AI systems (ChatGPT, Gemini, Claude) can read the site and describe the business correctly. Findings below, most important first.`,
  )
  lines.push('')

  let lastImpact: Impact | null = null
  let index = 0
  for (const { finding, guide } of items) {
    if (guide.impact !== lastImpact) {
      lines.push(`— ${he ? IMPACT_HEADING[guide.impact].he : IMPACT_HEADING[guide.impact].en} —`)
      lastImpact = guide.impact
    }
    index += 1
    const instruction = DEV_INSTRUCTION[finding.findingType]!
    lines.push(`${index}. ${he ? instruction.he : instruction.en}`)
    for (const url of finding.urls.slice(0, MAX_URLS_PER_ITEM)) lines.push(`   ${url}`)
    if (finding.urls.length > MAX_URLS_PER_ITEM) {
      const more = finding.urls.length - MAX_URLS_PER_ITEM
      lines.push(`   ${he ? `ועוד ${more} עמודים` : `and ${more} more pages`}`)
    }
    lines.push('')
  }

  if (needsJsonLd) {
    if (jsonLd) {
      lines.push(
        he
          ? 'בלוק JSON-LD מוכן, בנוי מהפרטים שקראנו מהאתר עצמו. אם משהו בו לא מדויק — הנתון באתר הוא זה שצריך תיקון, לא הבלוק:'
          : 'A ready JSON-LD block, built from the details we read off the site itself. If anything in it is wrong, the site is what needs correcting, not the block:',
      )
      lines.push('')
      lines.push(jsonLd)
      lines.push('')
    } else {
      lines.push(
        he
          ? 'לא הצלחנו לחלץ מהאתר מספיק פרטים כדי לייצר בלוק JSON-LD (חסר שם עסק). קודם צריך שהשם, הכתובת והטלפון יופיעו כטקסט באתר.'
          : 'We could not extract enough from the site to generate a JSON-LD block (no business name). The name, address and phone need to exist as text on the site first.',
      )
      lines.push('')
    }
  }

  lines.push(
    he
      ? 'הערה אחת: המטרה היא לא ציון בכלי בדיקה. המטרה היא שכל פרט שלקוח שואל עליו — טלפון, כתובת, שעות, מה העסק עושה — יהיה קיים כטקסט באתר, זהה בכל מקום שבו הוא מופיע.'
      : 'One note: the goal is not a score in a testing tool. The goal is that every detail a customer asks about — phone, address, hours, what the business does — exists as text on the site, identical everywhere it appears.',
  )

  return {
    text: lines.join('\n').trimEnd(),
    jsonLd,
    developerItems: items.filter((i) => i.guide.who === 'WEB_PERSON').length,
  }
}
