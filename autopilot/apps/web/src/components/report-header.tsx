/**
 * The strip at the top of the report.
 *
 * A report this long needs somewhere for the eye to land first, and a page that opens
 * straight into a paragraph does not have one. This is that anchor: the address that was
 * scanned, the score as a shape rather than a digit, and the three counts that answer the
 * questions people ask before they start reading — how much work is this, how many places
 * corroborate me, how much of my site did you actually look at.
 *
 * The dial exists because a number between 0 and 100 has no felt size. 4 and 40 read the
 * same in text and look nothing alike as an arc, and the arc is the thing somebody
 * remembers well enough to compare against next month.
 *
 * Colour is doing real work here and is therefore taken from the band, not from the raw
 * number — the same four thresholds the rest of the report explains itself in terms of, so
 * a red ring and the sentence under it can never disagree.
 */
import type { Band } from '@autopilot/insights/verdict.ts'

type Lang = 'he' | 'en'

const t = (he: string, en: string, language: Lang) => (language === 'he' ? he : en)

const BAND_STROKE: Record<Band, string> = {
  INVISIBLE: 'var(--color-negative)',
  PARTIAL: 'var(--color-caution)',
  READY: 'var(--color-accent)',
  STRONG: 'var(--color-positive)',
}

const BAND_TEXT: Record<Band, string> = {
  INVISIBLE: 'text-negative',
  PARTIAL: 'text-caution',
  READY: 'text-accent',
  STRONG: 'text-positive',
}

/**
 * The score as an arc.
 *
 * Rotated so the arc begins at the top rather than at three o'clock, which is where SVG
 * starts and where nobody expects a gauge to. Deliberately not mirrored under RTL: a
 * clockwise fill is how a dial reads in every direction, and flipping it would make the
 * same score look different in the two languages.
 */
const Dial = ({ score, band }: { score: number; band: Band }) => {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  const filled = (clamped / 100) * circumference

  return (
    <div className="relative size-[104px] shrink-0">
      <svg viewBox="0 0 104 104" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="10"
        />
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke={BAND_STROKE[band]}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-semibold tabular-nums ${BAND_TEXT[band]}`}>
          {clamped}
        </span>
        <span className="text-[10px] font-medium text-muted">/ 100</span>
      </div>
    </div>
  )
}

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="min-w-0">
    <p className="text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-0.5 text-xs leading-snug text-muted">{label}</p>
  </div>
)

export const ReportHeader = ({
  url,
  score,
  band,
  bandLabel,
  taskCount,
  linkedCount,
  totalSources,
  pagesRead,
  language,
}: {
  url: string
  score: number
  band: Band
  bandLabel: string
  taskCount: number
  linkedCount: number
  totalSources: number
  pagesRead: number
  language: Lang
}) => (
  <section className="rounded-xl border border-line bg-white p-6 sm:p-8">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted">
      {t('נסרק עכשיו', 'Scanned just now', language)}
    </p>
    <p className="mt-1 break-all text-sm font-medium" dir="ltr">
      {url}
    </p>

    <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-6">
      {/* Capped, so a long band label cannot squeeze the counts beside it into three
          wrapped lines each — which is what an uncapped flex child does here. */}
      <div className="flex items-center gap-4 sm:max-w-[19rem]">
        <Dial score={score} band={band} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            {t('ציון מוכנות', 'Readiness', language)}
          </p>
          <p className={`mt-1 text-lg font-semibold leading-snug ${BAND_TEXT[band]}`}>
            {bandLabel}
          </p>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-6 border-t border-line pt-5 sm:border-t-0 sm:border-s sm:ps-8 sm:pt-0">
        <Stat value={String(taskCount)} label={t('משימות', 'tasks', language)} />
        <Stat
          value={`${linkedCount}/${totalSources}`}
          label={t('מקורות מקושרים', 'sources linked', language)}
        />
        <Stat value={String(pagesRead)} label={t('עמודים נקראו', 'pages read', language)} />
      </div>
    </div>
  </section>
)
