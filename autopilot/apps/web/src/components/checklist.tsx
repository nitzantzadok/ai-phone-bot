'use client'

/**
 * The report as a list of things to tick off.
 *
 * A report is read once. A checklist gets opened again on Thursday, because there are two
 * items left on it. That is the entire difference between a document and a tool, and it is
 * the difference between a business that fixes three things and one that fixes nine.
 *
 * State lives in this viewer's browser, keyed by site. That is a deliberate limit and the
 * page says so out loud rather than implying a sync that does not exist: a customer who
 * ticks six items, opens the report on their phone, and finds them all unticked has been
 * lied to by the interface. Told up front, the same behaviour is simply what it is.
 *
 * Every read and write is wrapped, because `localStorage` is not merely empty in a private
 * window — the accessor itself throws in some browsers and contexts, and an unguarded read
 * takes the whole report down with it over a checkbox.
 */
import { useCallback, useEffect, useState } from 'react'

const KEY_PREFIX = 'autopilot:done:'

const read = (key: string): Set<string> => {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

const write = (key: string, done: Set<string>) => {
  try {
    window.localStorage.setItem(key, JSON.stringify([...done]))
  } catch {
    /* Storage refused. The ticks still work for this visit, which is most of the value. */
  }
}

export interface ChecklistState {
  readonly done: ReadonlySet<string>
  readonly toggle: (id: string) => void
  readonly ready: boolean
}

/**
 * Reads the ticks after mount, never during render.
 *
 * The server has no idea what this browser remembers, so rendering ticked boxes on the
 * first pass would produce markup the server could not have produced — React discards the
 * whole tree and the report flashes. `ready` lets the UI hold the boxes unticked for one
 * frame instead.
 */
export const useChecklist = (siteKey: string): ChecklistState => {
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setDone(read(KEY_PREFIX + siteKey))
    setReady(true)
  }, [siteKey])

  const toggle = useCallback(
    (id: string) => {
      setDone((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        write(KEY_PREFIX + siteKey, next)
        return next
      })
    },
    [siteKey],
  )

  return { done, toggle, ready }
}

/* ------------------------------------------------------------------ progress --- */

export const ChecklistProgress = ({
  done,
  total,
  language,
}: {
  done: number
  total: number
  language: 'he' | 'en'
}) => {
  const he = language === 'he'
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const complete = total > 0 && done === total

  return (
    <div
      className={`rounded-xl border p-5 backdrop-blur-sm transition-colors ${
        complete ? 'border-positive/40 bg-positive/5' : 'border-line bg-white'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {complete
            ? he
              ? 'סיימתם הכל 🎉'
              : 'Everything done 🎉'
            : he
              ? 'ההתקדמות שלכם'
              : 'Your progress'}
        </p>
        <p className="text-sm tabular-nums text-muted">
          {he ? `${done} מתוך ${total} משימות` : `${done} of ${total} tasks`}
        </p>
      </div>

      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div
          /* The sheen runs only while there is work left. Once everything is ticked a
             moving highlight stops meaning "live" and starts meaning "still going". */
          className={`relative h-full overflow-hidden rounded-full transition-[width] duration-700 ${
            complete ? 'bg-positive' : `bg-accent ${pct > 0 ? 'sheen' : ''}`
          }`}
          style={{ width: `${pct}%`, transitionTimingFunction: 'var(--ease-settle)' }}
        />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        {complete
          ? he
            ? 'הריצו את הסריקה שוב כדי לראות מה השתנה בפועל. שינויים באתר לוקחים כמה ימים עד שמערכות AI קוראות אותם מחדש.'
            : 'Run the scan again to see what actually moved. Site changes take a few days before AI systems re-read them.'
          : he
            ? 'הסימונים נשמרים בדפדפן הזה בלבד — לא בחשבון. אם תפתחו את הדוח במכשיר אחר, הרשימה תתחיל נקייה.'
            : 'Ticks are saved in this browser only, not to an account. Open the report on another device and the list starts fresh.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ checkbox --- */

export const TaskCheckbox = ({
  id,
  checked,
  onToggle,
  label,
}: {
  id: string
  checked: boolean
  onToggle: (id: string) => void
  label: string
}) => (
  <label
    className="group flex cursor-pointer select-none items-center gap-2 text-sm"
    title={label}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onToggle(id)}
      className="size-5 shrink-0 cursor-pointer rounded border-line accent-positive"
    />
    <span className={checked ? 'font-medium text-positive' : 'text-muted group-hover:text-ink'}>
      {label}
    </span>
  </label>
)
