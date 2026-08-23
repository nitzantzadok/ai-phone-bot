'use client'

/**
 * The entrance.
 *
 * A line travels down the wordmark and the mark resolves behind it — a picture of what the
 * product does, which is read a page from the top down and work out what is written there.
 *
 * Three rules keep an intro from becoming a tax:
 *
 *  1. **Once per visit.** Stored in `sessionStorage`, so somebody moving between the report
 *     and the pricing page does not sit through it five times. An animation you have to
 *     wait out repeatedly stops being delightful at roughly the second viewing.
 *  2. **Never blocking.** The page underneath renders immediately and completely; this is a
 *     cover that lifts off it. If the JavaScript never arrives, nothing is missing.
 *  3. **Skippable.** Any key or click dismisses it at once.
 *  4. **Never late.** This mounts after hydration, so on a slow connection the page can
 *     already be on screen and read by the time the intro would appear — and a curtain
 *     that drops over content somebody is *already reading* is not an entrance, it is an
 *     interruption. Past a threshold it simply does not play.
 *
 * It renders nothing at all under `prefers-reduced-motion` — checked in JavaScript as well
 * as in CSS, because a curtain that is merely instant still steals the first paint.
 */
import { useEffect, useState } from 'react'

const SEEN = 'autopilot:intro-seen'

export const Intro = ({ wordmark }: { wordmark: string }) => {
  const [show, show_] = useState(false)

  useEffect(() => {
    const asked = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (asked) return

    // Too late to be an entrance. `performance.now()` is milliseconds since the page
    // started loading, so this is "did we get here before the reader did".
    const LATE_MS = 700
    if (typeof performance !== 'undefined' && performance.now() > LATE_MS) return

    let seen = false
    try {
      seen = window.sessionStorage.getItem(SEEN) === '1'
    } catch {
      // Storage refused. Showing it once more is a far smaller cost than a crash here.
    }
    if (seen) return

    try {
      window.sessionStorage.setItem(SEEN, '1')
    } catch {
      /* ignore */
    }

    show_(true)
    // Matches the curtain's end in globals.css. Unmounting rather than leaving an
    // invisible fixed layer over the page, which would swallow every click on it.
    const done = window.setTimeout(() => show_(false), 2100)
    return () => window.clearTimeout(done)
  }, [])

  if (!show) return null

  return (
    <div
      className="intro"
      aria-hidden="true"
      onClick={() => show_(false)}
      onKeyDown={() => show_(false)}
      role="presentation"
    >
      <div className="relative overflow-hidden px-8 py-10">
        <p className="intro-mark text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {wordmark}
        </p>
        <span className="intro-sweep" />
      </div>
    </div>
  )
}
