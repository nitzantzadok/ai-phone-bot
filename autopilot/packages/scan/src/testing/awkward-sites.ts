/**
 * The websites a real scan actually meets.
 *
 * The demo clinic is a well-behaved site. Most are not. These fixtures reproduce the ways
 * a real Israeli small-business site defeats a naive crawler, and each one exists because
 * getting it wrong produces a report that is confidently false — which is worse than no
 * report at all, because the customer acts on it.
 *
 * Every variant serves a business that genuinely states its name, city and phone. If a
 * scan of one of these says "no name found", the scan is wrong, not the site.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export type AwkwardVariant =
  /** Content rendered by JavaScript. The HTML is an empty shell. */
  | 'spa'
  /** Hebrew served as windows-1255, which is still common on older Israeli sites. */
  | 'cp1255'
  /** Bot protection: a 403 with a challenge page, exactly like Cloudflare. */
  | 'bot-blocked'
  /** Apex redirects to www, and http redirects to https. */
  | 'redirecting'
  /** Serves fine but slowly, the way shared hosting does. */
  | 'slow'

const REAL_CONTENT = `
  <h1>מוסך אבי ובניו — חיפה</h1>
  <p>מוסך אבי ובניו נמצא בחיפה, ברחוב ההסתדרות 88. אנחנו עובדים על כל סוגי הרכבים,
     ופתוחים ראשון עד חמישי 08:00-18:00. טלפון: 04-855-1234.</p>
  <p>יש לנו רכב חלופי, ואנחנו עובדים מול כל חברות הביטוח.</p>
`

const page = (body: string, head = ''): string =>
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>מוסך אבי ובניו | מוסך בחיפה</title>
<meta name="description" content="מוסך בחיפה, רחוב ההסתדרות 88. ראשון עד חמישי 08:00-18:00, טלפון 04-855-1234.">
${head}</head><body>${body}</body></html>`

/**
 * The shell a React or Vue site serves. Every word a customer sees is added later by
 * JavaScript, so to anything that does not run JavaScript this page says nothing at all.
 */
const SPA_SHELL = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>מוסך אבי ובניו</title></head>
<body><div id="root"></div><noscript>יש להפעיל JavaScript כדי לצפות באתר.</noscript>
<script src="/static/app.js"></script></body></html>`

export interface AwkwardSite {
  readonly origin: string
  /** The address a person would type, which is not always where the content lives. */
  readonly entryUrl: string
  close(): Promise<void>
}

export const startAwkwardSite = async (variant: AwkwardVariant): Promise<AwkwardSite> => {
  let origin = ''

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!
    const host = req.headers.host ?? ''

    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('User-agent: *\nAllow: /\n')
      return
    }

    switch (variant) {
      case 'spa': {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(SPA_SHELL)
        return
      }

      case 'cp1255': {
        // Hebrew in the legacy Windows codepage, declared honestly in the header.
        const html = page(REAL_CONTENT).replace('charset=utf-8', 'charset=windows-1255')
        const encoded = Buffer.from(
          [...html].map((ch) => {
            const code = ch.codePointAt(0)!
            // Hebrew block 0x05D0-0x05EA maps to 0xE0-0xFA in windows-1255.
            if (code >= 0x05d0 && code <= 0x05ea) return String.fromCharCode(code - 0x05d0 + 0xe0)
            return code < 256 ? ch : '?'
          }).join(''),
          'latin1',
        )
        res.writeHead(200, {
          'content-type': 'text/html; charset=windows-1255',
          'content-length': String(encoded.length),
        })
        res.end(encoded)
        return
      }

      case 'bot-blocked': {
        res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', server: 'cloudflare' })
        res.end(
          '<!doctype html><html><head><title>Attention Required!</title></head>' +
            '<body><h1>Sorry, you have been blocked</h1>' +
            '<p>You are unable to access this website.</p></body></html>',
        )
        return
      }

      case 'redirecting': {
        // The apex sends everyone to www, which is what most registrars configure.
        if (!host.startsWith('www.') && path === '/') {
          res.writeHead(301, { location: `${origin}/home` })
          res.end()
          return
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(page(REAL_CONTENT))
        return
      }

      case 'slow': {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(page(REAL_CONTENT))
        }, 900)
        return
      }
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  origin = `http://127.0.0.1:${port}`

  return {
    origin,
    entryUrl: origin,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
