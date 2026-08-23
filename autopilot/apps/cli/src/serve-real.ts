import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
/* A site shaped like most real Israeli small-business sites: the name and city are
   readable, so we can write a suggestion — but the title is a stub and there is no
   description anywhere. */
const page = (title: string, body: string) => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head>
<body><header><a href="/">מספרת רוזה</a>
<nav><a href="/about">אודות</a> <a href="/contact">צרו קשר</a></nav></header>
${body}<footer><p>מספרת רוזה, הרצל 40, פתח תקווה. טלפון 03-9123456.</p></footer></body></html>`
const routes: Record<string, string> = {
  '/': page('ברוכים הבאים', `<main><h1>מספרת רוזה בפתח תקווה</h1>
    <p>מספרה לנשים וגברים ברחוב הרצל 40 בפתח תקווה. תספורות, צבע, החלקות ואיפור ערב.
       פתוח ראשון עד חמישי 09:00-19:00 ושישי עד 14:00. אפשר להגיע בלי תור בשעות הבוקר,
       ויש חניה חופשית ברחוב. הצוות שלנו מלווה לקוחות כבר יותר מעשור.</p></main>`),
  '/about': page('אודות', `<main><h1>על המספרה</h1><p>מספרת רוזה פועלת בפתח תקווה משנת 2011,
    ברחוב הרצל 40. אנחנו צוות של ארבע מעצבות שיער, ומתמחות בצבע ובהחלקות.</p></main>`),
  '/contact': page('צרו קשר', `<main><h1>צרו קשר</h1><p>הרצל 40, פתח תקווה. טלפון 03-9123456.
    פתוח ראשון עד חמישי 09:00-19:00, שישי עד 14:00.</p></main>`),
}
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]!
  if (path === '/robots.txt') { res.writeHead(200, {'content-type':'text/plain'}); res.end('User-agent: *\nAllow: /'); return }
  const html = routes[path]
  if (!html) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as { port: number }
  writeFileSync(process.argv[2]!, `http://127.0.0.1:${port}`)
})
