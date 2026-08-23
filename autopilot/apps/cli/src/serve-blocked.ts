import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
/* Welcomes every generic crawler, and singles out the ones that feed ChatGPT. Ours sails
   straight through; before the AI-access check this site reported as perfectly healthy. */
const ROBOTS = `User-agent: *
Allow: /

User-agent: OAI-SearchBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: PerplexityBot
Disallow: /
`
const page = (title: string, body: string) => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<meta name="description" content="מרפאת שיניים בהדר חיפה, מקבלים ילדים, תורים אחר הצהריים עד 19:00."></head>
<body><header><a href="/">דנטל סנטר הדר</a> <nav><a href="/about">אודות</a></nav></header>
${body}<footer><p>הרצל 12, חיפה. טלפון 04-8123456.</p></footer></body></html>`
const routes: Record<string,string> = {
  '/': page('דנטל סנטר הדר – מרפאת שיניים בחיפה', `<main><h1>מרפאת שיניים בחיפה</h1>
    <p>דנטל סנטר הדר היא מרפאת שיניים ברחוב הרצל 12 בחיפה. מקבלים ילדים ומבוגרים,
       פתוח ראשון עד חמישי 08:00-19:00. יש חניה חופשית והמרפאה נגישה לכיסא גלגלים.
       טלפון 04-8123456.</p></main>`),
  '/about': page('אודות | דנטל סנטר הדר', `<main><h1>אודות</h1>
    <p>המרפאה פועלת בחיפה מאז 2009, ברחוב הרצל 12. הצוות כולל רופאת שיניים לילדים.</p></main>`),
}
const server = createServer((req,res) => {
  const path = (req.url ?? '/').split('?')[0]!
  if (path === '/robots.txt') { res.writeHead(200,{'content-type':'text/plain'}); res.end(ROBOTS); return }
  const html = routes[path]
  if (!html) { res.writeHead(404); res.end('nope'); return }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); res.end(html)
})
server.listen(0,'127.0.0.1',() => {
  const { port } = server.address() as { port: number }
  writeFileSync(process.argv[2]!, `http://127.0.0.1:${port}`)
})
