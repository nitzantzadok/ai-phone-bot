/**
 * A realistic Israeli small-business site, served over real HTTP.
 *
 * Two versions of the same clinic. The "before" site is not a strawman — it is what most
 * small business sites in Israel actually look like: a nice design, a phone number in an
 * image, opening hours only a human can infer, and no structured data at all. The "after"
 * site changes nothing about the business, only what is written down about it.
 *
 * Serving these over a real socket (rather than injecting a fetcher) is the point: it
 * exercises DNS pinning, robots.txt, redirects and byte caps the same way a customer's
 * site does.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const shell = (title: string, body: string, head = ''): string => `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${title}</title>
${head}
</head>
<body>
<header><a href="/">דנטל סנטר הדר</a>
  <nav><a href="/about">אודות</a> <a href="/services">טיפולים</a> <a href="/contact">צור קשר</a></nav>
</header>
${body}
<footer><p>דנטל סנטר הדר</p></footer>
</body>
</html>`

/* ------------------------------------------------------------------ before --- */

const BEFORE: Record<string, string> = {
  '/': shell(
    'ברוכים הבאים',
    `<main>
      <h1>ברוכים הבאים</h1>
      <p>אנחנו כאן בשבילכם. צוות מקצועי, יחס אישי, וטכנולוגיה מתקדמת.</p>
      <p><img src="/phone.png" alt=""></p>
      <p>לתיאום תור התקשרו אלינו.</p>
    </main>`,
  ),
  '/about': shell(
    'אודות',
    `<main><h1>אודות</h1><p>המרפאה פועלת שנים רבות ומעניקה שירות ברמה הגבוהה ביותר.</p></main>`,
  ),
  '/services': shell(
    'טיפולים',
    `<main><h1>הטיפולים שלנו</h1><ul><li>סתימות</li><li>יישור שיניים</li><li>השתלות</li></ul></main>`,
  ),
  '/contact': shell(
    'צור קשר',
    `<main><h1>צור קשר</h1><p><img src="/phone.png" alt=""></p><p>נשמח לראותכם.</p></main>`,
  ),
}

/* ------------------------------------------------------------------- after --- */

const JSONLD = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Dentist',
  name: 'דנטל סנטר הדר',
  description: 'מרפאת שיניים בפתח תקווה עם טיפולי ילדים ותורים אחר הצהריים.',
  telephone: '+972-3-555-0123',
  priceRange: '₪₪',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'רחוב חובבי ציון 14',
    addressLocality: 'פתח תקווה',
    addressCountry: 'IL',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      opens: '08:00',
      closes: '19:00',
    },
  ],
})}</script>`

const AFTER: Record<string, string> = {
  '/': shell(
    'מרפאת שיניים בפתח תקווה | דנטל סנטר הדר',
    `<main>
      <h1>מרפאת שיניים בפתח תקווה</h1>
      <p>דנטל סנטר הדר היא מרפאת שיניים בפתח תקווה, ברחוב חובבי ציון 14.
         אנחנו מקבלים ילדים ומבוגרים, ופתוחים בימים ראשון עד חמישי בין 08:00 ל-19:00,
         כולל תורים אחר הצהריים להורים שחוזרים מהעבודה.</p>
      <p>טלפון: 03-555-0123. יש חניה חופשית ליד המרפאה, והמרפאה נגישה לכיסא גלגלים.</p>
      <h2>שאלות שהורים שואלים</h2>
      <h3>האם אתם מקבלים ילדים?</h3>
      <p>כן. יש לנו רופאת שיניים לילדים, והטיפולים בילדים נעשים בחדר נפרד ושקט.</p>
      <h3>האם יש תורים אחרי הצהריים?</h3>
      <p>כן, בימים ראשון עד חמישי עד 19:00.</p>
      <h3>האם אפשר להגיע בלי תור?</h3>
      <p>במקרה של כאב חריף אנחנו משתדלים לקבל באותו יום. עדיף להתקשר לפני.</p>
    </main>`,
    `<meta name="description" content="מרפאת שיניים בפתח תקווה המקבלת ילדים, עם תורים אחר הצהריים עד 19:00. רחוב חובבי ציון 14, טלפון 03-555-0123.">${JSONLD}`,
  ),
  '/about': shell(
    'אודות המרפאה | דנטל סנטר הדר פתח תקווה',
    `<main><h1>אודות דנטל סנטר הדר</h1>
     <p>המרפאה נמצאת בפתח תקווה, ברחוב חובבי ציון 14, ופועלת מאז 2009.
        הצוות כולל רופאת שיניים לילדים ורופא משקם. אנחנו מדברים עברית, ערבית ורוסית.</p>
     <p>המרפאה נגישה לכיסא גלגלים, ויש חניה חופשית ברחוב.</p></main>`,
    `<meta name="description" content="דנטל סנטר הדר, מרפאת שיניים בפתח תקווה מאז 2009, עם רופאת שיניים לילדים וצוות דובר עברית, ערבית ורוסית.">`,
  ),
  '/services': shell(
    'טיפולי שיניים בפתח תקווה | דנטל סנטר הדר',
    `<main><h1>הטיפולים שלנו בפתח תקווה</h1>
     <ul>
       <li>טיפולי שיניים לילדים, כולל טיפול ראשון בגיל שנתיים</li>
       <li>סתימות לבנות ושחזורים</li>
       <li>יישור שיניים עם קשתיות שקופות</li>
       <li>השתלות שיניים</li>
       <li>טיפולי חירום בכאב חריף, בדרך כלל באותו יום</li>
     </ul>
     <p>כל הטיפולים מתבצעים בפתח תקווה, ברחוב חובבי ציון 14, בשעות 08:00-19:00.</p></main>`,
    `<meta name="description" content="טיפולי שיניים בפתח תקווה: ילדים, סתימות, יישור, השתלות וטיפולי חירום. ראשון עד חמישי 08:00-19:00.">`,
  ),
  '/contact': shell(
    'צור קשר | מרפאת שיניים בפתח תקווה',
    `<main><h1>צור קשר</h1>
     <p>דנטל סנטר הדר, רחוב חובבי ציון 14, פתח תקווה.</p>
     <p>טלפון: 03-555-0123</p>
     <p>שעות פעילות: ראשון עד חמישי, 08:00 עד 19:00. שישי ושבת סגור.</p>
     <p>יש חניה חופשית ברחוב, והכניסה נגישה לכיסא גלגלים.</p></main>`,
    `<meta name="description" content="דנטל סנטר הדר, רחוב חובבי ציון 14 פתח תקווה. טלפון 03-555-0123, ראשון עד חמישי 08:00-19:00.">${JSONLD}`,
  ),
}

const ROBOTS = 'User-agent: *\nAllow: /\n'

/**
 * The single most consequential line a small business can have on its site without
 * knowing it. Usually left over from a staging environment nobody remembered to undo.
 */
const ROBOTS_BLOCKED = 'User-agent: *\nDisallow: /\n'

export type DemoVariant = 'before' | 'after' | 'blocked'

export interface DemoSite {
  readonly origin: string
  close(): Promise<void>
}

export const startDemoSite = async (variant: DemoVariant): Promise<DemoSite> => {
  const pages = variant === 'after' ? AFTER : BEFORE
  const robots = variant === 'blocked' ? ROBOTS_BLOCKED : ROBOTS

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!

    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(robots)
      return
    }
    if (path === '/phone.png') {
      // A phone number that exists only as pixels is invisible to every reader that matters.
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(Buffer.from('89504e470d0a1a0a', 'hex'))
      return
    }

    const body = pages[path]
    if (!body) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><title>404</title><h1>404</h1>')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(body)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
