import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The signed-out shell.
 *
 * Hebrew-first: the launch market reads right to left, and retrofitting that later means
 * auditing every layout primitive. Tailwind's logical properties (ms/me, start/end) mean
 * the same markup works in both directions.
 */
export const Shell = ({
  children,
  language,
}: {
  children: ReactNode
  language: 'he' | 'en'
}) => {
  const he = language === 'he'
  const other = he ? 'en' : 'he'

  return (
    <div dir={he ? 'rtl' : 'ltr'} className="min-h-screen">
      {/* The header wraps rather than scrolls. As one unwrapping flex row it ran about
          fifty pixels past the edge of a 390px phone, which is what most of this product's
          audience reads it on. In Hebrew it overflowed to the *left*, where `scrollWidth`
          does not count it — so the direction that matters most here was the one no
          overflow check could see. */}
      <nav className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link href={`/?lang=${language}`} className="text-sm font-semibold tracking-tight">
            {he ? 'אוטופיילוט המלצות AI' : 'AI Recommendation Autopilot'}
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href={`/insights?lang=${language}`} className="text-muted hover:text-ink">
              {he ? 'איך זה עובד' : 'How it works'}
            </Link>
            <Link href={`/pricing?lang=${language}`} className="text-muted hover:text-ink">
              {he ? 'מחירים' : 'Pricing'}
            </Link>
            <Link href={`/app?lang=${language}`} className="text-muted hover:text-ink">
              {he ? 'האפליקציה' : 'App'}
            </Link>
            <Link href={`/?lang=${other}`} className="text-muted hover:text-ink">
              {he ? 'English' : 'עברית'}
            </Link>
            <Link
              href={`/join?lang=${language}`}
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white"
            >
              {he ? 'סריקה חינם' : 'Free scan'}
            </Link>
          </div>
        </div>
      </nav>

      {children}

      <footer className="mt-20 border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs leading-relaxed text-muted">
          {he
            ? 'אנחנו לא שולטים במה שמערכות AI אומרות, ולא נטען אחרת. מה שאנחנו כן עושים: מודדים איפה אתם מופיעים, מסבירים למה, ומתקנים את מה שבאמת בשליטתכם.'
            : 'We do not control what AI systems say, and will not claim otherwise. What we do: measure where you appear, explain why, and fix what is genuinely within your control.'}
        </div>
      </footer>
    </div>
  )
}

/** Reads the language from the query string, defaulting to Hebrew for the launch market. */
export const languageFrom = (params: Record<string, string | string[] | undefined>): 'he' | 'en' =>
  params.lang === 'en' ? 'en' : 'he'
