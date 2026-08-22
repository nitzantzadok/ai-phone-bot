/**
 * Small presentational primitives.
 *
 * Deliberately plain. The product's credibility comes from the numbers being defensible,
 * not from the chrome around them, and a dashboard that looks like a trading terminal
 * would misrepresent how much certainty is on offer.
 */
import type { ReactNode } from 'react'

export const Card = ({
  title,
  hint,
  children,
}: {
  title?: string
  hint?: string
  children: ReactNode
}) => (
  <section className="rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
    {title ? (
      <header className="mb-3">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </header>
    ) : null}
    {children}
  </section>
)

export const Stat = ({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) => (
  <div>
    <div className="text-xs text-muted">{label}</div>
    <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
  </div>
)

/**
 * A rate is never shown without its denominator. "47%" invites a customer to imagine a
 * precision the sample does not support; "34 of 72 checks" does not.
 */
export const Rate = ({
  label,
  count,
  total,
}: {
  label: string
  count: number
  total: number
}) => {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-xs text-muted">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent"
          style={{ inlineSize: `${pct}%` }}
        />
      </div>
      <div className="w-24 shrink-0 text-end text-xs tabular-nums text-muted">
        {count} / {total}
      </div>
    </div>
  )
}

const CONTROL_STYLES = {
  CONTROLLED: 'bg-positive/10 text-positive',
  INFLUENCEABLE: 'bg-caution/10 text-caution',
  NOT_CONTROLLED: 'bg-muted/10 text-muted',
} as const

export const ControlBadge = ({
  controllability,
  label,
}: {
  controllability: keyof typeof CONTROL_STYLES
  label: string
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CONTROL_STYLES[controllability]}`}
  >
    {label}
  </span>
)

/**
 * The simulation badge.
 *
 * Rendered whenever a figure came from mock providers. It is not decoration: presenting a
 * simulated answer as a real one from ChatGPT would be the most damaging thing this
 * product could do to its own credibility.
 */
export const SimulatedBadge = ({ label }: { label: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-caution/15 px-2 py-0.5 text-[11px] font-medium text-caution">
    <span aria-hidden>&#9679;</span>
    {label}
  </span>
)

export const Disclosure = ({ text }: { text: string }) => (
  <p className="mt-3 text-[11px] leading-relaxed text-muted">{text}</p>
)
