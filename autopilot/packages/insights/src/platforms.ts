/**
 * Per-platform connection guides.
 *
 * A business owner's real question is not "what is a website connector", it is "I have Wix,
 * what do I click?". These are written to be followed by someone who has never heard the
 * word API, and they are honest about which platforms we can write to and which we cannot
 * yet — because a customer who follows five steps and then discovers their platform is
 * unsupported has been wasted, and will say so.
 *
 * Every guide states the read path and the write path separately. Reading works everywhere
 * with no setup at all; writing is what differs.
 */

export type PlatformId =
  | 'wordpress'
  | 'wix'
  | 'shopify'
  | 'webflow'
  | 'squarespace'
  | 'custom'
  | 'none'

export type WriteSupport = 'AUTOMATIC' | 'GUIDED' | 'PLANNED'

export interface GuideStep {
  readonly he: string
  readonly en: string
  /** Where in that platform's interface the step happens. */
  readonly where?: { he: string; en: string }
}

export interface PlatformGuide {
  readonly id: PlatformId
  readonly name: string
  readonly hebrewName: string
  /** How common this platform is among Israeli small businesses. Orders the picker. */
  readonly popularity: number
  readonly writeSupport: WriteSupport
  /** One sentence setting expectations before the customer starts. */
  readonly summary: { he: string; en: string }
  readonly steps: readonly GuideStep[]
  /** What the customer gets once connected. */
  readonly whatYouGet: { he: string; en: string }
  /** Stated plainly when we cannot write automatically. */
  readonly limitation?: { he: string; en: string }
  readonly timeMinutes: number
}

export const PLATFORM_GUIDES: readonly PlatformGuide[] = [
  {
    id: 'wordpress',
    name: 'WordPress',
    hebrewName: 'וורדפרס',
    popularity: 100,
    writeSupport: 'AUTOMATIC',
    timeMinutes: 3,
    summary: {
      he: 'החיבור המלא ביותר. אחרי החיבור אנחנו יכולים לתקן דברים באתר בעצמנו, ואתם רואים ומאשרים כל שינוי.',
      en: 'The most complete connection. Once connected we can fix things on the site ourselves, and you see and approve every change.',
    },
    steps: [
      {
        he: 'היכנסו לאזור הניהול של האתר שלכם (בדרך כלל הכתובת שלכם עם ‎/wp-admin בסוף).',
        en: 'Sign in to your site’s admin area (usually your address with /wp-admin at the end).',
      },
      {
        he: 'בתפריט הצדדי לחצו "משתמשים", ואז על המשתמש שלכם.',
        en: 'In the side menu click "Users", then your own user.',
        where: { he: 'משתמשים ← הפרופיל שלי', en: 'Users → Your Profile' },
      },
      {
        he: 'גללו למטה עד "סיסמאות יישומים" (Application Passwords). כתבו שם: Autopilot, ולחצו "הוסף".',
        en: 'Scroll down to "Application Passwords". Type the name: Autopilot, and click "Add".',
        where: { he: 'בתחתית עמוד הפרופיל', en: 'At the bottom of the profile page' },
      },
      {
        he: 'יוצג לכם קוד באותיות ומספרים. העתיקו אותו — הוא מוצג פעם אחת בלבד.',
        en: 'A code of letters and numbers appears. Copy it — it is shown only once.',
      },
      {
        he: 'הדביקו אותו אצלנו יחד עם שם המשתמש. זהו.',
        en: 'Paste it with us along with your username. That is it.',
      },
    ],
    whatYouGet: {
      he: 'תיקונים אוטומטיים של כותרות, תיאורים ומידע מובנה, והוספת תוכן חדש כטיוטה לאישורכם.',
      en: 'Automatic fixes to titles, descriptions and structured information, plus new content added as a draft for your approval.',
    },
    limitation: {
      he: 'עמודים חדשים תמיד נוצרים כטיוטה. שום דבר לא עולה לאוויר בלי שתאשרו.',
      en: 'New pages are always created as drafts. Nothing goes live without your approval.',
    },
  },
  {
    id: 'wix',
    name: 'Wix',
    hebrewName: 'ויקס',
    popularity: 95,
    writeSupport: 'GUIDED',
    timeMinutes: 1,
    summary: {
      he: 'נסרוק את האתר בלי שתצטרכו לעשות כלום. את התיקונים נראה לכם בדיוק איפה ומה לשנות — לחיצה-לחיצה.',
      en: 'We scan the site with nothing for you to do. For fixes, we show you exactly where and what to change, click by click.',
    },
    steps: [
      {
        he: 'פשוט הזינו את כתובת האתר שלכם. אין צורך בשום חיבור, סיסמה או הרשאה.',
        en: 'Just enter your website address. No connection, password or permission needed.',
      },
      {
        he: 'תוך דקה תקבלו את הציון והרשימה של מה שחסר.',
        en: 'Within a minute you get your score and the list of what is missing.',
      },
      {
        he: 'לכל תיקון נראה לכם צילום מסך של המקום המדויק ב-Wix ואת הטקסט המוכן להעתקה.',
        en: 'For each fix we show you a screenshot of the exact place in Wix and the ready-made text to paste.',
      },
    ],
    whatYouGet: {
      he: 'אבחון מלא, וטקסטים מוכנים להדבקה — כולל הכותרות, התיאורים והסעיפים החסרים.',
      en: 'A full diagnosis, and ready-made text to paste, including the titles, descriptions and missing sections.',
    },
    limitation: {
      he: 'ל-Wix אין כרגע ממשק שמאפשר לנו לשנות את האתר עבורכם. אנחנו מכינים לכם הכל, ואתם מדביקים — בדרך כלל דקה לכל תיקון.',
      en: 'Wix has no interface that lets us change the site for you today. We prepare everything and you paste it, usually a minute per fix.',
    },
  },
  {
    id: 'shopify',
    name: 'Shopify',
    hebrewName: 'שופיפיי',
    popularity: 70,
    writeSupport: 'PLANNED',
    timeMinutes: 1,
    summary: {
      he: 'סריקה ואבחון מלאים כבר עכשיו. חיבור לכתיבה אוטומטית בפיתוח.',
      en: 'Full scanning and diagnosis available now. An automatic write connection is in development.',
    },
    steps: [
      {
        he: 'הזינו את כתובת החנות. הסריקה מתחילה מיד.',
        en: 'Enter your store address. The scan starts immediately.',
      },
      {
        he: 'קבלו את הרשימה של מה לתקן, עם הטקסטים המוכנים.',
        en: 'Get the list of what to fix, with the text prepared.',
      },
    ],
    whatYouGet: {
      he: 'אבחון מלא של החנות והמלצות מוכנות ליישום.',
      en: 'A full diagnosis of the store and recommendations ready to apply.',
    },
    limitation: {
      he: 'כתיבה אוטומטית ל-Shopify עדיין לא נתמכת. נעדכן אתכם כשתהיה.',
      en: 'Automatic writing to Shopify is not supported yet. We will tell you when it is.',
    },
  },
  {
    id: 'webflow',
    name: 'Webflow',
    hebrewName: 'וובפלואו',
    popularity: 40,
    writeSupport: 'PLANNED',
    timeMinutes: 1,
    summary: {
      he: 'סריקה ואבחון מלאים כבר עכשיו. חיבור לכתיבה אוטומטית בפיתוח.',
      en: 'Full scanning and diagnosis available now. An automatic write connection is in development.',
    },
    steps: [
      { he: 'הזינו את כתובת האתר.', en: 'Enter your website address.' },
      {
        he: 'קבלו אבחון מלא ורשימת תיקונים עם הטקסטים.',
        en: 'Get a full diagnosis and a list of fixes with the text.',
      },
    ],
    whatYouGet: {
      he: 'אבחון מלא והמלצות מוכנות ליישום ב-Webflow.',
      en: 'A full diagnosis and recommendations ready to apply in Webflow.',
    },
    limitation: {
      he: 'כתיבה אוטומטית עדיין לא נתמכת.',
      en: 'Automatic writing is not supported yet.',
    },
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    hebrewName: 'סקוורספייס',
    popularity: 30,
    writeSupport: 'GUIDED',
    timeMinutes: 1,
    summary: {
      he: 'סריקה בלי חיבור, ותיקונים מודרכים צעד אחר צעד.',
      en: 'Scanning with no connection, and guided fixes step by step.',
    },
    steps: [
      { he: 'הזינו את כתובת האתר.', en: 'Enter your website address.' },
      {
        he: 'לכל תיקון נראה לכם היכן בדיוק ב-Squarespace ומה להדביק.',
        en: 'For each fix we show you exactly where in Squarespace and what to paste.',
      },
    ],
    whatYouGet: {
      he: 'אבחון מלא וטקסטים מוכנים.',
      en: 'A full diagnosis and ready-made text.',
    },
  },
  {
    id: 'custom',
    name: 'Custom site',
    hebrewName: 'אתר בפיתוח עצמאי',
    popularity: 60,
    writeSupport: 'GUIDED',
    timeMinutes: 2,
    summary: {
      he: 'סריקה מלאה מיד. אם יש לכם מפתח, נוכל לתת לו בדיוק מה לשנות — או להתחבר ישירות.',
      en: 'Full scanning immediately. If you have a developer, we can give them exactly what to change, or connect directly.',
    },
    steps: [
      { he: 'הזינו את כתובת האתר.', en: 'Enter your website address.' },
      {
        he: 'קבלו אבחון מלא, כולל את הקוד המדויק להוספה (מידע מובנה, כותרות, תיאורים).',
        en: 'Get a full diagnosis, including the exact code to add (structured data, titles, descriptions).',
      },
      {
        he: 'שלחו למפתח שלכם, או דברו איתנו על חיבור ישיר למערכת שלכם.',
        en: 'Send it to your developer, or talk to us about connecting directly to your system.',
      },
    ],
    whatYouGet: {
      he: 'אבחון מלא וקוד מוכן להדבקה, כולל מידע מובנה תקני.',
      en: 'A full diagnosis and ready-to-paste code, including standards-compliant structured data.',
    },
  },
  {
    id: 'none',
    name: 'No website yet',
    hebrewName: 'אין עדיין אתר',
    popularity: 20,
    writeSupport: 'GUIDED',
    timeMinutes: 5,
    summary: {
      he: 'אפשר להתחיל גם בלי אתר. פרופיל Google לבדו כבר נותן נוכחות אמיתית.',
      en: 'You can start without a website. A Google profile alone already gives you real presence.',
    },
    steps: [
      {
        he: 'ודאו שיש לכם פרופיל עסקי ב-Google ושהוא מאומת.',
        en: 'Make sure you have a Google Business Profile and that it is verified.',
      },
      {
        he: 'מלאו בו קטגוריה, שעות, טלפון וכתובת במדויק.',
        en: 'Fill in the category, hours, phone and address accurately.',
      },
      {
        he: 'חברו אותו אלינו — נעקוב אחרי איך ה-AI מתאר אתכם ונתריע על טעויות.',
        en: 'Connect it to us. We track how AI describes you and alert you to errors.',
      },
    ],
    whatYouGet: {
      he: 'מעקב אחרי איך מערכות AI מתארות אתכם, והתראה כשמידע שגוי מופיע.',
      en: 'Tracking of how AI systems describe you, and an alert when wrong information appears.',
    },
    limitation: {
      he: 'בלי אתר, היכולת שלנו לשפר מוגבלת. אתר בסיסי, אפילו עמוד אחד, משנה משמעותית.',
      en: 'Without a website our ability to improve things is limited. A basic site, even one page, changes this substantially.',
    },
  },
]

export const platformById = (id: PlatformId): PlatformGuide =>
  PLATFORM_GUIDES.find((p) => p.id === id) ?? PLATFORM_GUIDES[PLATFORM_GUIDES.length - 1]!

/** Ordered for the picker: most common platforms first. */
export const platformsForPicker = (): readonly PlatformGuide[] =>
  [...PLATFORM_GUIDES].sort((a, b) => b.popularity - a.popularity)

/**
 * The Google Business Profile connection, which is separate from the website and matters
 * as much for a local business.
 */
export const GOOGLE_GUIDE: PlatformGuide = {
  id: 'custom',
  name: 'Google Business Profile',
  hebrewName: 'פרופיל עסקי בגוגל',
  popularity: 100,
  writeSupport: 'AUTOMATIC',
  timeMinutes: 2,
  summary: {
    he: 'החיבור מתבצע דרך Google עצמה. אנחנו לעולם לא מבקשים את הסיסמה שלכם, ומתחילים במצב קריאה בלבד.',
    en: 'The connection goes through Google itself. We never ask for your password, and we start in read-only mode.',
  },
  steps: [
    {
      he: 'לחצו "חבר את פרופיל Google" אצלנו.',
      en: 'Click "Connect your Google profile" with us.',
    },
    {
      he: 'תועברו למסך של Google. התחברו כרגיל ואשרו את הבקשה.',
      en: 'You are taken to a Google screen. Sign in as usual and approve the request.',
      where: { he: 'מסך ההרשאות של Google', en: 'Google’s permissions screen' },
    },
    {
      he: 'בחרו את העסק שלכם מהרשימה, אם יש לכם יותר מאחד.',
      en: 'Pick your business from the list, if you have more than one.',
    },
    {
      he: 'זהו. כברירת מחדל אנחנו רק קוראים. אם תרצו שנעדכן פרטים עבורכם — תפעילו את זה בהגדרות, מתי שתחליטו.',
      en: 'Done. By default we only read. If you want us to update details for you, switch that on in settings whenever you decide.',
    },
  ],
  whatYouGet: {
    he: 'זיהוי מיידי של סתירות בין האתר לפרופיל, מעקב אחרי דיוק המידע, וניתוח נושאים חוזרים בביקורות.',
    en: 'Immediate detection of contradictions between your site and profile, accuracy tracking, and analysis of recurring themes in reviews.',
  },
  limitation: {
    he: 'מענה אוטומטי לביקורות כבוי כברירת מחדל ודורש הפעלה מפורשת ונפרדת.',
    en: 'Automatic review replies are off by default and require separate, explicit activation.',
  },
}
