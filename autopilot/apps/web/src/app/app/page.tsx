import { Suspense } from 'react'
import Link from 'next/link'
import { getPlan } from '@autopilot/billing/plans.ts'
import { Shell, languageFrom } from '@/components/shell'
import { readSession } from '@/lib/session'
import { Dashboard } from './dashboard'

/**
 * The app.
 *
 * Reached by choosing a plan. No payment is taken and no details are asked for yet, which
 * is stated on screen rather than left for someone to discover — a product that quietly
 * skips the part you expected is indistinguishable from one that is broken.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const Waiting = ({ language, url }: { language: 'he' | 'en'; url: string }) => {
  const he = language === 'he'
  return (
    <div className="rounded-xl border border-line bg-white p-6">
      <div className="flex items-center gap-3">
        <span className="size-3 animate-pulse rounded-full bg-accent" />
        <p className="font-medium">{he ? 'סורקים את האתר שלכם' : 'Scanning your site'}</p>
      </div>
      <p className="mt-1 text-xs text-muted" dir="ltr">
        {url}
      </p>
      <p className="mt-4 text-sm text-muted">
        {he
          ? 'כמה שניות עד דקה, תלוי בגודל האתר.'
          : 'A few seconds to a minute, depending on the size of the site.'}
      </p>
    </div>
  )
}

export default async function App({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const language = languageFrom(await searchParams)
  const he = language === 'he'
  const session = await readSession()

  if (!session) {
    return (
      <Shell language={language}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">
            {he ? 'עוד לא בחרתם עסק' : 'No business selected yet'}
          </h1>
          <p className="mt-3 text-muted">
            {he
              ? 'כדי להיכנס לאפליקציה צריך קודם כתובת אתר ותוכנית. שניהם לוקחים פחות מדקה, ואין תשלום.'
              : 'To enter the app we need a website address and a plan. Both take under a minute, and there is no payment.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/pricing?lang=${language}`}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white"
            >
              {he ? 'לבחירת תוכנית' : 'Choose a plan'}
            </Link>
            <Link
              href={`/join?lang=${language}`}
              className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium"
            >
              {he ? 'רק לסרוק אתר' : 'Just scan a site'}
            </Link>
          </div>
        </main>
      </Shell>
    )
  }

  const plan = getPlan(session.plan)

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div className="min-w-0">
            <p className="text-xs text-muted">{he ? 'העסק שלכם' : 'Your business'}</p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight" dir="ltr">
              {session.url}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-accent-soft px-3 py-1 font-medium text-accent">
              {plan.labels[language] ?? plan.name}
            </span>
            <form action="/app/leave" method="post">
              <input type="hidden" name="lang" value={language} />
              <button type="submit" className="text-muted underline">
                {he ? 'להחליף עסק' : 'Change business'}
              </button>
            </form>
          </div>
        </header>

        <div className="mt-4 rounded-lg border border-caution/40 bg-caution/5 px-4 py-3 text-sm">
          {he
            ? 'מצב בדיקה: לא נגבה תשלום ולא נשמרו פרטים. כל מסך כאן מריץ סריקה אמיתית של האתר שלכם.'
            : 'Test mode: no payment was taken and no details were stored. Every screen here runs a real scan of your site.'}
        </div>

        <div className="mt-8">
          <Suspense key={session.url} fallback={<Waiting language={language} url={session.url} />}>
            <Dashboard session={session} language={language} />
          </Suspense>
        </div>
      </main>
    </Shell>
  )
}
