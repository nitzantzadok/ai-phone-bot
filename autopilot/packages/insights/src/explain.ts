/**
 * What each technical finding means to the person who owns the business.
 *
 * The crawler produces findings in the crawler's vocabulary: MISSING_CANONICAL,
 * NO_STRUCTURED_DATA, THIN_CONTENT. Those are correct and they are useless. A dentist in
 * Haifa who reads "this page does not state its official address, so crawlers may treat
 * duplicates as separate pages" has learned nothing they can act on, and every sentence
 * like it teaches them that this report is not for them.
 *
 * So every finding type is written out here three times over:
 *
 *  - `what` — what the thing actually is, in the words someone uses at home. Analogies are
 *    allowed and encouraged. The test is whether a reader who has never heard the word
 *    "crawler" finishes the sentence knowing what is missing from their site.
 *  - `costs` — what it costs them. Not "it is a best practice": what happens to a customer
 *    who was about to find them and did not.
 *  - `steps` — what to do, concretely enough to follow alone. Where a step depends on the
 *    platform, it names the platforms Israeli small businesses actually use.
 *
 * Plus the two questions every business owner asks before reading any list of tasks, and
 * which no report of this kind ever answers: **how long does this take me**, and **can I do
 * it myself or do I need to call the person who built the site**.
 *
 * `impact` is deliberately not the crawler's `severity`. Severity ranks how broken
 * something is; impact ranks how much fixing it changes whether an assistant recommends
 * this business. They disagree often — a title that is four characters too long is a real
 * finding and almost never the reason a business is invisible, while a missing machine
 * readable business card is quiet, unalarming, and frequently the whole problem.
 *
 * CRITICAL means exactly one thing, and the copy attached to it says so out loud: the
 * content cannot enter an answer at all. Only three findings actually earn that — a page
 * that asks to be excluded, a page whose text does not exist until a browser draws it, and
 * a page that does not load. A missing business card is the highest-leverage finding in
 * this whole table and it still is not that: a site with well-written plain text gets
 * recommended without one every day. Ranking it CRITICAL made the report say "this is not
 * lower odds, it is zero" about something that is neither, and a customer who fixes it and
 * finds the claim was overstated has learned to discount every other number here.
 *
 * That is what `leverage` is for. It orders findings *within* a level, so the business card
 * still leads the list it belongs to without the report having to overstate it.
 */

export type Language = 'he' | 'en'

export type Impact = 'CRITICAL' | 'IMPORTANT' | 'MINOR'

/** Who can realistically do this. The honest answer, not the flattering one. */
export type FixOwner = 'YOU' | 'WEB_PERSON'

export interface Bilingual {
  readonly he: string
  readonly en: string
}

export interface FixGuide {
  readonly findingType: string
  readonly impact: Impact
  /**
   * How much this one moves the needle, 0..1, used to order findings inside an impact
   * level. A beliefs-based prior, not a measurement, and it never promotes across levels.
   */
  readonly leverage: number
  readonly who: FixOwner
  /** Realistic minutes for one page, for someone who has not done it before. */
  readonly minutes: number
  /** A short label for the problem, in the owner's words. */
  readonly headline: Bilingual
  readonly what: Bilingual
  readonly costs: Bilingual
  readonly steps: readonly Bilingual[]
  /** What "fixed" looks like, so they can check their own work. */
  readonly example?: Bilingual
}

/**
 * Impact order. Everything the report sorts by comes from here, so the order a customer
 * reads is the order that matters to them rather than the order the crawler emitted.
 */
export const IMPACT_RANK: Readonly<Record<Impact, number>> = {
  CRITICAL: 0,
  IMPORTANT: 1,
  MINOR: 2,
}

export const IMPACT_LABEL: Readonly<Record<Impact, Bilingual>> = {
  CRITICAL: { he: 'קריטי', en: 'Critical' },
  IMPORTANT: { he: 'משמעותי', en: 'Significant' },
  MINOR: { he: 'שווה לתקן', en: 'Worth fixing' },
}

export const IMPACT_MEANING: Readonly<Record<Impact, Bilingual>> = {
  CRITICAL: {
    he: 'כל עוד זה ככה, התוכן של העמוד הזה לא יכול להיכנס לתשובה בכלל. זה לא "פחות סיכוי" — פשוט אין מה לקרוא.',
    en: 'While this is true, this page’s content cannot enter an answer at all. Not a lower chance — there is nothing to read.',
  },
  IMPORTANT: {
    he: 'זה לא חוסם אתכם לגמרי, אבל זה מוריד משמעותית את הסיכוי שיזכירו אתכם — ובתחום צפוף זה בדרך כלל ההבדל.',
    en: 'This does not block you outright, but it materially lowers the chance you are mentioned — and in a crowded field that is usually the difference.',
  },
  MINOR: {
    he: 'משפיע קצת. תתקנו את זה אחרי שסגרתם את מה שלמעלה.',
    en: 'A small effect. Do this after the items above are closed.',
  },
}

export const OWNER_LABEL: Readonly<Record<FixOwner, Bilingual>> = {
  YOU: { he: 'אתם, לבד', en: 'You, on your own' },
  WEB_PERSON: { he: 'מי שבנה לכם את האתר', en: 'Whoever built your site' },
}

/* ------------------------------------------------------------------ guides --- */

const GUIDES: readonly FixGuide[] = [
  {
    findingType: 'NOINDEX',
    impact: 'CRITICAL',
    leverage: 1.0,
    who: 'WEB_PERSON',
    minutes: 5,
    headline: {
      he: 'העמוד מבקש במפורש לא להופיע בחיפוש',
      en: 'The page explicitly asks not to appear in search',
    },
    what: {
      he: 'בתוך הקוד של העמוד יש שורה שאומרת למנועי חיפוש ולמערכות AI: "אל תציגו אותי". בדרך כלל היא נשארה שם מהתקופה שבנו את האתר ואף אחד לא שם לב.',
      en: 'Inside the page there is a line telling search engines and AI systems: do not list me. Usually it was left there while the site was being built and nobody noticed.',
    },
    costs: {
      he: 'זה כמו לפתוח חנות ולהשאיר את השלט "סגור" על הדלת. שום מערכת לא תזכיר עמוד שביקש לא להיות מוזכר, גם אם הוא העמוד הכי טוב שלכם.',
      en: 'It is like opening the shop and leaving the "closed" sign on the door. No system mentions a page that asked not to be mentioned, however good the page is.',
    },
    steps: [
      {
        he: 'שלחו את העמוד הזה למי שבנה את האתר ובקשו להסיר את הוראת "noindex" ממנו.',
        en: 'Send this page to whoever built the site and ask them to remove the "noindex" instruction from it.',
      },
      {
        he: 'אם האתר בוורדפרס: בהגדרות התוסף Yoast או Rank Math יש מתג "הצג את העמוד בתוצאות חיפוש". צריך שיהיה דלוק.',
        en: 'On WordPress: the Yoast or Rank Math plugin has a "show this page in search results" switch. It needs to be on.',
      },
      {
        he: 'לפעמים זה במכוון — עמוד תודה אחרי טופס, עמוד בבנייה. שאלו לפני שמשנים.',
        en: 'Sometimes it is deliberate — a thank-you page, a page under construction. Ask before changing it.',
      },
    ],
  },
  {
    findingType: 'CLIENT_RENDERED',
    impact: 'CRITICAL',
    leverage: 1.0,
    who: 'WEB_PERSON',
    minutes: 0,
    headline: {
      he: 'הטקסט באתר לא קיים עד שהדפדפן מצייר אותו',
      en: 'The text does not exist until a browser draws it',
    },
    what: {
      he: 'האתר בנוי כך שהטקסט מגיע רק אחרי שהעמוד נטען, דרך תוכנה שרצה בדפדפן. אתם רואים אתר מלא. התוכנות שקוראות אתרים עבור ChatGPT ו-Gemini ברובן לא מחכות לזה, ומבחינתן העמוד ריק לגמרי.',
      en: 'The site is built so the text arrives only after the page loads, through code running in the browser. You see a full site. The programs that read sites for ChatGPT and Gemini mostly do not wait for that, and to them the page is entirely blank.',
    },
    costs: {
      he: 'וזה מסביר את המצב הכי מבלבל שיש: האתר שלכם יכול להיות מצוין בגוגל ולגמרי ריק בשביל ChatGPT. הסורק של גוגל כן מריץ את הקוד ומחכה לטקסט; הסורקים של ChatGPT, Claude ו-Perplexity לא. אז אתם רואים את עצמכם בגוגל, מסיקים שהכול בסדר, ולא מבינים למה שום מערכת AI לא מכירה אתכם. כל שאר השיפורים בדוח לא ישנו כלום עד שזה ייפתר — אין מה לתקן בתוכן כשאין תוכן.',
      en: 'And it explains the most confusing result there is: your site can be excellent in Google and completely empty to ChatGPT. Google’s crawler runs the code and waits for the text; the crawlers behind ChatGPT, Claude and Perplexity do not. So you find yourself in Google, conclude everything is fine, and cannot work out why no AI system knows you exist. Nothing else in this report matters until this is resolved — there is nothing to fix in content that is not there.',
    },
    steps: [
      {
        he: 'שלחו את הדוח הזה למי שבנה את האתר. המילים שהוא צריך לשמוע: "האתר צריך להגיש HTML מוכן מהשרת" (SSR או pre-rendering).',
        en: 'Send this report to whoever built the site. The words they need: the site must serve ready HTML from the server (SSR or pre-rendering).',
      },
      {
        he: 'זה לא שינוי של חמש דקות ולא כדאי לנסות לבד. זה כן שינוי חד-פעמי.',
        en: 'This is not a five-minute change and not one to attempt alone. It is a one-time change.',
      },
      {
        he: 'בדיקה שתוכלו לעשות בעצמכם: פתחו את האתר, לחצו קליק ימני ← "הצג מקור הדף". אם אתם לא מוצאים שם את הטקסט שאתם רואים על המסך — זו הבעיה.',
        en: 'A check you can run yourself: open the site, right-click, "View page source". If the text you see on screen is not in there, this is the problem.',
      },
    ],
  },
  {
    findingType: 'BROKEN_PAGE',
    impact: 'CRITICAL',
    leverage: 0.9,
    who: 'WEB_PERSON',
    minutes: 15,
    headline: { he: 'העמוד הזה לא נטען בכלל', en: 'This page does not load at all' },
    what: {
      he: 'ביקשנו את העמוד וקיבלנו הודעת שגיאה במקום תוכן. אותה שגיאה מוצגת גם ללקוח שלוחץ על הקישור.',
      en: 'We requested the page and got an error instead of content. A customer clicking the link gets the same error.',
    },
    costs: {
      he: 'לקוח שהגיע לעמוד שבור בדרך כלל לא מנסה שוב — הוא חוזר לחיפוש ונכנס למתחרה.',
      en: 'A customer who lands on a broken page usually does not try again. They go back to the search and into a competitor.',
    },
    steps: [
      {
        he: 'פתחו את הכתובת בעצמכם ובדקו מה קורה.',
        en: 'Open the address yourself and see what happens.',
      },
      {
        he: 'אם העמוד נמחק בכוונה — בקשו הפניה אוטומטית מהכתובת הישנה לעמוד שמחליף אותה.',
        en: 'If the page was deleted on purpose, ask for an automatic redirect from the old address to whatever replaces it.',
      },
      {
        he: 'אם הוא אמור לעבוד — זה תיקון למי שבנה את האתר, ודחוף.',
        en: 'If it is meant to work, this is a job for whoever built the site, and it is urgent.',
      },
    ],
  },
  {
    findingType: 'MISSING_TITLE',
    impact: 'IMPORTANT',
    leverage: 0.95,
    who: 'YOU',
    minutes: 5,
    headline: { he: 'לעמוד אין כותרת', en: 'The page has no title' },
    what: {
      he: 'לכל עמוד באינטרנט יש כותרת — הטקסט שמופיע בלשונית של הדפדפן למעלה, ובכחול בתוצאות של גוגל. בעמוד הזה היא ריקה.',
      en: 'Every page on the internet has a title — the text in the browser tab at the top, and the blue line in Google results. On this page it is empty.',
    },
    costs: {
      he: 'הכותרת היא הדבר הראשון והחזק ביותר שמערכת AI קוראת כדי להבין על מה העמוד. בלעדיה היא צריכה לנחש, ובמקרה של ספק היא בוחרת עסק אחר שכן כתב.',
      en: 'The title is the first and strongest thing an AI reads to decide what a page is about. Without one it has to guess, and a guess resolves in favour of a business that did write one.',
    },
    steps: [
      {
        he: 'במערכת שבה אתם עורכים את האתר, חפשו את השדה "כותרת העמוד" או "Title" בהגדרות של כל עמוד.',
        en: 'In whatever you edit the site with, find the "page title" or "Title" field in each page’s settings.',
      },
      {
        he: 'כתבו: שם העסק ‑ מה אתם ‑ העיר. זה מספיק, וזה עדיף על משפט שיווקי.',
        en: 'Write: business name - what you are - city. That is enough, and it beats a marketing sentence.',
      },
    ],
    example: {
      he: 'דנטל סנטר הדר – מרפאת שיניים בחיפה',
      en: 'Hadar Dental – dental clinic in Haifa',
    },
  },
  {
    findingType: 'NO_STRUCTURED_DATA',
    impact: 'IMPORTANT',
    leverage: 0.9,
    who: 'WEB_PERSON',
    minutes: 20,
    headline: {
      he: 'אין באתר כרטיס ביקור שמחשב יכול לקרוא',
      en: 'The site has no business card a computer can read',
    },
    what: {
      he: 'הטלפון, הכתובת ושעות הפתיחה שלכם כתובים באתר בשביל בני אדם. מחשב שקורא את העמוד צריך לנחש מה מתוך כל הטקסט הוא מספר טלפון ומה סתם מספר. יש דרך לכתוב את אותם פרטים בדיוק פעם נוספת, בפורמט שהמחשב קורא בוודאות — זה קטע קוד קטן שיושב בעמוד ואף אחד לא רואה אותו.',
      en: 'Your phone, address and opening hours are written on the site for humans. A computer reading the page has to guess which of those numbers is a phone number. There is a way to write the same details a second time in a format a computer reads with certainty — a small block of code that sits on the page and nobody sees.',
    },
    costs: {
      he: 'זו הסיבה הכי שקטה והכי נפוצה שעסק טוב לא מופיע בתשובות. מערכת AI שלא בטוחה בכתובת שלכם פשוט לא תיתן אותה — היא תיתן את זו של המתחרה שכן כתב אותה ככה.',
      en: 'This is the quietest and most common reason a good business does not appear. An AI that is not certain of your address simply will not give it — it gives the address of a competitor who did write it this way.',
    },
    steps: [
      {
        he: 'בהמשך הדוח יש קטע קוד מוכן עם הפרטים שלכם. העתיקו אותו ושלחו למי שבנה לכם את האתר.',
        en: 'Further down this report there is a ready block of code with your details. Copy it and send it to whoever built your site.',
      },
      {
        he: 'בוורדפרס אפשר גם לבד: התוסף Rank Math או Yoast, במסך "Local SEO", ממלא את זה מטופס.',
        en: 'On WordPress you can also do it yourself: the Rank Math or Yoast plugin, "Local SEO" screen, fills this in from a form.',
      },
      {
        he: 'בוויקס: הגדרות ← Business Info. מלאו שם, כתובת, טלפון ושעות — ויקס מייצרת את הקוד לבד.',
        en: 'On Wix: Settings → Business Info. Fill in name, address, phone and hours — Wix generates the code itself.',
      },
      {
        he: 'הפרטים שם חייבים להיות זהים בדיוק למה שכתוב בעמוד ובפרופיל Google שלכם. סתירה גרועה מכלום.',
        en: 'Those details must match exactly what the page and your Google profile say. A contradiction is worse than nothing.',
      },
    ],
  },
  {
    findingType: 'MISSING_META_DESCRIPTION',
    impact: 'IMPORTANT',
    leverage: 0.75,
    who: 'YOU',
    minutes: 5,
    headline: {
      he: 'אין לעמוד משפט שמסביר מה יש בו',
      en: 'The page has no sentence explaining what is on it',
    },
    what: {
      he: 'זה המשפט האפור שמופיע מתחת לשם שלכם בתוצאות של גוגל. הוא נכתב בנפרד מהטקסט של העמוד, ובעמוד הזה הוא ריק.',
      en: 'The grey sentence under your name in Google results. It is written separately from the page text, and on this page it is empty.',
    },
    costs: {
      he: 'זה אחד הדברים הראשונים שמערכת AI קוראת כשהיא מחליטה אם העמוד שלכם עונה על השאלה שנשאלה. משפט אחד טוב יכול להיות ההבדל בין להיות מוזכר לבין לא.',
      en: 'It is one of the first things an AI reads when deciding whether your page answers the question asked. One good sentence can be the difference between being mentioned and not.',
    },
    steps: [
      {
        he: 'בהגדרות של כל עמוד חפשו "תיאור" או "Meta description".',
        en: 'In each page’s settings look for "description" or "Meta description".',
      },
      {
        he: 'כתבו משפט אחד, 20–25 מילים, שאומר מה יש בעמוד ולמי הוא מתאים. בלי סופרלטיבים.',
        en: 'Write one sentence, 20–25 words, saying what is on the page and who it is for. No superlatives.',
      },
      {
        he: 'תכתבו כמו שאתם עונים בטלפון, לא כמו שכותבים במודעה.',
        en: 'Write it the way you answer the phone, not the way an ad is written.',
      },
    ],
    example: {
      he: 'מרפאת שיניים בהדר, חיפה. סתימות, יישור והשתלות. פתוח א׳–ה׳ 8:00–19:00, חניה בחצר.',
      en: 'Dental clinic in Hadar, Haifa. Fillings, braces and implants. Open Sun–Thu 8:00–19:00, parking on site.',
    },
  },
  {
    findingType: 'THIN_CONTENT',
    impact: 'IMPORTANT',
    leverage: 0.7,
    who: 'YOU',
    minutes: 30,
    headline: { he: 'בעמוד כמעט אין טקסט', en: 'The page has almost no text' },
    what: {
      he: 'בעמוד הזה יש פחות ממאה ועשרים מילים. עיצוב יפה ותמונות גדולות לא נחשבים — מערכת AI קוראת רק את המילים.',
      en: 'This page has fewer than a hundred and twenty words. A nice design and big photos do not count — an AI reads only the words.',
    },
    costs: {
      he: 'כשמישהו שואל שאלה, המערכת מחפשת מקור שכתוב בו משהו לצטט. עמוד כמעט ריק לא נותן לה כלום, אז היא לוקחת את התשובה ממישהו אחר וממליצה עליו.',
      en: 'When someone asks a question the system looks for a source with something to quote. A nearly empty page gives it nothing, so it takes the answer from somebody else and recommends them.',
    },
    steps: [
      {
        he: 'רשמו את חמש השאלות שהכי שואלים אתכם בטלפון, וכתבו לכל אחת תשובה של שתי שורות. זה כמעט תמיד מספיק.',
        en: 'Write down the five questions you get asked most on the phone, and answer each in two lines. That is almost always enough.',
      },
      {
        he: 'תארו במפורש מה אתם עושים ולמי אתם מתאימים. "החדר שקט ומתאים לזוגות" עדיף על "אווירה ייחודית".',
        en: 'Say plainly what you do and who you suit. "The room is quiet and suits couples" beats "a unique atmosphere".',
      },
      {
        he: 'אל תוסיפו טקסט סתם כדי להאריך. פסקה של שיווק ריק לא עוזרת יותר מכלום.',
        en: 'Do not pad. A paragraph of empty marketing helps no more than nothing.',
      },
    ],
  },
  {
    findingType: 'MISSING_H1',
    impact: 'IMPORTANT',
    leverage: 0.6,
    who: 'YOU',
    minutes: 5,
    headline: { he: 'אין כותרת ראשית בגוף העמוד', en: 'No main heading in the page body' },
    what: {
      he: 'הכותרת הגדולה שרואים בראש העמוד עצמו, לא זו שבלשונית. בעמוד הזה אין כזו — או שיש טקסט גדול שהוא לא מוגדר ככותרת אלא סתם טקסט מוגדל.',
      en: 'The big heading at the top of the page itself, not the one in the tab. This page has none — or it has big text that is only enlarged text, not marked as a heading.',
    },
    costs: {
      he: 'מערכת שקוראת עמוד מתחילה מהכותרת הראשית כדי להבין במה מדובר. בלעדיה היא קוראת את העמוד בלי נקודת התחלה.',
      en: 'A system reading a page starts at the main heading to work out the subject. Without one it reads with no starting point.',
    },
    steps: [
      {
        he: 'בעורך של האתר, סמנו את הטקסט הראשי בראש העמוד והגדירו אותו ככותרת ראשית (H1 / "כותרת 1").',
        en: 'In the site editor, select the main text at the top of the page and mark it as the main heading (H1 / "Heading 1").',
      },
      {
        he: 'כותרת ראשית אחת לכל עמוד, ושיהיה כתוב בה מה יש בעמוד — לא "ברוכים הבאים".',
        en: 'One main heading per page, saying what the page is — not "Welcome".',
      },
    ],
  },
  {
    findingType: 'DUPLICATE_TITLE',
    impact: 'IMPORTANT',
    leverage: 0.55,
    who: 'YOU',
    minutes: 10,
    headline: { he: 'כמה עמודים חולקים אותה כותרת', en: 'Several pages share one title' },
    what: {
      he: 'לכמה עמודים שונים באתר יש בדיוק אותה כותרת בלשונית. מבחוץ הם נראים כמו אותו עמוד שהועתק.',
      en: 'Several different pages carry exactly the same tab title. From outside they look like one page copied.',
    },
    costs: {
      he: 'המערכת בוחרת אחד מהם ומתעלמת מהשאר. אם היא בחרה את העמוד הלא נכון, העמוד הטוב שלכם פשוט לא קיים עבורה.',
      en: 'The system picks one and ignores the rest. If it picked the wrong one, your good page effectively does not exist.',
    },
    steps: [
      {
        he: 'תנו לכל עמוד כותרת שמתארת אותו הוא: "טיפולי יישור שיניים", "צרו קשר", ולא אותו שם עסק בכולם.',
        en: 'Give each page a title describing that page: "Orthodontics", "Contact us", not the same business name on all of them.',
      },
    ],
  },
  {
    findingType: 'LANGUAGE_MISMATCH',
    impact: 'IMPORTANT',
    leverage: 0.5,
    who: 'WEB_PERSON',
    minutes: 10,
    headline: {
      he: 'העמוד מצהיר על שפה אחת וכתוב באחרת',
      en: 'The page declares one language and is written in another',
    },
    what: {
      he: 'בקוד של העמוד רשום באיזו שפה הוא כתוב. כאן הרישום אומר דבר אחד והטקסט בפועל בשפה אחרת — לרוב "אנגלית" על עמוד בעברית, שנשאר מתבנית העיצוב.',
      en: 'The page records which language it is in. Here the record says one thing and the text is in another — usually "English" on a Hebrew page, left over from the design template.',
    },
    costs: {
      he: 'כששואלים בעברית "מרפאת שיניים בחיפה", מערכת מעדיפה מקורות בעברית. עמוד שמצהיר שהוא באנגלית לא נכנס לרשימה הזו.',
      en: 'When someone asks in Hebrew, the system prefers Hebrew sources. A page declaring itself English does not make that list.',
    },
    steps: [
      {
        he: 'בקשו ממי שבנה את האתר לתקן את הצהרת השפה של העמודים בעברית ל-lang="he" ולוודא dir="rtl".',
        en: 'Ask whoever built the site to set the Hebrew pages to lang="he" and confirm dir="rtl".',
      },
      {
        he: 'בוורדפרס: הגדרות ← כללי ← שפת האתר. לרוב זה כל מה שצריך.',
        en: 'On WordPress: Settings → General → Site Language. That is usually all it takes.',
      },
    ],
  },
  {
    findingType: 'NO_SITEMAP',
    impact: 'IMPORTANT',
    leverage: 0.45,
    who: 'WEB_PERSON',
    minutes: 10,
    headline: { he: 'אין לאתר תוכן עניינים', en: 'The site has no table of contents' },
    what: {
      he: 'מפת אתר היא קובץ שמפרט את כל העמודים שקיימים באתר, כמו תוכן עניינים בספר. בלעדיו מערכת שקוראת את האתר צריכה למצוא עמודים לפי קישורים בלבד — ומה שלא מקושר, לא נמצא.',
      en: 'A sitemap is a file listing every page the site has, like a table of contents. Without it a system reading the site can only find pages by following links — and what is not linked is not found.',
    },
    costs: {
      he: 'עמודים שקיימים ולא נמצאים הם עבודה שעשיתם ואף אחד לא רואה.',
      en: 'Pages that exist and are not found are work you did that nobody sees.',
    },
    steps: [
      {
        he: 'בוורדפרס: התוסף Yoast או Rank Math מייצר מפת אתר אוטומטית ברגע שמפעילים אותו.',
        en: 'On WordPress: the Yoast or Rank Math plugin generates a sitemap the moment it is enabled.',
      },
      {
        he: 'בוויקס, Shopify ו-Squarespace: יש כבר מפת אתר אוטומטית, לרוב אין מה לעשות.',
        en: 'On Wix, Shopify and Squarespace: there is already an automatic sitemap; usually nothing to do.',
      },
      {
        he: 'באתר בהתאמה אישית: זו בקשה של דקות ספורות למי שבנה אותו.',
        en: 'On a custom site: a few minutes of work for whoever built it.',
      },
    ],
  },
  {
    findingType: 'BROKEN_LINK',
    impact: 'IMPORTANT',
    leverage: 0.4,
    who: 'YOU',
    minutes: 10,
    headline: { he: 'קישור באתר מוביל לשום מקום', en: 'A link on the site leads nowhere' },
    what: {
      he: 'לחיצה על קישור באתר שלכם מגיעה לעמוד שכבר לא קיים.',
      en: 'Clicking a link on your site reaches a page that no longer exists.',
    },
    costs: {
      he: 'לקוח שנתקל בזה חושב שהאתר לא מתוחזק. מערכת שקוראת את האתר מסיקה בדיוק אותו דבר.',
      en: 'A customer who hits this assumes the site is not maintained. A system reading the site concludes the same.',
    },
    steps: [
      {
        he: 'מצאו את הקישור בעמוד ותקנו את היעד שלו, או הסירו אותו.',
        en: 'Find the link on the page and fix its destination, or remove it.',
      },
    ],
  },
  {
    findingType: 'MISSING_IMAGE_ALT',
    impact: 'MINOR',
    leverage: 0.35,
    who: 'YOU',
    minutes: 10,
    headline: { he: 'לתמונות אין תיאור בכתב', en: 'The images have no written description' },
    what: {
      he: 'לכל תמונה אפשר לצרף שורת טקסט שמתארת מה רואים בה. מערכת AI לא רואה תמונות — היא קוראת רק את השורה הזו. אם היא ריקה, התמונה מבחינתה לא קיימת.',
      en: 'Every image can carry a line of text describing what it shows. An AI does not see images — it reads only that line. If it is empty, the image does not exist for it.',
    },
    costs: {
      he: 'זה קריטי כשמשהו חשוב נמצא רק בתוך תמונה. מספר טלפון בתוך תמונה זה כמו לכתוב אותו על שלט מעבר לכביש — הוא שם, ואף מערכת לא תקרא אותו.',
      en: 'It matters most when something important lives only inside an image. A phone number inside a picture is like writing it on a sign across the road — it is there, and no system will read it.',
    },
    steps: [
      {
        he: 'הכי חשוב קודם: אם הטלפון, הכתובת או שעות הפתיחה נמצאים רק בתוך תמונה — כתבו אותם גם כטקסט רגיל בעמוד. זה בפני עצמו שווה יותר מכל השאר.',
        en: 'Most important first: if the phone, address or opening hours live only inside an image, write them as ordinary text on the page too. That alone is worth more than everything else here.',
      },
      {
        he: 'בעורך האתר, לחצו על תמונה וחפשו שדה בשם "טקסט חלופי" או "Alt text". כתבו בקצרה מה רואים.',
        en: 'In the site editor click an image and look for a field called "alt text". Describe briefly what it shows.',
      },
      {
        he: 'תמונות עיצוב בלבד (קווים, רקעים) לא צריכות תיאור. אל תבזבזו עליהן זמן.',
        en: 'Purely decorative images (lines, backgrounds) need no description. Do not spend time on them.',
      },
    ],
  },
  {
    findingType: 'MISSING_CANONICAL',
    impact: 'MINOR',
    leverage: 0.25,
    who: 'WEB_PERSON',
    minutes: 10,
    headline: {
      he: 'לעמוד יש כמה כתובות ואף אחת לא מסומנת כרשמית',
      en: 'The page has several addresses and none is marked official',
    },
    what: {
      he: 'אותו עמוד לרוב נגיש בכמה כתובות — עם www ובלי, עם קו נטוי בסוף ובלי. אנחנו רואים עמוד אחד; מערכת שקוראת את האתר עלולה לראות שלושה עמודים שונים עם אותו תוכן. יש דרך לסמן איזו כתובת היא הרשמית.',
      en: 'The same page is usually reachable at several addresses — with www and without, with a trailing slash and without. We see one page; a system reading the site may see three pages with identical content. There is a way to mark which address is the official one.',
    },
    costs: {
      he: 'הערך של העמוד מתחלק בין הכתובות במקום להצטבר לאחת. ההשפעה אמיתית אבל קטנה — אל תתעכבו על זה לפני שסגרתם את מה שלמעלה.',
      en: 'The page’s standing splits between the addresses instead of accumulating on one. The effect is real but small — do not stall on this before the items above are closed.',
    },
    steps: [
      {
        he: 'בוורדפרס עם Yoast או Rank Math זה קורה אוטומטית. אין מה לעשות.',
        en: 'On WordPress with Yoast or Rank Math this happens automatically. Nothing to do.',
      },
      {
        he: 'באתר בהתאמה אישית: בקשה של דקה למי שבנה אותו — "להוסיף תגית canonical לכל עמוד".',
        en: 'On a custom site: a one-minute request to whoever built it — add a canonical tag to every page.',
      },
    ],
  },
  {
    findingType: 'TITLE_LENGTH',
    impact: 'MINOR',
    leverage: 0.2,
    who: 'YOU',
    minutes: 5,
    headline: { he: 'הכותרת קצרה או ארוכה מדי', en: 'The title is too short or too long' },
    what: {
      he: 'הכותרת בלשונית קיימת, אבל היא קצרה מ-15 תווים או ארוכה מ-65. ארוכה מדי נחתכת באמצע; קצרה מדי לא אומרת מספיק.',
      en: 'The tab title exists but is shorter than 15 characters or longer than 65. Too long gets cut mid-word; too short does not say enough.',
    },
    costs: {
      he: 'זה משפיע קצת, לא הרבה. עסק לא נעלם מתשובות בגלל כותרת בת שבעים תווים.',
      en: 'This matters a little, not a lot. No business disappears from answers because a title runs to seventy characters.',
    },
    steps: [
      {
        he: 'קצרו או הרחיבו לטווח של 30–60 תווים, בתבנית: שם ‑ תחום ‑ עיר.',
        en: 'Trim or extend into the 30–60 character range, in the pattern: name - field - city.',
      },
    ],
  },
  {
    findingType: 'META_DESCRIPTION_LENGTH',
    impact: 'MINOR',
    leverage: 0.18,
    who: 'YOU',
    minutes: 5,
    headline: { he: 'התיאור הקצר לא באורך הנכון', en: 'The description is not the right length' },
    what: {
      he: 'המשפט שמתחת לשם בתוצאות החיפוש קיים, אבל קצר מ-50 תווים או ארוך מ-165. ארוך מדי נחתך.',
      en: 'The sentence under your name in search results exists but is under 50 characters or over 165. Too long gets cut.',
    },
    costs: {
      he: 'השפעה קטנה. שווה תיקון בזמן שאתם ממילא עורכים את העמוד.',
      en: 'A small effect. Worth fixing while you are editing the page anyway.',
    },
    steps: [
      {
        he: 'כוונו למשפט אחד של 20–25 מילים.',
        en: 'Aim for one sentence of 20–25 words.',
      },
    ],
  },
  {
    findingType: 'DUPLICATE_META_DESCRIPTION',
    impact: 'MINOR',
    leverage: 0.15,
    who: 'YOU',
    minutes: 10,
    headline: { he: 'אותו תיאור חוזר בכמה עמודים', en: 'The same description repeats on several pages' },
    what: {
      he: 'לכמה עמודים יש בדיוק אותו משפט תיאור, בדרך כלל כי נכתב פעם אחת והועתק.',
      en: 'Several pages carry exactly the same description sentence, usually because it was written once and copied.',
    },
    costs: {
      he: 'העמודים נראים דומים מדי מבחוץ, ורק אחד מהם נכנס לתשובה.',
      en: 'The pages look too alike from outside, and only one of them makes it into an answer.',
    },
    steps: [
      {
        he: 'כתבו משפט נפרד לכל עמוד — מספיק לשנות את החלק שמתאר מה יש בו.',
        en: 'Write a separate sentence per page — changing the part that says what is on it is enough.',
      },
    ],
  },
  {
    findingType: 'MISSING_LANG_ATTRIBUTE',
    impact: 'MINOR',
    leverage: 0.12,
    who: 'WEB_PERSON',
    minutes: 5,
    headline: { he: 'העמוד לא מצהיר באיזו שפה הוא', en: 'The page does not declare its language' },
    what: {
      he: 'בקוד של כל עמוד אמור להיות רשום באיזו שפה הוא כתוב. כאן זה חסר. בעברית זה משנה יותר מבאנגלית, כי גם כיוון הכתיבה נגזר מזה.',
      en: 'Every page should record which language it is written in. Here it is missing. In Hebrew it matters more than in English, because the writing direction follows from it.',
    },
    costs: {
      he: 'מערכת שמעדיפה מקורות בעברית לשאלה בעברית צריכה לנחש אם אתם כאלה.',
      en: 'A system preferring Hebrew sources for a Hebrew question has to guess whether you are one.',
    },
    steps: [
      {
        he: 'בקשו להוסיף lang="he" ו-dir="rtl" לעמודים בעברית. זה תיקון של דקה.',
        en: 'Ask for lang="he" and dir="rtl" on the Hebrew pages. A one-minute fix.',
      },
    ],
  },
  {
    findingType: 'NO_ROBOTS_TXT',
    impact: 'MINOR',
    leverage: 0.05,
    who: 'WEB_PERSON',
    minutes: 5,
    headline: {
      he: 'אין באתר קובץ שאומר מה מותר לקרוא',
      en: 'The site has no file saying what may be read',
    },
    what: {
      he: 'קובץ קטן בשורש האתר שאומר לתוכנות שקוראות אתרים מה מותר להן. כשהוא חסר, ברירת המחדל היא שהכול מותר — כלומר זה בסדר.',
      en: 'A small file at the site root telling programs that read sites what they may read. When it is missing the default is that everything is allowed — which is fine.',
    },
    costs: {
      he: 'כמעט לא משנה. מציינים את זה לשלמות, וכדי שתדעו שהוא לא חוסם אתכם.',
      en: 'Barely matters. Noted for completeness, and so you know it is not blocking you.',
    },
    steps: [
      {
        he: 'אין דחיפות. אם ממילא נוגעים באתר, אפשר להוסיף אותו יחד עם מפת האתר.',
        en: 'No urgency. If the site is being touched anyway, add it along with the sitemap.',
      },
    ],
  },
]

const BY_TYPE: ReadonlyMap<string, FixGuide> = new Map(GUIDES.map((g) => [g.findingType, g]))

export const fixGuide = (findingType: string): FixGuide | undefined => BY_TYPE.get(findingType)

export const allFixGuides = (): readonly FixGuide[] => GUIDES

/**
 * Impact for a finding type we have no guide for.
 *
 * New crawler findings should get a guide; until one is written, a finding with no guide is
 * ranked below everything explained, never above it. Silently promoting an unexplained
 * finding to the top of a customer's list is how a report starts with a sentence nobody
 * involved can defend.
 */
export const impactOf = (findingType: string): Impact => fixGuide(findingType)?.impact ?? 'MINOR'
