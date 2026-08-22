import { Suspense } from 'react'
import Link from 'next/link'
import { Shell, languageFrom } from '@/components/shell'
import { ScanResult } from './result'

/**
 * The scan page.
 *
 * The crawl happens inside a Suspense boundary so the shell and a waiting state stream to
 * the browser immediately. A scan takes seconds, and the difference between "a page that
 * says it is working" and "a blank tab" is the difference between a customer waiting and a
 * customer closing the tab believing the product is broken.
 */

/** The crawler uses Node's DNS and sockets directly; it cannot run on an edge runtime. */
export const runtime = 'nodejs'

/** Every scan is a fresh measurement of a live site. Caching one would be a lie. */
export const dynamic = 'force-dynamic'

/** Enough for a bounded crawl plus, when a key is configured, the AI half. */
export const maxDuration = 120

const Waiting = ({ language, url }: { language: 'he' | 'en'; url: string }) => {
  const he = language === 'he'
  const steps = he
    ? ['קוראים את העמודים באתר', 'מחלצים מה שכתוב על העסק', 'בודקים מה חסר', 'מכינים את רשימת התיקונים']
    : ['Reading the pages', 'Extracting what is stated', 'Checking what is missing', 'Preparing the fixes']

  return (
    <div className="rounded-xl border border-line bg-white p-6">
      <div className="flex items-center gap-3">
        <span className="size-3 animate-pulse rounded-full bg-accent" />
        <p className="font-medium">{he ? 'סורקים את האתר שלכם' : 'Scanning your site'}</p>
      </div>
      <p className="mt-1 text-xs text-muted" dir="ltr">
        {url}
      </p>
      <ul className="mt-5 space-y-2 text-sm text-muted">
        {steps.map((step) => (
          <li key={step}>· {step}</li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-muted">
        {he
          ? 'זה לוקח בין כמה שניות לדקה, תלוי בגודל האתר. אל תסגרו את העמוד.'
          : 'This takes a few seconds to a minute depending on the size of the site. Keep the page open.'}
      </p>
    </div>
  )
}

export default async function Scan({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const language = languageFrom(params)
  const he = language === 'he'
  // `website` is accepted as well as `url`: a shared link says ?url=, and a form field a
  // person fills in is called a website. Both mean the same thing and both must work.
  const raw = params.url ?? params.website
  const url = typeof raw === 'string' ? raw : ''

  return (
    <Shell language={language}>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          {he ? 'תוצאת הסריקה' : 'Scan result'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {he
            ? 'כל מספר בעמוד הזה נמדד עכשיו, מהאתר שלכם. מה שלא נמדד — כתוב שלא נמדד.'
            : 'Every number on this page was measured just now, from your site. What was not measured says so.'}
        </p>

        <div className="mt-8">
          {url.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6">
              <h2 className="text-lg font-semibold">
                {he ? 'לא קיבלנו כתובת אתר' : 'No website address'}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {he
                  ? 'הזינו את כתובת האתר של העסק כדי לקבל סריקה.'
                  : 'Enter your business website address to get a scan.'}
              </p>
              <Link
                href={`/join?lang=${language}`}
                className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white"
              >
                {he ? 'לסריקה' : 'Scan a site'}
              </Link>
            </div>
          ) : (
            <Suspense key={url} fallback={<Waiting language={language} url={url} />}>
              <ScanResult rawUrl={url} language={language} />
            </Suspense>
          )}
        </div>

        {url.length > 0 ? (
          <div className="mt-10 border-t border-line pt-6">
            <p className="text-sm text-muted">
              {he
                ? 'רוצים שנעשה את התיקונים האלה עבורכם ונמדוד כל חודש אם זה עבד?'
                : 'Want us to make these fixes for you and measure every month whether it worked?'}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href={`/onboarding?lang=${language}&website=${encodeURIComponent(url)}`}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white"
              >
                {he ? 'להמשיך להצטרפות' : 'Continue to signup'}
              </Link>
              <Link
                href={`/join?lang=${language}`}
                className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium"
              >
                {he ? 'לסרוק אתר אחר' : 'Scan another site'}
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </Shell>
  )
}
