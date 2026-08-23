'use client'

/**
 * The door.
 *
 * A field of scattered sources; a question goes out; what it touches lights up and finds
 * its neighbours; the whole network collapses into one answer, and the name resolves out of
 * the collapse. It is the product's own claim, drawn: *this* is what we measure.
 *
 * The arithmetic lives in `gate-field.ts` — one clock, seven overlapping acts, every pixel a
 * function of one timestamp. This file is only the door's manners, and the manners are the
 * part that decides whether an entrance is loved or hated:
 *
 *  1. **Once per visit.** Held in `sessionStorage`. Somebody moving between the report and
 *     the pricing page does not sit through it five times; an animation you wait out
 *     repeatedly stops being an entrance at roughly the second viewing.
 *  2. **Never blocking.** The page underneath is fully rendered before this mounts. If the
 *     JavaScript never arrives, nothing is missing and nothing is broken.
 *  3. **Always skippable.** A key, a click anywhere, Escape, or the skip control — which is
 *     on screen from the first second and reachable by keyboard, not hidden until the end.
 *  4. **Never late.** This mounts after hydration, so on a slow connection the page can
 *     already be on screen and read by the time the door would appear. A curtain dropping
 *     over something somebody is *already reading* is not an entrance, it is an
 *     interruption — past a threshold it simply does not play.
 *  5. **Off, wholesale, under `prefers-reduced-motion`.** Not shortened. Somebody who asked
 *     their system for less motion is often asking because motion makes them ill, and a
 *     tasteful three seconds of the thing that makes them ill is still that thing.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTS, GATE_DURATION, buildField, paint } from './gate-field'
import { phasesAt } from './gate-field'

const SEEN = 'autopilot:gate-seen'

/** `--color-signal`. The one colour in the system that means "something is being measured". */
const SIGNAL = '#5fd0e0'

/** Past this many milliseconds since navigation began, the reader got here first. */
const LATE_MS = 1500

/** How long the cover takes to lift when somebody skips. Matches `.gate` in globals.css. */
const LIFT_MS = 620

/** Nodes in the field. Enough to read as a network, few enough to stay at 60fps on a phone. */
const DENSITY = 260
const DENSITY_SMALL = 150

export const Gate = ({ language }: { language: 'he' | 'en' }) => {
  const he = language === 'he'
  const [show, show_] = useState(false)
  const [leaving, leaving_] = useState(false)
  const [arrived, arrived_] = useState(false)

  const root = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const mark = useRef<HTMLParagraphElement | null>(null)
  const kicker = useRef<HTMLParagraphElement | null>(null)
  const rule = useRef<HTMLSpanElement | null>(null)
  const raf = useRef(0)
  const going = useRef(false)

  const wordmark = he ? 'אוטופיילוט המלצות AI' : 'AI Recommendation Autopilot'

  /** Take the cover off. Cancels the clock first so nothing fights the fade. */
  const dismiss = useCallback((focusScan: boolean) => {
    if (going.current) return
    going.current = true
    cancelAnimationFrame(raf.current)
    raf.current = 0
    leaving_(true)
    window.setTimeout(() => {
      show_(false)
      if (!focusScan) return
      // "Enter the system" should land somewhere. The scan box is the first thing on the
      // page you can actually do, so an explicit entry puts the cursor in it.
      const url = document.getElementById('url')
      if (url instanceof HTMLInputElement) url.focus()
    }, LIFT_MS)
  }, [])

  // --- should it play at all -------------------------------------------------------
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (typeof performance !== 'undefined' && performance.now() > LATE_MS) return

    let seen = false
    try {
      seen = window.sessionStorage.getItem(SEEN) === '1'
    } catch {
      // Storage refused — a private window, or a browser configured to say no. Playing it
      // once more is a far smaller cost than throwing here.
    }
    if (seen) return

    try {
      window.sessionStorage.setItem(SEEN, '1')
    } catch {
      /* ignore */
    }

    show_(true)
  }, [])

  // --- the clock -------------------------------------------------------------------
  useEffect(() => {
    if (!show) return
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return

    let w = 0
    let h = 0
    const size = () => {
      // Capped at 2: a 3x phone display triples the pixels for a difference nobody can see
      // on a field of soft points, and drops the frame rate doing it.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const box = el.getBoundingClientRect()
      w = box.width
      h = box.height
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    window.addEventListener('resize', size)

    const field = buildField(w < 640 ? DENSITY_SMALL : DENSITY)
    const started = performance.now()

    /** The wordmark and its furniture, driven from the same clock so they cannot drift. */
    const plate = (resolve: number) => {
      const m = mark.current
      if (m) {
        m.style.opacity = resolve.toFixed(3)
        m.style.filter = `blur(${((1 - resolve) * 13).toFixed(2)}px)`
        // `--gate-spread` is set per screen width in CSS, so the name never starts wider
        // than the phone it is landing on.
        m.style.letterSpacing = `calc(0.01em + var(--gate-spread) * ${(1 - resolve).toFixed(3)})`
        m.style.transform = `translateY(${((1 - resolve) * 10).toFixed(2)}px) scale(${(0.97 + resolve * 0.03).toFixed(3)})`
        // The chromatic split: two coloured copies pulled apart behind the white one and
        // driven to zero as it lands. It reads as a lens settling onto the name.
        m.style.setProperty('--split', `${((1 - resolve) * 14).toFixed(2)}px`)
      }
      const late = Math.max(0, Math.min(1, (resolve - 0.45) / 0.55))
      const k = kicker.current
      if (k) {
        k.style.opacity = (late * 0.9).toFixed(3)
        k.style.letterSpacing = `${(0.34 + (1 - late) * 0.2).toFixed(3)}em`
      }
      const r = rule.current
      if (r) {
        r.style.opacity = late.toFixed(3)
        r.style.transform = `scaleX(${(0.15 + late * 0.85).toFixed(3)})`
      }
    }

    let doorShown = false
    const tick = (now: number) => {
      const t = now - started
      if (t >= GATE_DURATION) {
        show_(false)
        return
      }
      paint(ctx, field, t, w, h, SIGNAL)
      const p = phasesAt(t)
      plate(p.resolve)
      // The cover lifts on the same clock as everything else.
      if (root.current) root.current.style.opacity = (1 - p.release).toFixed(3)
      if (!doorShown && p.resolve > 0.6) {
        doorShown = true
        arrived_(true)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf.current)
      window.removeEventListener('resize', size)
    }
  }, [show])

  // --- while the door is up --------------------------------------------------------
  useEffect(() => {
    if (!show) return

    // Nothing under the cover should move: a stray wheel or swipe would scroll a page the
    // reader cannot see, and they would arrive halfway down it.
    const body = document.body
    const had = body.style.overflow
    body.style.overflow = 'hidden'

    /* Any key lifts it, Tab included — and Tab is the important one. The cover is out of
       the accessibility tree and its controls are out of the tab order, so a keyboard
       reader's first Tab must not land on a button they cannot see. It takes the cover off
       instead, and the next Tab goes where it would have gone on a page with no entrance.

       This replaced a `focusin` listener that was meant to do the same job. It dismissed the
       cover on the load's own focus event, before a single frame had been drawn: an
       entrance that never played, on every visit. */
    const key = () => dismiss(false)
    window.addEventListener('keydown', key)

    return () => {
      body.style.overflow = had
      window.removeEventListener('keydown', key)
    }
  }, [show, dismiss])

  if (!show) return null

  return (
    /* The whole cover is hidden from assistive technology, and both controls are held out
       of the tab order. This is deliberate and it is the accessible choice, not a shortcut:
       the page underneath is already complete and already announced, and a decorative
       curtain that seizes the reading order for six seconds — announcing a wordmark that is
       also in the navigation, offering a "skip" for something the reader cannot see — is
       worse for somebody using a screen reader than no entrance at all. They get the
       product; the moment anything takes focus, the cover leaves. */
    <div
      ref={root}
      className={`gate${leaving ? ' gate-leaving' : ''}`}
      aria-hidden="true"
      onClick={() => dismiss(false)}
    >
      <canvas ref={canvas} className="gate-canvas" />
      <span className="gate-grain" />
      <span className="gate-vignette" />

      <div className="gate-plate">
        <p ref={mark} className="gate-mark" data-text={wordmark}>
          {wordmark}
        </p>
        <p ref={kicker} className="gate-kicker">
          {he ? 'מודדים · מסבירים · מתקנים' : 'Measure · Explain · Fix'}
        </p>
        <span ref={rule} className="gate-rule" />

        {/* The door itself. It appears only once the name has resolved, because offering a
            way in before there is anything to go in to reads as an apology for the wait. */}
        <button
          type="button"
          className={`gate-enter${arrived ? ' gate-enter-in' : ''}`}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            dismiss(true)
          }}
        >
          {he ? 'כניסה למערכת' : 'Enter'}
        </button>
      </div>

      <button
        type="button"
        className="gate-skip"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation()
          dismiss(false)
        }}
      >
        {he ? 'דילוג' : 'Skip'}
      </button>

      <p className="gate-foot">
        {he ? 'הרשת מתכנסת לתשובה אחת' : 'the network converges on one answer'}
      </p>
    </div>
  )
}

/** Exported for the tests that keep the CSS and the clock in agreement. */
export const GATE_TIMING = { ACTS, GATE_DURATION, LIFT_MS, LATE_MS, SEEN }
