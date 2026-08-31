/**
 * What the customer typed, and whether it is a website we can measure.
 *
 * The address field is the first thing anybody touches, and it is where the product loses
 * people. Before this, everything that was not an ordinary website — an email address, a
 * Facebook page, a Yad2 listing, a private IP — was accepted, crawled for thirty seconds,
 * and answered with the same sentence: "we could not reach the site". That is the worst
 * possible response, because it is both slow and wrong: nothing was unreachable, the input
 * was simply not a website, and the customer is left believing the tool is broken.
 *
 * Most of these are recognisable instantly, from the address alone. So they are recognised
 * instantly, and answered with what is actually true.
 *
 * One of them is not an error at all. A business whose only presence is a Facebook page is
 * the *most* invisible kind of business to an AI assistant — assistants read websites, and
 * a social page is behind a login for almost every crawler. Refusing it as "invalid input"
 * throws away the sharpest finding this product can give somebody. So it gets a real
 * answer, not a validation error.
 */

export type Language = 'he' | 'en'

export type SiteUrlProblem =
  /** Nothing typed. */
  | 'EMPTY'
  /** Not an address at all — no dot, or unparseable. */
  | 'NOT_A_URL'
  /** An email address, with or without `mailto:`. */
  | 'EMAIL'
  /** A page on a social network, which is somebody else's platform. */
  | 'SOCIAL_PAGE'
  /** A listing on a marketplace or directory. The business is a guest there. */
  | 'MARKETPLACE'
  /** A link hub. A page of links is not a website an assistant can describe you from. */
  | 'LINK_HUB'
  /** A private, loopback or link-local address. Nothing outside can reach it. */
  | 'NOT_PUBLIC'
  /** A port no website is served from, and no crawler will try. */
  | 'ODD_PORT'

export type SiteUrlVerdict =
  | { readonly ok: true; readonly url: string }
  | {
      readonly ok: false
      readonly problem: SiteUrlProblem
      /** The host or value that produced the verdict, for the message. */
      readonly subject: string | null
    }

/**
 * Platforms where a business is a guest.
 *
 * Matched on the registrable part, so `m.facebook.com` and `www.facebook.com` both hit.
 * The list is deliberately short and certain: a false positive here refuses to scan a real
 * customer's real website, which is far more expensive than letting an unusual host
 * through. Site builders are *not* on it — a business running on `something.wixsite.com`
 * has a real website, and it is the one we should be reading.
 */
const SOCIAL_HOSTS = [
  'facebook.com',
  'fb.com',
  'fb.me',
  'instagram.com',
  'tiktok.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'youtu.be',
  'pinterest.com',
  'threads.net',
  'wa.me',
  'whatsapp.com',
  't.me',
  'telegram.me',
]

const MARKETPLACE_HOSTS = [
  'yad2.co.il',
  'zap.co.il',
  'easy.co.il',
  'rest.co.il',
  'b144.co.il',
  'd.co.il',
  '10bis.co.il',
  'wolt.com',
  'groupon.co.il',
  'tripadvisor.com',
  'tripadvisor.co.il',
  'booking.com',
  'airbnb.com',
  'google.com',
  'maps.app.goo.gl',
  'g.page',
  'goo.gl',
]

const LINK_HUB_HOSTS = ['linktr.ee', 'linktree.com', 'bio.link', 'beacons.ai', 'lnk.bio']

/** Query keys that describe where a click came from, never what the page is. */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|msclkid$|mc_[ce]id$|igshid$|_ga$|ref$|source$)/i

const registrable = (hostname: string): string => {
  const parts = hostname.toLowerCase().split('.')
  // Israeli second-level domains (co.il, org.il, net.il, ac.il, gov.il, muni.il, k12.il)
  // mean the registrable name is three labels, not two.
  const IL_SECOND_LEVEL = new Set(['co', 'org', 'net', 'ac', 'gov', 'muni', 'k12'])
  if (parts.length >= 3 && parts.at(-1) === 'il' && IL_SECOND_LEVEL.has(parts.at(-2)!)) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

const matches = (hostname: string, list: readonly string[]): boolean => {
  const host = hostname.toLowerCase()
  const root = registrable(host)
  return list.some((entry) => root === entry || host === entry || host.endsWith(`.${entry}`))
}

/** Private, loopback, link-local and CGNAT literals, checked before any DNS happens. */
const isPrivateLiteral = (hostname: string): boolean => {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Classifies whatever a person typed.
 *
 * Accepting is the common case and it is generous: "Example.CO.IL ", "www.example.co.il/"
 * and "https://example.co.il/about?utm_source=fb#top" are the same site and all three are
 * accepted. What comes back is cleaned — credentials removed, fragment dropped, tracking
 * parameters stripped — because that string is shown back to the customer as the thing
 * that was scanned, and `?fbclid=IwAR3x...` in a report header reads as a system that does
 * not know what it is looking at.
 */
export interface SiteUrlOptions {
  /**
   * The local-development seam, and nothing else.
   *
   * Integration tests and a developer checking the product point it at a fixture server on
   * `127.0.0.1:54321`, which is both a private address and an unusual port. The crawler
   * already has exactly this switch (`CRAWLER_ALLOW_PRIVATE_HOSTS`, which `APP_ENV=production`
   * refuses to accept), and having the field enforce a *different* rule from the fetcher is
   * how a local checkout stops being able to test the product at all.
   */
  readonly allowLocalTargets?: boolean
}

export const classifySiteUrl = (raw: string, options: SiteUrlOptions = {}): SiteUrlVerdict => {
  const local = options.allowLocalTargets === true
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, problem: 'EMPTY', subject: null }
  if (trimmed.length > 2000) return { ok: false, problem: 'NOT_A_URL', subject: null }

  const mailto = /^mailto:/i.test(trimmed)
  const hasScheme = /^https?:\/\//i.test(trimmed)
  const withoutMailto = trimmed.replace(/^mailto:/i, '')
  // Only when there is no scheme: `https://user:pass@example.co.il/` has exactly the shape
  // of an email address and is not one — it is a URL carrying credentials, which get
  // stripped below rather than sending somebody's password to a host in a log line.
  if (mailto || (!hasScheme && EMAIL_SHAPE.test(withoutMailto))) {
    return { ok: false, problem: 'EMAIL', subject: withoutMailto }
  }

  const withScheme = hasScheme ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, problem: 'NOT_A_URL', subject: null }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, problem: 'NOT_A_URL', subject: null }
  }
  if (isPrivateLiteral(url.hostname)) {
    if (!local) return { ok: false, problem: 'NOT_PUBLIC', subject: url.hostname }
  } else if (!url.hostname.includes('.')) {
    return { ok: false, problem: 'NOT_A_URL', subject: null }
  }

  // Credentials never belong in a site address, and passing them through would send a
  // customer's password to a host in a log line.
  url.username = ''
  url.password = ''

  if (!local && url.port !== '' && url.port !== '80' && url.port !== '443') {
    return { ok: false, problem: 'ODD_PORT', subject: url.port }
  }

  if (matches(url.hostname, LINK_HUB_HOSTS)) {
    return { ok: false, problem: 'LINK_HUB', subject: url.hostname }
  }
  if (matches(url.hostname, SOCIAL_HOSTS)) {
    return { ok: false, problem: 'SOCIAL_PAGE', subject: url.hostname }
  }
  if (matches(url.hostname, MARKETPLACE_HOSTS)) {
    return { ok: false, problem: 'MARKETPLACE', subject: url.hostname }
  }

  url.hash = ''
  // A snapshot, not the live iterator: deleting during iteration skips entries.
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
  }

  return { ok: true, url: url.toString() }
}

/** Backwards-compatible shorthand: the cleaned URL, or null for anything we will not scan. */
export const normalizeSiteUrl = (raw: string, options: SiteUrlOptions = {}): string | null => {
  const verdict = classifySiteUrl(raw, options)
  return verdict.ok ? verdict.url : null
}

const PROBLEMS: readonly SiteUrlProblem[] = [
  'EMPTY',
  'NOT_A_URL',
  'EMAIL',
  'SOCIAL_PAGE',
  'MARKETPLACE',
  'LINK_HUB',
  'NOT_PUBLIC',
  'ODD_PORT',
]

/**
 * Whether a string is one of ours.
 *
 * A problem code travels through a query string, which anybody can write by hand. Casting
 * it back into the union would let `?problem=whatever` fall past every branch of the
 * explanation switch and return nothing, which crashes the page that renders it.
 */
export const isSiteUrlProblem = (value: string): value is SiteUrlProblem =>
  (PROBLEMS as readonly string[]).includes(value)

export interface SiteUrlMessage {
  readonly title: string
  /** Paragraphs, in order. */
  readonly body: readonly string[]
  /** True when this is a finding about the business rather than a typo. */
  readonly isFinding: boolean
}

/**
 * What to tell the customer.
 *
 * Two of these are not complaints about the input. Somebody whose only presence is a
 * Facebook page or a Yad2 listing has just been told the most useful thing this product
 * knows, and the answer says so instead of asking them to try again.
 */
export const explainSiteUrl = (
  problem: SiteUrlProblem,
  subject: string | null,
  language: Language,
): SiteUrlMessage => {
  const he = language === 'he'
  const host = subject ?? (he ? 'הכתובת הזו' : 'that address')

  switch (problem) {
    case 'EMPTY':
      return {
        isFinding: false,
        title: he ? 'לא הזנתם כתובת' : 'No address entered',
        body: [
          he
            ? 'הזינו את כתובת האתר של העסק — מה שמקלידים בדפדפן, למשל example.co.il.'
            : 'Enter your business website address — what you type into a browser, for example example.co.il.',
        ],
      }

    case 'NOT_A_URL':
      return {
        isFinding: false,
        title: he ? 'זו לא כתובת אתר' : 'That is not a web address',
        body: [
          he
            ? 'צריך כתובת מלאה של אתר, למשל example.co.il או www.example.co.il. בדקו מה הקלדתם ונסו שוב.'
            : 'We need a full website address, for example example.co.il or www.example.co.il. Check what you typed and try again.',
        ],
      }

    case 'EMAIL':
      return {
        isFinding: false,
        title: he ? 'זו כתובת אימייל' : 'That is an email address',
        body: [
          he
            ? 'אנחנו צריכים את כתובת האתר — מה שמקלידים בשורת הכתובת של הדפדפן, בלי הסימן @.'
            : 'We need the website address — what you type in a browser’s address bar, with no @ in it.',
          he
            ? 'לרוב זה מה שמופיע אחרי ה-@ באימייל שלכם. אם האימייל הוא avi@garage.co.il, נסו garage.co.il.'
            : 'It is usually what comes after the @ in your email. If your email is avi@garage.co.il, try garage.co.il.',
        ],
      }

    case 'SOCIAL_PAGE':
      return {
        isFinding: true,
        title: he ? 'זה עמוד ברשת חברתית, לא אתר' : 'That is a social page, not a website',
        body: [
          he
            ? `${host} הוא פלטפורמה של מישהו אחר. אנחנו לא יכולים לסרוק אותה — וזו בדיוק הנקודה: גם ChatGPT, Gemini ו-Claude לא קוראים אותה. הסורקים שלהם קוראים אתרים, ועמוד ברשת חברתית חסום בפניהם כמעט לגמרי.`
            : `${host} is somebody else’s platform. We cannot read it — and that is exactly the point: ChatGPT, Gemini and Claude do not read it either. Their crawlers read websites, and a social page is closed to them almost entirely.`,
          he
            ? 'אם יש לכם אתר משלכם, הזינו את הכתובת שלו. אם אין — זה הדבר היחיד הגדול שעומד בינכם לבין הופעה בתשובות, ועמוד אחד עם השם, העיר, הטלפון והשירותים מספיק כדי לשנות את זה.'
            : 'If you have a website of your own, enter its address. If you do not, that is the single biggest thing standing between you and appearing in answers — and one page with your name, city, phone and services is enough to change it.',
        ],
      }

    case 'MARKETPLACE':
      return {
        isFinding: true,
        title: he ? 'זה עמוד שלכם באתר של מישהו אחר' : 'That is your listing on somebody else’s site',
        body: [
          he
            ? `${host} הוא אתר שאתם מופיעים בו, לא אתר שאתם שולטים בו. אנחנו מודדים אתר שאפשר לשנות בו דברים — ובעמוד שם אין לכם גישה לא ל-robots.txt, לא לכותרות ולא לסימון המובנה.`
            : `${host} is a site you appear on, not a site you control. We measure a site you can change — and on a listing there you control neither robots.txt, nor the headings, nor the structured data.`,
          he
            ? 'הזינו את כתובת האתר שלכם. אם אין לכם אתר, שווה לדעת: הופעה במדריך היא עדות טובה, אבל היא לא מחליפה מקור אחד שבשליטתכם שאפשר לצטט ממנו.'
            : 'Enter your own website address. If you do not have one, it is worth knowing: a directory listing is good corroboration, but it does not replace one source you control that can be quoted from.',
        ],
      }

    case 'LINK_HUB':
      return {
        isFinding: true,
        title: he ? 'זה עמוד קישורים, לא אתר' : 'That is a link page, not a website',
        body: [
          he
            ? `${host} הוא רשימת קישורים. אין בו טקסט שמתאר את העסק, ולכן אין ממה לצטט — לא לנו ולא למערכת AI שמנסה לענות על שאלה עליכם.`
            : `${host} is a list of links. There is no text on it describing the business, so there is nothing to quote — not for us, and not for an AI trying to answer a question about you.`,
          he
            ? 'הזינו את כתובת האתר עצמו, אם יש. אם עמוד הקישורים הוא כל מה שיש — זו הבעיה עצמה.'
            : 'Enter the website itself, if there is one. If the link page is all there is, that is the problem itself.',
        ],
      }

    case 'NOT_PUBLIC':
      return {
        isFinding: false,
        title: he ? 'הכתובת הזו לא קיימת באינטרנט' : 'That address is not on the internet',
        body: [
          he
            ? `${host} היא כתובת ברשת פנימית. שום דבר מחוץ לרשת הזו לא יכול להגיע אליה — לא אנחנו, ולא אף סורק של מערכת AI.`
            : `${host} is an address on a private network. Nothing outside that network can reach it — not us, and no AI system’s crawler either.`,
          he
            ? 'הזינו את הכתובת הציבורית של האתר.'
            : 'Enter the site’s public address.',
        ],
      }

    case 'ODD_PORT':
      return {
        isFinding: false,
        title: he ? 'הכתובת מצביעה על פורט לא סטנדרטי' : 'That address points at a non-standard port',
        body: [
          he
            ? `אנחנו קוראים אתרים בפורטים הרגילים בלבד (80 ו-443). סורק של מערכת AI לא ינסה את פורט ${host} — כלומר גם אם האתר עובד שם, הוא בלתי נראה.`
            : `We read sites on the standard ports only (80 and 443). An AI system’s crawler will not try port ${host} either — so even if the site works there, it is invisible.`,
          he ? 'הזינו את הכתובת בלי הפורט.' : 'Enter the address without the port.',
        ],
      }
  }
}
