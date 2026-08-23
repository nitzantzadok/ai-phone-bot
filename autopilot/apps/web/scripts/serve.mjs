#!/usr/bin/env node
/**
 * Starts the web app on a port that is definitely free, and says which one.
 *
 * Next handles a busy port by quietly moving to the next one. That is friendly until the
 * instructions you are following name a port — then the address you were told to open
 * belongs to whatever else is running there, you get somebody else's application, and the
 * reasonable conclusion is that this one is broken. Which is exactly what happened.
 *
 * So: find a free port first, print one unmissable line with the real address, and only
 * then hand over to Next. The banner is the single source of truth; nothing written in a
 * guide can contradict it, because it is produced by the process that bound the socket.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const MODE = process.argv[2] === 'start' ? 'start' : 'dev'

/**
 * `--fresh` deletes the build cache before starting.
 *
 * Tailwind generates its utilities from the `@theme` block at build time, so a change to a
 * design token or a class that has never been used before needs the cache rebuilt. When it
 * is not, the running server keeps serving the previous stylesheet: the markup is the new
 * markup, the CSS is the old CSS, and the page comes out with the old colours and missing
 * spacing on a layout that has already changed underneath it. It looks exactly like
 * "nothing I changed had any effect", which is the single most misleading way for a build
 * to fail, and no amount of reloading the browser fixes it.
 */
const FRESH = process.argv.includes('--fresh')
const FIRST_PORT = 3100
const ATTEMPTS = 20

/** True when we can bind the port ourselves, which is the only reliable test. */
const isFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '0.0.0.0')
  })

const findPort = async () => {
  for (let port = FIRST_PORT; port < FIRST_PORT + ATTEMPTS; port++) {
    if (await isFree(port)) return port
  }
  return null
}

if (FRESH) {
  const cache = fileURLToPath(new URL('../.next', import.meta.url))
  await rm(cache, { recursive: true, force: true })
  console.log('Cleared the build cache. The first page will take a few seconds longer.\n')
}

const port = await findPort()

if (port === null) {
  console.error(
    `\nלא נמצא פורט פנוי בין ${FIRST_PORT} ל-${FIRST_PORT + ATTEMPTS - 1}.\n` +
      'כנראה רצות אצלך הרבה אפליקציות במקביל. סגרו כמה מהן ונסו שוב.\n',
  )
  process.exit(1)
}

const url = `http://localhost:${port}`
const line = '─'.repeat(url.length + 22)

console.log(`
┌${line}┐
│  פתחו בדפדפן:  ${url}${' '.repeat(4)}│
└${line}┘

${port === FIRST_PORT ? '' : `(פורט ${FIRST_PORT} תפוס על ידי משהו אחר, אז עברנו ל-${port}.)\n`}\
לעצירה: Ctrl + C
`)

// `next` rather than `npx next`: the local binary is already on PATH under pnpm, and
// going through npx would add a resolution step that can pick a different version.
const startedAt = Date.now()
const child = spawn('next', [MODE, '-p', String(port)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code) => {
  // Dying within a few seconds means it never served anything, so the address printed
  // above was never real. Say that plainly rather than leaving a banner on screen that
  // points at nothing. The usual cause is this same project already running in another
  // window, which Next reports just above with that one's port and PID.
  if (code !== 0 && Date.now() - startedAt < 8000) {
    console.error(
      `\nהשרת לא עלה, ולכן הכתובת ${url} לא פעילה.\n` +
        'אם כתוב למעלה "Another next dev server is already running" — הפרויקט הזה כבר\n' +
        'רץ בחלון טרמינל אחר. עברו לחלון ההוא, או סגרו אותו ונסו שוב.\n',
    )
  }
  process.exit(code ?? 0)
})
